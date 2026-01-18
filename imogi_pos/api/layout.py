# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import cint
from imogi_pos.utils.permissions import validate_branch_access

def check_restaurant_domain(pos_profile=None):
    """
    Validate that the user's POS Profile has the Restaurant domain enabled.

    If ``pos_profile`` is not provided the profile is looked up from
    ``POS Profile User`` for the current session user.

    Args:
        pos_profile (str, optional): POS Profile name.

    Raises:
        frappe.ValidationError: If no profile is found or the profile is not for the
            Restaurant domain.
    """
    if not pos_profile:
        pos_profile = frappe.db.get_value(
            "POS Profile User", {"user": frappe.session.user}, "parent"
        )

    if not pos_profile:
        frappe.throw(
            _("No POS Profile found. Please configure a POS Profile for the user."),
            frappe.ValidationError,
        )

    domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain")
    if domain != "Restaurant":
        frappe.throw(
            _("Table layout features are only available for Restaurant domain"),
            frappe.ValidationError,
        )


@frappe.whitelist()
def get_floors():
    """
    Gets all floors accessible to the current user's branch.
    
    Returns:
        list: List of floor documents with name and floor_name
    
    Raises:
        frappe.ValidationError: If no POS Profile is found or domain is not Restaurant
    """
    # Check restaurant domain
    check_restaurant_domain()
    
    # Get the user's branch from their POS Profile
    pos_profile = frappe.db.get_value(
        "POS Profile User", {"user": frappe.session.user}, "parent"
    )
    branch = frappe.db.get_value("POS Profile", pos_profile, "branch")
    
    if not branch:
        frappe.throw(
            _("No branch found for this POS Profile"),
            frappe.ValidationError,
        )
    
    # Get all floors for this branch
    floors = frappe.get_all(
        "Restaurant Floor",
        filters={"branch": branch},
        fields=["name", "floor_name", "branch"],
        order_by="floor_name"
    )
    
    return floors


@frappe.whitelist()
def get_table_layout(floor):
    """
    Gets the layout for tables on a specific floor.
    
    Args:
        floor (str): Restaurant Floor name
    
    Returns:
        dict: Floor layout data including tables and their positions
    """
    # Get the floor details
    floor_doc = frappe.get_doc("Restaurant Floor", floor)
    
    # Get branch from floor to validate access
    branch = floor_doc.branch
    validate_branch_access(branch)
    
    # Check restaurant domain
    check_restaurant_domain()

    # Get active layout profile for this floor
    layout_profile = frappe.db.get_value(
        "Table Layout Profile", {"default_floor": floor, "is_active": 1}, "name"
    )
    
    # If no active profile, return basic layout
    if not layout_profile:
        # Get tables for this floor
        tables = frappe.get_all("Restaurant Table", 
                             filters={"floor": floor},
                             fields=["name", "no_of_seats", "minimum_seating"])
        
        # Return basic layout (no positioning)
        return {
            "floor": floor_doc.as_dict(),
            "tables": tables,
            "layout": None,
            "profile": None
        }
    
    # Get layout profile details
    profile_doc = frappe.get_doc("Table Layout Profile", layout_profile)
    
    # Get layout nodes (positions of tables)
    layout_nodes = frappe.get_all("Table Layout Node", 
                                filters={"parent": layout_profile},
                                fields=["table", "position_x", "position_y", "width", "height", "rotation"])
    
    # Get tables with additional data
    tables_data = []
    for node in layout_nodes:
        # Get table details
        table_doc = frappe.get_doc("Restaurant Table", node.table)
        
        # Get current order if any
        current_order = table_doc.current_pos_order
        
        # Get status data
        status_data = None
        if current_order:
            order_doc = frappe.get_doc("POS Order", current_order)
            status_data = {
                "order": current_order,
                "status": order_doc.workflow_state,
                "customer": order_doc.customer,
                "order_type": order_doc.order_type,
                "occupied_since": order_doc.creation
            }
        
        # Combine table data with node positioning
        table_data = {
            "name": node.table,
            "no_of_seats": table_doc.no_of_seats,
            "minimum_seating": table_doc.minimum_seating,
            "position_x": node.position_x,
            "position_y": node.position_y,
            "width": node.width,
            "height": node.height,
            "rotation": node.rotation,
            "status": table_doc.status,
            "current_order": status_data
        }
        
        tables_data.append(table_data)
    
    # Return complete layout
    return {
        "floor": floor_doc.as_dict(),
        "tables": tables_data,
        "layout": {
            "name": profile_doc.name,
            "profile_name": profile_doc.profile_name,
            "is_active": profile_doc.is_active,
            "canvas_width": profile_doc.canvas_width,
            "canvas_height": profile_doc.canvas_height,
            "background_image": profile_doc.background_image,
            "scale": profile_doc.scale,
        }
    }

@frappe.whitelist()
def save_table_layout(floor, layout_json, profile_name=None, title=None):
    """
    Saves a table layout for a specific floor.
    If profile_name is provided, updates that profile; otherwise creates a new one.
    
    Args:
        floor (str): Restaurant Floor name
        layout_json (str): JSON string with layout data
        profile_name (str, optional): Table Layout Profile to update. Defaults to None.
        title (str, optional): Name for new profile. Defaults to None.
    
    Returns:
        dict: Saved layout profile details
    
    Raises:
        frappe.ValidationError: If layout data is invalid
    """
    # Get the floor details
    floor_doc = frappe.get_doc("Restaurant Floor", floor)
    
    # Get branch from floor to validate access
    branch = floor_doc.branch
    validate_branch_access(branch)
    
    # Check restaurant domain
    check_restaurant_domain()
    
    # Parse layout JSON
    if isinstance(layout_json, str):
        layout_data = frappe.parse_json(layout_json)
    else:
        layout_data = layout_json
    
    # Validate layout data
    if not layout_data or not isinstance(layout_data, dict):
        frappe.throw(_("Invalid layout data"), frappe.ValidationError)
    
    # Check if we have nodes (positioned tables)
    if "nodes" not in layout_data or not layout_data["nodes"]:
        frappe.throw(_("No table positions provided in layout"), frappe.ValidationError)
    
    # Canvas settings
    canvas_width = cint(layout_data.get("canvas_width", 1200))
    canvas_height = cint(layout_data.get("canvas_height", 800))
    background_image = layout_data.get("background_image")
    scale = layout_data.get("scale", 1.0)
    
    # If updating existing profile
    if profile_name:
        try:
            profile_doc = frappe.get_doc("Table Layout Profile", profile_name)

            # Verify floor matches
            if profile_doc.default_floor != floor:
                frappe.throw(_("Profile does not match the specified floor"), frappe.ValidationError)
            
            # Update canvas settings
            profile_doc.canvas_width = canvas_width
            profile_doc.canvas_height = canvas_height
            profile_doc.background_image = background_image
            profile_doc.scale = scale

            # If title provided, update it
            if title:
                profile_doc.profile_name = title
            
            # Remove existing nodes (we'll add new ones)
            profile_doc.nodes = []
            
        except frappe.DoesNotExistError:
            frappe.throw(_("Layout profile {0} not found").format(profile_name), frappe.ValidationError)
    else:
        # Create new profile
        profile_title = title or f"{floor_doc.floor_name} Layout"
        profile_doc = frappe.new_doc("Table Layout Profile")
        profile_doc.default_floor = floor
        profile_doc.profile_name = profile_title
        profile_doc.canvas_width = canvas_width
        profile_doc.canvas_height = canvas_height
        profile_doc.background_image = background_image
        profile_doc.scale = scale
        profile_doc.is_active = 1  # Make new profile active
    
    # Add nodes (table positions)
    for node in layout_data["nodes"]:
        table = node.get("table")
        if not table:
            continue
        
        # Verify table exists and belongs to this floor
        table_floor = frappe.db.get_value("Restaurant Table", table, "floor")
        if not table_floor or table_floor != floor:
            continue
        
        # Add node
        profile_doc.append("nodes", {
            "table": table,
            "position_x": node.get("position_x", 0),
            "position_y": node.get("position_y", 0),
            "width": node.get("width", 100),
            "height": node.get("height", 100),
            "rotation": node.get("rotation", 0)
        })
    
    # If this is a new active profile, deactivate other profiles for this floor
    if not profile_name and profile_doc.is_active:
        frappe.db.sql("""
            UPDATE `tabTable Layout Profile`
            SET is_active = 0
            WHERE default_floor = %s AND name != %s
        """, (floor, profile_doc.name))
    
    # Save the profile
    profile_doc.save()
    
    # Return saved profile
    return {
        "profile": profile_doc.name,
        "profile_name": profile_doc.profile_name,
        "is_active": profile_doc.is_active,
        "floor": floor,
        "tables_positioned": len(profile_doc.nodes)
    }

@frappe.whitelist()
def get_table_status(floor=None, tables=None):
    """
    Gets the current status of tables on a floor or specific tables.
    
    Args:
        floor (str, optional): Restaurant Floor name. Defaults to None.
        tables (list or str, optional): Specific tables to check. Defaults to None.
    
    Returns:
        dict: Table status information
    """
    # Check restaurant domain
    check_restaurant_domain()
    
    # Parse tables if passed as string
    if isinstance(tables, str):
        tables = frappe.parse_json(tables)
    
    # If both floor and tables are None, return error
    if not floor and not tables:
        frappe.throw(_("Either floor or tables must be specified"), frappe.ValidationError)
    
    # If floor is specified, get all tables on that floor
    if floor:
        floor_doc = frappe.get_doc("Restaurant Floor", floor)
        branch = floor_doc.branch
        validate_branch_access(branch)
        
        if not tables:
            tables = frappe.get_all("Restaurant Table", 
                                  filters={"floor": floor},
                                  pluck="name")
    
    # Get status for each table
    table_status = {}
    for table in tables:
        # Get table details
        table_doc = frappe.get_doc("Restaurant Table", table)
        
        # Validate branch access if not already validated by floor
        if not floor:
            branch = frappe.db.get_value("Restaurant Floor", table_doc.floor, "branch")
            validate_branch_access(branch)
        
        # Get current order if any
        current_order = table_doc.current_pos_order
        
        # Build status data
        status_data = {
            "table": table,
            "floor": table_doc.floor,
            "status": table_doc.status,
            "no_of_seats": table_doc.no_of_seats,
            "minimum_seating": table_doc.minimum_seating
        }
        
        # Add order details if available
        if current_order:
            order_doc = frappe.get_doc("POS Order", current_order)
            status_data.update({
                "order": current_order,
                "order_status": order_doc.workflow_state,
                "customer": order_doc.customer,
                "order_type": order_doc.order_type,
                "occupied_since": order_doc.creation,
                "has_kot": frappe.db.exists("KOT Ticket", {"pos_order": current_order})
            })
        
        table_status[table] = status_data
    
    return {
        "floor": floor,
        "tables": table_status,
        "timestamp": frappe.utils.now_datetime().isoformat()
    }
