# Copyright (c) 2026, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class MenuCategory(Document):
	def validate(self):
		"""Validate menu category"""
		# Ensure unique category name (case insensitive)
		existing = frappe.db.exists(
			"Menu Category",
			{
				"name": ("!=", self.name),
				"category_name": ("like", self.category_name)
			}
		)
		if existing:
			frappe.throw(f"Menu Category with name '{self.category_name}' already exists")


@frappe.whitelist()
def get_menu_categories(active_only=True):
	"""Get list of menu categories"""
	filters = {}
	if active_only:
		filters["is_active"] = 1
	
	return frappe.get_all(
		"Menu Category",
		filters=filters,
		fields=["name", "category_name", "icon", "color", "sort_order", "default_kitchen", "default_kitchen_station"],
		order_by="sort_order ASC, category_name ASC"
	)


def migrate_hardcoded_categories():
	"""Migrate hardcoded menu categories to Menu Category DocType"""
	# List dari hardcoded categories di custom_field.json
	categories = [
		{"name": "Appetizer", "sort": 10, "icon": "🥗"},
		{"name": "Main Course", "sort": 20, "icon": "🍽️"},
		{"name": "Dessert", "sort": 30, "icon": "🍰"},
		{"name": "Beverage", "sort": 40, "icon": "🥤"},
		{"name": "Special", "sort": 50, "icon": "⭐"},
		{"name": "Coffee", "sort": 60, "icon": "☕"},  # Fix typo "Coffe"
		{"name": "Tea", "sort": 70, "icon": "🍵"}
		# Skip "Allura" dan "Sugus" karena brand-specific
	]
	
	for cat in categories:
		if not frappe.db.exists("Menu Category", cat["name"]):
			doc = frappe.get_doc({
				"doctype": "Menu Category",
				"category_name": cat["name"],
				"sort_order": cat["sort"],
				"icon": cat["icon"],
				"is_active": 1
			})
			doc.insert()
			frappe.db.commit()
	
	frappe.msgprint(f"Migrated {len(categories)} menu categories")
