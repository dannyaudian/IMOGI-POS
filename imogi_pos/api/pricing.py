# -*- coding: utf-8 -*-
"""Helpers for pricing configuration exposed over HTTP APIs."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Set, Union

import frappe
from frappe import _
from frappe.utils import flt, getdate, now_datetime


def _extract_doc_value(doc: Any, fieldname: str) -> Any:
    """Safely fetch an attribute from a document or mapping."""

    if doc is None or not fieldname:
        return None

    if isinstance(doc, dict):
        return doc.get(fieldname)

    return getattr(doc, fieldname, None)


def publish_item_price_update(doc: Any, event: str | None = None) -> None:
    """Broadcast item price updates to realtime subscribers.

    Args:
        doc: The Item Price document (``Document`` or mapping) provided by Frappe
            doc events.
        event: Optional event name provided by Frappe doc event hooks (unused).
    """

    item_code = _normalise_text(_extract_doc_value(doc, "item_code"))
    price_list = _normalise_text(_extract_doc_value(doc, "price_list"))

    if not item_code or not price_list:
        return

    try:
        is_enabled = frappe.db.get_value("Price List", price_list, "enabled")
    except Exception:
        is_enabled = None

    if not is_enabled:
        return

    price_list_rate = _extract_doc_value(doc, "price_list_rate")
    if price_list_rate is None:
        price_list_rate = _extract_doc_value(doc, "rate")

    payload: Dict[str, Any] = {
        "item_price": _extract_doc_value(doc, "name"),
        "item_code": item_code,
        "price_list": price_list,
        "currency": _extract_doc_value(doc, "currency"),
        "price_list_rate": flt(price_list_rate) if price_list_rate is not None else None,
        "uom": _extract_doc_value(doc, "uom"),
        "valid_from": _extract_doc_value(doc, "valid_from"),
        "valid_upto": _extract_doc_value(doc, "valid_upto"),
        "selling": _extract_doc_value(doc, "selling"),
        "buying": _extract_doc_value(doc, "buying"),
    }

    flags = getattr(doc, "flags", None)
    is_deleted = bool(getattr(flags, "in_trash", False) or getattr(flags, "in_delete", False))
    if getattr(doc, "docstatus", None) == 2:
        is_deleted = True

    if is_deleted:
        payload["is_deleted"] = True

    try:
        frappe.publish_realtime("item_price_update", payload)
    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            _("Failed to publish item price update for {0} on {1}").format(
                item_code,
                price_list,
            ),
        )

def _normalise_text(value: Any) -> Optional[str]:
    """Return a stripped string representation or ``None`` for empty values."""

    if value is None:
        return None

    if isinstance(value, str):
        normalised = value.strip()
    else:
        normalised = str(value).strip()

    return normalised or None


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


def get_price_list_rate_maps(
    item_names: Iterable[str],
    *,
    price_list: Optional[str] = None,
    base_price_list: Optional[str] = None,
) -> Dict[str, Dict[str, object]]:
    """Return price list rate lookups with optional baseline fallback.

    Args:
        item_names: Iterable of item identifiers to resolve.
        price_list: Preferred price list for explicit channel pricing.
        base_price_list: Baseline price list used when the preferred list lacks
            an explicit rate. Falls back to ``price_list`` when omitted.

    Returns:
        dict: Mapping keys ``price_list_rates``, ``price_list_currencies``,
        ``base_price_list_rates`` and ``base_price_list_currencies`` each
        containing ``item_code -> value`` dictionaries.
    """

    names = [name for name in (item_names or []) if name]

    payload = {
        "price_list_rates": {},
        "price_list_currencies": {},
        "base_price_list_rates": {},
        "base_price_list_currencies": {},
    }

    if not names:
        return payload

    def fetch_rates(list_name: Optional[str]) -> Dict[str, Dict[str, object]]:
        if not list_name:
            return {"rates": {}, "currencies": {}}

        try:
            rows = frappe.get_all(
                "Item Price",
                filters={"price_list": list_name, "item_code": ["in", names]},
                fields=["item_code", "price_list_rate", "currency"],
            )
        except Exception:
            rows = []

        rates: Dict[str, object] = {}
        currencies: Dict[str, object] = {}

        for row in rows or []:
            item_code = getattr(row, "item_code", None)
            if not item_code:
                continue
            if item_code not in names:
                continue
            rates[item_code] = getattr(row, "price_list_rate", None)
            currencies[item_code] = getattr(row, "currency", None)

        return {"rates": rates, "currencies": currencies}

    primary = fetch_rates(price_list)
    payload["price_list_rates"] = primary["rates"]
    payload["price_list_currencies"] = primary["currencies"]

    base_price_list_name = base_price_list or price_list
    if base_price_list_name:
        if base_price_list_name == price_list:
            payload["base_price_list_rates"] = dict(primary["rates"])
            payload["base_price_list_currencies"] = dict(primary["currencies"])
        else:
            baseline = fetch_rates(base_price_list_name)
            payload["base_price_list_rates"] = baseline["rates"]
            payload["base_price_list_currencies"] = baseline["currencies"]

    return payload

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


__all__ = [
    "get_allowed_price_lists",
    "get_item_price",
]


@frappe.whitelist(allow_guest=True)
def get_item_price(
    item_code: Optional[str],
    price_list: Optional[str] = None,
    base_price_list: Optional[str] = None,
    pos_profile: Optional[str] = None,
) -> Dict[str, Any]:
    """Resolve the rate for an item considering the active price list context."""

    if not item_code:
        frappe.throw(_("Item code is required"), frappe.ValidationError)

    resolved_price_list = price_list
    resolved_base_price_list = base_price_list

    if pos_profile and not resolved_price_list:
        try:
            profile = frappe.get_cached_doc("POS Profile", pos_profile)
        except Exception:
            profile = None
        if profile:
            resolved_price_list = resolved_price_list or getattr(profile, "selling_price_list", None)
            resolved_base_price_list = (
                resolved_base_price_list
                or getattr(profile, "imogi_base_price_list", None)
                or getattr(profile, "base_price_list", None)
            )

    rate_maps = get_price_list_rate_maps(
        [item_code],
        price_list=resolved_price_list,
        base_price_list=resolved_base_price_list,
    )

    base_rate = rate_maps["price_list_rates"].get(item_code)
    if base_rate in (None, ""):
        base_rate = rate_maps["base_price_list_rates"].get(item_code)
    if base_rate in (None, ""):
        base_rate = frappe.db.get_value("Item", item_code, "standard_rate")

    try:
        item_name = frappe.db.get_value("Item", item_code, "item_name")
    except Exception:
        item_name = None

    return {
        "item_code": item_code,
        "item_name": item_name or item_code,
        "rate": flt(base_rate or 0),
        "price_list": resolved_price_list,
        "base_price_list": resolved_base_price_list,
    }
