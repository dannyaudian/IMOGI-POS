# -*- coding: utf-8 -*-
"""Helpers for pricing configuration exposed over HTTP APIs."""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Set

import frappe
from frappe import _
from frappe.utils import flt, getdate, now_datetime


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


def _normalize_promo_result(result: Optional[Dict[str, object]], code: str) -> Optional[Dict[str, object]]:
    if not result:
        return None

    if isinstance(result, dict):
        payload = dict(result)
    else:
        return None

    if payload.get("valid") is False:
        error_message = payload.get("error") or payload.get("message")
        return {"valid": False, "error": error_message or _( "Promo code is invalid or expired." )}

    percent = flt(payload.get("discount_percent") or payload.get("percent") or 0)
    amount = flt(payload.get("discount_amount") or payload.get("amount") or 0)
    discount_type = payload.get("discount_type") or payload.get("type")
    if discount_type:
        discount_type = str(discount_type).lower()
        if "amount" in discount_type:
            discount_type = "amount"
        elif "percent" in discount_type:
            discount_type = "percent"
        else:
            discount_type = None

    if not discount_type:
        discount_type = "amount" if amount > percent else "percent"

    return {
        "valid": True,
        "code": payload.get("code") or code.upper(),
        "discount_type": discount_type,
        "discount_percent": percent,
        "discount_amount": amount,
        "label": payload.get("label") or payload.get("title") or _( "Promo {0}" ).format(code.upper()),
        "description": payload.get("description") or payload.get("message") or "",
        "message": payload.get("message") or payload.get("status_message"),
    }


@frappe.whitelist(allow_guest=True)
def validate_promo_code(
    promo_code: str,
    pos_profile: Optional[str] = None,
    branch: Optional[str] = None,
    quantity: Optional[float] = None,
    subtotal: Optional[float] = None,
    tax: Optional[float] = None,
    total: Optional[float] = None,
    order_type: Optional[str] = None,
    table: Optional[str] = None,
    customer: Optional[str] = None,
):
    code = (promo_code or "").strip()
    if not code:
        return {"valid": False, "error": _( "Please enter a promo code." )}

    context = {
        "code": code,
        "pos_profile": pos_profile,
        "branch": branch,
        "quantity": quantity,
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
        "order_type": order_type,
        "table": table,
        "customer": customer,
    }

    for handler_path in frappe.get_hooks("imogi_pos_promo_code_validators", []):
        try:
            handler = frappe.get_attr(handler_path)
        except (AttributeError, ImportError):
            frappe.log_error(_( "Failed to import promo code validator: {0}" ).format(handler_path))
            continue

        try:
            response = handler(context)
        except Exception as err:  # pragma: no cover - safety
            frappe.log_error(_( "Promo code validator error: {0}" ).format(err))
            continue

        normalized = _normalize_promo_result(response, code)
        if normalized:
            return normalized

    if not frappe.db.exists("DocType", "Coupon Code"):
        return {"valid": False, "error": _( "Promo code validation is not configured." )}

    coupon_row = frappe.db.get_value(
        "Coupon Code",
        {"coupon_code": code, "docstatus": 1},
        ["name"],
        as_dict=True,
    )

    if not coupon_row:
        return {"valid": False, "error": _( "Promo code is invalid or expired." )}

    try:
        coupon_doc = frappe.get_doc("Coupon Code", coupon_row.name)
    except frappe.DoesNotExistError:
        return {"valid": False, "error": _( "Promo code is invalid or expired." )}

    if getattr(coupon_doc, "disabled", False):
        return {"valid": False, "error": _( "Promo code is disabled." )}

    valid_from = getattr(coupon_doc, "valid_from", None)
    valid_upto = getattr(coupon_doc, "valid_upto", None)
    now = now_datetime().date()
    if valid_from:
        try:
            if getdate(valid_from) > now:
                return {"valid": False, "error": _( "Promo code is not yet active." )}
        except Exception:  # pragma: no cover - defensive
            pass
    if valid_upto:
        try:
            if getdate(valid_upto) < now:
                return {"valid": False, "error": _( "Promo code has expired." )}
        except Exception:  # pragma: no cover - defensive
            pass

    pricing_rule_name = getattr(coupon_doc, "pricing_rule", None)
    if not pricing_rule_name:
        return {"valid": False, "error": _( "Promo code is invalid or expired." )}

    try:
        pricing_rule = frappe.get_doc("Pricing Rule", pricing_rule_name)
    except frappe.DoesNotExistError:
        return {"valid": False, "error": _( "Promo code is invalid or expired." )}

    percent = flt(getattr(pricing_rule, "discount_percentage", None) or getattr(pricing_rule, "discount_percent", None) or 0)
    amount = flt(getattr(pricing_rule, "discount_amount", None) or 0)
    rate_or_discount = str(getattr(pricing_rule, "rate_or_discount", "")).lower()

    if "amount" in rate_or_discount and amount <= 0 and percent > 0:
        amount = 0
    if "percent" in rate_or_discount and percent <= 0 and amount > 0:
        percent = 0

    gross = flt(total) if total is not None else flt(subtotal) + flt(tax)
    amount_discount_value = amount
    percent_discount_value = gross * (percent / 100) if percent > 0 else 0

    if amount_discount_value > percent_discount_value:
        discount_type = "amount"
    elif percent_discount_value > 0:
        discount_type = "percent"
    else:
        discount_type = "amount" if amount > 0 else "percent"

    label = getattr(pricing_rule, "title", None) or getattr(coupon_doc, "coupon_name", None) or _( "Promo {0}" ).format(code.upper())
    description = getattr(pricing_rule, "description", None) or getattr(coupon_doc, "description", None) or ""

    return {
        "valid": True,
        "code": code.upper(),
        "discount_type": discount_type,
        "discount_percent": percent,
        "discount_amount": amount,
        "label": label,
        "description": description,
        "message": getattr(pricing_rule, "message", None),
    }


__all__ = ["get_allowed_price_lists", "validate_promo_code"]

