# Copyright (c) 2026, IMOGI and Contributors
# Migration patch for customer fields simplification

import frappe


def execute():
	"""Simplify customer fields and migrate to configurable DocTypes"""
	
	# Create default Customer Classifications and Age Ranges
	create_default_customer_settings()
	
	# Migrate existing customer data from hardcoded values
	migrate_customer_classifications()
	migrate_customer_age_ranges()
	
	frappe.db.commit()


def create_default_customer_settings():
	"""Create Customer Classifications and Age Ranges if not exist"""
	# Customer Classifications
	default_classifications = [
		{"name": "Single", "sort": 10, "icon": "👤", "description": "Single individual"},
		{"name": "Family", "sort": 20, "icon": "👨‍👩‍👧‍👦", "description": "Family with dependents"},
		{"name": "Couple", "sort": 30, "icon": "👫", "description": "Couple"},
		{"name": "Group", "sort": 40, "icon": "👥", "description": "Group of people"}
	]
	
	for cls in default_classifications:
		if not frappe.db.exists("Customer Classification", cls["name"]):
			try:
				doc = frappe.get_doc({
					"doctype": "Customer Classification",
					"classification_name": cls["name"],
					"sort_order": cls["sort"],
					"icon": cls["icon"],
					"description": cls.get("description", ""),
					"is_active": 1
				})
				doc.insert(ignore_permissions=True)
				print(f"✓ Created Customer Classification: {cls['name']}")
			except Exception as e:
				frappe.log_error(
					title="Customer Classification Migration Error",
					message=f"Error creating {cls['name']}: {str(e)}"
				)
	
	# Customer Age Ranges
	default_age_ranges = [
		{"name": "Child (< 10)", "min": 0, "max": 10, "sort": 10},
		{"name": "Teen (11-19)", "min": 11, "max": 19, "sort": 20},
		{"name": "Young Adult (20-29)", "min": 20, "max": 29, "sort": 30},
		{"name": "Adult (30-49)", "min": 30, "max": 49, "sort": 40},
		{"name": "Senior (50+)", "min": 50, "max": 999, "sort": 50}
	]
	
	for age_range in default_age_ranges:
		if not frappe.db.exists("Customer Age Range", age_range["name"]):
			try:
				doc = frappe.get_doc({
					"doctype": "Customer Age Range",
					"range_name": age_range["name"],
					"min_age": age_range["min"],
					"max_age": age_range["max"],
					"sort_order": age_range["sort"],
					"description": f"Age range from {age_range['min']} to {age_range['max']}",
					"is_active": 1
				})
				doc.insert(ignore_permissions=True)
				print(f"✓ Created Age Range: {age_range['name']}")
			except Exception as e:
				frappe.log_error(
					title="Age Range Migration Error",
					message=f"Error creating {age_range['name']}: {str(e)}"
				)


def migrate_customer_classifications():
	"""Migrate hardcoded customer_identification values to new classifications"""
	# Map old hardcoded values to new classifications
	classification_mapping = {
		"Berkeluarga": "Family",
		"Tidak Berkeluarga": "Single"
	}
	
	# Migrate Customer master data
	customers = frappe.get_all(
		"Customer",
		filters={"customer_identification": ["in", list(classification_mapping.keys())]},
		fields=["name", "customer_identification"]
	)
	
	migrated_count = 0
	for customer in customers:
		old_value = customer.customer_identification
		new_value = classification_mapping.get(old_value)
		
		if new_value and frappe.db.exists("Customer Classification", new_value):
			try:
				frappe.db.set_value("Customer", customer.name, "customer_identification", new_value)
				migrated_count += 1
			except Exception as e:
				frappe.log_error(
					title="Customer Classification Migration Error",
					message=f"Error migrating customer {customer.name}: {str(e)}"
				)
	
	if migrated_count > 0:
		print(f"✓ Migrated {migrated_count} customer classifications")
	
	# Migrate Sales Invoice data
	invoices = frappe.get_all(
		"Sales Invoice",
		filters={"customer_identification": ["in", list(classification_mapping.keys())]},
		fields=["name", "customer_identification"]
	)
	
	migrated_count = 0
	for invoice in invoices:
		old_value = invoice.customer_identification
		new_value = classification_mapping.get(old_value)
		
		if new_value and frappe.db.exists("Customer Classification", new_value):
			try:
				frappe.db.set_value("Sales Invoice", invoice.name, "customer_identification", new_value)
				migrated_count += 1
			except Exception as e:
				frappe.log_error(
					title="Invoice Classification Migration Error",
					message=f"Error migrating invoice {invoice.name}: {str(e)}"
				)
	
	if migrated_count > 0:
		print(f"✓ Migrated {migrated_count} invoice classifications")


def migrate_customer_age_ranges():
	"""Migrate hardcoded customer_age values to new age ranges"""
	# Map old hardcoded values to new age ranges
	age_mapping = {
		"< 10": "Child (< 10)",
		"11 - 19": "Teen (11-19)",
		"20 - 29": "Young Adult (20-29)",
		"30 >": "Adult (30-49)"  # Map old "30 >" to "Adult (30-49)" as best fit
	}
	
	# Migrate Customer master data
	customers = frappe.get_all(
		"Customer",
		filters={"customer_age": ["in", list(age_mapping.keys())]},
		fields=["name", "customer_age"]
	)
	
	migrated_count = 0
	for customer in customers:
		old_value = customer.customer_age
		new_value = age_mapping.get(old_value)
		
		if new_value and frappe.db.exists("Customer Age Range", new_value):
			try:
				frappe.db.set_value("Customer", customer.name, "customer_age", new_value)
				migrated_count += 1
			except Exception as e:
				frappe.log_error(
					title="Customer Age Migration Error",
					message=f"Error migrating customer {customer.name}: {str(e)}"
				)
	
	if migrated_count > 0:
		print(f"✓ Migrated {migrated_count} customer age ranges")
	
	# Migrate Sales Invoice data
	invoices = frappe.get_all(
		"Sales Invoice",
		filters={"customer_age": ["in", list(age_mapping.keys())]},
		fields=["name", "customer_age"]
	)
	
	migrated_count = 0
	for invoice in invoices:
		old_value = invoice.customer_age
		new_value = age_mapping.get(old_value)
		
		if new_value and frappe.db.exists("Customer Age Range", new_value):
			try:
				frappe.db.set_value("Sales Invoice", invoice.name, "customer_age", new_value)
				migrated_count += 1
			except Exception as e:
				frappe.log_error(
					title="Invoice Age Migration Error",
					message=f"Error migrating invoice {invoice.name}: {str(e)}"
				)
	
	if migrated_count > 0:
		print(f"✓ Migrated {migrated_count} invoice age ranges")
	
	# Migrate POS Order data
	pos_orders = frappe.get_all(
		"POS Order",
		filters={"customer_age": ["in", list(age_mapping.keys())]},
		fields=["name", "customer_age"]
	)
	
	migrated_count = 0
	for order in pos_orders:
		old_value = order.customer_age
		new_value = age_mapping.get(old_value)
		
		if new_value and frappe.db.exists("Customer Age Range", new_value):
			try:
				frappe.db.set_value("POS Order", order.name, "customer_age", new_value)
				migrated_count += 1
			except Exception as e:
				frappe.log_error(
					title="POS Order Age Migration Error",
					message=f"Error migrating POS Order {order.name}: {str(e)}"
				)
	
	if migrated_count > 0:
		print(f"✓ Migrated {migrated_count} POS Order age ranges")
