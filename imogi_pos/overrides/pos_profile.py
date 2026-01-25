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
        """
        Validate session scope field has valid value.
        
        Note: Device scope is not fully supported with native POS Opening Entry
        as it doesn't have a device_id field. Use User or POS Profile scope instead.
        """
        if self.get("imogi_require_pos_session"):
            scope = self.get("imogi_pos_session_scope")
            valid_values = ["User", "Device", "POS Profile"]
            
            # Check if scope is set
            if not scope:
                # Set default to User (most common use case)
                self.imogi_pos_session_scope = "User"
            elif scope not in valid_values:
                # Invalid value - this can happen if the field was corrupted
                frappe.throw(
                    _("Session Scope must be one of: {0}").format(", ".join(valid_values)),
                    frappe.ValidationError
                )
            
            # Warn if Device scope is selected (not fully supported)
            if scope == "Device":
                frappe.msgprint(
                    _("Device scope is not fully supported with POS Opening Entry. Consider using User or POS Profile scope instead."),
                    indicator="orange",
                    title=_("Warning")
                )
