# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class RestaurantTable(Document):
    def validate(self):
        self.validate_domain()
        self.validate_seating()
        
    def validate_domain(self):
        """Validate that restaurant features are only used in Restaurant domain"""
        # Check if any POS Profile has the Restaurant domain
        has_restaurant_domain = frappe.db.exists(
            "POS Profile", 
            {"imogi_pos_domain": "Restaurant"}
        )
        
        if not has_restaurant_domain:
            frappe.msgprint(
                _("No POS Profile with Restaurant domain found. Restaurant Table features are only available for Restaurant domain."),
                indicator="orange",
                alert=True
            )
    
    def validate_seating(self):
        """Validate that minimum seating is less than or equal to maximum seating"""
        if self.minimum_seating > self.maximum_seating:
            frappe.throw(_("Minimum seating cannot be greater than maximum seating"))
    
    def before_save(self):
        """Ensure branch matches floor branch"""
        if self.floor:
            floor_branch = frappe.db.get_value("Restaurant Floor", self.floor, "branch")
            if floor_branch and self.branch != floor_branch:
                self.branch = floor_branch
    
    def after_insert(self):
        """Update floor's tables list after insert"""
        self.update_floor_tables()
    
    def on_update(self):
        """Update floor's tables list after update"""
        self.update_floor_tables()
        
        # Publish realtime update
        self.publish_table_update()
    
    def on_trash(self):
        """Update floor's tables list after delete"""
        self.update_floor_tables(remove=True)
    
    def update_floor_tables(self, remove=False):
        """Update the parent floor's tables list"""
        if not self.floor:
            return
            
        try:
            floor = frappe.get_doc("Restaurant Floor", self.floor)
            floor.update_tables_list()
        except Exception as e:
            frappe.log_error(
                title="Restaurant Table Update Error",
                message=f"Error updating floor tables: {e}"
            )
    
    def set_status(self, status, pos_order=None):
        """Set table status and update current order"""
        self.reload()
        self.status = status
        if pos_order:
            self.current_pos_order = pos_order
        elif status == "Available":
            self.current_pos_order = None
        self.save(ignore_version=True)
        self.publish_table_update()
        return {"status": self.status, "current_pos_order": self.current_pos_order}

    def ensure_available_for_new_order(self):
        """Ensure table has no active POS Order before creating a new one.

        If the linked ``current_pos_order`` exists but its workflow state is in a
        terminal state (Closed/Cancelled/Returned), clear it. Otherwise raise an
        error to prevent multiple active orders for the same table.
        """
        if not self.current_pos_order:
            return

        state = frappe.db.get_value(
            "POS Order", self.current_pos_order, "workflow_state"
        )

        closed_states = ("Closed", "Cancelled", "Returned")
        if state in closed_states:
            # Stale link – mark table as available again
            self.set_status("Available")
        else:
            frappe.throw(
                _(
                    "POS Order {0} is still {1}. Close or reopen it before creating a new order."
                ).format(self.current_pos_order, state),
                frappe.ValidationError,
            )
    
    def publish_table_update(self):
        """Publish realtime update for table status change"""
        # Publish to table channel
        frappe.publish_realtime(
            f"table:{self.name}",
            {
                "action": "table_updated",
                "table": self.name,
                "status": self.status,
                "order": self.current_pos_order
            }
        )
        
        # Publish to floor channel
        if self.floor:
            frappe.publish_realtime(
                f"table_display:floor:{self.floor}",
                {
                    "action": "table_updated",
                    "table": self.name,
                    "status": self.status
                }
            )
    
    def generate_qr_slug(self):
        """Generate a new QR slug for this table"""
        if not frappe.db.exists("Module Def", "imogi_pos"):
            frappe.msgprint(_("IMOGI POS module not found. QR generation is not available."))
            return
            
        try:
            from imogi_pos.utils.qr import refresh_table_qr_token
            result = refresh_table_qr_token(self.name)
            return result
        except ImportError:
            frappe.log_error("Failed to import QR module", "QR Generation Error")
            return None