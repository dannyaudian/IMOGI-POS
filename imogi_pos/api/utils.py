import frappe

@frappe.whitelist()
def get_meta(doctype: str):
    """Return DocType metadata.

    Args:
        doctype (str): Name of the DocType.

    Returns:
        dict: DocType metadata as a dictionary.
    """
    return frappe.get_meta(doctype).as_dict()
