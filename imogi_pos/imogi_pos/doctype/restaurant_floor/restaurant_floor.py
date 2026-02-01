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

        # Save child table safely using SQL parameterized updates
        if tables:
            # Delete existing child records for this floor
            frappe.db.sql(
                """
                DELETE FROM `tabRestaurant Floor Table`
                WHERE parent = %(parent)s
                """,
                {"parent": self.name}
            )
            
            # Insert new child records with parameterized query
            for idx, row in enumerate(self.tables, start=1):
                frappe.db.sql(
                    """
                    INSERT INTO `tabRestaurant Floor Table`
                    (name, creation, modified, modified_by, owner, docstatus, 
                     parent, parenttype, parentfield, idx,
                     table, table_number, status, current_pos_order)
                    VALUES (%(name)s, NOW(), NOW(), %(user)s, %(user)s, 0,
                            %(parent)s, 'Restaurant Floor', 'tables', %(idx)s,
                            %(table)s, %(table_number)s, %(status)s, %(current_pos_order)s)
                    """,
                    {
                        "name": frappe.generate_hash(length=10),
                        "user": frappe.session.user,
                        "parent": self.name,
                        "idx": idx,
                        "table": row.table,
                        "table_number": row.table_number,
                        "status": row.status,
                        "current_pos_order": row.current_pos_order
                    }
                )
            
            frappe.db.commit()
    
    def get_active_tables(self):
        """Get all active tables on this floor"""
        return frappe.get_all(
            "Restaurant Table",
            filters={"floor": self.name, "is_active": 1},
            fields=["name", "table_number", "status", "current_pos_order", 
                   "minimum_seating", "maximum_seating"]
        )
