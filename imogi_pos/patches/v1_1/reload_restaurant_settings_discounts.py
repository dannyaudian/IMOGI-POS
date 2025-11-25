import frappe


def execute():
    """Reload Restaurant Settings DocType to include discount toggles."""
    frappe.reload_doc("imogi_pos", "doctype", "restaurant_settings")
