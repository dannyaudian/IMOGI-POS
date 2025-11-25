# Copyright (c) 2024, IMOGI and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class POSMenuProfile(Document):
    """Defines groups of menu items for POS interfaces."""

    def validate(self):
        """Ensure groups are ordered by sort order."""
        self.sort_groups()

    def sort_groups(self):
        if not getattr(self, "groups", None):
            return
        # Assign default sort_order based on row index if missing
        for idx, group in enumerate(self.groups, start=1):
            if not group.sort_order:
                group.sort_order = idx
        self.groups.sort(key=lambda x: x.sort_order or 0)
