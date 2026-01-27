# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

"""
Table Layout & Waiter API

This module provides endpoints for table layout management and waiter app functionality.

WAITER APP ENDPOINTS:
- get_floors() - Get all floors for user's branch
- get_table_layout(floor) - Get positioned tables with status (uses Table Layout Profile)
- get_tables(branch) - Get simple table list with status (direct query, no layout)
- get_table_status(floor, tables) - Get detailed status for specific tables
- update_table_status(table, status, order) - Update table status and current order

LAYOUT EDITOR ENDPOINTS:
- save_table_layout(floor, layout_json, ...) - Save/update table positions

REACT HOOK MAPPING:
- useTables(branch) → get_tables(branch) ✅
- useUpdateTableStatus() → update_table_status(table, status, order) ✅
- (table layout UI) → get_floors() + get_table_layout(floor) ✅

IMPORTANT NOTES:
- get_table_layout uses "KOT Ticket" DocType name (verify in your system)
- Optimized to avoid N+1 queries (batch loads tables and orders)
- update_table_status validates branch access and restaurant domain
"""

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import cint
from imogi_pos.utils.permission_manager import check_branch_access
from imogi_pos.utils.decorators import require_permission

def check_restaurant_domain(pos_profile):
    """
    Validate that the POS Profile has the Restaurant domain enabled.

    Args:
        pos_profile (str): POS Profile name (required).

    Raises:
        frappe.ValidationError: If the profile is not for the Restaurant domain.
        
    Returns:
        str: The validated pos_profile name
    """
    if not pos_profile:
        frappe.throw(
            _("POS Profile required for restaurant domain check."),
            frappe.ValidationError,
        )

    domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain")
    if domain != "Restaurant":
        frappe.throw(
            _("Table layout features are only available for Restaurant domain"),
            frappe.ValidationError,
        )
    return pos_profile


@frappe.whitelist(allow_guest=False, methods=['GET', 'POST'])
def get_floors():
    """
    Gets all floors accessible to the current user's branch.
    Uses centralized operational context for branch resolution.
    
    Returns:
        list: List of floor documents with name and floor_name
    
    Raises:
        frappe.ValidationError: If no POS Profile is found or domain is not Restaurant
    """
    from imogi_pos.utils.operational_context import require_operational_context
    
    # Get operational context
    context = require_operational_context()
    pos_profile = context.get("pos_profile")
    branch = context.get("branch")
    
    # Check restaurant domain
    check_restaurant_domain(pos_profile)
    
    # Check restaurant domain
    check_restaurant_domain(pos_profile)
    
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
    Uses centralized operational context.
    
    Args:
        floor (str): Restaurant Floor name
    
    Returns:
        dict: Floor layout data including tables and their positions
    """
    from imogi_pos.utils.operational_context import require_operational_context
    
    # Get operational context
    context = require_operational_context()
    pos_profile = context.get("pos_profile")
    
    # Get the floor details
    floor_doc = frappe.get_doc("Restaurant Floor", floor)
    
    # Get branch from floor to validate access
    branch = floor_doc.branch
    check_branch_access(branch)
    
    # Check restaurant domain
    check_restaurant_domain(pos_profile)

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
    
    if not layout_nodes:
        # No tables positioned yet
        return {
            "floor": floor_doc.as_dict(),
            "tables": [],
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
    
    # PERFORMANCE OPTIMIZATION: Batch load all tables instead of N+1 queries
    table_names = [node.table for node in layout_nodes]
    
    # Get all table details in one query
    tables_list = frappe.get_all(
        "Restaurant Table",
        filters={"name": ["in", table_names]},
        fields=["name", "no_of_seats", "minimum_seating", "status", "current_pos_order"]
    )
    tables_map = {t.name: t for t in tables_list}
    
    # Get all current orders in one query
    current_orders = [t.current_pos_order for t in tables_list if t.current_pos_order]
    orders_map = {}
    
    if current_orders:
        orders_list = frappe.get_all(
            "POS Order",
            filters={"name": ["in", current_orders]},
            fields=["name", "workflow_state", "customer", "order_type", "creation"]
        )
        orders_map = {o.name: o for o in orders_list}
    
    # Build tables data from cached results
    tables_data = []
    for node in layout_nodes:
        table_doc = tables_map.get(node.table)
        if not table_doc:
            continue  # Skip if table was deleted
        
        # Get status data from cached order
        status_data = None
        if table_doc.current_pos_order and table_doc.current_pos_order in orders_map:
            order_doc = orders_map[table_doc.current_pos_order]
            status_data = {
                "order": table_doc.current_pos_order,
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
@require_permission("Table Layout Profile", "write")
def save_table_layout(floor, layout_json, profile_name=None, title=None):
    """
    Saves a table layout for a specific floor.
    Uses centralized operational context.
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
    from imogi_pos.utils.operational_context import require_operational_context
    
    # Get operational context
    context = require_operational_context()
    pos_profile = context.get("pos_profile")
    
    # Get the floor details
    floor_doc = frappe.get_doc("Restaurant Floor", floor)
    
    # Get branch from floor to validate access
    branch = floor_doc.branch
    check_branch_access(branch)
    
    # Check restaurant domain
    check_restaurant_domain(pos_profile)
    
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
def get_tables():
    """
    Gets all tables for a specific branch for the waiter app.
    Uses centralized operational context for branch resolution.
    Returns a simple list of tables with their current status.
    
    Returns:
        list: List of tables with basic information
    """
    from imogi_pos.utils.operational_context import require_operational_context
    
    context = require_operational_context()
    pos_profile = context.get("pos_profile")
    effective_branch = context.get("branch")
    
    if not effective_branch:
        return []
    
    # Validate branch access
    check_branch_access(effective_branch)
    
    # Get all tables for this branch through their floors
    # NOTE: Using frappe.get_all instead of SQL to avoid field issues
    floors = frappe.get_all(
        "Restaurant Floor",
        filters={"branch": effective_branch},
        fields=["name"],
        pluck="name"
    )
    
    if not floors:
        return []
    
    tables = frappe.get_all(
        "Restaurant Table",
        filters={"floor": ["in", floors]},
        fields=[
            "name",
            "table_number", 
            "status",
            "floor"
        ],
        order_by="floor, table_number"
    )
    
    # Enrich with floor names
    for table in tables:
        floor_name = frappe.db.get_value("Restaurant Floor", table.floor, "floor_name")
        table["floor_name"] = floor_name
        table["seating_capacity"] = 4  # Default, can be customized
    
    return tables or []


@frappe.whitelist()
@require_permission("Restaurant Table", "write")
def update_table_status(table, status, order=None):
    """
    Updates the status of a restaurant table and optionally links/unlinks an order.
    
    This endpoint is called by the Waiter app (useUpdateTableStatus hook) to:
    - Mark table as Occupied when order is created
    - Mark table as Available when order is completed
    - Update current_pos_order link
    
    Args:
        table (str): Restaurant Table name
        status (str): New status (Available, Occupied, Reserved, etc.)
        order (str, optional): POS Order name to link. Pass None to unlink.
    
    Returns:
        dict: Updated table information
    
    Raises:
        frappe.ValidationError: If table not found or permission denied
    """
    from imogi_pos.utils.operational_context import require_operational_context
    
    # Get operational context
    context = require_operational_context()
    pos_profile = context.get("pos_profile")
    
    # Get table document
    if not frappe.db.exists("Restaurant Table", table):
        frappe.throw(_("Table {0} not found").format(table), frappe.DoesNotExistError)
    
    table_doc = frappe.get_doc("Restaurant Table", table)
    
    # Validate branch access via floor
    floor_branch = frappe.db.get_value("Restaurant Floor", table_doc.floor, "branch")
    if floor_branch:
        check_branch_access(floor_branch)
    
    # Check restaurant domain
    check_restaurant_domain(pos_profile)
    
    # Validate status value
    valid_statuses = ["Available", "Occupied", "Reserved", "Maintenance"]
    if status not in valid_statuses:
        frappe.throw(
            _("Invalid status. Must be one of: {0}").format(", ".join(valid_statuses)),
            frappe.ValidationError
        )
    
    # Update table
    table_doc.status = status
    
    # Update order link
    if order:
        # Validate order exists and belongs to this table
        if not frappe.db.exists("POS Order", order):
            frappe.throw(_("Order {0} not found").format(order), frappe.DoesNotExistError)
        
        order_table = frappe.db.get_value("POS Order", order, "table")
        if order_table != table:
            frappe.throw(
                _("Order {0} is not assigned to table {1}").format(order, table),
                frappe.ValidationError
            )
        
        table_doc.current_pos_order = order
    else:
        # Clear order link
        table_doc.current_pos_order = None
    
    # Save changes
    table_doc.save(ignore_permissions=True)
    
    # Publish realtime event for table update
    frappe.publish_realtime(
        event="table_status_updated",
        message={
            "table": table,
            "status": status,
            "order": order,
            "floor": table_doc.floor
        },
        room=f"table:{table}"
    )
    
    # Also publish to floor room for waiter UI updates
    frappe.publish_realtime(
        event="floor_table_updated",
        message={
            "table": table,
            "status": status,
            "order": order
        },
        room=f"floor:{table_doc.floor}"
    )
    
    return {
        "success": True,
        "table": table,
        "status": status,
        "order": order,
        "floor": table_doc.floor,
        "message": _("Table status updated successfully")
    }


@frappe.whitelist()
def get_table_status(floor=None, tables=None):
    """
    Gets the current status of tables on a floor or specific tables.
    Uses centralized operational context.
    
    Args:
        floor (str, optional): Restaurant Floor name. Defaults to None.
        tables (list or str, optional): Specific tables to check. Defaults to None.
    
    Returns:
        dict: Table status information
    """
    from imogi_pos.utils.operational_context import require_operational_context
    
    # Get operational context
    context = require_operational_context()
    pos_profile = context.get("pos_profile")
    
    # Check restaurant domain
    check_restaurant_domain(pos_profile)
    
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
        check_branch_access(branch)
        
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
            check_branch_access(branch)
        
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
                # IMPORTANT: Using "KOT Ticket" - verify DocType name in your system
                # May need to change to "Kitchen Order Ticket" depending on installation
                "has_kot": frappe.db.exists("KOT Ticket", {"pos_order": current_order})
            })
        
        table_status[table] = status_data
    
    return {
        "floor": floor,
        "tables": table_status,
        "timestamp": frappe.utils.now_datetime().isoformat()
    }
