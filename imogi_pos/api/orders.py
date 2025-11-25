# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import copy
import frappe
from frappe import _
from frappe.utils import now_datetime, flt, cstr, cint
from imogi_pos.utils.permissions import validate_branch_access
from imogi_pos.api.queue import get_next_queue_number
from imogi_pos.api.pricing import evaluate_order_discounts, get_price_list_rate_maps
from frappe.exceptions import TimestampMismatchError


DEFAULT_DISCOUNT_ROLES = {
    "System Manager",
    "Restaurant Manager",
    "Cashier",
    "POS Manager",
}


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


def user_can_apply_order_discounts(user=None):
    """Return True when the current session is allowed to apply manual discounts."""

    user = user or getattr(getattr(frappe, "session", None), "user", None)
    if not user or user == "Guest":
        return False

    try:
        roles = set(frappe.get_roles(user))
    except Exception:
        roles = set()

    allowed_roles = set(DEFAULT_DISCOUNT_ROLES)
    try:
        hooks = frappe.get_hooks("imogi_discount_roles") or []
    except Exception:
        hooks = []
    allowed_roles.update(hooks)

    return bool(roles.intersection(allowed_roles))

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
def add_item_to_order(pos_order, item, qty=1, rate=None, item_options=None):
    """Append a new item row to an existing POS Order and recalculate totals."""

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
        "discount_amount": flt(getattr(order_doc, "discount_amount", 0)),
        "discount_percent": flt(getattr(order_doc, "discount_percent", 0)),
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
    """Ensure the POS Profile is configured to update stock."""
    if not frappe.db.get_value("POS Profile", pos_profile, "update_stock"):
        frappe.throw(
            _("POS Profile {0} is not configured to update stock").format(pos_profile),
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
def create_order(order_type, branch, pos_profile, table=None, customer=None, items=None, discount_amount=0, discount_percent=0, promo_code=None, service_type=None, selling_price_list=None, customer_info=None):
    """
    Creates a new POS Order.
    
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
    evaluation = evaluate_order_discounts(items, promo_code=promo_code)
    evaluation_errors = evaluation.get("errors") or []
    if evaluation_errors:
        frappe.throw(evaluation_errors[0], frappe.ValidationError)

    computed_percent = flt(evaluation.get("discount_percent") or 0)
    computed_amount = flt(evaluation.get("discount_amount") or 0)
    computed_code = evaluation.get("applied_promo_code")

    has_computed_discount = bool(computed_amount or computed_percent)

    if has_computed_discount:
        discount_amount = computed_amount
        discount_percent = computed_percent

    if computed_code is not None or has_computed_discount:
        promo_code = computed_code

    temporary_discount_flag = False
    if has_computed_discount and not _get_flag("imogi_allow_discount_override"):
        _set_flag("imogi_allow_discount_override", True)
        temporary_discount_flag = True

    try:
        # Ensure numeric discounts to avoid type issues
        try:
            discount_amount = float(discount_amount or 0)
        except Exception:
            discount_amount = 0
        try:
            discount_percent = float(discount_percent or 0)
        except Exception:
            discount_percent = 0

        trusted_discount_context = _get_flag("imogi_allow_discount_override")
        if not trusted_discount_context:
            if discount_amount or discount_percent:
                frappe.log_error(
                    _("Blocked untrusted discount submission for user {0}").format(
                        getattr(getattr(frappe, "session", None), "user", "Guest")
                    ),
                    "IMOGI POS Discount Guard",
                )
            discount_amount = 0
            discount_percent = 0
    finally:
        if temporary_discount_flag:
            _set_flag("imogi_allow_discount_override", None)

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

            age_value = _coalesce(payload, ("customer_age", "age"))
            if age_value not in (None, ""):
                try:
                    age_int = cint(age_value)
                except Exception:
                    age_int = None
                if age_int is not None and age_int >= 0:
                    customer_details["customer_age"] = age_int

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
            "discount_amount": discount_amount,
            "discount_percent": discount_percent,
            "promo_code": promo_code,
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
        for item in items:
            if not item.get("item") and item.get("item_code"):
                item["item"] = item.get("item_code")
            row = order_doc.append("items", item)
            if item.get("rate") is not None:
                row.rate = item.get("rate")
            if item.get("item_options") is not None:
                row.item_options = item.get("item_options")
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
    discount_amount=0,
    discount_percent=0,
    promo_code=None,
    service_type=None,
    selling_price_list=None,
    customer_info=None,
):
    """Create an order on behalf of staff while enabling trusted discount overrides."""

    existing_flag = _get_flag("imogi_allow_discount_override")
    should_clear_flag = False

    if not existing_flag and user_can_apply_order_discounts():
        _set_flag("imogi_allow_discount_override", True)
        should_clear_flag = True

    try:
        return create_order(
            order_type,
            branch,
            pos_profile,
            table=table,
            customer=customer,
            items=items,
            discount_amount=discount_amount,
            discount_percent=discount_percent,
            promo_code=promo_code,
            service_type=service_type,
            selling_price_list=selling_price_list,
            customer_info=customer_info,
        )
    finally:
        if should_clear_flag:
            _set_flag("imogi_allow_discount_override", None)

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
