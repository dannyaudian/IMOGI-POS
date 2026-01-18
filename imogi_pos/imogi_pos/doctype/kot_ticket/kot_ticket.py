# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _
from frappe.utils import now_datetime
from imogi_pos.utils.state_manager import StateManager
from imogi_pos.utils.kot_publisher import KOTPublisher


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
            self.workflow_state = StateManager.STATES["QUEUED"]
    
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
        
        # Get KOT states
        kot_states = [kot.workflow_state for kot in all_kots]
        
        # Use StateManager to determine new POS Order state
        new_pos_state = StateManager.get_pos_order_state_from_kots(kot_states)
        
        # Only update if we have a new state to apply
        if StateManager.should_update_pos_order_state(
            frappe.db.get_value("POS Order", self.pos_order, "workflow_state"),
            new_pos_state
        ):
            frappe.db.set_value("POS Order", self.pos_order, "workflow_state", new_pos_state)
    
    def publish_realtime_updates(self):
        """Publish realtime updates for KOT status changes using KOTPublisher"""
        KOTPublisher.publish_ticket_update(self, event_type="kot_updated")
    
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