# Copyright (c) 2024, IMOGI and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class POSProfileGroup(Document):
    """Child table for POS Menu Profile grouping of menu items."""

    def validate(self):
        if not self.sort_order:
            self.sort_order = self.idx
