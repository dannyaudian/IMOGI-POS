# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import now_datetime
from frappe import _

@frappe.whitelist(allow_guest=True)
def verify_session(token=None, slug=None):
    """
    Verify a self-order session token or slug and return session details if valid
    
    This API allows guests to verify and access their self-order session
    """
    if not token and not slug:
        frappe.throw(_("Token or slug is required"))
    
    # Search by token or slug
    filters = {"token": token} if token else {"slug": slug}
    
    session_name = frappe.db.get_value("Self Order Session", filters, "name")
    if not session_name:
        frappe.throw(_("Invalid token or slug"))
    
    # Get session document
    session = frappe.get_doc("Self Order Session", session_name)
    
    # Check if expired
    if now_datetime() > frappe.utils.get_datetime(session.expires_on):
        frappe.throw(_("Session has expired"))
    
    # Update IP and user agent
    if frappe.request:
        session.last_ip = frappe.local.request_ip
        session.user_agent = frappe.request.headers.get('User-Agent', '')
        session.save(ignore_permissions=True)
    
    # Return session details (sanitized for security)
    return {
        "session_id": session.name,
        "branch": session.branch,
        "table": session.table,
        "pos_profile": session.pos_profile,
        "order_linkage": session.order_linkage,
        "expires_on": session.expires_on,
        "is_guest": session.is_guest
    }

@frappe.whitelist(allow_guest=True)
def create_session(pos_profile, branch, table=None, is_guest=1):
    """
    Create a new self-order session (controlled access via POS Profile settings)
    """
    # Check if POS Profile allows self-order and guest access
    pos_profile_doc = frappe.get_doc("POS Profile", pos_profile)
    if not hasattr(pos_profile_doc, 'imogi_enable_self_order') or not pos_profile_doc.imogi_enable_self_order:
        frappe.throw(_("Self Order is not enabled for this POS Profile"))
    
    if is_guest and not hasattr(pos_profile_doc, 'imogi_self_order_allow_guest'):
        frappe.throw(_("Guest access not allowed for this POS Profile"))
    
    # Create the session
    session = frappe.new_doc("Self Order Session")
    session.pos_profile = pos_profile
    session.branch = branch
    
    if table:
        # Verify table exists and belongs to branch
        table_doc = frappe.get_doc("Restaurant Table", table)
        if table_doc.branch != branch:
            frappe.throw(_("Table does not belong to selected branch"))
        session.table = table
    
    session.is_guest = is_guest
    session.last_ip = frappe.local.request_ip
    
    if frappe.request:
        session.user_agent = frappe.request.headers.get('User-Agent', '')
    
    session.insert(ignore_permissions=True)
    
    # Return the session details
    return {
        "success": True,
        "session_id": session.name,
        "token": session.token,
        "slug": session.slug,
        "expires_on": session.expires_on
    }

@frappe.whitelist(allow_guest=True)
def checkout_takeaway(session_id, cart_items, pos_profile, branch, customer='Walk-in Customer', payment_method='qris'):
    """
    Create order and invoice for takeaway self-order checkout with integrated QRIS payment
    
    Args:
        session_id: Self Order Session identifier
        cart_items: List of items in cart with item_code, qty, rate, etc.
        pos_profile: POS Profile name
        branch: Branch name
        customer: Customer name (default: 'Walk-in Customer')
        payment_method: Payment method (default: 'qris')
    
    Returns:
        dict: {
            "success": True,
            "order": order_dict,
            "invoice": invoice_dict,
            "payment": payment_qr_data,
            "payment_required": True/False
        }
    """
    # 1. Validate session
    session = frappe.get_doc("Self Order Session", session_id)
    if now_datetime() > frappe.utils.get_datetime(session.expires_on):
        frappe.throw(_("Session has expired"))
    
    # 2. Create POS Order using existing API
    from imogi_pos.api.orders import create_order
    
    order = create_order(
        order_type='Takeaway',
        branch=branch,
        pos_profile=pos_profile,
        customer=customer,
        items=cart_items,
        session_id=session_id
    )
    
    # 3. Generate Sales Invoice
    from imogi_pos.api.billing import generate_invoice
    
    invoice = generate_invoice(pos_order=order['name'])
    
    # 4. Route to Xendit QRIS payment if module is available
    payment_data = None
    payment_required = False
    
    if payment_method == 'qris' and frappe.db.exists("Module Def", "xendit_integration_imogi"):
        try:
            # Call Xendit integration directly
            qris_result = frappe.call(
                'xendit_integration_imogi.api.qris.generate_dynamic_qr',
                amount=invoice['grand_total'],
                invoice=invoice['name'],
                branch=branch,
                description=f"Self-Order Takeaway - Session {session_id}"
            )
            
            payment_data = qris_result
            payment_required = True
            
        except Exception as e:
            frappe.log_error(f"Error generating Xendit QRIS for self-order: {str(e)}")
            frappe.throw(_("Failed to generate payment QR code. Please try again."))
    
    return {
        "success": True,
        "order": order,
        "invoice": invoice,
        "payment": payment_data,
        "payment_required": payment_required
    }

@frappe.whitelist(allow_guest=True)
def submit_table_order(session_id, cart_items, pos_profile, branch, table, customer='Walk-in Customer'):
    """
    Submit order for dine-in (table) self-order - no payment required
    
    Args:
        session_id: Self Order Session identifier
        cart_items: List of items in cart
        pos_profile: POS Profile name
        branch: Branch name
        table: Restaurant Table name
        customer: Customer name (default: 'Walk-in Customer')
    
    Returns:
        dict: {
            "success": True,
            "order": order_dict
        }
    """
    # 1. Validate session
    session = frappe.get_doc("Self Order Session", session_id)
    if now_datetime() > frappe.utils.get_datetime(session.expires_on):
        frappe.throw(_("Session has expired"))
    
    # Verify table matches session
    if session.table != table:
        frappe.throw(_("Table does not match session"))
    
    # 2. Create POS Order using existing API
    from imogi_pos.api.orders import create_order
    
    order = create_order(
        order_type='Dine-in',
        branch=branch,
        pos_profile=pos_profile,
        customer=customer,
        table=table,
        items=cart_items,
        session_id=session_id
    )
    
    return {
        "success": True,
        "order": order
    }

@frappe.whitelist(allow_guest=True)
def regenerate_payment_qr(invoice_name, branch=None):
    """
    Regenerate QRIS QR code for an existing invoice (used when QR expires)
    
    Args:
        invoice_name: Sales Invoice name
        branch: Branch name (optional)
    
    Returns:
        dict: New payment QR data with fresh expiry time
    """
    # Verify invoice exists and is unpaid
    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    
    if invoice.docstatus != 1:
        frappe.throw(_("Invoice is not submitted"))
    
    if invoice.status == "Paid":
        frappe.throw(_("Invoice is already paid"))
    
    # Generate new QRIS QR code
    if frappe.db.exists("Module Def", "xendit_integration_imogi"):
        try:
            qris_result = frappe.call(
                'xendit_integration_imogi.api.qris.generate_dynamic_qr',
                amount=invoice.grand_total,
                invoice=invoice.name,
                branch=branch or invoice.branch,
                description=f"Payment Regenerated - Invoice {invoice.name}"
            )
            
            return {
                "success": True,
                "payment": qris_result,
                "regenerated": True
            }
            
        except Exception as e:
            frappe.log_error(f"Error regenerating Xendit QRIS: {str(e)}")
            frappe.throw(_("Failed to regenerate payment QR code. Please try again."))
    else:
        frappe.throw(_("Xendit integration module is not available"))