# -*- coding: utf-8 -*-
"""Helpers for pricing configuration exposed over HTTP APIs."""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Set

import frappe
from frappe import _
from frappe.utils import flt


def _extract_price_list_from_row(row: frappe.model.base.Document) -> Optional[str]:
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
    return None


def _extract_label_from_row(row: frappe.model.base.Document) -> Optional[str]:
    for fieldname in ("label", "display_name", "price_list_label"):
        value = getattr(row, fieldname, None)
        if value:
            return value
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
            name = _extract_price_list_from_row(row)
            if not name:
                continue

            label = _extract_label_from_row(row)
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


__all__ = ["get_allowed_price_lists"]

