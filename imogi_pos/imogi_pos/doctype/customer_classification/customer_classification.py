# Copyright (c) 2026, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class CustomerClassification(Document):
	def validate(self):
		"""Validate customer classification"""
		pass


@frappe.whitelist()
def get_customer_classifications(active_only=True):
	"""Get list of customer classifications"""
	filters = {}
	if active_only:
		filters["is_active"] = 1
	
	return frappe.get_all(
		"Customer Classification",
		filters=filters,
		fields=["name", "classification_name", "icon", "sort_order"],
		order_by="sort_order ASC, classification_name ASC"
	)
