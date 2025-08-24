# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class RestaurantFloor(Document):
    def validate(self):
        self.validate_domain()
    
    def validate_domain(self):
        """Validate that restaurant features are only used in Restaurant domain"""
        # Check if any POS Profile has the Restaurant domain
        has_restaurant_domain = frappe.db.exists(
            "POS Profile", 
            {"imogi_pos_domain": "Restaurant"}
        )
        
        if not has_restaurant_domain:
            frappe.msgprint(
                _("No POS Profile with Restaurant domain found. Restaurant Floor features are only available for Restaurant domain."),
                indicator="orange",
                alert=True
            )
    
    def after_insert(self):
        """Update tables list after insert"""
        self.update_tables_list()
    
    def on_update(self):
        """Update tables list after update"""
        self.update_tables_list()
    
    def update_tables_list(self):
        """Update the tables table with current linked tables"""
        # Clear existing tables
        self.tables = []
        
        # Get all tables linked to this floor
        tables = frappe.get_all(
            "Restaurant Table", 
            filters={"floor": self.name},
            fields=["name", "table_number", "status", "current_pos_order"]
        )
        
        # Add them to the tables table
        for table in tables:
            self.append("tables", {
                "table": table.name,
                "table_number": table.table_number,
                "status": table.status,
                "current_pos_order": table.current_pos_order
            })
        
        # Save without triggering on_update again
        if tables:
            frappe.db.set_value(
                "Restaurant Floor", 
                self.name, 
                "tables", 
                self.tables, 
                update_modified=False
            )
    
    def get_active_tables(self):
        """Get all active tables on this floor"""
        return frappe.get_all(
            "Restaurant Table",
            filters={"floor": self.name, "is_active": 1},
            fields=["name", "table_number", "status", "current_pos_order", 
                   "minimum_seating", "maximum_seating"]
        )