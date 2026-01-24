# Copyright (c) 2026, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PrinterProfile(Document):
	def validate(self):
		"""Validate printer configuration based on interface type"""
		if self.interface == "LAN" and not self.lan_host:
			frappe.throw("LAN Host/IP Address is required for LAN interface")
		
		if self.interface == "USB" and not self.usb_device_path:
			frappe.throw("USB Device Path is required for USB interface")
		
		if self.interface == "Bluetooth" and not self.bt_device_name:
			frappe.throw("Bluetooth Device Name is required for Bluetooth interface")
	
	def get_printer_config(self):
		"""Get printer configuration as dict for printing APIs"""
		config = {
			"printer_name": self.printer_name,
			"interface": self.interface,
			"is_active": self.is_active,
			"printer_type": self.printer_type,
			"thermal_width": int(self.thermal_width or 32),
			"paper_width_mm": int(self.paper_width_mm or 58),
			"dpi": int(self.dpi or 203)
		}
		
		if self.interface == "LAN":
			config.update({
				"lan_host": self.lan_host,
				"lan_port": self.lan_port or 9100
			})
		
		elif self.interface == "USB":
			config.update({
				"usb_device_path": self.usb_device_path
			})
		
		elif self.interface == "Bluetooth":
			config.update({
				"bt_device_name": self.bt_device_name,
				"bt_mac": self.bt_mac,
				"bt_vendor_profile": self.bt_vendor_profile or "ESC/POS",
				"bt_retry": self.bt_retry or 3,
				"print_bridge_url": self.print_bridge_url,
				"print_bridge_token": self.print_bridge_token
			})
		
		return config


@frappe.whitelist()
def get_printer_profiles(branch=None, printer_type=None, active_only=True):
	"""Get list of printer profiles with optional filters"""
	filters = {}
	
	if branch:
		filters["branch"] = branch
	
	if printer_type:
		filters["printer_type"] = printer_type
	
	if active_only:
		filters["is_active"] = 1
	
	return frappe.get_all(
		"Printer Profile",
		filters=filters,
		fields=["name", "printer_name", "interface", "printer_type", "branch"]
	)


@frappe.whitelist()
def get_printer_config(printer_profile):
	"""Get printer configuration for a specific profile"""
	if not printer_profile:
		return None
	
	doc = frappe.get_doc("Printer Profile", printer_profile)
	return doc.get_printer_config()
