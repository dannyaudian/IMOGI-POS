# -*- coding: utf-8 -*-
"""Utilities for applying POS customisation modifiers on Sales Invoices."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any, Dict, Iterable, Tuple

import frappe
from frappe.utils import flt

from imogi_pos.api.items import get_item_options


def apply_invoice_modifiers(doc, method: str | None = None) -> None:
    """Apply customisation modifiers to a Sales Invoice's packed items."""

    items = getattr(doc, "items", None) or []
    if not items:
        return

    packed = getattr(doc, "packed_items", None)
    if packed is None:
        packed = []
        setattr(doc, "packed_items", packed)

    options_cache: Dict[str, Dict[str, Any]] = {}

    for item in items:
        item_code = _get_attr(item, ("item_code", "item"))
        base_qty = flt(getattr(item, "qty", 0) or 0)
        if not item_code or base_qty <= 0:
            continue

        customisations = _parse_customisations(getattr(item, "pos_customizations", None))
        if not customisations:
            continue

        if item_code not in options_cache:
            try:
                options_cache[item_code] = get_item_options(item_code) or {}
            except Exception:
                options_cache[item_code] = {}

        qty_factor, component_deltas = _collect_modifiers(
            options_cache.get(item_code, {}), customisations
        )

        if not component_deltas and abs(qty_factor - 1.0) < 1e-9:
            continue

        _apply_to_packed_items(doc, item_code, base_qty, qty_factor, component_deltas)


def _parse_customisations(raw: Any) -> Dict[str, Any]:
    if not raw:
        return {}

    data = raw
    if isinstance(raw, str):
        try:
            if hasattr(frappe, "parse_json"):
                data = frappe.parse_json(raw)
            else:
                data = json.loads(raw)
        except Exception:
            return {}

    if isinstance(data, dict):
        return data

    return {}


def _collect_modifiers(
    option_groups: Dict[str, Any], customisations: Dict[str, Any]
) -> Tuple[float, Dict[str, float]]:
    qty_factor = 1.0
    component_deltas: Dict[str, float] = {}

    if not option_groups:
        return qty_factor, component_deltas

    index: Dict[str, Dict[str, Any]] = {}
    for group_name, entries in option_groups.items():
        option_index = _index_options(entries)
        if option_index:
            index[group_name] = option_index
            index[group_name.lower()] = option_index

    for group_name, selections in customisations.items():
        if selections in (None, "", []):
            continue

        option_index = index.get(group_name) or index.get(str(group_name).lower())
        if not option_index:
            continue

        for selection in _flatten(selections):
            key = _normalise_selection(selection)
            if not key:
                continue

            option = option_index.get(key.lower())
            if not option:
                continue

            for modifier in _iter_modifiers(option):
                qty_factor = _apply_qty_factor(qty_factor, modifier)
                _merge_component_deltas(component_deltas, modifier)

    return qty_factor, component_deltas


def _apply_qty_factor(current: float, modifier: Dict[str, Any]) -> float:
    for key in ("qty_factor", "factor"):
        if key in modifier:
            try:
                factor = flt(modifier[key])
            except Exception:
                continue
            return current * factor
    return current


def _merge_component_deltas(target: Dict[str, float], modifier: Dict[str, Any]) -> None:
    if not modifier:
        return

    component_values = None
    for key in ("component_deltas", "component_delta", "components"):
        if key in modifier and modifier[key]:
            component_values = modifier[key]
            break

    if not component_values:
        return

    if isinstance(component_values, dict):
        iterable: Iterable[Tuple[str, Any]] = component_values.items()
    else:
        iterable = []
        for entry in component_values:
            if isinstance(entry, dict):
                code = entry.get("item_code") or entry.get("component") or entry.get("code")
                qty = entry.get("qty") or entry.get("quantity") or entry.get("qty_delta")
                if code is not None and qty is not None:
                    iterable.append((code, qty))
            elif isinstance(entry, (list, tuple)) and len(entry) >= 2:
                iterable.append((entry[0], entry[1]))

    for code, qty in iterable:
        if not code:
            continue
        try:
            qty_value = flt(qty)
        except Exception:
            continue
        if not qty_value:
            continue
        key = str(code)
        target[key] = target.get(key, 0.0) + qty_value


def _apply_to_packed_items(
    doc, parent_item: str, base_qty: float, qty_factor: float, component_deltas: Dict[str, float]
) -> None:
    packed_items = getattr(doc, "packed_items", None)
    if packed_items is None:
        packed_items = []
        setattr(doc, "packed_items", packed_items)

    parent_rows = [
        row
        for row in packed_items
        if (_get_attr(row, ("parent_item", "parent_detail_docname")) or "") == parent_item
    ]

    handled_components: set[str] = set()

    if parent_rows:
        for row in parent_rows:
            original_qty = flt(getattr(row, "qty", 0) or 0)
            new_qty = original_qty * qty_factor
            component_code = _get_attr(row, ("item_code", "component"))
            if component_code and component_code in component_deltas:
                new_qty += base_qty * component_deltas[component_code]
                handled_components.add(component_code)
            setattr(row, "qty", new_qty)

    for component_code, per_unit_delta in component_deltas.items():
        if component_code in handled_components:
            continue
        actual_delta = base_qty * per_unit_delta
        if not actual_delta:
            continue
        _append_packed_item(
            doc,
            {
                "parent_item": parent_item,
                "item_code": component_code,
                "qty": actual_delta,
            },
        )


def _append_packed_item(doc, data: Dict[str, Any]):
    if hasattr(doc, "append"):
        try:
            return doc.append("packed_items", data)
        except Exception:
            pass

    packed_items = getattr(doc, "packed_items", None)
    if packed_items is None:
        packed_items = []
        setattr(doc, "packed_items", packed_items)

    row = SimpleNamespace(**data)
    packed_items.append(row)
    return row


def _index_options(entries: Any) -> Dict[str, Any]:
    index: Dict[str, Any] = {}
    for entry in entries or []:
        for key_name in ("value", "label", "name", "option_name"):
            value = _get_attr(entry, (key_name,))
            if value:
                index[str(value).lower()] = entry
    return index


def _iter_modifiers(option: Any) -> Iterable[Dict[str, Any]]:
    raw = _get_attr(option, ("modifiers", "modifier"))
    if raw:
        if isinstance(raw, dict):
            yield raw
        else:
            for mod in raw:
                if isinstance(mod, dict):
                    yield mod

    derived: Dict[str, Any] = {}
    qty_factor = _get_attr(option, ("qty_factor", "factor"))
    if qty_factor not in (None, "", 1, 1.0):
        derived["qty_factor"] = qty_factor

    for key in ("component_deltas", "component_delta", "components"):
        value = _get_attr(option, (key,))
        if value:
            derived.setdefault("component_deltas", value)
            break

    if derived:
        yield derived


def _flatten(value: Any) -> Iterable[Any]:
    if isinstance(value, (list, tuple, set)):
        for entry in value:
            yield from _flatten(entry)
    else:
        yield value


def _normalise_selection(selection: Any) -> str | None:
    if isinstance(selection, dict):
        for key in ("value", "name", "label", "option"):
            value = selection.get(key)
            if value not in (None, ""):
                return str(value)
        return None
    if selection in (None, ""):
        return None
    return str(selection)


def _get_attr(source: Any, names: Tuple[str, ...]) -> Any:
    for name in names:
        if isinstance(source, dict):
            if name in source:
                return source[name]
        else:
            if hasattr(source, name):
                return getattr(source, name)
    return None
