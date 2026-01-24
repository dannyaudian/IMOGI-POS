# Copyright (c) 2026, IMOGI and Contributors
# Migration patch for v2.0

import frappe


def execute():
	"""Migrate Kitchen and Kitchen Station to use Printer Profile"""
	
	# Create Printer Profiles from existing Kitchen configurations
	migrate_kitchen_printers()
	
	# Create Printer Profiles from existing Kitchen Station configurations
	migrate_kitchen_station_printers()
	
	# Migrate Menu Categories
	migrate_menu_categories()
	
	frappe.db.commit()


def migrate_kitchen_printers():
	"""Create Printer Profiles from Kitchen printer settings"""
	kitchens = frappe.get_all(
		"Kitchen",
		fields=["name", "kitchen_name", "branch", "default_printer_interface", 
		        "default_printer", "default_printer_port", "default_bt_device_name",
		        "default_bt_mac", "default_bt_vendor_profile"]
	)
	
	for kitchen in kitchens:
		# Skip if no printer configured or already has printer profile
		if not kitchen.get("default_printer_interface") or kitchen.get("default_printer_interface") == "OS":
			continue
		
		printer_name = f"{kitchen.kitchen_name} - Kitchen Printer"
		
		# Check if printer profile already exists
		if frappe.db.exists("Printer Profile", printer_name):
			# Link existing profile to kitchen
			frappe.db.set_value("Kitchen", kitchen.name, "default_printer_profile", printer_name)
			continue
		
		# Create new Printer Profile
		try:
			printer_doc = frappe.get_doc({
				"doctype": "Printer Profile",
				"printer_name": printer_name,
				"description": f"Auto-migrated from Kitchen: {kitchen.kitchen_name}",
				"branch": kitchen.branch,
				"printer_type": "Kitchen",
				"is_active": 1,
				"interface": kitchen.default_printer_interface
			})
			
			# Add interface-specific settings
			if kitchen.default_printer_interface == "LAN":
				printer_doc.lan_host = kitchen.default_printer
				printer_doc.lan_port = kitchen.default_printer_port or 9100
			
			elif kitchen.default_printer_interface == "Bluetooth":
				printer_doc.bt_device_name = kitchen.default_bt_device_name
				printer_doc.bt_mac = kitchen.default_bt_mac
				printer_doc.bt_vendor_profile = kitchen.default_bt_vendor_profile or "ESC/POS"
			
			printer_doc.insert(ignore_permissions=True)
			
			# Link printer profile to kitchen
			frappe.db.set_value("Kitchen", kitchen.name, "default_printer_profile", printer_name)
			
			print(f"✓ Created Printer Profile: {printer_name}")
		
		except Exception as e:
			frappe.log_error(
				title="Kitchen Printer Migration Error",
				message=f"Error migrating printer for kitchen {kitchen.name}: {str(e)}"
			)


def migrate_kitchen_station_printers():
	"""Create Printer Profiles from Kitchen Station printer settings"""
	stations = frappe.get_all(
		"Kitchen Station",
		fields=["name", "station_name", "kitchen", "branch", "interface",
		        "lan_host", "lan_port", "bt_device_name", "bt_mac",
		        "bt_vendor_profile", "bt_retry"]
	)
	
	for station in stations:
		# Skip if no printer configured or already has printer profile or uses OS
		if not station.get("interface") or station.get("interface") == "OS":
			continue
		
		printer_name = f"{station.station_name} - Printer"
		
		# Check if printer profile already exists
		if frappe.db.exists("Printer Profile", printer_name):
			frappe.db.set_value("Kitchen Station", station.name, "printer_profile", printer_name)
			continue
		
		# Create new Printer Profile
		try:
			printer_doc = frappe.get_doc({
				"doctype": "Printer Profile",
				"printer_name": printer_name,
				"description": f"Auto-migrated from Kitchen Station: {station.station_name}",
				"branch": station.branch,
				"printer_type": "Kitchen",
				"is_active": 1,
				"interface": station.interface
			})
			
			# Add interface-specific settings
			if station.interface == "LAN":
				printer_doc.lan_host = station.lan_host
				printer_doc.lan_port = station.lan_port or 9100
			
			elif station.interface == "Bluetooth":
				printer_doc.bt_device_name = station.bt_device_name
				printer_doc.bt_mac = station.bt_mac
				printer_doc.bt_vendor_profile = station.bt_vendor_profile or "ESC/POS"
				printer_doc.bt_retry = station.bt_retry or 3
			
			printer_doc.insert(ignore_permissions=True)
			
			# Link printer profile to station
			frappe.db.set_value("Kitchen Station", station.name, "printer_profile", printer_name)
			
			print(f"✓ Created Printer Profile: {printer_name}")
		
		except Exception as e:
			frappe.log_error(
				title="Station Printer Migration Error",
				message=f"Error migrating printer for station {station.name}: {str(e)}"
			)


def migrate_menu_categories():
	"""Migrate hardcoded menu categories to Menu Category DocType"""
	default_categories = [
		{"name": "Appetizer", "sort": 10, "icon": "🥗", "description": "Starters and small plates"},
		{"name": "Main Course", "sort": 20, "icon": "🍽️", "description": "Main dishes"},
		{"name": "Dessert", "sort": 30, "icon": "🍰", "description": "Sweet treats"},
		{"name": "Beverage", "sort": 40, "icon": "🥤", "description": "Drinks"},
		{"name": "Special", "sort": 50, "icon": "⭐", "description": "Special items"},
		{"name": "Coffee", "sort": 60, "icon": "☕", "description": "Coffee drinks"},
		{"name": "Tea", "sort": 70, "icon": "🍵", "description": "Tea beverages"}
	]
	
	created_count = 0
	for cat in default_categories:
		if not frappe.db.exists("Menu Category", cat["name"]):
			try:
				doc = frappe.get_doc({
					"doctype": "Menu Category",
					"category_name": cat["name"],
					"sort_order": cat["sort"],
					"icon": cat["icon"],
					"description": cat.get("description", ""),
					"is_active": 1
				})
				doc.insert(ignore_permissions=True)
				created_count += 1
				print(f"✓ Created Menu Category: {cat['name']}")
			except Exception as e:
				frappe.log_error(
					title="Menu Category Migration Error",
					message=f"Error creating menu category {cat['name']}: {str(e)}"
				)
	
	if created_count > 0:
		print(f"✓ Migrated {created_count} menu categories")
