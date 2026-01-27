import frappe
from frappe import _
from frappe.utils import now_datetime, cint
from typing import Dict, List, Optional, Union, Any, Tuple
import json


class TableLayoutService:
    """
    Service class for managing restaurant table layouts and operations.
    
    Handles:
    - Layout serialization and validation
    - Table status tracking and updates
    - Helper utilities for table operations
    """
    
    # Table status constants
    STATUS = {
        "AVAILABLE": "Available",
        "OCCUPIED": "Occupied",
        "RESERVED": "Reserved",
        "DIRTY": "Dirty",
        "INACTIVE": "Inactive"
    }
    
    def __init__(self, profile: Optional[str] = None):
        """
        Initialize the table layout service
        
        Args:
            profile: Optional Table Layout Profile name to work with
        """
        self.profile = None
        if profile:
            self.load_profile(profile)
    
    def load_profile(self, profile_name: str) -> Dict:
        """
        Load a Table Layout Profile
        
        Args:
            profile_name: Table Layout Profile name
            
        Returns:
            Profile document as dict
        """
        self.profile = frappe.get_doc("Table Layout Profile", profile_name)
        return self.profile
    
    def get_table_layout(
        self, 
        profile_name: Optional[str] = None, 
        floor: Optional[str] = None,
        with_table_status: bool = True
    ) -> Dict[str, Any]:
        """
        Get a complete table layout with nodes
        
        Args:
            profile_name: Layout profile name (optional if already loaded)
            floor: Filter by specific floor (optional)
            with_table_status: Include current table status
            
        Returns:
            Dict with layout information
        """
        # Load profile if needed
        if profile_name and (not self.profile or self.profile.name != profile_name):
            self.load_profile(profile_name)
        elif not self.profile:
            frappe.throw(_("No layout profile specified"))
        
        # Get all nodes for this profile
        filters = {"parent": self.profile.name}
        if floor:
            filters["floor"] = floor
            
        nodes = frappe.get_all(
            "Table Layout Node",
            filters=filters,
            fields=[
                "name", "node_type", "table", "floor", "label", 
                "position_x", "position_y", "width", "height", 
                "shape", "color", "background_color", "capacity",
                "rotation", "custom_class", "custom_data"
            ]
        )
        
        # Get table status if requested
        table_status = {}
        if with_table_status:
            # Get tables referenced in the nodes
            table_nodes = [node for node in nodes if node.get("table")]
            table_names = [node.get("table") for node in table_nodes]
            
            if table_names:
                table_status = self.get_table_status(table_names)
        
        # Group nodes by floor
        floors = {}
        for node in nodes:
            floor_name = node.get("floor")
            if not floor_name:
                continue
                
            # Add floor if not already in the dict
            if floor_name not in floors:
                floor_doc = frappe.get_doc("Restaurant Floor", floor_name)
                floors[floor_name] = {
                    "name": floor_name,
                    "description": floor_doc.description,
                    "nodes": []
                }
            
            # Add status to node if it's a table
            if with_table_status and node.get("table") and node.get("table") in table_status:
                node["status"] = table_status[node.get("table")]
            
            # Add node to floor
            floors[floor_name]["nodes"].append(node)
        
        return {
            "profile": self.profile.name,
            "floors": list(floors.values())
        }
    
    def save_table_layout(
        self, 
        profile_name: str, 
        layout_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Save a table layout (create or update nodes)
        
        Args:
            profile_name: Layout profile name
            layout_data: Layout data with floors and nodes
            
        Returns:
            Dict with success info
        """
        # Load profile
        if not self.profile or self.profile.name != profile_name:
            self.load_profile(profile_name)
        
        # Table layout profiles no longer reference legacy POS Profile defaults,
        # so domain validation based on it has been removed.
        
        # Track created/updated nodes
        created = []
        updated = []
        deleted = []
        
        # Get existing nodes
        existing_nodes = frappe.get_all(
            "Table Layout Node",
            filters={"parent": profile_name},
            fields=["name", "floor", "table"]
        )
        existing_node_names = [node.name for node in existing_nodes]
        
        # Process layout data
        if layout_data.get("floors"):
            for floor_data in layout_data.get("floors", []):
                floor_name = floor_data.get("name")
                if not floor_name:
                    continue
                
                # Process nodes for this floor
                processed_nodes = []
                for node_data in floor_data.get("nodes", []):
                    node_name = node_data.get("name")
                    
                    # Validate node data
                    self._validate_node_data(node_data, floor_name)
                    
                    # Prepare node data for save
                    node_values = {
                        "node_type": node_data.get("node_type"),
                        "floor": floor_name,
                        "label": node_data.get("label"),
                        "position_x": node_data.get("position_x", 0),
                        "position_y": node_data.get("position_y", 0),
                        "width": node_data.get("width", 100),
                        "height": node_data.get("height", 100),
                        "shape": node_data.get("shape", "rectangle"),
                        "color": node_data.get("color", "#000000"),
                        "background_color": node_data.get("background_color", "#FFFFFF"),
                        "rotation": node_data.get("rotation", 0),
                        "custom_class": node_data.get("custom_class", ""),
                        "custom_data": node_data.get("custom_data", "")
                    }
                    
                    # Add table reference if applicable
                    if node_data.get("table"):
                        node_values["table"] = node_data.get("table")
                    
                    # Add capacity if specified
                    if node_data.get("capacity"):
                        node_values["capacity"] = node_data.get("capacity")
                    
                    # Create or update node
                    if not node_name or node_name not in existing_node_names:
                        # Create new node
                        node_doc = frappe.get_doc({
                            "doctype": "Table Layout Node",
                            "parent": profile_name,
                            "parenttype": "Table Layout Profile",
                            "parentfield": "nodes",
                            **node_values
                        })
                        node_doc.insert()
                        created.append(node_doc.name)
                        processed_nodes.append(node_doc.name)
                    else:
                        # Update existing node
                        frappe.db.set_value("Table Layout Node", node_name, node_values)
                        updated.append(node_name)
                        processed_nodes.append(node_name)
                
                # Find nodes to delete (in this floor but not in processed nodes)
                floor_nodes = [n.name for n in existing_nodes if n.floor == floor_name]
                to_delete = [n for n in floor_nodes if n not in processed_nodes]
                
                # Delete nodes
                for node_name in to_delete:
                    frappe.delete_doc("Table Layout Node", node_name)
                    deleted.append(node_name)
        
        return {
            "profile": profile_name,
            "created": created,
            "updated": updated,
            "deleted": deleted
        }
    
    def get_table_status(
        self, 
        tables: Union[str, List[str]]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get the current status of one or more tables
        
        Args:
            tables: Table name or list of table names
            
        Returns:
            Dict mapping table names to status info
        """
        if isinstance(tables, str):
            tables = [tables]
            
        if not tables:
            return {}
            
        # Get table documents with relevant fields
        table_docs = frappe.get_all(
            "Restaurant Table",
            filters={"name": ["in", tables]},
            fields=[
                "name", "status", "current_pos_order", "floor", 
                "minimum_seating", "maximum_seating"
            ]
        )
        
        # Build status dict
        status = {}
        for table in table_docs:
            table_status = {
                "status": table.status or self.STATUS["AVAILABLE"],
                "order": table.current_pos_order,
                "floor": table.floor,
                "min_seating": table.minimum_seating,
                "max_seating": table.maximum_seating
            }
            
            # If there's a current order, get more details
            if table.current_pos_order:
                order_info = frappe.db.get_value(
                    "POS Order",
                    table.current_pos_order,
                    ["customer", "creation", "workflow_state"],
                    as_dict=1
                )
                
                if order_info:
                    table_status["order_info"] = order_info
                    
                    # Calculate time elapsed
                    if order_info.creation:
                        # Simplified - you may want to format this better
                        table_status["time_elapsed"] = now_datetime() - order_info.creation
            
            status[table.name] = table_status
            
        return status
    
    def update_table_status(
        self, 
        table: str, 
        status: str, 
        pos_order: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update a table's status and associated order
        
        Args:
            table: Table name
            status: New status (use STATUS constants)
            pos_order: POS Order to associate (optional)
            
        Returns:
            Dict with update info
        """
        # Validate status
        if status not in self.STATUS.values():
            frappe.throw(_("Invalid table status: {0}").format(status))
            
        # Get table doc
        table_doc = frappe.get_doc("Restaurant Table", table)
        
        # Update status
        old_status = table_doc.status
        table_doc.status = status
        
        # Update associated order if provided
        if pos_order:
            table_doc.current_pos_order = pos_order
        elif status == self.STATUS["AVAILABLE"]:
            # Clear current order if setting to Available
            table_doc.current_pos_order = None
            
        # Save changes
        table_doc.save()
        
        # Publish realtime update
        self._publish_table_update(table_doc)
        
        return {
            "table": table,
            "old_status": old_status,
            "new_status": status,
            "pos_order": table_doc.current_pos_order
        }
    
    def open_or_create_for_table(
        self, 
        table: str, 
        pos_profile: str, 
        customer: Optional[str] = None, 
        branch: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Open an existing POS Order for a table or create a new one
        
        Args:
            table: Table name
            pos_profile: POS Profile to use
            customer: Optional customer to associate
            branch: Optional branch for the order
            
        Returns:
            Dict with POS Order info
        """
        # Validate domain
        self._validate_restaurant_domain(pos_profile)
        
        # Get table document
        table_doc = frappe.get_doc("Restaurant Table", table)
        
        # Check if table already has an order
        if table_doc.current_pos_order:
            # Check if the order is still valid (not Closed/Cancelled/Returned)
            order_state = frappe.db.get_value(
                "POS Order", 
                table_doc.current_pos_order, 
                "workflow_state"
            )
            
            if order_state not in ["Closed", "Cancelled", "Returned"]:
                # Return existing order
                return {
                    "pos_order": table_doc.current_pos_order,
                    "is_new": False,
                    "table": table,
                    "floor": table_doc.floor
                }
        
        # If we reach here, we need to create a new order
        
        # Determine branch
        if not branch:
            # Try to get branch from table
            table_branch = frappe.db.get_value("Restaurant Table", table, "branch")
            if table_branch:
                branch = table_branch
            else:
                # Try to get from POS Profile
                profile_branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
                if profile_branch:
                    branch = profile_branch
                    
        # Ensure we have a branch
        if not branch:
            frappe.throw(_("Branch is required to create a POS Order"))
            
        # Create new POS Order
        new_order = frappe.get_doc({
            "doctype": "POS Order",
            "branch": branch,
            "table": table,
            "floor": table_doc.floor,
            "order_type": "Dine-in",
            "pos_profile": pos_profile,
            "workflow_state": "Draft"
        })
        
        # Add customer if provided
        if customer:
            new_order.customer = customer
            
        # Insert the new order
        new_order.insert()
        
        # Update table status to Occupied
        self.update_table_status(table, self.STATUS["OCCUPIED"], new_order.name)
        
        return {
            "pos_order": new_order.name,
            "is_new": True,
            "table": table,
            "floor": table_doc.floor
        }
    
    def get_available_tables(
        self, 
        floor: Optional[str] = None, 
        min_capacity: Optional[int] = None,
        branch: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get a list of available tables, optionally filtered
        
        Args:
            floor: Optional floor to filter by
            min_capacity: Optional minimum seating capacity
            branch: Optional branch to filter by
            
        Returns:
            List of available table info dicts
        """
        filters = {"status": self.STATUS["AVAILABLE"]}
        
        if floor:
            filters["floor"] = floor
            
        if branch:
            filters["branch"] = branch
            
        if min_capacity:
            filters["minimum_seating"] = [">=", cint(min_capacity)]
            
        tables = frappe.get_all(
            "Restaurant Table",
            filters=filters,
            fields=[
                "name", "floor", "minimum_seating", "maximum_seating",
                "description", "branch"
            ]
        )
        
        return tables
    
    def validate_and_prepare_table_operation(
        self, 
        table: str, 
        pos_profile: str
    ) -> Tuple[Dict, Dict]:
        """
        Validate and prepare for a table operation
        
        Args:
            table: Table name
            pos_profile: POS Profile to use
            
        Returns:
            Tuple of (table_doc, pos_profile_doc)
        """
        # Validate domain
        self._validate_restaurant_domain(pos_profile)
        
        # Get table and profile docs
        table_doc = frappe.get_doc("Restaurant Table", table)
        profile_doc = frappe.get_doc("POS Profile", pos_profile)
        
        # Validate branch if both have it set
        if table_doc.branch and profile_doc.get("imogi_branch") and table_doc.branch != profile_doc.get("imogi_branch"):
            frappe.throw(_("Table branch ({0}) does not match POS Profile branch ({1})").format(
                table_doc.branch, profile_doc.get("imogi_branch")
            ))
            
        return table_doc, profile_doc
    
    def _validate_node_data(self, node_data: Dict[str, Any], floor: str) -> None:
        """
        Validate node data before saving
        
        Args:
            node_data: Node data dictionary
            floor: Floor name this node belongs to
            
        Raises:
            frappe.ValidationError for invalid data
        """
        # Required fields
        if not node_data.get("node_type"):
            frappe.throw(_("Node type is required"))
            
        # Validate table reference if present
        if node_data.get("table"):
            table_exists = frappe.db.exists("Restaurant Table", node_data.get("table"))
            if not table_exists:
                frappe.throw(_("Table {0} does not exist").format(node_data.get("table")))
                
            # Check if table is on the right floor
            table_floor = frappe.db.get_value("Restaurant Table", node_data.get("table"), "floor")
            if table_floor != floor:
                frappe.throw(_("Table {0} belongs to floor {1}, not {2}").format(
                    node_data.get("table"), table_floor, floor
                ))
    
    def _publish_table_update(self, table_doc: Dict) -> None:
        """
        Publish realtime updates for a table change
        
        Args:
            table_doc: Table document
        """
        # Publish to table channel
        frappe.publish_realtime(
            f"table:{table_doc.name}",
            {
                "action": "table_updated",
                "table": table_doc.name,
                "status": table_doc.status,
                "order": table_doc.current_pos_order
            }
        )
        
        # Publish to floor channel if available
        if table_doc.floor:
            frappe.publish_realtime(
                f"table_display:floor:{table_doc.floor}",
                {
                    "action": "table_updated",
                    "table": table_doc.name,
                    "status": table_doc.status
                }
            )
    
    def _validate_restaurant_domain(self, pos_profile: str) -> None:
        """
        Validate that the POS Profile has the Restaurant domain enabled
        
        Args:
            pos_profile: POS Profile name
            
        Raises:
            frappe.ValidationError: If domain is not Restaurant
        """
        domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain")
        if domain != "Restaurant":
            frappe.throw(_("Table operations are only available for Restaurant domain"))


# Module-level functions as convenience wrappers around the service class

def get_table_layout(profile_name, floor=None, with_table_status=True):
    """Module-level wrapper for TableLayoutService.get_table_layout"""
    service = TableLayoutService()
    return service.get_table_layout(profile_name, floor, with_table_status)

def save_table_layout(profile_name, layout_data):
    """Module-level wrapper for TableLayoutService.save_table_layout"""
    service = TableLayoutService()
    return service.save_table_layout(profile_name, layout_data)

def get_table_status(tables):
    """Module-level wrapper for TableLayoutService.get_table_status"""
    service = TableLayoutService()
    return service.get_table_status(tables)

def update_table_status(table, status, pos_order=None):
    """Module-level wrapper for TableLayoutService.update_table_status"""
    service = TableLayoutService()
    return service.update_table_status(table, status, pos_order)

def open_or_create_for_table(table, pos_profile, customer=None, branch=None):
    """Module-level wrapper for TableLayoutService.open_or_create_for_table"""
    service = TableLayoutService()
    return service.open_or_create_for_table(table, pos_profile, customer, branch)

def get_available_tables(floor=None, min_capacity=None, branch=None):
    """Module-level wrapper for TableLayoutService.get_available_tables"""
    service = TableLayoutService()
    return service.get_available_tables(floor, min_capacity, branch)
