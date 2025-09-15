# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from imogi_pos.utils.options import format_options_for_display


class KOTItem(Document):
    def validate(self):
        self.set_last_edited_by()
        self.set_options_display()

    def before_save(self):
        self.set_last_edited_by()
        self.set_options_display()
    
    def set_last_edited_by(self):
        """Set last_edited_by field to current user"""
        self.last_edited_by = frappe.session.user

    def set_options_display(self):
        """Generate human readable options string"""
        self.options_display = format_options_for_display(getattr(self, "item_options", None))
    
    def update_pos_order_item(self):
        """Update the corresponding POS Order Item counters"""
        if not self.pos_order_item:
            return
            
        try:
            # Try to get the POS Order Item
            counters = frappe.db.get_value("POS Order Item", self.pos_order_item, "counters") or "{}"
            
            # Parse counters
            import json
            if isinstance(counters, str):
                counters = json.loads(counters)
            
            # Map KOT states to counter fields
            state_to_counter = {
                "Queued": "sent",
                "In Progress": "preparing",
                "Ready": "ready",
                "Served": "served",
                "Cancelled": "cancelled"
            }
            
            # Update the appropriate counter with current timestamp
            if self.workflow_state in state_to_counter:
                import datetime
                counters[state_to_counter[self.workflow_state]] = datetime.datetime.now().isoformat()
            
            # Save back to the POS Order Item
            frappe.db.set_value(
                "POS Order Item", 
                self.pos_order_item, 
                {
                    "counters": json.dumps(counters),
                    "last_edited_by": frappe.session.user
                }
            )
            
        except Exception as e:
            frappe.log_error(
                f"Error updating POS Order Item counters: {str(e)}",
                "KOT Item Update Error"
            )