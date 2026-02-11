# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _
from frappe.utils import flt
from imogi_pos.utils.customer_sync import sync_customer_fields_to_order


class POSOrder(Document):
    def validate(self):
        self.validate_domain()
        self.sync_customer_fields()
        self.set_last_edited_by()
        self.calculate_totals()
    
    def before_save(self):
        self.set_last_edited_by()
        # Track previous workflow state for KOT creation trigger
        doc_before = self.get_doc_before_save()
        if doc_before:
            self._previous_workflow_state = doc_before.workflow_state
        else:
            # For new documents, check if there's a saved version in DB
            if self.name and frappe.db.exists("POS Order", self.name):
                self._previous_workflow_state = frappe.db.get_value(
                    "POS Order", self.name, "workflow_state"
                )
            else:
                self._previous_workflow_state = None
    
    def on_update(self):
        self.update_table_status()
        self.auto_create_kot_on_send_to_kitchen()
    
    def sync_customer_fields(self):
        """Auto-sync customer fields from Customer master if customer selected"""
        if self.customer and self.customer != "Guest":
            sync_customer_fields_to_order(self)
    
    def validate_domain(self):
        """Validate that the POS Profile has the right mode for table orders"""
        mode = frappe.db.get_value("POS Profile", self.pos_profile, "imogi_mode")
        if self.table and mode not in ["Table", "Kiosk", "Self-Order"]:
            frappe.throw(_("Table can only be set for Restaurant mode POS Profiles (Table/Kiosk/Self-Order)"))
    
    def set_last_edited_by(self):
        """Copy modified_by to last_edited_by for easier tracking"""
        self.last_edited_by = self.modified_by or frappe.session.user
    
    def calculate_totals(self):
        """Calculate order totals including PB1"""
        subtotal = 0
        for item in self.items:
            if not item.amount:
                item.amount = (item.qty or 0) * (item.rate or 0)
            subtotal += item.amount

        # store subtotal
        self.subtotal = subtotal

        # apply PB1 tax (11%)
        pb1 = subtotal * 0.11
        self.pb1_amount = pb1
        
        # total is subtotal + PB1
        self.totals = subtotal + pb1
    
    def update_table_status(self):
        """Update table status if applicable"""
        if not self.table:
            return
            
        # Get current table status
        table_status = frappe.db.get_value(
            "Restaurant Table",
            self.table,
            ["status", "current_pos_order"],
            as_dict=True,
        )
        # Only update if this is a new order or status has changed
        workflow_closed_states = ["Closed", "Cancelled", "Returned"]

        current_order = table_status.get("current_pos_order") if table_status else None

        if self.workflow_state in workflow_closed_states:
            # If order is closed/cancelled/returned, clear table if it's still linked to this order
            if table_status and table_status.get("current_pos_order") == self.name:
                frappe.db.set_value("Restaurant Table", self.table, {
                    "status": "Available",
                    "current_pos_order": None
                })
        elif table_status and (not table_status.get("current_pos_order") or table_status.get("current_pos_order") == self.name):
            # Link table to this order if not already linked to another order
            frappe.db.set_value(
                "Restaurant Table",
                self.table,
                {"status": "Occupied", "current_pos_order": self.name},
            )

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
    
    def on_cancel(self):
        """Release table when order cancelled (Restaurant Flow)"""
        if self.table:
            try:
                from imogi_pos.api.orders import release_table_if_done
                release_table_if_done(self.name)
            except Exception as e:
                frappe.log_error(
                    title="Restaurant Flow: Table Release on Cancel Failed",
                    message=f"Order: {self.name}, Table: {self.table}, Error: {str(e)}"
                )
                # Fallback: direct release
                table_pos_order = frappe.db.get_value("Restaurant Table", self.table, "current_pos_order")
                if table_pos_order == self.name:
                    frappe.db.set_value("Restaurant Table", self.table, {
                        "status": "Available",
                        "current_pos_order": None
                    })

    def auto_create_kot_on_send_to_kitchen(self):
        """
        Automatically create KOT Ticket when workflow action 'Send to Kitchen' is triggered.
        This happens when state changes from 'Draft' to 'In Progress' (or 'Sent to Kitchen').
        """
        # Get previous state (set in before_save)
        previous_state = getattr(self, '_previous_workflow_state', None)
        current_state = self.workflow_state
        
        # DEBUG: Log state transition info
        frappe.log_error(
            title="[DEBUG] Auto KOT - State Check",
            message=f"Order: {self.name}\n"
                   f"Previous State: {previous_state}\n"
                   f"Current State: {current_state}\n"
                   f"POS Profile: {self.pos_profile}"
        )
        
        # Only trigger on specific state transitions that indicate "Send to Kitchen"
        # Also trigger if previous_state is None and current is In Progress (first save with workflow)
        send_to_kitchen_transitions = [
            ("Draft", "In Progress"),
            ("Draft", "Sent to Kitchen"),
            (None, "In Progress"),  # First save edge case
        ]
        
        transition = (previous_state, current_state)
        if transition not in send_to_kitchen_transitions:
            frappe.log_error(
                title="[DEBUG] Auto KOT - Transition Skipped",
                message=f"Order: {self.name}, Transition {transition} not in allowed list"
            )
            return
        
        # Check if POS Profile has Restaurant domain and KOT enabled
        pos_profile_data = frappe.db.get_value(
            "POS Profile", 
            self.pos_profile, 
            ["imogi_pos_domain", "imogi_enable_kot"],
            as_dict=True
        )
        
        if not pos_profile_data:
            frappe.log_error(
                title="[DEBUG] Auto KOT - No POS Profile Data",
                message=f"Order: {self.name}, POS Profile: {self.pos_profile}"
            )
            return
        
        domain = pos_profile_data.get("imogi_pos_domain")
        enable_kot = pos_profile_data.get("imogi_enable_kot")
        
        # DEBUG: Log POS Profile settings
        frappe.log_error(
            title="[DEBUG] Auto KOT - POS Profile Settings",
            message=f"Order: {self.name}\n"
                   f"Domain: {domain}\n"
                   f"Enable KOT: {enable_kot}"
        )
        
        # Only create KOT for Restaurant domain with KOT enabled
        if domain != "Restaurant" or not enable_kot:
            frappe.log_error(
                title="[DEBUG] Auto KOT - Domain/KOT Check Failed",
                message=f"Order: {self.name}, domain={domain}, enable_kot={enable_kot}"
            )
            return
        
        # Check if there are items to send (not already sent)
        items_to_send = []
        for item in self.items:
            counters = frappe.parse_json(item.get("counters") or "{}")
            if not counters.get("sent"):
                items_to_send.append(item)
        
        # DEBUG: Log items check
        frappe.log_error(
            title="[DEBUG] Auto KOT - Items Check",
            message=f"Order: {self.name}\n"
                   f"Total items: {len(self.items)}\n"
                   f"Items to send: {len(items_to_send)}"
        )
        
        if not items_to_send:
            return
        
        # Create KOT
        try:
            from imogi_pos.kitchen.kot_service import create_kot_from_order
            
            frappe.log_error(
                title="[DEBUG] Auto KOT - Creating KOT",
                message=f"Order: {self.name}, Calling create_kot_from_order..."
            )
            
            kot_result = create_kot_from_order(
                pos_order=self.name,
                selected_items=None,  # All unsent items
                send_to_kitchen=True
            )
            
            if kot_result and kot_result.get("tickets"):
                frappe.msgprint(
                    _("KOT Ticket(s) created: {0}").format(
                        ", ".join(kot_result["tickets"])
                    ),
                    alert=True,
                    indicator="green"
                )
                frappe.log_error(
                    title="[DEBUG] Auto KOT - SUCCESS",
                    message=f"Order: {self.name}, KOT created: {kot_result['tickets']}"
                )
            else:
                frappe.log_error(
                    title="[DEBUG] Auto KOT - No Tickets Created",
                    message=f"Order: {self.name}, Result: {kot_result}"
                )
        except Exception as e:
            frappe.log_error(
                title="Auto KOT Creation Failed",
                message=f"Order: {self.name}, Error: {str(e)}\n{frappe.get_traceback()}"
            )
            frappe.msgprint(
                _("Failed to create KOT: {0}").format(str(e)),
                alert=True,
                indicator="red"
            )
