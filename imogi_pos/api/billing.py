# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import now_datetime, cint, add_to_date, get_url
from frappe.realtime import publish_realtime

def validate_branch_access(branch):
    """
    Validates that the current user has access to the specified branch.
    
    Args:
        branch (str): Branch name
    
    Raises:
        frappe.PermissionError: If user doesn't have access to the branch
    """
    if not frappe.has_permission("Branch", doc=branch):
        frappe.throw(_("You don't have access to branch: {0}").format(branch), 
                    frappe.PermissionError)

def validate_pos_session(pos_profile, enforce_session=None):
    """
    Validates if an active POS Session exists as required by the POS Profile.
    
    Args:
        pos_profile (str): POS Profile name
        enforce_session (bool, optional): Override profile setting
    
    Returns:
        str: POS Session name if active, None otherwise
    
    Raises:
        frappe.ValidationError: If session is required but not active
    """
    # Get POS Profile settings
    profile_doc = frappe.get_doc("POS Profile", pos_profile)
    
    # Determine if session is required
    require_session = enforce_session
    if require_session is None:
        require_session = cint(profile_doc.get("imogi_require_pos_session", 0))
    
    if not require_session:
        return None
    
    # Get the scope (User/Device/POS Profile)
    scope = profile_doc.get("imogi_pos_session_scope", "User")
    
    # Get active session
    active_session = get_active_pos_session(scope)
    
    if not active_session and require_session:
        frappe.throw(_("No active POS Session found. Please open a POS Session first."), 
                    frappe.ValidationError)
    
    return active_session

@frappe.whitelist()
def generate_invoice(pos_order):
    """
    Creates a Sales Invoice (is_pos=1) from a POS Order.
    
    Args:
        pos_order (str): POS Order name
    
    Returns:
        dict: Created Sales Invoice details
    
    Raises:
        frappe.ValidationError: If any selected item is a template (not a variant)
    """
    # Get POS Order details
    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)
    
    # Validate POS Session
    pos_session = validate_pos_session(order_doc.pos_profile)
    
    # Validate items for templates
    for item in order_doc.items:
        is_template = frappe.db.get_value("Item", item.item_code, "has_variants")
        if is_template:
            frappe.throw(_("Cannot create invoice with template item. Please select a variant for: {0}").format(item.item_code))
    
    # STUB: Create Sales Invoice logic will go here
    # For now, create a minimal response
    invoice = {
        "name": f"SINV-{frappe.utils.now_datetime().strftime('%Y%m%d%H%M%S')}",
        "pos_order": pos_order,
        "is_pos": 1,
        "customer": order_doc.customer,
        "branch": order_doc.branch,
        "pos_profile": order_doc.pos_profile,
        "pos_session": pos_session,
        "total": 0.0,  # Will be calculated from items
        "order_type": order_doc.order_type,
        "creation": now_datetime()
    }
    
    # STUB: Copy Line Notes to SI Item Description for Counter/Kiosk
    # This will be done in prepare_invoice_draft()
    
    # STUB: Update POS Order with invoice link
    
    return invoice

@frappe.whitelist()
def list_orders_for_cashier(branch=None, status=None, floor=None):
    """
    Lists POS Orders that are ready for billing in the cashier console.
    
    Args:
        branch (str, optional): Branch filter
        status (str, optional): Status filter (Ready/Served)
        floor (str, optional): Floor filter
    
    Returns:
        list: POS Orders with summarized details
    """
    if not branch:
        branch = frappe.db.get_value("POS Profile", 
                                    {"user": frappe.session.user}, 
                                    "imogi_branch")
    
    if branch:
        validate_branch_access(branch)
    
    # Default filter for cashier (typically want Ready or Served orders)
    if not status:
        status = ["Ready", "Served"]
    elif isinstance(status, str):
        status = [status]
    
    # Build filters
    filters = {"branch": branch, "status": ["in", status]}
    if floor:
        filters["floor"] = floor

    # Query POS Orders
    orders = frappe.get_all(
        "POS Order",
        filters=filters,
        fields=[
            "name",
            "customer",
            "order_type",
            "table",
            "status",
            "grand_total",
        ],
        order_by="creation desc",
    )

    # Fetch items for each order
    for order in orders:
        order["items"] = frappe.get_all(
            "POS Order Item",
            filters={"parent": order["name"]},
            fields=["item_code", "item_name", "qty", "rate", "amount"],
            order_by="idx",
        )

    return orders

@frappe.whitelist()
def prepare_invoice_draft(pos_order):
    """
    Prepares a draft Sales Invoice with proper handling of line notes.
    
    For Counter/Kiosk, notes are copied to the Sales Invoice Item description.
    For Table Bill, notes are not included.
    
    Args:
        pos_order (str): POS Order name
    
    Returns:
        dict: Draft Sales Invoice data
    """
    # Get POS Order details
    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)
    
    # Get POS Profile to determine mode (Table/Counter/Kiosk)
    profile_doc = frappe.get_doc("POS Profile", order_doc.pos_profile)
    mode = profile_doc.get("imogi_mode", "Counter")
    
    # Prepare draft invoice items
    invoice_items = []
    for item in order_doc.items:
        # Create item entry
        invoice_item = {
            "item_code": item.item_code,
            "item_name": item.item_name,
            "qty": item.qty,
            "rate": item.rate,
            "amount": item.amount,
            "description": item.item_name
        }
        
        # Copy notes to description for Counter/Kiosk modes (not for Table mode)
        if mode in ["Counter", "Kiosk", "Self-Order"] and item.notes:
            # In Counter/Kiosk mode, include notes in the description
            invoice_item["description"] = f"{item.item_name}\n{item.notes}"
            invoice_item["has_notes"] = True
        
        invoice_items.append(invoice_item)
    
    # Prepare draft invoice
    draft_invoice = {
        "doctype": "Sales Invoice",
        "is_pos": 1,
        "pos_profile": order_doc.pos_profile,
        "customer": order_doc.customer or "Walk-in Customer",
        "branch": order_doc.branch,
        "items": invoice_items,
        "imogi_pos_order": pos_order,
        "order_type": order_doc.order_type,
        "pos_session": validate_pos_session(order_doc.pos_profile)
    }
    
    # Add table information for Dine-in orders
    if order_doc.table:
        draft_invoice["table"] = order_doc.table
        draft_invoice["floor"] = frappe.db.get_value("Restaurant Table", order_doc.table, "floor")
    
    return draft_invoice

@frappe.whitelist()
def get_active_pos_session(context_scope=None):
    """
    Gets the active POS Session for the current context.
    
    Args:
        context_scope (str, optional): Scope to check (User/Device/POS Profile)
                                      Default is User
    
    Returns:
        str: POS Session name if active, None otherwise
    """
    if not context_scope:
        context_scope = "User"
    
    user = frappe.session.user
    
    # STUB: Logic to get active POS Session based on scope
    if context_scope == "User":
        # Check if user has an active session
        active_session = frappe.db.get_value("POS Session", 
                                           {"user": user, "status": "Open"}, 
                                           "name")
    elif context_scope == "Device":
        # In actual implementation, would use device ID
        active_session = None
    elif context_scope == "POS Profile":
        # Get user's POS Profile, then check for any open session with that profile
        pos_profile = frappe.db.get_value("POS Profile", {"user": user}, "name")
        if pos_profile:
            active_session = frappe.db.get_value("POS Session", 
                                               {"pos_profile": pos_profile, "status": "Open"}, 
                                               "name")
    else:
        active_session = None
    
    return active_session

@frappe.whitelist()
def request_payment(sales_invoice):
    """
    Creates a Payment Request and delegates to IMOGI Xendit Connect to get a payment QR code.
    
    Args:
        sales_invoice (str): Sales Invoice name
    
    Returns:
        dict: Payment info with QR image URL, checkout URL, amount and expiry
              for Customer Display/Kiosk/Self-Order
    
    Raises:
        frappe.ValidationError: If payment gateway is not properly configured
    """
    # Get Sales Invoice details
    invoice_doc = frappe.get_doc("Sales Invoice", sales_invoice)
    validate_branch_access(invoice_doc.branch)
    
    # Get POS Profile for payment settings
    pos_profile = frappe.db.get_value("POS Profile", invoice_doc.pos_profile, 
                                     ["imogi_enable_payment_gateway", 
                                      "imogi_payment_gateway_account",
                                      "imogi_payment_timeout_seconds"], 
                                     as_dict=True)
    
    # Check if payment gateway is enabled
    if not cint(pos_profile.get("imogi_enable_payment_gateway", 0)):
        frappe.throw(_("Payment gateway is not enabled for this POS Profile"), frappe.ValidationError)
    
    # Get payment gateway account
    payment_gateway_account = pos_profile.get("imogi_payment_gateway_account")
    if not payment_gateway_account:
        frappe.throw(_("Payment gateway account not configured"), frappe.ValidationError)
    
    # Determine expiry time (default 10 minutes if not specified)
    timeout_seconds = cint(pos_profile.get("imogi_payment_timeout_seconds", 600))
    expiry = add_to_date(now_datetime(), seconds=timeout_seconds)
    
    # Create Payment Request
    try:
        payment_request = frappe.get_doc({
            "doctype": "Payment Request",
            "payment_gateway_account": payment_gateway_account,
            "reference_doctype": "Sales Invoice",
            "reference_name": sales_invoice,
            "grand_total": invoice_doc.grand_total,
            "email_to": invoice_doc.contact_email,
            "subject": f"Payment for {sales_invoice}",
            "message": f"Please pay {invoice_doc.grand_total} for your order.",
            "payment_gateway": frappe.db.get_value("Payment Gateway Account", 
                                                  payment_gateway_account, 
                                                  "payment_gateway"),
            "currency": invoice_doc.currency,
            "status": "Initiated"
        }).insert(ignore_permissions=True)
        
        payment_request.submit()
        
        # Try to use IMOGI Xendit Connect for payment
        xendit_payload = None
        if frappe.db.exists("Module Def", "imogi_xendit_connect"):
            try:
                # Import the method from the app if available
                from imogi_xendit_connect.api import create_payment_qr

                # Create payment QR through Xendit
                xendit_payload = create_payment_qr(
                    payment_request=payment_request.name,
                    amount=invoice_doc.grand_total,
                    external_id=payment_request.name,  # Use PR name as external_id for idempotency
                    description=f"Payment for {sales_invoice}",
                    expiry=expiry
                )
            except Exception as e:
                frappe.log_error(f"Error creating Xendit payment: {str(e)}")
        else:
            raise frappe.ValidationError(_("IMOGI Xendit Connect module is not installed"))
        
        # If Xendit integration failed or not available, create a fallback
        if not xendit_payload:
            # Fallback to standard Payment Request URL
            xendit_payload = {
                "qr_image_url": None,
                "checkout_url": get_url(f"/payments/payment-request/{payment_request.name}"),
                "amount": invoice_doc.grand_total,
                "currency": invoice_doc.currency,
                "expiry": expiry.isoformat(),
                "payment_request": payment_request.name,
                "is_fallback": True
            }
        
        # Add payment request name for realtime updates
        xendit_payload["payment_request"] = payment_request.name
        
        # Publish to payment channel for realtime updates
        publish_realtime(f"payment:pr:{payment_request.name}", {
            "status": "awaiting_payment",
            "payment_data": xendit_payload
        })
        
        # If customer display is enabled, publish to customer display channel
        pos_profile_full = frappe.get_doc("POS Profile", invoice_doc.pos_profile)
        if cint(pos_profile_full.get("imogi_show_payment_qr_on_customer_display", 0)):
            # If we have a linked customer display, publish to it
            if invoice_doc.get("imogi_customer_display"):
                publish_realtime(f"customer_display:device:{invoice_doc.imogi_customer_display}", {
                    "type": "payment_qr",
                    "payment_data": xendit_payload,
                    "sales_invoice": sales_invoice
                })
        
        return xendit_payload
    
    except Exception as e:
        frappe.log_error(f"Error creating payment request: {str(e)}")
        frappe.throw(_("Failed to create payment request: {0}").format(str(e)))