import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def execute():
    """
    Patch: Add restaurant flow fields to POS Order
    - request_payment (Check)
    - requested_payment_at (Datetime)
    - paid_at (Datetime)
    
    These fields support waiter->cashier restaurant workflow:
    1. Waiter creates order and requests bill (request_payment=1)
    2. Cashier claims and processes payment
    3. Table auto-released after payment completion
    """
    
    custom_fields = {
        "POS Order": [
            {
                "fieldname": "request_payment",
                "fieldtype": "Check",
                "label": "Request Payment",
                "default": "0",
                "insert_after": "claimed_at",
                "description": "Waiter has requested bill/payment for this dine-in order",
                "search_index": 1,
                "in_standard_filter": 1
            },
            {
                "fieldname": "requested_payment_at",
                "fieldtype": "Datetime",
                "label": "Requested Payment At",
                "read_only": 1,
                "insert_after": "request_payment",
                "description": "Timestamp when payment was requested by waiter"
            },
            {
                "fieldname": "paid_at",
                "fieldtype": "Datetime",
                "label": "Paid At",
                "read_only": 1,
                "insert_after": "requested_payment_at",
                "description": "Timestamp when order was fully paid"
            }
        ]
    }
    
    try:
        create_custom_fields(custom_fields, update=True)
        frappe.db.commit()
        print("✓ Restaurant flow fields added to POS Order")
    except Exception as e:
        print(f"✗ Error adding restaurant flow fields: {str(e)}")
        frappe.log_error(
            title="Restaurant Flow Fields Patch Failed",
            message=str(e)
        )
