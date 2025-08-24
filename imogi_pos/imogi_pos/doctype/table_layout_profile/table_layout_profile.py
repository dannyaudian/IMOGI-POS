# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class TableLayoutProfile(Document):
    def validate(self):
        self.validate_domain()
        self.validate_nodes()
        
    def validate_domain(self):
        """Validate that restaurant features are only used in Restaurant domain"""
        # Check if any POS Profile has the Restaurant domain
        has_restaurant_domain = frappe.db.exists(
            "POS Profile", 
            {"imogi_pos_domain": "Restaurant"}
        )
        
        if not has_restaurant_domain:
            frappe.msgprint(
                _("No POS Profile with Restaurant domain found. Table Layout features are only available for Restaurant domain."),
                indicator="orange",
                alert=True
            )
    
    def validate_nodes(self):
        """Validate layout nodes"""
        # Check for duplicate table references
        table_nodes = {}
        for node in self.nodes:
            if node.table:
                if node.table in table_nodes:
                    frappe.throw(_("Table {0} is referenced by multiple nodes").format(node.table))
                table_nodes[node.table] = node.name
                
                # Validate table exists
                if not frappe.db.exists("Restaurant Table", node.table):
                    frappe.throw(_("Table {0} does not exist").format(node.table))
    
    def import_tables_from_floor(self, floor=None):
        """Import tables from a floor as nodes"""
        if not floor and not self.default_floor:
            frappe.throw(_("No floor specified for import"))
            
        floor_name = floor or self.default_floor
        
        # Get all tables from the floor
        tables = frappe.get_all(
            "Restaurant Table",
            filters={"floor": floor_name, "is_active": 1},
            fields=["name", "table_number"]
        )
        
        if not tables:
            frappe.msgprint(_("No tables found on floor {0}").format(floor_name))
            return
            
        # Add tables as nodes if they don't already exist
        existing_tables = [node.table for node in self.nodes if node.table]
        added = 0
        
        # Calculate grid spacing
        grid_size = self.grid_size or 20
        cols = max(3, self.canvas_width // (grid_size * 5))  # 5 cells per table width
        
        for i, table in enumerate(tables):
            if table.name in existing_tables:
                continue
                
            # Calculate position in grid
            row = i // cols
            col = i % cols
            
            # Create node
            self.append("nodes", {
                "node_type": "table",
                "table": table.name,
                "label": table.table_number,
                "position_x": col * grid_size * 5 + grid_size,
                "position_y": row * grid_size * 5 + grid_size,
                "width": grid_size * 4,
                "height": grid_size * 4,
                "shape": "rectangle",
                "color": "#4CAF50",
                "background_color": "#E8F5E9"
            })
            added += 1
            
        if added > 0:
            self.save()
            frappe.msgprint(_("Added {0} tables to layout").format(added))
        else:
            frappe.msgprint(_("No new tables to add"))
    
    def get_serialized_layout(self, with_table_status=True):
        """Get serialized layout data for frontend"""
        layout_data = {
            "profile": self.name,
            "grid": {
                "size": self.grid_size,
                "snap": self.grid_snap,
                "show": self.show_grid,
                "width": self.canvas_width,
                "height": self.canvas_height
            },
            "nodes": []
        }
        
        # Get table status if requested
        table_status = {}
        if with_table_status:
            tables = [node.table for node in self.nodes if node.table]
            if tables:
                table_docs = frappe.get_all(
                    "Restaurant Table",
                    filters={"name": ["in", tables]},
                    fields=["name", "status", "current_pos_order"]
                )
                
                for table in table_docs:
                    table_status[table.name] = {
                        "status": table.status,
                        "order": table.current_pos_order
                    }
        
        # Add nodes
        for node in self.nodes:
            node_data = {
                "id": node.name,
                "type": node.node_type,
                "x": node.position_x,
                "y": node.position_y,
                "width": node.width,
                "height": node.height,
                "rotation": node.rotation or 0,
                "shape": node.shape,
                "color": node.color,
                "backgroundColor": node.background_color,
                "label": node.label,
                "customClass": node.custom_class or ""
            }
            
            # Add table reference if present
            if node.table:
                node_data["table"] = node.table
                
                # Add status if available
                if with_table_status and node.table in table_status:
                    node_data["status"] = table_status[node.table]["status"]
                    node_data["order"] = table_status[node.table]["order"]
                    
            if node.custom_data:
                try:
                    import json
                    custom_data = json.loads(node.custom_data)
                    node_data["customData"] = custom_data
                except:
                    # If JSON parsing fails, use as string
                    node_data["customData"] = node.custom_data
            
            layout_data["nodes"].append(node_data)
            
        return layout_data