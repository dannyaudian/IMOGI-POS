"""
Patch to remove problematic session_scope custom field from POS Session DocType.

This field was causing validation errors where it was being set to user email
instead of valid options ("User", "Device", "POS Profile").
"""

import frappe


def execute():
    """Remove session_scope custom field from POS Session if it exists."""
    
    # Check if the custom field exists
    if frappe.db.exists("Custom Field", {"dt": "POS Session", "fieldname": "session_scope"}):
        try:
            frappe.delete_doc("Custom Field", "POS Session-session_scope", force=True)
            frappe.db.commit()
            print("✓ Removed session_scope custom field from POS Session")
        except Exception as e:
            print(f"⚠ Could not remove session_scope field: {e}")
    else:
        print("✓ session_scope custom field does not exist in POS Session")
    
    # Also check and remove if there are any variants of this field
    problematic_fields = frappe.db.get_all(
        "Custom Field",
        filters={
            "dt": "POS Session",
            "fieldname": ["in", ["session_scope", "imogi_session_scope", "pos_session_scope"]]
        },
        pluck="name"
    )
    
    for field_name in problematic_fields:
        try:
            frappe.delete_doc("Custom Field", field_name, force=True)
            print(f"✓ Removed custom field: {field_name}")
        except Exception as e:
            print(f"⚠ Could not remove {field_name}: {e}")
    
    frappe.db.commit()
    frappe.clear_cache()
