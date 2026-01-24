# Copyright (c) 2026, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class CustomerAgeRange(Document):
	def validate(self):
		"""Validate age range"""
		if self.min_age and self.max_age and self.min_age > self.max_age:
			frappe.throw("Minimum Age cannot be greater than Maximum Age")


@frappe.whitelist()
def get_customer_age_ranges(active_only=True):
	"""Get list of customer age ranges"""
	filters = {}
	if active_only:
		filters["is_active"] = 1
	
	return frappe.get_all(
		"Customer Age Range",
		filters=filters,
		fields=["name", "range_name", "min_age", "max_age", "sort_order"],
		order_by="sort_order ASC, min_age ASC"
	)
