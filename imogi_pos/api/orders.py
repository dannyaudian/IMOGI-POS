# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import copy
import frappe
from frappe import _
from frappe.utils import now_datetime, flt, cstr, cint
from imogi_pos.utils.permissions import validate_branch_access
from imogi_pos.utils.decorators import require_permission, require_role
from imogi_pos.api.queue import get_next_queue_number
from imogi_pos.api.pricing import get_price_list_rate_maps
from frappe.exceptions import TimestampMismatchError

# Import native pricing integration
try:
    from imogi_pos.api.native_pricing import (
        get_applicable_pricing_rules,
        apply_pricing_rules_to_items,
    )
    NATIVE_PRICING_AVAILABLE = True
except ImportError:
    NATIVE_PRICING_AVAILABLE = False


def _get_flag(name):
    flags = getattr(frappe.local, "flags", None)
    if not flags:
        return False
    if isinstance(flags, dict):
        return bool(flags.get(name))
    return bool(getattr(flags, name, False))


def _set_flag(name, value):
    flags = getattr(frappe.local, "flags", None)
    if not flags:
        default_factory = getattr(frappe, "_dict", dict)
        frappe.local.flags = default_factory()
        flags = frappe.local.flags

    if isinstance(flags, dict):
        if value is None:
            flags.pop(name, None)
        else:
            flags[name] = value
    else:
        if value is None:
            if hasattr(flags, name):
                delattr(flags, name)
        else:
            setattr(flags, name, value)


def _apply_native_pricing_rules_to_item(item_dict, customer=None, price_list=None, pos_profile=None):
    """Apply native ERPNext pricing rules to a single item."""
    if not NATIVE_PRICING_AVAILABLE:
        return item_dict
    
    try:
        item_code = item_dict.get("item_code") or item_dict.get("item")
        qty = flt(item_dict.get("qty", 1))
        
        if not item_code:
            return item_dict
        
        # Get applicable pricing rules
        pricing_result = get_applicable_pricing_rules(
            item_code=item_code,
            customer=customer,
            price_list=price_list,
            qty=qty,
            pos_profile=pos_profile,
        )
        
        if pricing_result.get("has_rule"):
            # Apply discount from pricing rule
            if pricing_result.get("discount_percentage"):
                item_dict["discount_percentage"] = pricing_result["discount_percentage"]
            if pricing_result.get("discount_amount"):
                item_dict["discount_amount"] = pricing_result["discount_amount"]
            if pricing_result.get("rate"):
                item_dict["rate"] = pricing_result["rate"]
            
            item_dict["pricing_rule"] = pricing_result.get("pricing_rule")
            
            # Log for debugging
            frappe.log_error(
                f"Applied native pricing rule: {pricing_result.get('pricing_rule')} to item {item_code}",
                "Native Pricing Applied"
            )
    except Exception as e:
        error_msg = f"Error applying native pricing rules to item {item_code}: {str(e)}"
        frappe.log_error(error_msg, "Native Pricing Error")
        # Notify user about the error but still proceed with standard rate
        return item_dict


def _apply_customer_metadata(customer, details):
    """Persist provided customer demographics onto the Customer document when available."""

    if not customer or not details or not isinstance(details, dict):
        return

    if not frappe.db.exists("Customer", customer):
        return

    allowed_fields = (
        "customer_full_name",
        "customer_gender",
        "customer_phone",
        "customer_age",
        "customer_identification",
    )

    updates = {}
    for field in allowed_fields:
        value = details.get(field)
        if value and frappe.db.has_column("Customer", field):
            updates[field] = value

    if updates:
        frappe.db.set_value("Customer", customer, updates, update_modified=False)




WORKFLOW_CLOSED_STATES = ("Closed", "Cancelled", "Returned")


def validate_item_is_sales_item(doc, method=None):
    """Ensure the linked Item is a sales item before saving POS Order Item.

    Args:
        doc: POS Order Item document being saved
        method: Frappe hook method (unused)

    Raises:
        frappe.ValidationError: If the Item is not marked as a sales item
    """

    identifier = getattr(doc, "item", None) or getattr(doc, "item_code", None)
    if not identifier:
        frappe.throw(_("Item is required"), frappe.ValidationError)

    # Ensure downstream logic can rely on doc.item being populated
    doc.item = identifier


    if not frappe.db.exists("Item", identifier):
        frappe.throw(_("Item {0} not found").format(identifier), frappe.ValidationError)

    is_sales_item = frappe.db.get_value("Item", identifier, "is_sales_item")
    if not is_sales_item:
        frappe.throw(
            _("Item {0} is not a sales item").format(identifier),
            frappe.ValidationError,
        )


@frappe.whitelist()
@require_permission("POS Order", "write")
@require_permission("POS Order Item", "create")
def add_item_to_order(pos_order, item, qty=1, rate=None, item_options=None):
    """
    Append a new item row to an existing POS Order and recalculate totals.
    
    PERMISSION REQUIREMENTS:
    - Requires 'write' permission on POS Order
    - Requires 'create' permission on POS Order Item
    - Role 'Cashier' has READ-ONLY access by default (cannot add items)
    - Use roles: Waiter, Branch Manager, or custom role with write permissions
    
    Args:
        pos_order: POS Order name
        item: Item code or dict with item details
        qty: Quantity (default 1)
        rate: Price override (optional)
        item_options: Additional options like variant selection
    """

    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)

    state = getattr(order_doc, "workflow_state", None)
    if state in WORKFLOW_CLOSED_STATES:
        frappe.throw(
            _("Cannot modify order {0} in state {1}").format(order_doc.name, state),
            frappe.ValidationError,
        )

    if item is None:
        frappe.throw(_("Item is required"), frappe.ValidationError)

    # Normalise the incoming item payload
    item_payload = item
    if isinstance(item_payload, str):
        try:
            parsed_item = frappe.parse_json(item_payload)
        except Exception:
            parsed_item = None
        if isinstance(parsed_item, dict):
            item_payload = parsed_item
        else:
            item_payload = {"item": item_payload}
    elif not isinstance(item_payload, dict):
        try:
            item_payload = frappe.parse_json(item_payload)
        except Exception:
            item_payload = {}

    if not isinstance(item_payload, dict):
        frappe.throw(_("Invalid item payload"), frappe.ValidationError)

    if not item_payload.get("item") and item_payload.get("item_code"):
        item_payload["item"] = item_payload.get("item_code")

    item_code = item_payload.get("item")
    if not item_code:
        frappe.throw(_("Item is required"), frappe.ValidationError)

    # Merge and normalise item options
    options_value = item_options if item_options is not None else item_payload.get("item_options")
    if isinstance(options_value, str) and options_value:
        try:
            options_value = frappe.parse_json(options_value)
        except Exception:
            frappe.throw(_("Invalid item options payload"), frappe.ValidationError)

    def _extract_linked_code(selection):
        if isinstance(selection, dict):
            linked = selection.get("linked_item")
            if linked:
                return linked
            nested = selection.get("value")
            if nested:
                return _extract_linked_code(nested)
        elif isinstance(selection, (list, tuple)):
            for entry in selection:
                linked = _extract_linked_code(entry)
                if linked:
                    return linked
        return None

    replacement_code = None
    if isinstance(options_value, dict):
        variant_selection = options_value.get("variant")
        replacement_code = _extract_linked_code(variant_selection)
        if not replacement_code:
            for group, selection in options_value.items():
                if group in {"price", "extra_price"}:
                    continue
                replacement_code = _extract_linked_code(selection)
                if replacement_code:
                    break

    if replacement_code:
        item_code = replacement_code
        item_payload["item"] = item_code
        item_payload["item_code"] = item_code

    # Quantity is either provided explicitly or inside the payload
    qty_value = item_payload.get("qty") if item_payload.get("qty") not in (None, "") else qty
    try:
        qty_value = flt(qty_value)
    except Exception:
        frappe.throw(_("Quantity must be a number"), frappe.ValidationError)

    if qty_value <= 0:
        frappe.throw(_("Quantity must be greater than zero"), frappe.ValidationError)

    # Determine rate precedence: explicit argument > payload > leave unset
    rate_value = rate if rate not in (None, "") else item_payload.get("rate")
    if rate_value not in (None, ""):
        try:
            rate_value = flt(rate_value)
        except Exception:
            frappe.throw(_("Rate must be a number"), frappe.ValidationError)
    else:
        order_price_list = getattr(order_doc, "selling_price_list", None)
        base_price_list = (
            getattr(order_doc, "base_price_list", None)
            or getattr(order_doc, "imogi_base_price_list", None)
        )

        # PERFORMANCE NOTE: get_price_list_rate_maps is called for each add_item_to_order request.
        # If adding items frequently (e.g., quick successive clicks), consider:
        # 1. Caching price list rates at session level
        # 2. Batch item additions in frontend before calling API
        # 3. Pre-loading price lists when order is opened
        rate_maps = get_price_list_rate_maps(
            [item_code],
            price_list=order_price_list,
            base_price_list=base_price_list,
        )

        fallback_rate = rate_maps["price_list_rates"].get(item_code)
        if fallback_rate in (None, ""):
            fallback_rate = rate_maps["base_price_list_rates"].get(item_code)
        if fallback_rate in (None, ""):
            fallback_rate = frappe.db.get_value("Item", item_code, "standard_rate")

        rate_value = flt(fallback_rate or 0)

    row_data = {
        "item": item_code,
        "qty": qty_value,
    }

    row_data["rate"] = rate_value

    if options_value is not None:
        row_data["item_options"] = options_value

    # Apply native ERPNext pricing rules (native-first approach)
    row_data = _apply_native_pricing_rules_to_item(
        row_data,
        customer=getattr(order_doc, "customer", None),
        price_list=getattr(order_doc, "selling_price_list", None),
        pos_profile=getattr(order_doc, "pos_profile", None),
    )

    # Carry over other recognised optional fields from the payload
    for key in ("notes", "kitchen", "kitchen_station"):
        if key in item_payload and item_payload.get(key) is not None:
            row_data[key] = item_payload.get(key)

    row = order_doc.append("items", row_data)

    validate_item_is_sales_item(row)

    order_doc.save()

    row_name = getattr(row, "name", None)

    if hasattr(order_doc, "reload"):
        try:
            order_doc.reload()
        except Exception:
            pass

    added_row = None
    if row_name:
        added_row = next(
            (item_row for item_row in getattr(order_doc, "items", []) if getattr(item_row, "name", None) == row_name),
            None,
        )
    if not added_row:
        added_row = row

    summary = {
        "name": order_doc.name,
        "workflow_state": order_doc.workflow_state,
        "subtotal": flt(getattr(order_doc, "subtotal", 0)),
        "pb1_amount": flt(getattr(order_doc, "pb1_amount", 0)),
        "totals": flt(getattr(order_doc, "totals", 0)),
        "item_count": len(getattr(order_doc, "items", []) or []),
        "total_qty": sum(
            flt(getattr(child, "qty", 0) or 0) for child in (getattr(order_doc, "items", []) or [])
        ),
    }

    return {
        "success": True,
        "item": added_row.as_dict(),
        "order": summary,
    }

def check_restaurant_domain(pos_profile):
    """
    Validates that the POS Profile has Restaurant domain enabled.
    
    Args:
        pos_profile (str): POS Profile name
    
    Raises:
        frappe.ValidationError: If domain is not Restaurant
    """
    domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain")
    if domain != "Restaurant":
        frappe.throw(_("This operation is only available for Restaurant domain"), 
                    frappe.ValidationError)


def ensure_update_stock_enabled(pos_profile):
    """
    Ensure the POS Profile is configured to update stock.
    
    IMPORTANT: This check prevents order creation if POS Profile's 'Update Stock' is disabled.
    If orders fail silently in UI, verify this setting in POS Profile master.
    """
    if not frappe.db.get_value("POS Profile", pos_profile, "update_stock"):
        frappe.throw(
            _("Cannot create order: POS Profile '{0}' must have 'Update Stock' enabled. Please update the POS Profile settings.").format(pos_profile),
            frappe.ValidationError,
        )


@frappe.whitelist()
def get_next_available_table(branch):
    """Return the lowest-numbered available table for a branch."""
    validate_branch_access(branch)
    tables = frappe.get_all(
        "Restaurant Table",
        filters={"branch": branch, "status": "Available"},
        pluck="name",
    )

    if not tables:
        frappe.throw(_("No tables are currently available"), frappe.ValidationError)

    numbers = []
    for name in tables:
        try:
            numbers.append(int(name))
        except (ValueError, TypeError):
            try:
                number = frappe.db.get_value("Restaurant Table", name, "table_number")
                numbers.append(int(number))
            except Exception:
                pass

    if not numbers:
        frappe.throw(_("No tables are currently available"), frappe.ValidationError)

    return str(min(numbers))

@frappe.whitelist()
@require_permission("POS Order", "create")
def create_order(order_type, branch, pos_profile, table=None, customer=None, items=None, service_type=None, selling_price_list=None, customer_info=None):
    """
    Creates a new POS Order.
    
    PERMISSION REQUIREMENTS:
    - Requires 'create' permission on POS Order
    - Role 'Cashier' has READ-ONLY access by default (cannot create orders)
    - Use roles: Waiter, Branch Manager, or custom role with create permissions
    
    COMMON ISSUE: If UI shows "permission denied" or clicks do nothing:
    1. Check user has Waiter/Branch Manager role (not just Cashier)
    2. Verify POS Profile has 'update_stock' enabled
    3. Check browser console for permission errors
    
    Args:
        order_type (str): Order type (Dine-in/Takeaway/Kiosk/POS)
        branch (str): Branch name
        pos_profile (str): POS Profile name
        table (str, optional): Restaurant Table name.
        customer (str, optional): Customer identifier.
        items (list | dict, optional): Items to be added to the order.
        service_type (str, optional): Service type for kiosk or POS orders (Takeaway/Dine-in).
        selling_price_list (str, optional): Explicit price list to apply to the order.
        customer_info (dict | str, optional): Additional customer metadata to store with the order.
    
    Returns:
        dict: Created POS Order details

    """
    validate_branch_access(branch)
    ensure_update_stock_enabled(pos_profile)

    if not selling_price_list:
        selling_price_list = frappe.db.get_value("POS Profile", pos_profile, "selling_price_list")

    # For restaurant-specific features like table assignment
    table_doc = None
    def _safe_throw(message):
        try:
            frappe.throw(message, frappe.ValidationError)
        except BrokenPipeError:
            frappe.log_error(frappe.get_traceback())
            raise frappe.ValidationError(message)

    if table:
        check_restaurant_domain(pos_profile)
        table_doc = frappe.get_doc("Restaurant Table", table)

        # Table must belong to branch and be available
        if table_doc.branch != branch:
            _safe_throw(
                _("Table {0} does not belong to branch {1}").format(table, branch)
            )

        # Resolve any lingering order linked to this table. In concurrent
        # scenarios the referenced POS Order might no longer exist which would
        # raise an unexpected KeyError. To keep the error user facing and
        # consistent we treat any exception here as the table being occupied.
        try:
            table_doc.ensure_available_for_new_order()
        except Exception:
            _safe_throw(
                _("Table {0} is already occupied").format(table)
            )

        if table_doc.current_pos_order:
            _safe_throw(
                _("Table {0} is already occupied").format(table)
            )
    elif order_type == "Dine-in":
        # Allow Dine-in orders without specifying a table, but ensure Restaurant domain
        check_restaurant_domain(pos_profile)

    # Normalise optional customer metadata
    customer_details = {}
    if customer_info not in (None, "", {}):
        payload = customer_info
        if isinstance(payload, str):
            try:
                payload = frappe.parse_json(payload)
            except Exception:
                payload = {}
        elif not isinstance(payload, dict):
            try:
                payload = frappe.parse_json(payload)
            except Exception:
                payload = {}

        if isinstance(payload, dict):
            def _clean_text(value):
                if value in (None, ""):
                    return None
                text = cstr(value).strip()
                return text or None

            def _coalesce(payload_dict, keys):
                for key in keys:
                    if key in payload_dict:
                        return payload_dict.get(key)
                return None

            name_value = _clean_text(
                _coalesce(
                    payload,
                    ("customer_full_name", "full_name", "name", "customer_name"),
                )
            )
            if name_value:
                customer_details["customer_full_name"] = name_value

            gender_value = _clean_text(
                _coalesce(payload, ("customer_gender", "gender"))
            )
            if gender_value:
                customer_details["customer_gender"] = gender_value

            phone_value = _clean_text(
                _coalesce(
                    payload,
                    (
                        "customer_phone",
                        "phone",
                        "mobile",
                        "mobile_no",
                        "contact_number",
                    ),
                )
            )
            if phone_value:
                customer_details["customer_phone"] = phone_value

            age_value = _clean_text(
                _coalesce(payload, ("customer_age", "age"))
            )
            if age_value:
                customer_details["customer_age"] = age_value

            identification_value = _clean_text(
                _coalesce(
                    payload,
                    (
                        "customer_identification",
                        "identification_status",
                        "identification",
                    ),
                )
            )
            if identification_value:
                customer_details["customer_identification"] = identification_value

    # Create POS Order document
    order_doc = frappe.new_doc("POS Order")
    order_doc.update(
        {
            "order_type": order_type,
            "branch": branch,
            "pos_profile": pos_profile,
            "table": table,
            "customer": customer,
            "workflow_state": "Draft",
            "selling_price_list": selling_price_list,
        }
    )
    if customer_details:
        order_doc.update(customer_details)
    if table_doc:
        order_doc.floor = table_doc.floor

    if order_type in {"Kiosk", "POS"}:
        order_doc.queue_number = get_next_queue_number(branch)

    if service_type:
        order_doc.service_type = service_type

    if items:
        if isinstance(items, str):
            items = frappe.parse_json(items)
        if isinstance(items, dict):
            items = [items]
        
        # Apply native pricing rules to all items (native-first approach)
        if NATIVE_PRICING_AVAILABLE:
            try:
                pricing_result = apply_pricing_rules_to_items(
                    items=items,
                    customer=customer,
                    price_list=selling_price_list,
                    pos_profile=pos_profile,
                )
                
                if pricing_result.get("has_pricing_rules"):
                    items = pricing_result.get("items", items)
                    
                    # Add free items if any
                    free_items = pricing_result.get("free_items", [])
                    if free_items:
                        items.extend(free_items)
            except Exception as e:
                frappe.log_error(f"Error applying native pricing to order items: {str(e)}", "Native Pricing Error")
        
        for item in items:
            if not item.get("item") and item.get("item_code"):
                item["item"] = item.get("item_code")
            row = order_doc.append("items", item)
            if item.get("rate") is not None:
                row.rate = item.get("rate")
            if item.get("item_options") is not None:
                row.item_options = item.get("item_options")
            # Copy pricing rule info if available
            if item.get("pricing_rule"):
                row.pricing_rule = item.get("pricing_rule")
            if item.get("discount_percentage"):
                row.discount_percentage = item.get("discount_percentage")
            if item.get("discount_amount"):
                row.discount_amount = item.get("discount_amount")
                # Log discount for audit trail
                try:
                    from imogi_pos.utils.audit_log import log_discount_applied
                    log_discount_applied(
                        invoice_name=order_doc.name,
                        discount_amount=item.get("discount_amount"),
                        reason="Pricing rule applied",
                        user=frappe.session.user,
                        branch=order_doc.imogi_branch if hasattr(order_doc, 'imogi_branch') else None
                    )
                except Exception as e:
                    frappe.log_error(f"Failed to log discount: {str(e)}", "Discount Audit Log")
            validate_item_is_sales_item(row)

    # Validate customer before inserting the order
    if customer:
        # Check if the provided customer exists
        if not frappe.db.exists("Customer", customer):
            if customer == "Walk-in Customer":
                # Remove link to allow inserting the order without a customer
                order_doc.customer = None
            else:
                _safe_throw(
                    _("Customer {0} not found").format(customer)
                )

    order_doc.insert()
    if customer_details:
        _apply_customer_metadata(customer, customer_details)
    # Allow downstream apps to reserve or deduct stock before invoicing
    call_hook = getattr(frappe, "call_hook", None)
    if call_hook:
        call_hook("after_create_order", order=order_doc)
    else:
        for hook in frappe.get_hooks("after_create_order") or []:
            frappe.get_attr(hook)(order=order_doc)

    if table_doc:
        table_doc.reload()
        if table_doc.status != "Available":
            _safe_throw(_("Table already occupied"))
        try:
            table_doc.set_status("Occupied", pos_order=order_doc.name)
        except TimestampMismatchError:
            _safe_throw(_("Table already occupied"))

    return order_doc.as_dict()


@frappe.whitelist()
def create_staff_order(
    order_type,
    branch,
    pos_profile,
    table=None,
    customer=None,
    items=None,
    service_type=None,
    selling_price_list=None,
    customer_info=None,
):
    """Create an order on behalf of staff."""

    return create_order(
        order_type,
        branch,
        pos_profile,
        table=table,
        customer=customer,
        items=items,
        service_type=service_type,
        selling_price_list=selling_price_list,
        customer_info=customer_info,
    )

@frappe.whitelist()
def open_or_create_for_table(table, floor, pos_profile):
    """
    Opens an existing POS Order for a table or creates a new one if none exists.
    Used by Waiter Order flow.
    
    Args:
        table (str): Restaurant Table name
        floor (str): Restaurant Floor name
        pos_profile (str): POS Profile name
    
    Returns:
        dict: POS Order details (existing or new)
    """
    check_restaurant_domain(pos_profile)
    
    # Get branch from POS Profile
    branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
    if not branch:
        frappe.throw(_("Branch not configured in POS Profile"), frappe.ValidationError)

    validate_branch_access(branch)

    table_doc = frappe.get_doc("Restaurant Table", table)

    if table_doc.current_pos_order:
        state = frappe.db.get_value(
            "POS Order", table_doc.current_pos_order, "workflow_state"
        )
        if state in WORKFLOW_CLOSED_STATES:
            table_doc.set_status("Available")
        else:
            existing_order = frappe.get_doc("POS Order", table_doc.current_pos_order)
            validate_branch_access(existing_order.branch)
            return existing_order.as_dict()

    return create_order("Dine-in", branch, pos_profile, table)

@frappe.whitelist()
def switch_table(pos_order, from_table, to_table):
    """
    Moves a POS Order from one table to another.
    
    Args:
        pos_order (str): POS Order name
        from_table (str): Source table name
        to_table (str): Destination table name
    
    Returns:
        dict: Updated POS Order details
    
    Raises:
        frappe.ValidationError: If tables are not available or order status doesn't allow switch
    """
    # Get POS Order details
    order_doc = frappe.get_doc("POS Order", pos_order)
    check_restaurant_domain(order_doc.pos_profile)
    validate_branch_access(order_doc.branch)
    
    # Validate that the from_table matches the order's current table
    if order_doc.table != from_table:
        frappe.throw(_("Order is not currently at table {0}").format(from_table),
                    frappe.ValidationError)

    # Check destination table availability
    to_table_doc = frappe.get_doc("Restaurant Table", to_table)
    if to_table_doc.status == "Occupied" and to_table_doc.current_pos_order:
        frappe.throw(
            _("Table {0} is already occupied").format(to_table),
            frappe.ValidationError,
        )

    from_table_doc = frappe.get_doc("Restaurant Table", from_table)

    # Update order and table assignments
    order_doc.table = to_table
    order_doc.floor = to_table_doc.floor
    order_doc.save()

    from_table_doc.set_status("Available")
    to_table_doc.set_status("Occupied", pos_order=order_doc.name)

    return order_doc.as_dict()

@frappe.whitelist()
def merge_tables(target_table, source_tables):
    """
    Merges orders from multiple tables into a single target table.
    
    Args:
        target_table (str): Destination table name
        source_tables (list): List of source table names to merge
    
    Returns:
        dict: Merged order details
    
    Raises:
        frappe.ValidationError: If any table has items in Ready state
                              or tables don't have open orders
    """
    if isinstance(source_tables, str):
        source_tables = frappe.parse_json(source_tables)
    
    # Ensure we have at least one source table
    if not source_tables or len(source_tables) == 0:
        frappe.throw(_("No source tables provided for merge"), frappe.ValidationError)
    
    target_order_name = frappe.db.get_value(
        "Restaurant Table", target_table, "current_pos_order"
    )
    if not target_order_name:
        frappe.throw(_("No open order found for target table"), frappe.ValidationError)

    target_order = frappe.get_doc("POS Order", target_order_name)
    check_restaurant_domain(target_order.pos_profile)
    validate_branch_access(target_order.branch)

    target_table_doc = frappe.get_doc("Restaurant Table", target_table)

    for table in source_tables:
        if table == target_table:
            frappe.throw(_("Source table list cannot include the target table"), frappe.ValidationError)

        source_order_name = frappe.db.get_value(
            "Restaurant Table", table, "current_pos_order"
        )
        if not source_order_name:
            frappe.throw(
                _("No open order found for table {0}").format(table),
                frappe.ValidationError,
            )

        source_order = frappe.get_doc("POS Order", source_order_name)

        if any(
            getattr(item, "workflow_state", None) == "Ready"
            for item in getattr(source_order, "items", [])
        ):
            frappe.throw(
                _("Cannot merge table {0} with items in Ready state").format(table),
                frappe.ValidationError,
            )

        for item in getattr(source_order, "items", []):
            target_order.append("items", copy.deepcopy(item))
        target_order.save()

        frappe.db.set_value("POS Order", source_order_name, "workflow_state", "Merged")
        source_table_doc = frappe.get_doc("Restaurant Table", table)
        source_table_doc.set_status("Available")

    target_table_doc.set_status("Occupied", pos_order=target_order.name)

    return {
        "name": target_order.name,
        "target_table": target_table,
        "source_tables": source_tables,
        "merged_at": now_datetime(),
        "status": "Merged",
    }

@frappe.whitelist()
def update_order_status(pos_order, status):
    """Update an order's workflow state and free its table when completed."""
    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)

    order_doc.db_set("workflow_state", status, update_modified=False)
    order_doc.workflow_state = status

    if status in WORKFLOW_CLOSED_STATES and order_doc.table:
        table_doc = frappe.get_doc("Restaurant Table", order_doc.table)
        table_doc.set_status("Available")

    return {"name": order_doc.name, "workflow_state": order_doc.workflow_state}

@frappe.whitelist()
def save_order(pos_order, items=None, customer=None, guests=None, table=None, **kwargs):
    """
    Save order changes without sending to kitchen.
    Updates items, customer, guests, and other order details.
    
    Args:
        pos_order (str): POS Order name
        items (list): List of items with their details
        customer (str): Customer ID (optional)
        guests (int): Number of guests (optional)
        table (str): Table name (optional)
    
    Returns:
        dict: Updated order with item rows
    """
    if isinstance(items, str):
        items = frappe.parse_json(items)
    
    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)
    
    # Check if order is in a closed state
    if order_doc.workflow_state in WORKFLOW_CLOSED_STATES:
        frappe.throw(
            _("Cannot modify order {0} in state {1}").format(order_doc.name, order_doc.workflow_state),
            frappe.ValidationError
        )
    
    # Update customer if provided
    if customer:
        order_doc.customer = customer
    
    # Update guests if provided
    if guests is not None:
        order_doc.guests = cint(guests)
    
    # Update table if provided
    if table:
        order_doc.table = table
    
    # Get existing items with counters (already sent to kitchen)
    existing_sent_items = {}
    for item in order_doc.items:
        if item.get("counters"):
            existing_sent_items[item.name] = item
    
    # Update items if provided
    if items:
        # Keep track of items to preserve
        items_to_keep = []
        
        for item_data in items:
            item_name = item_data.get('name')
            
            # If item has a name and exists in sent items, update it
            if item_name and item_name in existing_sent_items:
                existing_item = existing_sent_items[item_name]
                # Only update notes for items already sent to kitchen
                existing_item.notes = item_data.get('notes', existing_item.notes)
                items_to_keep.append(existing_item)
            else:
                # This is a new item, add it
                items_to_keep.append(item_data)
        
        # Clear items and re-add
        order_doc.items = []
        
        for item_data in items_to_keep:
            if hasattr(item_data, 'as_dict'):
                # This is an existing item object
                order_doc.append('items', item_data)
            else:
                # This is new item data
                order_doc.append('items', {
                    'item': item_data.get('item') or item_data.get('item_code'),
                    'template_item': item_data.get('template_item'),
                    'qty': flt(item_data.get('qty', 1)),
                    'rate': flt(item_data.get('rate', 0)),
                    'notes': item_data.get('notes', ''),
                    'item_options': item_data.get('item_options', {})
                })
    
    order_doc.save()
    order_doc.reload()
    
    return order_doc.as_dict()


@frappe.whitelist()
@require_permission("POS Order", "cancel")
def cancel_order(pos_order):
    """
    Cancel a POS Order and free its table.
    
    Args:
        pos_order (str): POS Order name
    
    Returns:
        dict: Success status and message
    """
    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)
    
    # Check if order can be cancelled
    if order_doc.workflow_state in ["Billed", "Completed"]:
        frappe.throw(
            _("Cannot cancel order {0} that has been billed").format(order_doc.name),
            frappe.ValidationError
        )
    
    # Update workflow state
    order_doc.workflow_state = "Cancelled"
    order_doc.save()
    
    # Log order cancellation for audit trail
    try:
        from imogi_pos.utils.audit_log import log_void_transaction
        total_amount = sum(item.amount for item in order_doc.items) if hasattr(order_doc, 'items') else 0
        log_void_transaction(
            invoice_name=order_doc.name,
            total_amount=total_amount,
            reason="POS Order cancelled",
            user=frappe.session.user,
            branch=order_doc.branch if hasattr(order_doc, 'branch') else None
        )
    except Exception as e:
        frappe.log_error(f"Failed to log order cancellation: {str(e)}", "Order Cancellation Audit Log")
    
    # Free the table if assigned
    if order_doc.table:
        try:
            table_doc = frappe.get_doc("Restaurant Table", order_doc.table)
            table_doc.status = "Available"
            table_doc.current_pos_order = None
            table_doc.save()
        except Exception as e:
            frappe.log_error(f"Failed to free table {order_doc.table}: {str(e)}", "Cancel Order")
    
    return {
        "success": True,
        "message": _("Order {0} has been cancelled").format(order_doc.name),
        "name": order_doc.name,
        "workflow_state": order_doc.workflow_state
    }


@frappe.whitelist()
def set_order_type(pos_order, order_type):
    """
    Updates the order type of an existing POS Order.
    
    Args:
        pos_order (str): POS Order name
        order_type (str): New order type (Dine-in/Takeaway/Kiosk/POS)
    
    Returns:
        dict: Updated POS Order details
    
    Raises:
        frappe.ValidationError: If the order type change is not allowed for the current state
    """
    # Get POS Order details
    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)
    
    # If changing to or from Dine-in, check restaurant domain
    if order_type == "Dine-in" or order_doc.order_type == "Dine-in":
        check_restaurant_domain(order_doc.pos_profile)
    
    # STUB: Validate if order type change is allowed in current state
    # STUB: Update order type and handle table assignment changes
    
    return {
        "name": pos_order,
        "previous_type": order_doc.order_type,
        "new_type": order_type,
        "updated_at": now_datetime()
    }


@frappe.whitelist()
def create_counter_order(pos_profile, branch, items, customer=None, order_type="Takeaway", customer_info=None):
    """
    Creates a new POS Order specifically for Counter mode.
    Simplified version of create_order() focused on counter operations.
    
    Args:
        pos_profile (str): POS Profile name
        branch (str): Branch name
        items (list): Items to add to order [{"item_code": "ITEM-001", "qty": 2, "rate": 50000, "notes": ""}]
        customer (str, optional): Customer name (defaults to Walk-in Customer)
        order_type (str, optional): "Takeaway" or "Dine-in" (for queue number)
        customer_info (dict, optional): Additional customer metadata
    
    Returns:
        dict: Created POS Order with name, items, totals
    """
    from frappe.utils import flt, cint, now_datetime
    from imogi_pos.api.pricing import calculate_order_totals
    
    # Validate access
    validate_branch_access(branch)
    ensure_update_stock_enabled(pos_profile)
    
    # Parse items if string
    if isinstance(items, str):
        items = frappe.parse_json(items)
    
    if not items or not isinstance(items, list):
        frappe.throw(_("Items are required to create an order"))
    
    # Get POS Profile settings
    pos_profile_doc = frappe.get_doc("POS Profile", pos_profile)
    selling_price_list = pos_profile_doc.selling_price_list
    currency = pos_profile_doc.currency or frappe.defaults.get_global_default("currency")
    
    # Get or create Walk-in Customer if no customer specified
    if not customer:
        customer = frappe.db.get_value(
            "POS Profile", pos_profile, "customer"
        ) or frappe.db.get_value("Selling Settings", None, "customer")
        
        if not customer:
            # Create Walk-in Customer if not exists
            if not frappe.db.exists("Customer", "Walk-in Customer"):
                walk_in = frappe.get_doc({
                    "doctype": "Customer",
                    "customer_name": "Walk-in Customer",
                    "customer_group": frappe.db.get_value("Selling Settings", None, "customer_group") or "Commercial",
                    "territory": frappe.db.get_value("Selling Settings", None, "territory") or "All Territories"
                })
                walk_in.insert(ignore_permissions=True)
                customer = "Walk-in Customer"
            else:
                customer = "Walk-in Customer"
    
    # Parse customer_info if string
    customer_details = {}
    if customer_info:
        if isinstance(customer_info, str):
            customer_info = frappe.parse_json(customer_info)
        if isinstance(customer_info, dict):
            customer_details = customer_info
    
    # Apply customer metadata if provided
    if customer_details:
        _apply_customer_metadata(customer, customer_details)
    
    # Generate queue number if Dine-in (for counter dine-in orders)
    queue_number = None
    if order_type == "Dine-in":
        queue_number = get_next_queue_number(branch)
    
    # Create POS Order document
    order_doc = frappe.get_doc({
        "doctype": "POS Order",
        "branch": branch,
        "pos_profile": pos_profile,
        "customer": customer,
        "order_type": order_type,
        "selling_price_list": selling_price_list,
        "currency": currency,
        "workflow_state": "Draft",  # Start as Draft
        "imogi_mode": "Counter",  # Mark as Counter mode order
        "queue_number": queue_number,
        "items": []
    })
    
    # Add customer metadata to order if available
    for key, value in customer_details.items():
        if hasattr(order_doc, key):
            order_doc.set(key, value)
    
    # Add items to order
    for item_data in items:
        item_code = item_data.get("item_code") or item_data.get("item")
        if not item_code:
            continue
        
        qty = flt(item_data.get("qty", 1))
        if qty <= 0:
            continue
        
        # Get item details
        item_doc = frappe.get_doc("Item", item_code)
        
        # Get rate from item_data or fetch from price list
        rate = flt(item_data.get("rate", 0))
        if rate == 0:
            # Fetch from Item Price
            item_price = frappe.db.get_value(
                "Item Price",
                {
                    "item_code": item_code,
                    "price_list": selling_price_list,
                    "selling": 1
                },
                "price_list_rate"
            )
            rate = flt(item_price) if item_price else 0
        
        # Calculate amount
        amount = flt(qty * rate)
        
        # Add item row
        order_doc.append("items", {
            "item": item_code,
            "item_name": item_doc.item_name,
            "qty": qty,
            "rate": rate,
            "amount": amount,
            "uom": item_doc.stock_uom,
            "notes": item_data.get("notes", ""),
            "default_kitchen": item_doc.get("default_kitchen"),
            "default_kitchen_station": item_doc.get("default_kitchen_station")
        })
    
    # Insert order (will trigger calculations)
    order_doc.insert(ignore_permissions=True)
    
    # Calculate totals
    totals = calculate_order_totals(order_doc.name)
    order_doc.reload()
    
    # Send to kitchen if KOT is enabled in Restaurant Settings
    # Check global setting instead of hardcoding based on order_type
    kot_ticket = None
    try:
        from imogi_pos.utils.restaurant_settings import get_kot_settings
        kot_settings = get_kot_settings()
        
        # If KOT is enabled, send ALL counter orders to kitchen (Takeaway + Dine-in)
        if kot_settings.get("enable_kot"):
            from imogi_pos.kitchen.kot_service import create_kot_from_order
            kot_result = create_kot_from_order(
                pos_order=order_doc.name,
                selected_items=None,  # All items
                send_to_kitchen=True
            )
            if kot_result and kot_result.get("tickets"):
                # Get first ticket name (may be multiple if grouped by station)
                kot_ticket = kot_result["tickets"][0] if kot_result["tickets"] else None
                frappe.logger().info(f"KOT created for counter order {order_doc.name}: {kot_ticket}")
    except Exception as e:
        frappe.log_error(f"Failed to create KOT for counter order {order_doc.name}: {str(e)}")
        # Don't fail order creation if KOT fails
    
    # Return order details
    return {
        "name": order_doc.name,
        "customer": order_doc.customer,
        "order_type": order_doc.order_type,
        "queue_number": order_doc.queue_number,
        "workflow_state": order_doc.workflow_state,
        "kot_ticket": kot_ticket,
        "items": [
            {
                "item": row.item,
                "item_name": row.item_name,
                "qty": row.qty,
                "rate": row.rate,
                "amount": row.amount,
                "notes": row.notes
            }
            for row in order_doc.items
        ],
        "totals": totals,
        "creation": order_doc.creation,
        "modified": order_doc.modified
    }


@frappe.whitelist()
def create_table_order(branch, customer, waiter, items, table=None, mode="Dine-in", notes=""):
    """
    Create a POS Order for table service (Waiter App).
    Does not generate invoice - that happens at Cashier when customer pays.
    
    Args:
        branch (str): Branch name
        customer (str): Customer name (can be "Walk-in Customer")
        waiter (str): Waiter user email
        items (list): List of order items with item_code, qty, rate, notes, station
        table (str, optional): Restaurant table name (required for Dine-in)
        mode (str): Order mode - "Dine-in" or "Counter"
        notes (str, optional): Order-level special notes
    
    Returns:
        dict: Created order details
    """
    try:
        # Parse items if JSON string
        if isinstance(items, str):
            import json
            items = json.loads(items)
        
        # Validate inputs
        if not branch:
            frappe.throw(_("Branch is required"))
        
        if not customer:
            customer = "Walk-in Customer"
        
        if not waiter:
            frappe.throw(_("Waiter is required"))
        
        if not items or len(items) == 0:
            frappe.throw(_("At least one item is required"))
        
        if mode == "Dine-in" and not table:
            frappe.throw(_("Table is required for Dine-in orders"))
        
        # Validate branch access
        validate_branch_access(branch)
        
        # Get POS Profile for branch
        pos_profile = frappe.db.get_value("POS Profile", {"branch": branch, "disabled": 0}, "name")
        if not pos_profile:
            frappe.throw(_("No active POS Profile found for branch {0}").format(branch))
        
        # Get POS Profile details
        pos_profile_doc = frappe.get_doc("POS Profile", pos_profile)
        
        # Create POS Order
        order_doc = frappe.new_doc("POS Order")
        order_doc.branch = branch
        order_doc.pos_profile = pos_profile
        order_doc.customer = customer
        order_doc.order_type = mode
        order_doc.table = table if mode == "Dine-in" else None
        order_doc.waiter = waiter
        order_doc.workflow_state = "Draft"
        order_doc.imogi_source_module = "Waiter"
        
        # Set company and other defaults from POS Profile
        order_doc.company = pos_profile_doc.company
        order_doc.price_list = pos_profile_doc.selling_price_list
        order_doc.currency = pos_profile_doc.currency or frappe.defaults.get_global_default("currency")
        
        # Add special notes
        if notes:
            order_doc.special_notes = notes
        
        # Add items
        total_qty = 0
        total_amount = 0
        
        for item in items:
            item_code = item.get("item_code")
            qty = flt(item.get("qty", 1))
            rate = flt(item.get("rate", 0))
            
            if not item_code:
                continue
            
            # Get item details
            item_doc = frappe.get_doc("Item", item_code)
            
            order_doc.append("items", {
                "item_code": item_code,
                "item_name": item.get("item_name") or item_doc.item_name,
                "qty": qty,
                "uom": item.get("uom") or item_doc.stock_uom,
                "rate": rate,
                "amount": qty * rate,
                "notes": item.get("notes", ""),
                "production_station": item.get("station")
            })
            
            total_qty += qty
            total_amount += (qty * rate)
        
        # Calculate totals
        order_doc.total_qty = total_qty
        order_doc.net_total = total_amount
        order_doc.grand_total = total_amount  # Will be updated with taxes later
        
        # Save order
        order_doc.insert(ignore_permissions=True)
        
        # Update table status if dine-in
        if table:
            table_doc = frappe.get_doc("Restaurant Table", table)
            table_doc.status = "Occupied"
            table_doc.current_order = order_doc.name
            table_doc.save(ignore_permissions=True)
        
        frappe.db.commit()
        
        return {
            "name": order_doc.name,
            "customer": order_doc.customer,
            "table": order_doc.table,
            "order_type": order_doc.order_type,
            "waiter": order_doc.waiter,
            "workflow_state": order_doc.workflow_state,
            "total_qty": order_doc.total_qty,
            "grand_total": order_doc.grand_total,
            "items": [
                {
                    "item_code": row.item_code,
                    "item_name": row.item_name,
                    "qty": row.qty,
                    "rate": row.rate,
                    "amount": row.amount,
                    "notes": row.notes,
                    "station": row.production_station
                }
                for row in order_doc.items
            ],
            "creation": order_doc.creation
        }
        
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Error creating table order: {str(e)}", "Create Table Order Error")
        frappe.throw(_("Failed to create order: {0}").format(str(e)))


