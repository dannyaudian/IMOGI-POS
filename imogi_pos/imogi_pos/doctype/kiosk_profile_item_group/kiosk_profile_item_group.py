# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from frappe.model.document import Document

class KioskProfileItemGroup(Document):
    """
    Child table DocType for Kiosk Profile to manage allowed item groups.
    
    This table stores the item groups that are allowed to be displayed in a kiosk,
    with optional custom display names.
    """
    
    def validate(self):
        """Validate the item group settings"""
        self.set_default_display_name()
    
    def set_default_display_name(self):
        """Set display name to item group name if not specified"""
        if not self.display_name and self.item_group:
            from frappe.model.naming import get_default_naming_series
            item_group_doc = self.get_item_group_doc()
            if item_group_doc:
                self.display_name = item_group_doc.item_group_name
    
    def get_item_group_doc(self):
        """Get the item group document"""
        import frappe
        if self.item_group:
            return frappe.get_doc("Item Group", self.item_group)
        return None