import frappe


def execute():
    """Allow cashier device session in Journal Entry Account reference type."""
    frappe.reload_doc("accounts", "doctype", "journal_entry_account")

    field_name = frappe.db.get_value(
        "DocField",
        {"parent": "Journal Entry Account", "fieldname": "reference_type"},
        "name",
    )

    if not field_name:
        return

    df = frappe.get_doc("DocField", field_name)
    options = (df.options or "").split("\n")
    if "Cashier Device Session" not in options:
        options.append("Cashier Device Session")
        df.options = "\n".join(filter(None, options))
        df.save()
        frappe.clear_cache()
