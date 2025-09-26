# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import math
import frappe
from frappe import _
from frappe.utils import now_datetime, cint, add_to_date, get_url, flt
from frappe.realtime import publish_realtime

try:
    from erpnext.stock.stock_ledger import NegativeStockError
except Exception:  # pragma: no cover - fallback when erpnext isn't installed
    class NegativeStockError(Exception):
        pass


LOW_STOCK_THRESHOLD = 10

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
    # Skip validation completely if POS Session DocType is unavailable
    if not frappe.db.exists("DocType", "POS Session"):
        return None

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


def notify_stock_update(invoice_doc, profile_doc):
    """Publish stock updates for items in a submitted Sales Invoice."""

    if not invoice_doc or not profile_doc:
        return

    warehouse = None
    profile_get = getattr(profile_doc, "get", None)
    if callable(profile_get):
        warehouse = profile_get("warehouse")
    if not warehouse:
        warehouse = getattr(profile_doc, "warehouse", None)

    if not warehouse:
        return

    def _extract_item_codes(rows):
        for row in rows or []:
            if isinstance(row, dict):
                item_code = row.get("item_code")
            else:
                item_code = getattr(row, "item_code", None)
            if item_code:
                yield item_code

    item_codes = set()
    item_codes.update(_extract_item_codes(getattr(invoice_doc, "items", None)))
    item_codes.update(_extract_item_codes(getattr(invoice_doc, "packed_items", None)))

    if not item_codes:
        return

    realtime = getattr(frappe, "publish_realtime", None) or publish_realtime

    for item_code in item_codes:
        actual_qty = frappe.db.get_value(
            "Bin",
            {"item_code": item_code, "warehouse": warehouse},
            "actual_qty",
        ) or 0
        realtime(
            "stock_update",
            {
                "item_code": item_code,
                "warehouse": warehouse,
                "actual_qty": actual_qty,
            },
        )


def on_sales_invoice_submit(invoice_doc, method=None):
    """Hook handler to publish stock updates when a Sales Invoice is submitted."""

    if not invoice_doc:
        return

    pos_profile = getattr(invoice_doc, "pos_profile", None)
    if not pos_profile:
        return

    try:
        profile_doc = frappe.get_doc("POS Profile", pos_profile)
    except Exception:
        return

    notify_stock_update(invoice_doc, profile_doc)


def _get_option_price(item_doc, table_name, option_name):
    for row in getattr(item_doc, table_name, []) or []:
        if getattr(row, "option_name", None) == option_name:
            return flt(getattr(row, "additional_price", 0))
    return 0


def compute_customizations(order_item):
    """Compute customization details for a POS Order item."""
    options = getattr(order_item, "item_options", None) or {}
    if isinstance(options, str):
        options = frappe.parse_json(options)
    if not isinstance(options, dict):
        return 0, {}, ""

    customizations = {}
    total_delta = 0
    summary_parts = []
    item_doc = None

    option_tables = {
        "size": "item_size_options",
        "spice": "item_spice_options",
        "topping": "item_topping_options",
        "toppings": "item_topping_options",
        "variant": "item_variant_options",
        "sugar": "item_sugar_options",
        "ice": "item_ice_options",
    }

    for group, selection in options.items():
        if group == "extra_price" or selection in (None, "", []):
            continue
        if isinstance(selection, list):
            entries = selection
        else:
            entries = [selection]

        names = []
        linked_codes = set()
        for entry in entries:
            if not entry:
                continue
            if isinstance(entry, dict):
                display = entry.get("name") or entry.get("label") or entry.get("value")
                if display is not None and display != "":
                    names.append(str(display))
                linked_code = entry.get("linked_item")
                if linked_code:
                    linked_codes.add(linked_code)
            else:
                names.append(str(entry))

        if not names:
            continue

        customizations[group] = names
        summary_parts.append(f"{group.title()}: {', '.join(names)}")

        table = option_tables.get(group)
        if table:
            if item_doc is None:
                try:
                    item_doc = frappe.get_cached_doc("Item", order_item.item)
                except Exception:
                    item_doc = None
            if item_doc:
                skip_price_lookup = bool(linked_codes and getattr(order_item, "item", None) in linked_codes)
                if not skip_price_lookup:
                    for name in names:
                        total_delta += _get_option_price(item_doc, table, name)

    summary = ", ".join(summary_parts)
    return total_delta, customizations, summary

def _get_invoice_item_values(invoice_item):
    if isinstance(invoice_item, dict):
        parent_item_code = invoice_item.get("item_code") or invoice_item.get("item")
        item_qty = flt(invoice_item.get("qty") or 0)
        item_warehouse = invoice_item.get("warehouse")
    else:
        parent_item_code = getattr(invoice_item, "item_code", None) or getattr(
            invoice_item, "item", None
        )
        item_qty = flt(getattr(invoice_item, "qty", 0))
        item_warehouse = getattr(invoice_item, "warehouse", None)

    return parent_item_code, item_qty, item_warehouse


def _get_default_warehouse(profile_doc):
    profile_get = getattr(profile_doc, "get", None)
    default_warehouse = None
    if callable(profile_get):
        default_warehouse = profile_get("warehouse")
    if not default_warehouse:
        default_warehouse = getattr(profile_doc, "warehouse", None)
    return default_warehouse


def _collect_bom_component_data(
    parent_item_code, item_qty, item_warehouse, default_warehouse, cache
):
    if not parent_item_code or not item_qty:
        return None

    cache_entry = cache.get(parent_item_code)
    if cache_entry is None:
        bom_name = frappe.db.get_value(
            "BOM",
            {"item": parent_item_code, "is_default": 1, "is_active": 1},
            "name",
        )
        if not bom_name:
            cache[parent_item_code] = False
            return None

        try:
            bom_doc = frappe.get_doc("BOM", bom_name)
        except Exception:
            cache[parent_item_code] = False
            return None

        bom_quantity = flt(getattr(bom_doc, "quantity", 0)) or 0
        if not bom_quantity:
            cache[parent_item_code] = False
            return None

        cache_entry = (bom_name, bom_doc, bom_quantity)
        cache[parent_item_code] = cache_entry

    if not cache_entry:
        return None

    bom_name, bom_doc, bom_quantity = cache_entry
    components = []
    low_stock_components = []
    max_producible_qty = None
    has_component_shortage = False
    item_details_cache = cache.setdefault("_item_details", {})
    for component in getattr(bom_doc, "items", []) or []:
        if isinstance(component, dict):
            component_code = component.get("item_code")
            component_qty = flt(component.get("qty") or 0)
            component_warehouse = (
                component.get("source_warehouse")
                or component.get("s_warehouse")
                or component.get("warehouse")
            )
        else:
            component_code = getattr(component, "item_code", None)
            component_qty = flt(getattr(component, "qty", 0))
            component_warehouse = (
                getattr(component, "source_warehouse", None)
                or getattr(component, "s_warehouse", None)
                or getattr(component, "warehouse", None)
            )

        if not component_code or not component_qty:
            continue

        per_unit_qty = component_qty / bom_quantity
        if not per_unit_qty:
            total_qty = 0
        else:
            total_qty = per_unit_qty * item_qty
        if not total_qty:
            continue

        warehouse = component_warehouse or item_warehouse or default_warehouse

        available_qty = None
        if per_unit_qty:
            bin_filters = {"item_code": component_code}
            if warehouse:
                bin_filters["warehouse"] = warehouse
            try:
                available_qty = frappe.db.get_value(
                    "Bin", bin_filters, "actual_qty"
                )
            except Exception:
                available_qty = None
            available_qty = flt(available_qty or 0)
            if available_qty < 0:
                available_qty = 0
            component_capacity = math.floor(available_qty / per_unit_qty)
            if component_capacity < 0:
                component_capacity = 0
            previous_capacity = max_producible_qty
            if max_producible_qty is None:
                max_producible_qty = component_capacity
            else:
                max_producible_qty = min(max_producible_qty, component_capacity)
            if (
                max_producible_qty is not None
                and max_producible_qty <= 0
                and (previous_capacity is None or previous_capacity > 0)
            ):
                has_component_shortage = True
            elif component_capacity <= 0:
                has_component_shortage = True
        else:
            available_qty = None

        item_details = item_details_cache.get(component_code)
        if item_details is None:
            try:
                item_details = frappe.db.get_value(
                    "Item",
                    component_code,
                    ["item_name", "stock_uom"],
                    as_dict=True,
                )
            except Exception:
                item_details = None
            if not isinstance(item_details, dict):
                item_details = {}
            item_details_cache[component_code] = item_details

        item_name = item_details.get("item_name") or component_code
        stock_uom = item_details.get("stock_uom")

        component_data = {
            "item_code": component_code,
            "qty": total_qty,
            "warehouse": warehouse,
            "per_unit_qty": per_unit_qty,
            "available_qty": available_qty,
            "item_name": item_name,
            "stock_uom": stock_uom,
        }
        components.append(component_data)

        if available_qty is not None and available_qty < LOW_STOCK_THRESHOLD:
            low_stock_components.append(
                {
                    "item_code": component_code,
                    "item_name": item_name,
                    "stock_uom": stock_uom,
                    "actual_qty": available_qty,
                    "warehouse": warehouse,
                }
            )

    finished_warehouse = (
        getattr(bom_doc, "fg_warehouse", None)
        or item_warehouse
        or default_warehouse
    )

    finished_stock = 0
    if finished_warehouse:
        try:
            finished_stock = frappe.db.get_value(
                "Bin",
                {"item_code": parent_item_code, "warehouse": finished_warehouse},
                "actual_qty",
            )
        except Exception:
            finished_stock = 0
        finished_stock = flt(finished_stock or 0)
        if finished_stock < 0:
            finished_stock = 0

    bom_capacity = flt(max_producible_qty or 0) + finished_stock

    return {
        "bom_name": bom_name,
        "components": components,
        "finished_warehouse": finished_warehouse,
        "item_qty": item_qty,
        "item_warehouse": item_warehouse or default_warehouse,
        "max_producible_qty": flt(max_producible_qty or 0),
        "finished_stock": finished_stock,
        "bom_capacity": bom_capacity,
        "has_component_shortage": has_component_shortage,
        "low_stock_components": low_stock_components,
    }


def get_bom_capacity_summary(
    parent_item_code, item_warehouse=None, default_warehouse=None, cache=None
):
    """Return production capacity data for the given item BOM."""

    if cache is None:
        cache = {}

    details = _collect_bom_component_data(
        parent_item_code,
        1,
        item_warehouse,
        default_warehouse,
        cache,
    )

    if not details:
        return None

    return {
        "bom_name": details.get("bom_name"),
        "finished_warehouse": details.get("finished_warehouse"),
        "max_producible_qty": details.get("max_producible_qty") or 0,
        "finished_stock": details.get("finished_stock") or 0,
        "bom_capacity": details.get("bom_capacity") or 0,
        "item_warehouse": details.get("item_warehouse"),
        "has_component_shortage": bool(details.get("has_component_shortage")),
        "low_stock_components": list(details.get("low_stock_components") or []),
    }

def _populate_bom_components(invoice_doc, profile_doc):
    """Populate packed items for BOM components on the given invoice."""

    if not invoice_doc:
        return

    invoice_items = getattr(invoice_doc, "items", None) or []
    if not invoice_items:
        return

    default_warehouse = _get_default_warehouse(profile_doc)

    packed_rows = getattr(invoice_doc, "packed_items", None)
    if packed_rows is None:
        packed_rows = []
        setattr(invoice_doc, "packed_items", packed_rows)

    existing = {}
    for row in packed_rows:
        if isinstance(row, dict):
            parent_item = row.get("parent_item")
            item_code = row.get("item_code")
            warehouse = row.get("warehouse")
            qty = flt(row.get("qty") or 0)
        else:
            parent_item = getattr(row, "parent_item", None)
            item_code = getattr(row, "item_code", None)
            warehouse = getattr(row, "warehouse", None)
            qty = flt(getattr(row, "qty", 0))
        key = (parent_item, item_code, warehouse)
        existing[key] = row
        if isinstance(row, dict):
            row["qty"] = qty
        else:
            setattr(row, "qty", qty)

    bom_cache = {}
    for invoice_item in invoice_items:
        parent_item_code, item_qty, item_warehouse = _get_invoice_item_values(
            invoice_item
        )

        details = _collect_bom_component_data(
            parent_item_code, item_qty, item_warehouse, default_warehouse, bom_cache
        )
        if not details:
            continue

        for component in details["components"]:
            component_code = component.get("item_code")
            total_qty = flt(component.get("qty") or 0)
            warehouse = component.get("warehouse")

            if not component_code or not total_qty:
                continue

            key = (parent_item_code, component_code, warehouse)
            if key in existing:
                row = existing[key]
                if isinstance(row, dict):
                    row["qty"] = flt(row.get("qty") or 0) + total_qty
                else:
                    setattr(row, "qty", flt(getattr(row, "qty", 0)) + total_qty)
                continue

            packed_data = {
                "parent_item": parent_item_code,
                "item_code": component_code,
                "qty": total_qty,
                "warehouse": warehouse,
            }

            append = getattr(invoice_doc, "append", None)
            if callable(append):
                new_row = append("packed_items", packed_data)
                if new_row is None:
                    new_row = getattr(invoice_doc, "packed_items", [])[-1]
            else:
                packed_rows.append(packed_data)
                new_row = packed_data

            existing[key] = new_row


def _validate_bom_capacity(invoice_doc, profile_doc):
    """Ensure requested quantities do not exceed BOM production capacity."""

    if not invoice_doc or not profile_doc:
        return

    invoice_items = getattr(invoice_doc, "items", None) or []
    if not invoice_items:
        return

    default_warehouse = _get_default_warehouse(profile_doc)
    bom_cache = {}
    capacity_map = {}

    for invoice_item in invoice_items:
        parent_item_code, item_qty, item_warehouse = _get_invoice_item_values(
            invoice_item
        )

        if not parent_item_code or not item_qty:
            continue

        summary = get_bom_capacity_summary(
            parent_item_code,
            item_warehouse,
            default_warehouse,
            bom_cache,
        )

        if not summary:
            continue

        finished_warehouse = (
            summary.get("finished_warehouse")
            or item_warehouse
            or default_warehouse
        )

        key = (
            summary.get("bom_name"),
            parent_item_code,
            finished_warehouse,
        )

        entry = capacity_map.setdefault(
            key,
            {
                "item_code": parent_item_code,
                "requested_qty": 0,
                "max_producible_qty": flt(summary.get("max_producible_qty") or 0),
                "finished_stock": summary.get("finished_stock") or 0,
            },
        )

        entry["requested_qty"] += flt(item_qty)
        entry["max_producible_qty"] = min(
            entry["max_producible_qty"],
            flt(summary.get("max_producible_qty") or 0),
        )
        entry["finished_stock"] = max(
            flt(entry.get("finished_stock") or 0),
            flt(summary.get("finished_stock") or 0),
        )

    for entry in capacity_map.values():
        requested_qty = flt(entry.get("requested_qty") or 0)
        max_producible_qty = flt(entry.get("max_producible_qty") or 0)
        finished_stock = flt(entry.get("finished_stock") or 0)
        total_capacity = max_producible_qty + finished_stock

        if requested_qty > total_capacity:
            shortage = requested_qty - total_capacity
            frappe.throw(
                _(
                    "Item {0} exceeds available BOM capacity by {1}. "
                    "Reduce the quantity or replenish component stock."
                ).format(entry.get("item_code"), shortage),
                frappe.ValidationError,
            )


def _create_manufacturing_stock_entries(invoice_doc, profile_doc):
    """Create Stock Entry (Manufacture) records for BOM-based items."""

    if not invoice_doc or not profile_doc:
        return

    if not getattr(invoice_doc, "get", None):
        return

    if not invoice_doc.get("update_stock"):
        return

    invoice_items = getattr(invoice_doc, "items", None) or []
    if not invoice_items:
        return

    default_warehouse = _get_default_warehouse(profile_doc)
    company = getattr(invoice_doc, "company", None)
    posting_date = invoice_doc.get("posting_date")
    posting_time = invoice_doc.get("posting_time")
    invoice_name = invoice_doc.get("name")

    bom_cache = {}
    created_entries = []

    for invoice_item in invoice_items:
        parent_item_code, item_qty, item_warehouse = _get_invoice_item_values(
            invoice_item
        )

        details = _collect_bom_component_data(
            parent_item_code, item_qty, item_warehouse, default_warehouse, bom_cache
        )
        if not details or not details["components"]:
            continue

        component_rows = []
        for component in details["components"]:
            component_code = component.get("item_code")
            component_qty = flt(component.get("qty") or 0)
            component_warehouse = component.get("warehouse")

            if not component_code or not component_qty:
                continue

            source_warehouse = component_warehouse or default_warehouse
            if not source_warehouse:
                continue

            component_rows.append(
                {
                    "item_code": component_code,
                    "qty": component_qty,
                    "s_warehouse": source_warehouse,
                }
            )

        if not component_rows:
            continue

        finished_qty = flt(details.get("item_qty") or 0)
        finished_warehouse = details.get("finished_warehouse")
        if parent_item_code and finished_qty:
            finished_row = {
                "item_code": parent_item_code,
                "qty": finished_qty,
                "transfer_qty": finished_qty,
                "is_finished_item": 1,
                "t_warehouse": finished_warehouse,
            }
            component_rows.append(finished_row)

        stock_entry_data = {
            "doctype": "Stock Entry",
            "stock_entry_type": "Manufacture",
            "from_bom": 1,
            "bom_no": details.get("bom_name"),
            "items": component_rows,
        }

        if company:
            stock_entry_data["company"] = company
        if posting_date:
            stock_entry_data["posting_date"] = posting_date
        if posting_time:
            stock_entry_data["posting_time"] = posting_time
        if invoice_name:
            stock_entry_data["sales_invoice"] = invoice_name

        stock_entry_doc = frappe.get_doc(stock_entry_data)
        stock_entry_doc.insert(ignore_permissions=True)

        submit = getattr(stock_entry_doc, "submit", None)
        if callable(submit):
            stock_entry_doc.submit()

        created_entries.append(getattr(stock_entry_doc, "name", None))

    if created_entries:
        existing_refs = list(getattr(invoice_doc, "imogi_manufacture_entries", []) or [])
        existing_refs.extend(name for name in created_entries if name)
        setattr(invoice_doc, "imogi_manufacture_entries", existing_refs)

def build_invoice_items(order_doc, mode):
    """Builds Sales Invoice Item dictionaries from a POS Order.

    Args:
        order_doc (Document): POS Order document
        mode (str): POS mode (Counter/Kiosk/Self-Order/Table)

    Returns:
        list: List of item dictionaries with descriptions and optional notes flag
    """
    invoice_items = []

    # Collect distinct item codes and fetch their names in a single query
    item_codes = list({item.item for item in order_doc.items})
    item_names = {}
    if item_codes:
        if hasattr(frappe, "get_all"):
            fetched = frappe.get_all(
                "Item",
                filters={"name": ["in", item_codes]},
                fields=["name", "item_name"],
            )
        else:
            fetched = [
                {
                    "name": code,
                    "item_name": frappe.db.get_value("Item", code, "item_name"),
                }
                for code in item_codes
            ]
        item_names = {d["name"]: d["item_name"] for d in fetched}

    for item in order_doc.items:
        item_code = item.item
        item_name = getattr(item, "item_name", None) or item_names.get(item_code)

        # Calculate pricing taking into account any customization delta stored on
        # the POS Order Item. This value represents additional charges from
        # selected options (e.g. extra toppings) and is applied on the total
        # amount for the row.
        customization_delta = flt(getattr(item, "pos_customizations_delta", 0))
        amount = flt(getattr(item, "amount", 0)) + customization_delta
        qty = flt(getattr(item, "qty", 0)) or 0
        rate = flt(getattr(item, "rate", 0))
        if qty:
            rate = amount / qty

        invoice_item = {
            "item_code": item_code,
            "item_name": item_name,
            "qty": qty,
            "rate": rate,
            "amount": amount,
            "description": item_name,
        }

        if mode in ["Counter", "Kiosk", "Self-Order"] and getattr(item, "notes", None):
            invoice_item["description"] = f"{item_name}\n{item.notes}"
            invoice_item["has_notes"] = True

        delta, customizations, summary = compute_customizations(item)
        if customizations:
            invoice_item["pos_customizations"] = customizations
            invoice_item["pos_customizations_delta"] = delta
            if summary:
                invoice_item["pos_display_details"] = summary

        invoice_items.append(invoice_item)

    return invoice_items

@frappe.whitelist()
def generate_invoice(
    pos_order: str | None = None, mode_of_payment=None, amount=None
):
    """Creates a Sales Invoice (``is_pos=1``) from a POS Order.

    Args:
        pos_order (str | None, optional): POS Order name. Required.
        mode_of_payment (str, optional): Mode of payment to record against the invoice
        amount (float, optional): Payment amount

    Returns:
        dict: Created Sales Invoice details

    Raises:
        frappe.ValidationError: If POS Order is missing or any selected item is a template
    """
    if not pos_order:
        frappe.throw(_("POS Order is required"), frappe.ValidationError)
    if not mode_of_payment or amount is None:
        frappe.throw(_("Mode of payment and amount are required"), frappe.ValidationError)

    # Get POS Order details
    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)
    
    # Validate POS Session
    pos_session = validate_pos_session(order_doc.pos_profile)
    
    # Validate items for templates
    for item in order_doc.items:
        is_template = frappe.db.get_value("Item", item.item, "has_variants")
        if is_template:
            frappe.throw(
                _(
                    "Cannot create invoice with template item. Please select a variant for: {0}"
                ).format(item.item)
            )
    # Determine POS mode for handling item notes
    profile_doc = frappe.get_doc("POS Profile", order_doc.pos_profile)
    mode = profile_doc.get("imogi_mode", "Counter")
    allow_non_sales = cint(profile_doc.get("imogi_allow_non_sales_items", 0))
    allow_out_of_stock_orders = cint(
        profile_doc.get("imogi_allow_out_of_stock_orders", 0)
    )

    # Ensure all items are marked as sales items unless explicitly allowed
    valid_items = []
    for item in order_doc.items:
        is_sales_item = frappe.db.get_value("Item", item.item, "is_sales_item")
        if not is_sales_item:
            if allow_non_sales:
                continue
            frappe.throw(
                _(
                    "Cannot generate invoice for non-sales item: {0}. Either mark the item as a Sales Item or enable \"Allow Non Sales Items\" in the POS Profile."
                ).format(item.item),
                frappe.ValidationError,
            )
        valid_items.append(item)
    order_doc.items = valid_items

    if not order_doc.items:
        frappe.throw(
            _(
                "No sales items left to invoice after filtering non-sales items"
            ),
            frappe.ValidationError,
        )

    try:
        # Build invoice items and copy notes where applicable
        invoice_items = build_invoice_items(order_doc, mode)
        # Remove helper-only flags before creating invoice document
        for item in invoice_items:
            item.pop("has_notes", None)

        # Create Sales Invoice document
        update_stock = profile_doc.get("update_stock")
        if allow_out_of_stock_orders:
            update_stock = 0

        invoice_data = {
            "doctype": "Sales Invoice",
            "is_pos": 1,
            "pos_profile": order_doc.pos_profile,
            "customer": order_doc.customer,
            "branch": order_doc.branch,
            "items": invoice_items,
            "imogi_pos_order": pos_order,
            "order_type": order_doc.order_type,
            "update_stock": update_stock,
        }
        if pos_session:
            invoice_data["pos_session"] = pos_session

        if getattr(order_doc, "discount_percent", None):
            invoice_data["additional_discount_percentage"] = order_doc.discount_percent
            invoice_data["apply_discount_on"] = "Grand Total"
        if getattr(order_doc, "discount_amount", None):
            invoice_data["discount_amount"] = order_doc.discount_amount
            invoice_data["apply_discount_on"] = "Grand Total"
        if getattr(order_doc, "promo_code", None):
            invoice_data["promo_code"] = order_doc.promo_code

        invoice_doc = frappe.get_doc(invoice_data)

        _populate_bom_components(invoice_doc, profile_doc)
        _validate_bom_capacity(invoice_doc, profile_doc)

        selling_price_list = getattr(order_doc, "selling_price_list", None) or getattr(
            profile_doc, "selling_price_list", None
        )
        if selling_price_list:
            invoice_doc.selling_price_list = selling_price_list

        # Include table info if present
        if getattr(order_doc, "table", None):
            invoice_doc.table = order_doc.table
            invoice_doc.floor = frappe.db.get_value(
                "Restaurant Table", order_doc.table, "floor"
            )

        # Add payment details if provided
        if mode_of_payment and amount is not None:
            invoice_doc.append(
                "payments",
                {"mode_of_payment": mode_of_payment, "amount": amount},
            )
            grand_total = invoice_doc.get("grand_total")
            if grand_total is None:
                grand_total = sum(
                    flt(item.get("amount", 0)) for item in invoice_doc.items
                )
            payments_total = sum(
                flt(p.get("amount", 0))
                for p in getattr(invoice_doc, "payments", [])
            )
            tolerance = flt(profile_doc.get("imogi_payment_tolerance", 0))
            difference = round(grand_total - payments_total, 2)
            if abs(difference) <= tolerance:
                invoice_doc.outstanding_amount = 0
            else:
                invoice_doc.outstanding_amount = difference
                if difference > 0:
                    invoice_doc.payment_message = _(
                        "Outstanding amount {0}"
                    ).format(difference)
                else:
                    invoice_doc.payment_message = _(
                        "Overpayment of {0}"
                    ).format(abs(difference))

        invoice_doc.set_missing_values()
        invoice_doc.calculate_taxes_and_totals()

        if invoice_doc.get("update_stock") and not allow_out_of_stock_orders:
            allow_negative_stock = frappe.db.get_value(
                "Stock Settings", None, "allow_negative_stock"
            )
            for item in invoice_doc.get("items", []):
                warehouse = item.get("warehouse") or profile_doc.get("warehouse")
                if not warehouse:
                    continue
                available_qty = frappe.db.get_value(
                    "Bin",
                    {"item_code": item.get("item_code"), "warehouse": warehouse},
                    "actual_qty",
                ) or 0
                if (
                    not cint(allow_negative_stock)
                    and flt(item.get("qty")) > flt(available_qty)
                ):
                    shortage = flt(item.get("qty")) - flt(available_qty)
                    # Provide guidance to operators when stock is insufficient
                    frappe.throw(
                        _(
                            "Item {0} in warehouse {1} is short by {2}. "
                            "Restock the item or enable negative stock in Stock Settings."
                        ).format(item.get("item_code"), warehouse, shortage),
                        frappe.ValidationError,
                    )

        invoice_doc.insert(ignore_permissions=True)
        _create_manufacturing_stock_entries(invoice_doc, profile_doc)

        try:
            invoice_doc.submit()
        except NegativeStockError:
            if allow_out_of_stock_orders:
                if not getattr(invoice_doc, "flags", None):
                    invoice_doc.flags = type("Flags", (), {})()
                invoice_doc.flags.ignore_negative_stock = True
                invoice_doc.submit()
            else:
                frappe.throw(
                    _(
                        "Insufficient stock to complete invoice. Restock the item or "
                        "enable negative stock in Stock Settings."
                    ),
                    frappe.ValidationError,
                )

        notify_stock_update(invoice_doc, profile_doc)

        # Link invoice back to POS Order
        frappe.db.set_value("POS Order", pos_order, "sales_invoice", invoice_doc.name)

        return invoice_doc.as_dict()

    except frappe.ValidationError:
        raise
    except Exception as e:
        message = f"POS Order {pos_order}: {e}"
        # Truncate to avoid CharacterLengthExceededError in Error Log
        max_length = 1000
        if len(message) > max_length:
            message = message[:max_length]
        frappe.log_error(
            title="Invoice generation failed",
            message=message,
        )
        frappe.throw(_("Failed to generate invoice: {0}").format(str(e)))

@frappe.whitelist()
def list_orders_for_cashier(pos_profile=None, branch=None, workflow_state=None, floor=None):
    """
    Lists POS Orders that are ready for billing in the cashier console.
    
    Args:
        pos_profile (str, optional): POS Profile name
        branch (str, optional): Branch filter
        workflow_state (str, optional): Workflow state filter (Ready/Served)
        floor (str, optional): Floor filter
    
    Returns:
        list: POS Orders with summarized details
    """
    if not branch:
        if pos_profile:
            branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
        else:
            pos_profile = frappe.db.get_value(
                "POS Profile User", {"user": frappe.session.user}, "parent"
            )
            if not pos_profile:
                frappe.throw(
                    _("No POS Profile found for user: {0}").format(
                        frappe.session.user
                    )
                )
            branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
    
    if branch:
        validate_branch_access(branch)

    # Treat explicit 'All' workflow_state as no filter
    if workflow_state == "All":
        workflow_state = None

    # Default filter for cashier (typically want Ready or Served orders)
    if not workflow_state:
        workflow_state = ["Ready", "Served"]
    elif isinstance(workflow_state, str):
        workflow_state = [workflow_state]

    # Build filters
    filters = {"branch": branch, "workflow_state": ["in", workflow_state]}
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
            "queue_number",
            "workflow_state",
            "discount_percent",
            "discount_amount",
            "promo_code",
            "totals",
            "creation",
        ],
        order_by="creation desc",
    )

    # Fetch customer names and items for each order
    for order in orders:
        order["customer_name"] = (
            frappe.db.get_value("Customer", order["customer"], "customer_name")
            if order.get("customer")
            else "Walk-in Customer"
        )
        order_items = frappe.get_all(
            "POS Order Item",
            filters={"parent": order["name"]},
            fields=["item", "qty", "rate", "amount", "notes"],
            order_by="idx",
        )
        # Attach item info from Item doctype and ensure required fields exist
        for item in order_items:
            details = frappe.db.get_value(
                "Item", item["item"], ["item_name", "image"], as_dict=True
            ) or {}

            # Always include item_name, image, and rate in the payload
            item["item_name"] = details.get("item_name") or item.get("item")
            item["image"] = details.get("image")
            item["rate"] = flt(item.get("rate"))

        order["items"] = order_items

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
    if not pos_order:
        frappe.throw(_("POS Order is required"), frappe.ValidationError)

    # Get POS Order details
    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)
    
    # Get POS Profile to determine mode (Table/Counter/Kiosk)
    profile_doc = frappe.get_doc("POS Profile", order_doc.pos_profile)
    mode = profile_doc.get("imogi_mode", "Counter")
    
    # Prepare draft invoice items
    invoice_items = build_invoice_items(order_doc, mode)
    
    # Determine active session if required
    pos_session = validate_pos_session(order_doc.pos_profile)

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
    }
    if pos_session:
        draft_invoice["pos_session"] = pos_session

    if getattr(order_doc, "discount_percent", None):
        draft_invoice["additional_discount_percentage"] = order_doc.discount_percent
        draft_invoice["apply_discount_on"] = "Grand Total"
    if getattr(order_doc, "discount_amount", None):
        draft_invoice["discount_amount"] = order_doc.discount_amount
        draft_invoice["apply_discount_on"] = "Grand Total"
    if getattr(order_doc, "promo_code", None):
        draft_invoice["promo_code"] = order_doc.promo_code

    # Add table information for Dine-in orders
    if order_doc.table:
        draft_invoice["table"] = order_doc.table
        draft_invoice["floor"] = frappe.db.get_value("Restaurant Table", order_doc.table, "floor")

    return draft_invoice

@frappe.whitelist()
def check_pos_session(pos_profile=None):
    """Check whether POS Session feature is available and active."""

    exists = bool(frappe.db.exists("DocType", "POS Session"))
    active_session = None

    if exists:
        try:
            active_session = get_active_pos_session()
        except Exception:
            active_session = None

    return {
        "exists": exists,
        "active": bool(active_session),
        "pos_session": active_session,
    }


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
    if not frappe.db.exists("DocType", "POS Session"):
        return None

    if not context_scope:
        context_scope = "User"

    user = frappe.session.user

    filters = {"status": "Open"}

    if context_scope == "User":
        # Session is tied to current user
        filters["user"] = user
    elif context_scope == "Device":
        # Identify device by request_ip (or any identifier stored on frappe.local)
        device_id = getattr(getattr(frappe, "local", object()), "request_ip", None)
        if not device_id:
            return None
        filters["device_id"] = device_id
    elif context_scope == "POS Profile":
        # Sessions shared per POS Profile
        pos_profile = frappe.db.get_value("POS Profile", {"user": user}, "name")
        if not pos_profile:
            return None
        filters["pos_profile"] = pos_profile
    else:
        return None

    active_session = frappe.db.get_value("POS Session", filters, "name")
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
    if not sales_invoice:
        frappe.throw(_("Missing Sales Invoice"), frappe.ValidationError)

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