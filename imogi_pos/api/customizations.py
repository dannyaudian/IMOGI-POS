# -*- coding: utf-8 -*-
"""Helper utilities for validating and processing POS item customisations."""
from __future__ import unicode_literals

import frappe


def _count_selections(selection_type, selections):
    """Return the number of selections made for a group."""
    if not selections:
        return 0

    if selection_type == "single":
        # selections may be a dict or a list with a single item
        if isinstance(selections, (list, tuple)):
            return len(selections)
        return 1

    if selection_type == "multi":
        return len(selections)

    # quantity based selections expect each entry to carry a ``qty`` key.
    total = 0
    if isinstance(selections, dict):
        selections = [selections]
    for opt in selections:
        qty = 0
        if isinstance(opt, dict):
            qty = opt.get("qty") or opt.get("quantity") or 0
        else:
            qty = getattr(opt, "qty", 0) or getattr(opt, "quantity", 0)
        total += int(qty or 0)
    return total


def validate_group_selection(group, selections):
    """Validate selections for a single customisation group.

    Args:
        group (dict): Definition of the group including ``selection_type``,
            ``min_select`` and ``max_select``.
        selections (Any): User provided selections for the group. The type depends
            on ``selection_type``.

    Raises:
        frappe.ValidationError: If the selection count is outside the allowed
            range for the group.
    """
    selection_type = group.get("selection_type", "single")
    count = _count_selections(selection_type, selections)

    min_sel = int(group.get("min_select") or 0)
    max_sel = group.get("max_select")
    max_sel = None if max_sel in (None, "") else int(max_sel)

    if count < min_sel:
        frappe.throw(
            frappe._(
                "At least {0} selections required for {1}"
            ).format(min_sel, group.get("name") or group.get("id") or "group"),
            frappe.ValidationError,
        )
    if max_sel is not None and count > max_sel:
        frappe.throw(
            frappe._(
                "No more than {0} selections allowed for {1}"
            ).format(max_sel, group.get("name") or group.get("id") or "group"),
            frappe.ValidationError,
        )


def validate_item_customisations(doc, method=None):  # pragma: no cover - thin wrapper
    """Frappe doc-event hook for validating customisation groups on a document.

    The document is expected to provide a ``pos_customisations`` attribute which
    is a JSON serialisable list of group definitions, each containing a
    ``selected`` key. This wrapper simply parses the data and calls
    :func:`validate_group_selection` for each group.
    """
    groups = getattr(doc, "pos_customisations", None)
    if not groups:
        return

    if isinstance(groups, str):
        try:
            groups = frappe.parse_json(groups)
        except Exception:
            return

    for group in groups:
        selections = (
            group.get("selected")
            or group.get("selected_options")
            or group.get("options")
        )
        validate_group_selection(group, selections)
