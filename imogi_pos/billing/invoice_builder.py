import frappe
from frappe import _
from frappe.utils import nowdate, get_datetime, now_datetime
from typing import Dict, List, Optional, Union, Any


def build_sales_invoice_from_pos_order(
    pos_order: Union[str, Dict, Any],
    submit: bool = False,
    payment_method: Optional[str] = None,
    payment_amount: Optional[float] = None,
    include_notes_in_description: bool = True
) -> str:
    """
    Build a Sales Invoice (is_pos=1) from a POS Order with proper notes handling.
    
    Args:
        pos_order: POS Order name or document
        submit: Whether to submit the invoice immediately
        payment_method: Optional payment method to use (for immediate payment)
        payment_amount: Optional payment amount (if different from grand total)
        include_notes_in_description: Whether to include notes in item descriptions
            (True for Counter/Kiosk, False for Table Bill)
    
    Returns:
        Name of the created Sales Invoice
    """
    # Get the POS Order document if name is provided
    if isinstance(pos_order, str):
        pos_order = frappe.get_doc("POS Order", pos_order)
    
    # Validate order status
    if pos_order.workflow_state in ["Cancelled", "Returned"]:
        frappe.throw(_("Cannot create invoice from a cancelled or returned order"))
    
    # Check if invoice already exists
    if pos_order.sales_invoice:
        return pos_order.sales_invoice
    
    # Get the POS Profile
    pos_profile = frappe.get_doc("POS Profile", pos_order.pos_profile)
    
    # Get active POS session if required
    pos_session = None
    if frappe.db.exists("DocType", "POS Session") and frappe.db.get_value(
        "POS Profile", pos_order.pos_profile, "imogi_require_pos_session"
    ):
        pos_session = get_active_pos_session(pos_order.pos_profile)
        if not pos_session:
            frappe.throw(
                _(
                    "No active POS Session found. Please open a session before creating an invoice."
                )
            )
    
    # Determine notes handling based on POS Profile settings and order type
    should_include_notes = _should_include_notes_in_description(
        pos_profile, pos_order.order_type, include_notes_in_description
    )
    
    # Create the invoice
    si = frappe.new_doc("Sales Invoice")
    si.is_pos = 1
    
    # Set standard fields
    si.company = frappe.defaults.get_user_default("Company")
    si.posting_date = nowdate()
    si.posting_time = now_datetime().strftime("%H:%M:%S")
    si.customer = pos_order.customer or pos_profile.customer
    si.set_posting_time = 1
    
    # Set IMOGI-specific context fields
    si.imogi_pos_order = pos_order.name
    si.imogi_branch = pos_order.branch
    
    if pos_order.table:
        si.imogi_table = pos_order.table
        
        # Get floor from table if available
        table_floor = frappe.db.get_value("Restaurant Table", pos_order.table, "floor")
        if table_floor:
            si.imogi_floor = table_floor
    
    # Link to POS session if active
    if pos_session:
        si.imogi_pos_session = pos_session
    
    # Set standard POS fields
    si.pos_profile = pos_order.pos_profile
    si.update_stock = pos_profile.update_stock
    # Enable native ERPNext Pricing Rules (native-first approach)
    si.ignore_pricing_rule = 0  # Always use native pricing rules
    
    # Copy tax/charging template from POS Profile
    if pos_profile.taxes_and_charges:
        si.taxes_and_charges = pos_profile.taxes_and_charges

    if not pos_profile.taxes_and_charges:
        si.append("taxes", {
            "charge_type": "On Net Total",
            "description": "PB1 11%",
            "rate": 11.0
        })

    # Apply order discount if any (custom promo codes as fallback)
    # Native pricing rules will be applied first automatically by ERPNext
    if getattr(pos_order, "discount_amount", None) or getattr(pos_order, "discount_percent", None):
        si.apply_discount_on = "Grand Total"
        if getattr(pos_order, "discount_amount", None):
            si.discount_amount = pos_order.discount_amount
        if getattr(pos_order, "discount_percent", None):
            si.additional_discount_percentage = pos_order.discount_percent

    # Apply selling price list preference: order override > profile default
    price_list = getattr(pos_order, "selling_price_list", None) or pos_profile.selling_price_list
    if price_list:
        si.selling_price_list = price_list
    
    # Add items
    for order_item in pos_order.items:
        item_details = frappe.db.get_value(
            "Item", order_item.item, 
            ["item_name", "description", "stock_uom", "tax_template"], 
            as_dict=1
        )
        
        # Prepare item description (with or without notes)
        description = item_details.description or item_details.item_name
        if should_include_notes and order_item.notes:
            description += f"\n{order_item.notes}"
        
        si_item = si.append("items", {
            "item_code": order_item.item,
            "item_name": item_details.item_name,
            "description": description,
            "qty": order_item.qty,
            "rate": order_item.rate,
            "conversion_factor": 1.0,
            "uom": item_details.stock_uom,
            "stock_uom": item_details.stock_uom,
            "warehouse": pos_profile.warehouse
        })
        
        # Set tax template if available
        if item_details.tax_template:
            si_item.item_tax_template = item_details.tax_template
    
    # Add payment if provided
    if payment_method and payment_amount:
        si.append("payments", {
            "mode_of_payment": payment_method,
            "amount": payment_amount
        })
    
    # Save the invoice
    si.set_missing_values()
    si.calculate_taxes_and_totals()
    si.save()
    
    # Update the POS Order with the invoice reference
    frappe.db.set_value("POS Order", pos_order.name, "sales_invoice", si.name)
    
    # Submit if requested
    if submit:
        si.submit()
    
    # Return the invoice name
    return si.name


def get_active_pos_session(pos_profile: str) -> Optional[str]:
    """
    Get active POS Session for the given profile.
    
    Args:
        pos_profile: POS Profile name
        
    Returns:
        Name of the active POS Session or None
    """
    if not frappe.db.exists("DocType", "POS Session"):
        return None

    scope = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_session_scope") or "User"
    
    filters = {
        "pos_profile": pos_profile,
        "user": frappe.session.user,
        "status": "Open"
    }
    
    # Apply scope-specific filters
    if scope == "Device":
        # Get current device ID (implementation depends on how you track devices)
        device_id = frappe.local.request_ip if hasattr(frappe.local, "request_ip") else None
        if device_id:
            filters["device_id"] = device_id
    elif scope == "POS Profile":
        # Just filter by profile (already included above)
        pass
    
    active_session = frappe.db.get_value("POS Session", filters, "name")
    return active_session


def _should_include_notes_in_description(
    pos_profile: Dict, 
    order_type: str,
    default: bool = True
) -> bool:
    """
    Determine whether notes should be included in the invoice item description
    based on POS Profile settings and order type.
    
    Args:
        pos_profile: POS Profile document
        order_type: Order type (Dine-in, Takeaway, Kiosk)
        default: Default behavior if settings aren't found
        
    Returns:
        Boolean indicating whether to include notes
    """
    # Always include notes for Counter/Kiosk receipts
    if order_type in ["Takeaway", "Kiosk"]:
        return pos_profile.get("imogi_print_notes_on_receipt", True)
    
    # Hide notes on Table Bill by default
    if order_type == "Dine-in":
        return not pos_profile.get("imogi_hide_notes_on_table_bill", True)
    
    # Default behavior
    return default


def split_pos_order_to_invoices(
    pos_order: Union[str, Dict, Any],
    split_data: List[Dict]
) -> List[str]:
    """
    Split a POS Order into multiple Sales Invoices based on ``split_data``.

    Args:
        pos_order: POS Order name or document
        split_data: A list of dictionaries describing how the order should be
            divided. Each dictionary is expected to include a ``customer`` and
            an ``items`` list containing ``{"item_id": str, "qty": float}``
            entries.

    Returns:
        List of created Sales Invoice names.

    Intended behaviour:
        1. Validate the provided split data to ensure item quantities and totals
           match the original POS Order.
        2. Create a new Sales Invoice for each split entry using the specified
           customer and items.
        3. Mark the original POS Order as split and link the resulting invoices.

    Currently, this function is not implemented and will raise an exception
    when called to prevent silent failures.
    """
    frappe.throw(_("Invoice splitting not implemented"))