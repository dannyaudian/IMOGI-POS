# Copyright (c) 2023, IMOGI LABS and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class BrandProfile(Document):
    def validate(self):
        """Validate the brand profile settings"""
        # Make sure the primary color is provided
        if not self.primary_color:
            self.primary_color = "#4c5a67"
        
        # Make sure the accent color is provided
        if not self.accent_color:
            self.accent_color = "#2490ef"
        
        # Make sure the header background color is provided
        if not self.header_bg_color:
            self.header_bg_color = "#ffffff"