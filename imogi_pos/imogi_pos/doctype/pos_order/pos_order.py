# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class POSOrder(Document):
    def validate(self):
        self.validate_domain()
        self.set_last_edited_by()
        self.calculate_totals()
    
    def before_save(self):
        self.set_last_edited_by()
    
    def on_update(self):
        self.update_table_status()
    
    def validate_domain(self):
        """Validate that the POS Profile has the right domain"""
        domain = frappe.db.get_value("POS Profile", self.pos_profile, "imogi_pos_domain")
        if self.table and domain != "Restaurant":
            frappe.throw(_("Table can only be set for Restaurant domain POS Profiles"))
    
    def set_last_edited_by(self):
        """Copy modified_by to last_edited_by for easier tracking"""
        self.last_edited_by = self.modified_by or frappe.session.user
    
    def calculate_totals(self):
        """Calculate order totals from items"""
        total = 0
        for item in self.items:
            if not item.amount:
                item.amount = (item.qty or 0) * (item.rate or 0)
            total += item.amount
        self.totals = total
    
    def update_table_status(self):
        """Update table status if applicable"""
        if not self.table:
            return
            
        # Get current table status
        table_status = frappe.db.get_value("Restaurant Table", self.table, ["status", "current_pos_order"])
        
        # Only update if this is a new order or status has changed
        workflow_closed_states = ["Closed", "Cancelled", "Returned"]
        
        if self.workflow_state in workflow_closed_states:
            # If order is closed/cancelled/returned, clear table if it's still linked to this order
            if table_status and table_status[1] == self.name:
                frappe.db.set_value("Restaurant Table", self.table, {
                    "status": "Available",
                    "current_pos_order": None
                })
        elif table_status and (not table_status[1] or table_status[1] == self.name):
            # Link table to this order if not already linked to another order
            frappe.db.set_value("Restaurant Table", self.table, {
                "status": "Occupied",
                "current_pos_order": self.name
            })
            
    def on_trash(self):
        """Clean up when document is deleted"""
        # If linked to a table, update table status
        if self.table:
            table_pos_order = frappe.db.get_value("Restaurant Table", self.table, "current_pos_order")
            if table_pos_order == self.name:
                frappe.db.set_value("Restaurant Table", self.table, {
                    "status": "Available",
                    "current_pos_order": None
                })