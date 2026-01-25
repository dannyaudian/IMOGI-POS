# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import math
import frappe
from frappe import _
from frappe.utils import now_datetime, cint, add_to_date, get_url, flt, cstr
from frappe.realtime import publish_realtime
from imogi_pos.utils.permissions import validate_branch_access, validate_api_permission
from imogi_pos.utils.decorators import require_permission, require_role

try:
    from erpnext.stock.stock_ledger import NegativeStockError
except Exception:  # pragma: no cover - fallback when erpnext isn't installed
    class NegativeStockError(Exception):
        pass


LOW_STOCK_THRESHOLD = 10

def validate_pos_session(pos_profile, enforce_session=None):
    """
    Validates if an active POS Opening Entry exists as required by the POS Profile.
    
    Args:
        pos_profile (str): POS Profile name
        enforce_session (bool, optional): Override profile setting
    
    Returns:
        str: POS Opening Entry name if active, None otherwise
    
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
    
    # Get active POS Opening Entry
    active_session = get_active_pos_session(scope)
    
    if not active_session and require_session:
        frappe.throw(_("No active POS Opening Entry found. Please open a session before proceeding."),
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
    """Compute customization details for a POS Order item.
    
    For fresh deployments using native variants, this function provides
    backward compatibility for customization processing.
    """
    options = getattr(order_item, "item_options", None) or {}
    if isinstance(options, str):
        options = frappe.parse_json(options)
    if not isinstance(options, dict):
        return 0, {}, ""

    customizations = {}
    total_delta = 0
    summary_parts = []

    # For native variants, customization data structure is simpler
    # Just process the basic options without referencing deprecated tables
    for group, selection in options.items():
        if group == "extra_price" or selection in (None, "", []):
            continue
        
        if isinstance(selection, list):
            entries = selection
        else:
            entries = [selection]

        names = []
        for entry in entries:
            if not entry:
                continue
            if isinstance(entry, dict):
                display = entry.get("name") or entry.get("label") or entry.get("value")
                if display is not None and display != "":
                    names.append(str(display))
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
@require_permission("Sales Invoice", "create")
def generate_invoice(
    pos_order: str | None = None, mode_of_payment=None, amount=None, customer_info=None
):
    """Creates a Sales Invoice (``is_pos=1``) from a POS Order.

    Args:
        pos_order (str | None, optional): POS Order name. Required.
        mode_of_payment (str, optional): Mode of payment to record against the invoice
        amount (float, optional): Payment amount
        customer_info (dict | str, optional): Optional customer metadata overrides

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
    
    # Optionally merge transient customer metadata
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

            def _coalesce(source, keys):
                for key in keys:
                    if key in source:
                        return source.get(key)
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

    if customer_details:
        if hasattr(order_doc, "update") and callable(order_doc.update):
            order_doc.update(customer_details)
        else:
            for fieldname, value in customer_details.items():
                setattr(order_doc, fieldname, value)

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
            "imogi_branch": order_doc.branch,
            "items": invoice_items,
            "imogi_pos_order": pos_order,
            "order_type": order_doc.order_type,
            "update_stock": update_stock,
        }
        if pos_session:
            invoice_data["imogi_pos_session"] = pos_session

        if getattr(order_doc, "discount_percent", None):
            invoice_data["additional_discount_percentage"] = order_doc.discount_percent
            invoice_data["apply_discount_on"] = "Grand Total"
        if getattr(order_doc, "discount_amount", None):
            invoice_data["discount_amount"] = order_doc.discount_amount
            invoice_data["apply_discount_on"] = "Grand Total"
        if getattr(order_doc, "promo_code", None):
            invoice_data["promo_code"] = order_doc.promo_code

        invoice_doc = frappe.get_doc(invoice_data)

        for fieldname in (
            "customer_full_name",
            "customer_gender",
            "customer_phone",
            "customer_age",
            "customer_identification",
        ):
            value = getattr(order_doc, fieldname, None)
            if value not in (None, ""):
                setattr(invoice_doc, fieldname, value)

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
            
            # Log invoice creation for audit trail
            from imogi_pos.utils.audit_log import log_operation
            log_operation(
                doctype="Sales Invoice",
                action="submit",
                doc_name=invoice_doc.name,
                details={
                    "items_count": len(invoice_doc.items),
                    "total_amount": invoice_doc.grand_total,
                    "pos_profile": invoice_doc.pos_profile,
                    "branch": invoice_doc.imogi_branch if hasattr(invoice_doc, 'imogi_branch') else None
                },
                branch=invoice_doc.imogi_branch if hasattr(invoice_doc, 'imogi_branch') else None
            )
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
@require_permission("POS Order", "read")
def list_orders_for_cashier(pos_profile=None, branch=None, workflow_state=None, floor=None, order_type=None):
    """
    Lists POS Orders that are ready for billing in the cashier console.
    
    Args:
        pos_profile (str, optional): POS Profile name
        branch (str, optional): Branch filter
        workflow_state (str, optional): Workflow state filter (Ready/Served)
        floor (str, optional): Floor filter
        order_type (str, optional): Order type filter (Counter/Dine In/Take Away)
    
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
    if order_type:
        filters["order_type"] = order_type

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
        
        # Get table name if order has a table
        if order.get("table"):
            order["table_name"] = frappe.db.get_value("Table", order["table"], "table_name") or order["table"]
        else:
            order["table_name"] = None
            
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
        "imogi_branch": order_doc.branch,
        "items": invoice_items,
        "imogi_pos_order": pos_order,
        "order_type": order_doc.order_type,
    }
    if pos_session:
        draft_invoice["imogi_pos_session"] = pos_session

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
        draft_invoice["imogi_table"] = order_doc.table
        draft_invoice["imogi_floor"] = frappe.db.get_value("Restaurant Table", order_doc.table, "floor")

    return draft_invoice

@frappe.whitelist()
def check_pos_session(pos_profile=None):
    """Check whether POS Opening Entry is active for session management."""

    active_session = None
    try:
        active_session = get_active_pos_session()
    except Exception:
        active_session = None

    return {
        "exists": True,  # POS Opening Entry always exists in ERPNext
        "active": bool(active_session),
        "pos_session": active_session,
    }


@frappe.whitelist()
def get_active_pos_session(context_scope=None, device_id=None):
    """
    Gets the active POS Opening Entry for the current context.
    
    Args:
        context_scope (str, optional): Scope to check (User/POS Profile/Device)
                                      Default is User
        device_id (str, optional): Device ID for Device scope
    
    Returns:
        str: POS Opening Entry name if active, None otherwise
    """
    if not context_scope:
        context_scope = "User"

    user = frappe.session.user

    filters = {
        "docstatus": 1,  # Submitted
        "status": "Open"
    }

    if context_scope == "User":
        # Session is tied to current user
        filters["user"] = user
    elif context_scope == "POS Profile":
        # Sessions shared per POS Profile
        pos_profile = frappe.db.get_value("POS Profile User", {"user": user}, "parent")
        if not pos_profile:
            return None
        filters["pos_profile"] = pos_profile
    elif context_scope == "Device":
        # Get device ID from request header or parameter
        if not device_id:
            device_id = frappe.local.request.headers.get("X-Device-ID") if hasattr(frappe.local, 'request') else None
        
        if device_id:
            # Filter by device_id if available
            filters["device_id"] = device_id
        else:
            # Fallback to User scope for Device if device_id not provided
            frappe.log_error(
                f"No device_id found for device-scope session, falling back to user scope",
                "Device Session Warning"
            )
            filters["user"] = user
    else:
        return None

    active_session = frappe.db.get_value("POS Opening Entry", filters, "name")
    return active_session

@frappe.whitelist()
def get_session_info(pos_session=None):
    """
    Get detailed session information for display in UI.
    
    Args:
        pos_session (str, optional): POS Opening Entry name. If not provided, gets active session.
    
    Returns:
        dict: Session details including start time, sales summary, etc.
    """
    # Get session
    if not pos_session:
        pos_session = get_active_pos_session()
    
    if not pos_session:
        return None
    
    try:
        session_doc = frappe.get_doc("POS Opening Entry", pos_session)
        
        # Calculate session duration
        from frappe.utils import time_diff_in_seconds, now_datetime
        start_time = session_doc.get("posting_date") or session_doc.get("creation")
        duration_seconds = time_diff_in_seconds(now_datetime(), start_time)
        duration_hours = duration_seconds / 3600
        
        # Get sales summary
        sales_summary = frappe.db.sql("""
            SELECT 
                COUNT(DISTINCT name) as total_orders,
                SUM(grand_total) as total_sales,
                SUM(outstanding_amount) as outstanding
            FROM `tabSales Invoice`
            WHERE imogi_pos_session = %s
            AND docstatus = 1
        """, (pos_session,), as_dict=True)
        
        summary = sales_summary[0] if sales_summary else {}
        
        return {
            "name": pos_session,
            "user": session_doc.get("user"),
            "pos_profile": session_doc.get("pos_profile"),
            "start_time": str(start_time),
            "duration_hours": round(duration_hours, 2),
            "status": session_doc.get("status"),
            "opening_amount": flt(session_doc.get("opening_amount", 0)),
            "total_orders": cint(summary.get("total_orders", 0)),
            "total_sales": flt(summary.get("total_sales", 0)),
            "outstanding": flt(summary.get("outstanding", 0))
        }
    except Exception as e:
        frappe.log_error(f"Error getting session info: {str(e)}")
        return None

@frappe.whitelist()
@require_permission("POS Opening Entry", "write")
def close_session_request(pos_session, closing_amount=None):
    """
    Prepare data for closing a POS Session.
    Creates a POS Closing Entry draft.
    
    Args:
        pos_session (str): POS Session name
        closing_amount (float, optional): Closing cash amount
    
    Returns:
        dict: POS Closing Entry draft data
    """
    if not frappe.db.exists("DocType", "POS Closing Entry"):
        frappe.throw(_("POS Closing Entry doctype not available"))
    
    if not frappe.db.exists("POS Opening Entry", pos_session):
        frappe.throw(_("POS Opening Entry {0} not found").format(pos_session))
    
    # Check if session already has closing entry
    existing = frappe.db.exists("POS Closing Entry", {"pos_opening_entry": pos_session})
    if existing:
        frappe.throw(_("Closing Entry already exists for this session: {0}").format(existing))
    
    try:
        # Get session details
        session_doc = frappe.get_doc("POS Opening Entry", pos_session)
        
        # Create new POS Closing Entry
        closing_entry = frappe.new_doc("POS Closing Entry")
        closing_entry.pos_opening_entry = pos_session
        closing_entry.user = session_doc.user
        closing_entry.pos_profile = session_doc.pos_profile
        closing_entry.company = session_doc.company
        closing_entry.period_start_date = session_doc.period_start_date
        closing_entry.period_end_date = frappe.utils.nowdate()
        
        if closing_amount:
            closing_entry.closing_amount = flt(closing_amount)
        
        # Set missing values and calculate
        closing_entry.set_missing_values()
        
        return {
            "name": "new-pos-closing-entry-1",
            "doctype": "POS Closing Entry",
            "pos_session": pos_session,
            "redirect_url": f"/app/pos-closing-entry/new-pos-closing-entry-1?pos_session={pos_session}"
        }
    except Exception as e:
        frappe.log_error(f"Error creating closing entry: {str(e)}")
        frappe.throw(_("Failed to create closing entry: {0}").format(str(e)))

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
        
        # Try to use Xendit Integration for QRIS payment
        xendit_payload = None
        if frappe.db.exists("Module Def", "xendit_integration_imogi"):
            try:
                # Get customer display device_id if configured
                device_id = invoice_doc.get("imogi_customer_display")
                
                # Call new Xendit QRIS integration
                xendit_payload = frappe.call(
                    'xendit_integration_imogi.api.qris.generate_dynamic_qr',
                    amount=invoice_doc.grand_total,
                    invoice=sales_invoice,
                    branch=invoice_doc.branch,
                    device_id=device_id,  # Automatically pushes to customer display
                    description=f"Payment for {sales_invoice}"
                )
                
                # Reformat for compatibility with existing frontend code
                xendit_payload = {
                    "qr_image": xendit_payload.get("qr_image"),
                    "qr_string": xendit_payload.get("qr_string"),
                    "checkout_url": None,  # QRIS doesn't need checkout URL
                    "amount": xendit_payload.get("amount"),
                    "currency": invoice_doc.currency,
                    "expiry": xendit_payload.get("expires_at"),
                    "xendit_id": xendit_payload.get("xendit_id"),
                    "payment_request": payment_request.name
                }
            except Exception as e:
                frappe.log_error(f"Error creating Xendit QRIS payment: {str(e)}")
                raise frappe.ValidationError(_("Failed to generate payment QR code"))
        else:
            raise frappe.ValidationError(_("Xendit Integration module is not installed"))
        
        # If Xendit integration failed or not available, create a fallback
        if not xendit_payload:
            # Fallback to standard Payment Request URL
            xendit_payload = {
                "qr_image": None,
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


@frappe.whitelist()
def list_counter_order_history(pos_profile=None, branch=None, cashier=None, date=None, limit=50):
    """
    Lists completed POS Orders created by Counter mode for history view.
    Only shows orders created in Counter mode by the current cashier or all cashiers in branch.
    
    Args:
        pos_profile (str, optional): POS Profile name
        branch (str, optional): Branch filter
        cashier (str, optional): Filter by specific cashier (defaults to current user)
        date (str, optional): Date filter (defaults to today)
        limit (int, optional): Number of records to return
    
    Returns:
        list: Completed POS Orders with summarized details
    """
    from frappe.utils import today, getdate
    
    try:
        frappe.logger().debug(f"list_counter_order_history called with: pos_profile={pos_profile}, branch={branch}, user={frappe.session.user}")
        
        # Get branch from POS Profile if not provided
        if not branch:
            if pos_profile:
                branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
                frappe.logger().debug(f"Got branch from POS Profile: {branch}")
            else:
                pos_profile = frappe.db.get_value(
                    "POS Profile User", {"user": frappe.session.user}, "parent"
                )
                frappe.logger().debug(f"Got POS Profile from user: {pos_profile}")
                if not pos_profile:
                    error_msg = _("No POS Profile configured for user: {0}. Please contact your system administrator to assign a POS Profile.").format(frappe.session.user)
                    frappe.log_error(
                        f"No POS Profile found for user: {frappe.session.user}",
                        "list_counter_order_history - No POS Profile"
                    )
                    frappe.throw(error_msg, frappe.ValidationError)
                branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
                frappe.logger().debug(f"Got branch from POS Profile: {branch}")
        
        # If still no branch, throw error
        if not branch:
            error_msg = _("No branch configured for POS Profile: {0}. Please contact your system administrator to configure a branch.").format(pos_profile)
            frappe.log_error(
                f"No branch found for POS Profile: {pos_profile}",
                "list_counter_order_history - No Branch"
            )
            frappe.throw(error_msg, frappe.ValidationError)
        
        frappe.logger().debug(f"Validating branch access for: {branch}")
        # Validate branch access - will throw clear error if no access
        validate_branch_access(branch)
        
        # Default to current user if cashier not specified
        if not cashier:
            cashier = frappe.session.user
        
        # Default to today if date not specified
        if not date:
            date = today()
        
        # Validate date
        try:
            date_obj = getdate(date)
        except:
            date_obj = getdate(today())
        
        frappe.logger().debug(f"Querying orders with filters: branch={branch}, date={date_obj}, cashier={cashier}")
        
        # Build filters - pending orders ready for checkout
        filters = {
            "branch": branch,
            "workflow_state": ["in", ["Draft", "Pending", "Ready", "Confirmed"]],  # Pending orders ready for checkout
            "creation": [">=", date_obj],
            "owner": cashier  # This cashier only
        }
        
        # Query POS Orders
        orders = frappe.get_all(
            "POS Order",
            filters=filters,
            fields=[
                "name",
                "customer",
                "order_type",
                "queue_number",
                "workflow_state",
                "totals",
                "creation",
                "modified",
                "owner"
            ],
            order_by="modified desc",
            limit_page_length=limit
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
            
            # Attach item info from Item doctype
            for item in order_items:
                details = frappe.db.get_value(
                    "Item", item["item"], ["item_name", "image"], as_dict=True
                ) or {}
                
                item["item_name"] = details.get("item_name") or item.get("item")
                item["image"] = details.get("image")
                item["rate"] = flt(item.get("rate"))
            
            order["items"] = order_items
        
        frappe.logger().debug(f"Returning {len(orders)} orders from list_counter_order_history")
        return orders
    
    except frappe.PermissionError as e:
        # Log detailed error for admin debugging
        frappe.log_error(
            f"Permission denied in list_counter_order_history\nUser: {frappe.session.user}\nRoles: {', '.join(frappe.get_roles())}\nBranch: {branch if 'branch' in locals() else 'N/A'}\nPOS Profile: {pos_profile if 'pos_profile' in locals() else 'N/A'}\nError: {str(e)}",
            "list_counter_order_history - Permission Denied"
        )
        # Re-throw with clear message for user
        frappe.throw(
            _("Access denied. {0}").format(str(e)),
            frappe.PermissionError
        )
    except frappe.ValidationError as e:
        # Validation errors (missing config) - throw to user
        frappe.throw(str(e), frappe.ValidationError)
    except Exception as e:
        # Log unexpected errors
        frappe.log_error(
            f"Unexpected error in list_counter_order_history\nUser: {frappe.session.user}\nBranch: {branch if 'branch' in locals() else 'N/A'}\nError: {str(e)}",
            "list_counter_order_history - Unexpected Error"
        )
        # Throw user-friendly error
        frappe.throw(
            _("Failed to load orders. Please try again or contact your system administrator. Error: {0}").format(str(e)),
            frappe.ValidationError
        )