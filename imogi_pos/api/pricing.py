# -*- coding: utf-8 -*-
"""Helpers for pricing configuration exposed over HTTP APIs."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Set, Union

import frappe
from frappe import _
from frappe.utils import flt, getdate, now_datetime


def _normalise_text(value: Any) -> Optional[str]:
    """Return a stripped string representation or ``None`` for empty values."""

    if value is None:
        return None

    if isinstance(value, str):
        normalised = value.strip()
    else:
        normalised = str(value).strip()

    return normalised or None


def _get_promo_scope_values(
    doctype: str, fieldname: str, promo_name: Optional[str]
) -> List[str]:
    """Fetch trimmed values from a promo child table."""

    if not promo_name:
        return []

    try:
        rows = frappe.get_all(
            doctype,
            filters={"parent": promo_name, "parenttype": "POS Promo Code"},
            pluck=fieldname,
        )
    except Exception:
        return []

    values: List[str] = []
    for row in rows or []:
        candidate = row.get(fieldname) if isinstance(row, dict) else row
        normalised = _normalise_text(candidate)
        if normalised:
            values.append(normalised)

    return values


def _fetch_item_menu_category(
    item_code: Optional[str], cache: Dict[str, Optional[str]]
) -> Optional[str]:
    """Return the menu category for an item, caching lookups."""

    code = _normalise_text(item_code)
    cache_key = (code or "").upper()
    if not cache_key:
        return None

    if cache_key in cache:
        return cache[cache_key]

    category = None
    if code:
        try:
            category = frappe.db.get_value("Item", code, "menu_category")
        except Exception:
            category = None

    normalised = _normalise_text(category)
    cache[cache_key] = normalised
    return normalised


def _extract_menu_category(
    entry: Dict[str, Any],
    item_code: Optional[str],
    cache: Dict[str, Optional[str]],
) -> Optional[str]:
    """Determine the menu category for a cart entry."""

    for key in ("menu_category", "category", "item_group"):
        category = _normalise_text(entry.get(key))
        if category:
            return category

    return _fetch_item_menu_category(item_code, cache)


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
        promo_name = getattr(row, "name", None)
        active[key] = {
            "name": promo_name,
            "code": normalised,
            "discount_type": getattr(row, "discount_type", None),
            "discount_value": flt(getattr(row, "discount_value", 0)),
            "applicable_categories": _get_promo_scope_values(
                "POS Promo Category", "menu_category", promo_name
            ),
            "applicable_items": _get_promo_scope_values(
                "POS Promo Item", "item", promo_name
            ),
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
    item_codes_in_cart: Set[str] = set()
    categories_in_cart: Set[str] = set()
    category_cache: Dict[str, Optional[str]] = {}

    for entry in normalised_items:
        qty = entry.get("qty")
        if qty in (None, ""):
            qty = entry.get("quantity")
        total_qty += _coerce_number(qty)

        item_code = _normalise_text(entry.get("item_code") or entry.get("item"))
        if item_code:
            item_codes_in_cart.add(item_code.upper())

        category = _extract_menu_category(entry, item_code, category_cache)
        if category:
            categories_in_cart.add(category.casefold())

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

    applied_code = promo.get("code") or code

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

    configured_item_values = promo.get("applicable_items") or promo.get("items") or []
    configured_items: List[str] = []
    allowed_item_codes: Set[str] = set()
    for value in configured_item_values or []:
        normalised_item = _normalise_text(value)
        if not normalised_item:
            continue
        key = normalised_item.upper()
        if key in allowed_item_codes:
            continue
        allowed_item_codes.add(key)
        configured_items.append(normalised_item)

    configured_category_values = (
        promo.get("applicable_categories") or promo.get("categories") or []
    )
    configured_categories: List[str] = []
    allowed_category_tokens: Set[str] = set()
    for value in configured_category_values or []:
        normalised_category = _normalise_text(value)
        if not normalised_category:
            continue
        key = normalised_category.casefold()
        if key in allowed_category_tokens:
            continue
        allowed_category_tokens.add(key)
        configured_categories.append(normalised_category)

    if allowed_item_codes and not item_codes_in_cart.intersection(allowed_item_codes):
        result.update(
            {
                "discount_percent": 0.0,
                "discount_amount": 0.0,
                "applied_promo_code": None,
                "messages": [],
            }
        )
        items_list = ", ".join(configured_items)
        result["errors"].append(
            _("Promo code {0} only applies to the following items: {1}.").format(
                applied_code, items_list
            )
        )
        return result

    if allowed_category_tokens and not categories_in_cart.intersection(
        allowed_category_tokens
    ):
        result.update(
            {
                "discount_percent": 0.0,
                "discount_amount": 0.0,
                "applied_promo_code": None,
                "messages": [],
            }
        )
        categories_list = ", ".join(configured_categories)
        result["errors"].append(
            _("Promo code {0} only applies to menu categories: {1}.").format(
                applied_code, categories_list
            )
        )
        return result

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


@frappe.whitelist()
def validate_promo_code(**payload: Any) -> Dict[str, Any]:
    """Validate a promo code request originating from the POS interfaces.

    The UI submits a summarised payload (order totals, profile, table, etc.).
    We leverage :func:`evaluate_order_discounts` for validation to keep the
    business rules centralised and then reshape the outcome so the frontend can
    consume it via ``normalizePromoResult``.
    """

    raw_code = (payload.get("promo_code") or payload.get("code") or "").strip()
    if not raw_code:
        return {"error": _("Promo code is required."), "valid": False}

    items = payload.get("items")
    evaluation = evaluate_order_discounts(items, promo_code=raw_code)

    errors = evaluation.get("errors") or []
    if errors:
        message = errors[0]
        return {
            "code": raw_code.upper(),
            "error": message,
            "message": message,
            "valid": False,
        }

    applied_code = (evaluation.get("applied_promo_code") or raw_code).strip()
    if not applied_code:
        return {
            "code": raw_code.upper(),
            "error": _("Promo code is invalid or inactive."),
            "valid": False,
        }

    discount_percent = flt(evaluation.get("discount_percent") or 0)
    discount_amount = flt(evaluation.get("discount_amount") or 0)

    promo = None
    active_codes = get_active_promo_codes()
    if active_codes:
        promo = active_codes.get(applied_code.upper()) or active_codes.get(raw_code.upper())

    discount_type = None
    if promo:
        discount_type = promo.get("discount_type")
        discount_value = flt(promo.get("discount_value") or 0)
        normalised_type = (discount_type or "").lower()
        if normalised_type == "percent" and discount_percent <= 0:
            discount_percent = discount_value
        elif normalised_type != "percent" and discount_amount <= 0:
            discount_amount = discount_value

    if not discount_type:
        if discount_percent > 0 and discount_amount <= 0:
            discount_type = "Percent"
        elif discount_amount > 0 and discount_percent <= 0:
            discount_type = "Amount"
        elif discount_percent > 0:
            discount_type = "Percent"
        elif discount_amount > 0:
            discount_type = "Amount"

    messages = [str(entry) for entry in evaluation.get("messages") or [] if entry]
    description = " ".join(messages) if messages else None
    if not description and discount_type:
        if (discount_type or "").lower() == "percent" and discount_percent > 0:
            description = _("Applied promo code {0} for {1}% off.").format(
                applied_code, discount_percent
            )
        elif discount_amount > 0:
            description = _("Applied promo code {0} for a {1} discount.").format(
                applied_code, discount_amount
            )

    label = None
    if promo:
        label = promo.get("label")
    if not label:
        if (discount_type or "").lower() == "percent" and discount_percent > 0:
            label = _("Promo {0} ({1}% off)").format(applied_code, discount_percent)
        else:
            label = _("Promo {0}").format(applied_code)

    return {
        "code": applied_code.upper(),
        "promo_code": applied_code.upper(),
        "discount_type": discount_type,
        "discount_percent": discount_percent,
        "discount_amount": discount_amount,
        "label": label,
        "description": description,
        "message": messages[0] if messages else None,
        "valid": True,
    }


__all__ = ["get_allowed_price_lists", "evaluate_order_discounts", "validate_promo_code"]
