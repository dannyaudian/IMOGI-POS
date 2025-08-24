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