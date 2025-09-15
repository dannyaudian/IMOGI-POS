# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
import json
from frappe.model.document import Document
from imogi_pos.utils.printing import format_kot_options


class POSOrderItem(Document):
    def validate(self):
        self.init_counters()
        self.set_amount()
        self.validate_item()
        self.set_last_edited_by()
        self.set_default_kitchen_station()
        self.set_options_display()

    def before_save(self):
        self.set_options_display()
    
    def set_amount(self):
        """Calculate amount based on qty and rate"""
        self.amount = (self.qty or 0) * (self.rate or 0)
    
    def validate_item(self):
        """Validate that the item exists and is saleable"""
        if not self.item:
            return
            
        # Check if item is a template with variants
        is_template = frappe.db.get_value("Item", self.item, "has_variants")
        if is_template:
            frappe.msgprint(
                f"Item {self.item} is a template with variants. "
                "Please select a specific variant before sending to kitchen or creating invoice.",
                indicator="orange",
                alert=True
            )
    
    def set_last_edited_by(self):
        """Set last_edited_by field to current user"""
        self.last_edited_by = frappe.session.user
    
    def set_default_kitchen_station(self):
        """Set default kitchen/station from item if not provided"""
        if not self.item:
            return
            
        if not self.kitchen or not self.kitchen_station:
            item_defaults = frappe.db.get_value(
                "Item", 
                self.item, 
                ["default_kitchen", "default_kitchen_station"],
                as_dict=1
            )
            
            if item_defaults:
                if not self.kitchen and item_defaults.default_kitchen:
                    self.kitchen = item_defaults.default_kitchen
                    
                if not self.kitchen_station and item_defaults.default_kitchen_station:
                    self.kitchen_station = item_defaults.default_kitchen_station
    
    def init_counters(self):
        """Initialize counters object if not set"""
        if not self.counters:
            self.counters = json.dumps({})

    def set_options_display(self):
        """Format item_options into a display string"""
        self.options_display = format_kot_options(self.item_options)
