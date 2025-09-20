# -*- coding: utf-8 -*-
"""Helpers for pricing configuration exposed over HTTP APIs."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Set, Union

import frappe
from frappe import _
from frappe.utils import flt, getdate, now_datetime


def get_active_promo_codes() -> Dict[str, Dict[str, Any]]:
    """Return active promo code configurations keyed by their code."""

    try:
        rows = frappe.get_all(
            "POS Promo Code",
            filters={"enabled": 1},
            fields=["name", "code", "discount_type", "discount_value"],
        )
    except Exception:
        return {}

    active: Dict[str, Dict[str, Any]] = {}
    for row in rows or []:
        code = getattr(row, "code", None) or getattr(row, "name", None)
        if not code:
            continue

        normalised = code.strip()
        if not normalised:
            continue

        key = normalised.upper()
        active[key] = {
            "name": getattr(row, "name", None),
            "code": normalised,
            "discount_type": getattr(row, "discount_type", None),
            "discount_value": flt(getattr(row, "discount_value", 0)),
        }

    return active


def _extract_price_list_from_row(
    row: frappe.model.base.Document,
    table_field: Optional[frappe.model.base.Document] = None,
) -> Optional[str]:
    """Return the price list value from an arbitrary child table row."""

    for fieldname in (
        "price_list",
        "selling_price_list",
        "price_list_name",
        "price_list_code",
    ):
        value = getattr(row, fieldname, None)
        if value:
            return value

    link_doctype = getattr(row, "link_doctype", None)
    table_options = getattr(table_field, "options", None) if table_field else None
    link_name = getattr(row, "link_name", None)

    if link_name and (
        link_doctype == "Price List"
        or (not link_doctype and table_options == "Price List")
    ):
        return link_name
    return None


def _extract_label_from_row(
    row: frappe.model.base.Document,
    table_field: Optional[frappe.model.base.Document] = None,
) -> Optional[str]:
    for fieldname in ("label", "display_name", "price_list_label"):
        value = getattr(row, fieldname, None)
        if value:
            return value
    link_title = getattr(row, "link_title", None)
    if link_title:
        return link_title
    return None


@frappe.whitelist(allow_guest=True)
def get_allowed_price_lists(pos_profile: str) -> Dict[str, object]:
    """Return the list of selectable price lists for a POS Profile.

    The function inspects the POS Profile document for the default
    ``selling_price_list`` as well as any child tables referencing the
    ``Price List`` DocType. The payload is intentionally defensive so the
    frontend can work with different customisations (e.g. custom child tables
    or default flags).

    Args:
        pos_profile: POS Profile identifier.

    Returns:
        dict: ``price_lists`` containing display information and
        ``default_price_list`` with the name that should be pre-selected.
    """

    if not pos_profile:
        frappe.throw(_("POS Profile is required"), frappe.ValidationError)

    profile = frappe.get_doc("POS Profile", pos_profile)

    seen: Set[str] = set()
    entries: List[Dict[str, Optional[str]]] = []
    default_name: Optional[str] = getattr(profile, "selling_price_list", None)

    def register(name: Optional[str], *, is_default: bool = False, label: Optional[str] = None) -> None:
        nonlocal default_name
        if not name:
            return
        if name not in seen:
            seen.add(name)
            entries.append({"name": name, "label": label})
        if is_default or not default_name:
            default_name = name

    register(default_name, is_default=bool(default_name))

    # Inspect child tables that might contain additional price lists
    for table_field in profile.meta.get_table_fields():
        child_rows: Iterable[frappe.model.base.Document] = getattr(profile, table_field.fieldname, []) or []
        for row in child_rows:
            name = _extract_price_list_from_row(row, table_field)
            if not name:
                continue

            label = _extract_label_from_row(row, table_field)
            is_default = bool(
                getattr(row, "is_default", None)
                or getattr(row, "default", None)
                or getattr(row, "default_price_list", None)
            )

            register(name, is_default=is_default, label=label)

    if not entries:
        # Fall back to the global default selling price list if nothing has been
        # configured on the POS Profile itself.
        global_default = frappe.defaults.get_global_default("selling_price_list")
        register(global_default, is_default=bool(global_default))

    # Load human readable labels and currency information in bulk
    price_list_names = [entry["name"] for entry in entries if entry.get("name")]
    price_meta: Dict[str, Dict[str, object]] = {}
    adjustment_field_available = frappe.db.has_column("Price List", "imogi_price_adjustment")

    if price_list_names:
        fields = ["name", "price_list_name", "currency", "enabled"]
        if adjustment_field_available:
            fields.append("imogi_price_adjustment")

        rows = frappe.get_all(
            "Price List",
            filters={"name": ["in", price_list_names]},
            fields=fields,
        )
        price_meta = {row.name: row for row in rows}

    payload: List[Dict[str, object]] = []
    for entry in entries:
        name = entry.get("name")
        if not name:
            continue
        meta = price_meta.get(name, {})
        label = entry.get("label") or meta.get("price_list_name") or name
        currency = meta.get("currency")
        payload.append(
            {
                "name": name,
                "label": label,
                "currency": currency,
                "is_default": 1 if name == default_name else 0,
                "enabled": meta.get("enabled"),
                "adjustment": flt(meta.get("imogi_price_adjustment") or 0)
                if adjustment_field_available
                else 0,
            }
        )

    return {
        "price_lists": payload,
        "default_price_list": default_name,
    }

def _normalise_items(
    items: Union[str, Iterable[Union[Dict[str, Any], object]], Dict[str, Any], None]
) -> List[Dict[str, Any]]:
    """Normalise arbitrary item payloads into dictionaries."""

    if items is None:
        return []

    payload: Union[Iterable[Union[Dict[str, Any], object]], Dict[str, Any], Any]
    payload = items

    if isinstance(payload, str):
        try:
            payload = frappe.parse_json(payload)
        except Exception:
            return []

    if isinstance(payload, dict):
        payload = [payload]

    if not isinstance(payload, Iterable):
        return []

    result: List[Dict[str, Any]] = []
    for entry in payload:
        if entry is None:
            continue

        if isinstance(entry, str):
            try:
                entry = frappe.parse_json(entry)
            except Exception:
                continue

        if isinstance(entry, dict):
            result.append(entry)
            continue

        values: Dict[str, Any] = {}
        for field in ("item", "item_code", "qty", "quantity", "rate", "amount"):
            if hasattr(entry, field):
                values[field] = getattr(entry, field)
        if values:
            result.append(values)

    return result


def _coerce_number(value: Any) -> float:
    try:
        return flt(value or 0)
    except Exception:
        return 0.0


def _format_percent_message(quantity: float) -> str:
    count = int(quantity) if float(int(quantity)) == float(quantity) else quantity
    return _("Applied automatic 10% discount for {0} items.").format(count)


def _format_promo_message(code: str, discount_type: str, discount_value: float) -> str:
    if (discount_type or "").lower() == "percent":
        return _("Applied promo code {0} for {1}% off.").format(code, discount_value)
    return _("Applied promo code {0} for a {1} discount.").format(code, discount_value)


@frappe.whitelist(allow_guest=True)
def evaluate_order_discounts(
    items: Union[str, Iterable[Union[Dict[str, Any], object]], Dict[str, Any], None],
    promo_code: Optional[str] = None,
) -> Dict[str, Any]:
    """Evaluate automatic and promo-code based discounts for an order."""

    normalised_items = _normalise_items(items)

    result: Dict[str, Any] = {
        "discount_percent": 0.0,
        "discount_amount": 0.0,
        "applied_promo_code": None,
        "messages": [],
        "errors": [],
    }

    total_qty = 0.0
    for entry in normalised_items:
        qty = entry.get("qty")
        if qty in (None, ""):
            qty = entry.get("quantity")
        total_qty += _coerce_number(qty)

    if total_qty >= 5:
        result["discount_percent"] = 10.0
        result["messages"].append(_format_percent_message(total_qty))

    code = (promo_code or "").strip()
    if not code:
        return result

    active_codes = get_active_promo_codes()
    promo = active_codes.get(code.upper())

    if not promo:
        result.update(
            {
                "discount_percent": 0.0,
                "discount_amount": 0.0,
                "applied_promo_code": None,
                "messages": [],
            }
        )
        result["errors"].append(
            _("Promo code {0} is invalid or inactive.").format(code)
        )
        return result

    discount_value = _coerce_number(promo.get("discount_value"))
    if discount_value <= 0:
        result.update(
            {
                "discount_percent": 0.0,
                "discount_amount": 0.0,
                "applied_promo_code": None,
                "messages": [],
            }
        )
        result["errors"].append(
            _("Promo code {0} has no remaining balance.").format(code)
        )
        return result

    discount_type = (promo.get("discount_type") or "").lower()
    applied_code = promo.get("code") or code

    if discount_type == "percent":
        result["discount_percent"] = discount_value
        result["discount_amount"] = 0.0
    else:
        result["discount_percent"] = 0.0
        result["discount_amount"] = discount_value

    result["applied_promo_code"] = applied_code
    result["messages"] = [
        _format_promo_message(applied_code, promo.get("discount_type"), discount_value)
    ]

    return result


__all__ = ["get_allowed_price_lists"]
