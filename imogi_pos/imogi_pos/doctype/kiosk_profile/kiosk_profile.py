# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class KioskProfile(Document):
    """
    Kiosk Profile configuration for IMOGI POS.
    
    Stores theme settings, allowed item groups, timeout configuration, and printer settings
    for kiosk devices.
    """
    
    def validate(self):
        """Validate Kiosk Profile settings."""
        self.validate_timeout()
        
    def validate_timeout(self):
        """Ensure timeout values are within acceptable range."""
        if self.timeout_seconds and self.timeout_seconds < 30:
            frappe.throw("Timeout must be at least 30 seconds")
        
        if self.timeout_warning_seconds and self.timeout_warning_seconds < 10:
            frappe.throw("Timeout warning must be at least 10 seconds")
            
        if self.timeout_warning_seconds and self.timeout_seconds and self.timeout_warning_seconds >= self.timeout_seconds:
            frappe.throw("Timeout warning must be less than the main timeout")