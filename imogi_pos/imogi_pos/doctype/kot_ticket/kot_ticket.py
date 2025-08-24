# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _
from frappe.utils import now_datetime


class KOTTicket(Document):
    def validate(self):
        self.validate_domain()
        self.set_defaults()
        self.set_last_edited_by()
    
    def before_save(self):
        self.set_last_edited_by()
    
    def on_update(self):
        self.update_pos_order_state()
        self.publish_realtime_updates()
    
    def validate_domain(self):
        """Validate that the POS Profile has the Restaurant domain"""
        if self.pos_order:
            pos_profile = frappe.db.get_value("POS Order", self.pos_order, "pos_profile")
            if pos_profile:
                domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain")
                if domain != "Restaurant":
                    frappe.throw(_("KOT features are only available for Restaurant domain"))
    
    def set_defaults(self):
        """Set default values if not provided"""
        if not self.creation_time:
            self.creation_time = now_datetime()
            
        if not self.created_by:
            self.created_by = frappe.session.user
            
        # Set workflow_state default if not set
        if not self.workflow_state:
            self.workflow_state = "Queued"
    
    def set_last_edited_by(self):
        """Set last_edited_by field to current user"""
        self.last_edited_by = self.modified_by or frappe.session.user
    
    def update_pos_order_state(self):
        """Update the POS Order state based on KOT state changes"""
        if not self.pos_order:
            return
            
        # Get all KOTs for this order
        all_kots = frappe.get_all(
            "KOT Ticket", 
            filters={"pos_order": self.pos_order},
            fields=["name", "workflow_state"]
        )
        
        # Map KOT states to POS Order states
        kot_to_pos_map = {
            "Preparing": "In Progress",
            "Ready": "Ready",
            "Served": "Served",
            "Cancelled": "Cancelled"  # Only if all KOTs are cancelled
        }
        
        new_pos_state = None
        
        # If all KOTs are cancelled, mark order as cancelled
        if all(kot.workflow_state == "Cancelled" for kot in all_kots):
            new_pos_state = "Cancelled"
        
        # If all KOTs are served, mark order as served
        elif all(kot.workflow_state == "Served" for kot in all_kots):
            new_pos_state = "Served"
        
        # If any KOT is ready and none are queued/preparing, mark order as ready
        elif any(kot.workflow_state == "Ready" for kot in all_kots) and \
             not any(kot.workflow_state in ["Queued", "Preparing"] for kot in all_kots):
            new_pos_state = "Ready"
        
        # If any KOT is preparing, mark order as in progress
        elif any(kot.workflow_state == "Preparing" for kot in all_kots):
            new_pos_state = "In Progress"
        
        # Only update if we have a new state to apply
        if new_pos_state:
            current_state = frappe.db.get_value("POS Order", self.pos_order, "workflow_state")
            if current_state != new_pos_state:
                frappe.db.set_value("POS Order", self.pos_order, "workflow_state", new_pos_state)
    
    def publish_realtime_updates(self):
        """Publish realtime updates for KOT status changes"""
        # Publish to kitchen station channel
        if self.kitchen_station:
            frappe.publish_realtime(
                f"kitchen:station:{self.kitchen_station}",
                {
                    "action": "kot_updated",
                    "ticket": self.name,
                    "state": self.workflow_state,
                    "branch": self.branch
                }
            )
        
        # Publish to kitchen channel
        if self.kitchen:
            frappe.publish_realtime(
                f"kitchen:{self.kitchen}",
                {
                    "action": "kot_updated",
                    "ticket": self.name,
                    "station": self.kitchen_station,
                    "state": self.workflow_state,
                    "branch": self.branch
                }
            )
        
        # Publish to table channel if applicable
        if self.table:
            frappe.publish_realtime(
                f"table:{self.table}",
                {
                    "action": "kot_updated",
                    "ticket": self.name,
                    "state": self.workflow_state
                }
            )
            
            # Also publish to floor channel if available
            if self.floor:
                frappe.publish_realtime(
                    f"table_display:floor:{self.floor}",
                    {
                        "action": "table_updated",
                        "table": self.table,
                        "has_kot_updates": True
                    }
                )
    
    def log_reprint(self, printer=None, copies=1):
        """Log a reprint event"""
        if not self.reprint_logs:
            self.reprint_logs = []
            
        reprint_log = {
            "printer": printer,
            "copies": copies,
            "timestamp": now_datetime(),
            "user": frappe.session.user
        }
        
        self.append("reprint_logs", reprint_log)
        self.save()
        
        return reprint_log