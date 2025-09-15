# Copyright (c) 2024, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class POSMenuGroup(Document):
    """Defines a group of POS menu options with selection rules."""

    def validate(self):
        """Validate selection limits and default values."""
        if self.min_select and self.max_select and self.min_select > self.max_select:
            frappe.throw("Minimum selection cannot exceed maximum selection")

        if self.selection_type == "Single":
            # Single selection always has max_select of 1
            self.max_select = 1
            if self.required:
                self.min_select = 1
            elif self.min_select and self.min_select > 1:
                self.min_select = 1
