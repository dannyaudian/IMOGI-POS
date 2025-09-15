# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
import json
from frappe.model.document import Document


class KOTItem(Document):
    def validate(self):
        self.set_last_edited_by()
    
    def before_save(self):
        self.set_last_edited_by()
        self.set_options_display()

    def set_last_edited_by(self):
        """Set last_edited_by field to current user"""
        self.last_edited_by = frappe.session.user

    def set_options_display(self):
        """Parse item_options and build a summary string"""
        options = self.item_options
        if not options:
            self.options_display = ""
            return

        # Parse JSON string to dict if necessary
        if isinstance(options, str):
            try:
                options = frappe.parse_json(options)
            except Exception:
                try:
                    options = json.loads(options)
                except Exception:
                    self.options_display = ""
                    return

        if not isinstance(options, dict):
            self.options_display = ""
            return

        parts = []
        for key, value in options.items():
            label = key.replace("_", " ").title()
            if isinstance(value, dict):
                value = value.get("name") or value.get("value") or ", ".join(
                    f"{k}: {v}" for k, v in value.items()
                )
            parts.append(f"{label}: {value}")

        self.options_display = " | ".join(parts)
    
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
