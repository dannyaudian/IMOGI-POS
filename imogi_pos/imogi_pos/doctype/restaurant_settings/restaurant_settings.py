# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import cint

class RestaurantSettings(Document):
    """
    Global settings for Restaurant features in IMOGI POS.
    
    This is a single-instance DocType that stores defaults and toggles
    for restaurant-specific functionality.
    """
    
    def validate(self):
        """Validate settings and set defaults if needed"""
        self.validate_branch_settings()
        self.validate_kot_settings()
        
    def validate_branch_settings(self):
        """Validate branch-related settings"""
        if self.enforce_branch and not self.default_branch:
            frappe.throw("Default Branch is required when Branch Enforcement is enabled")
    
    def validate_kot_settings(self):
        """Validate KOT (Kitchen Order Ticket) settings"""
        if self.auto_kot_print_copies and cint(self.auto_kot_print_copies) < 1:
            self.auto_kot_print_copies = 1
    
    def on_update(self):
        """Clear cache when settings are updated"""
        frappe.cache().delete_value('restaurant_settings')
        
    @staticmethod
    def get_settings():
        """Get cached settings or fetch from database"""
        settings = frappe.cache().get_value('restaurant_settings')
        if not settings:
            settings = frappe.get_single('Restaurant Settings')
            frappe.cache().set_value('restaurant_settings', settings)
        return settings
