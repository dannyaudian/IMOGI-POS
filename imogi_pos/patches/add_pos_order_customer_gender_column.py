import frappe


def execute():
    """Ensure POS Order has the customer_gender column before inserts."""
    frappe.reload_doc("imogi_pos", "doctype", "pos_order")

    if not frappe.db.has_column("POS Order", "customer_gender"):
        frappe.db.add_column("POS Order", "customer_gender")
