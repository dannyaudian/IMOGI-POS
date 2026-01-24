"""
Custom POS Profile override to add validation for IMOGI POS custom fields
"""
import frappe
from frappe import _
from erpnext.accounts.doctype.pos_profile.pos_profile import POSProfile


class CustomPOSProfile(POSProfile):
    """
    Extended POS Profile with IMOGI POS validations
    """
    
    def validate(self):
        """Override validate to add custom validations"""
        super().validate()
        self.validate_session_scope()
    
    def validate_session_scope(self):
        """Validate session scope field has valid value"""
        if self.get("imogi_require_pos_session"):
            scope = self.get("imogi_pos_session_scope")
            valid_values = ["User", "Device", "POS Profile"]
            
            # Check if scope is set
            if not scope:
                # Set default
                self.imogi_pos_session_scope = "User"
            elif scope not in valid_values:
                # Invalid value - this can happen if the field was corrupted
                frappe.throw(
                    _("Session Scope must be one of: {0}").format(", ".join(valid_values)),
                    frappe.ValidationError
                )
