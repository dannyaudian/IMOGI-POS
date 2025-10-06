"""Branch-related helper utilities."""

from __future__ import annotations

from typing import Dict, Optional

import frappe


def get_branch_details(branch_name: Optional[str]) -> Optional[Dict[str, str]]:
    """Return display information for a Branch document.

    Args:
        branch_name: Name of the Branch document.

    Returns:
        A dictionary containing the branch ``name`` along with optional
        ``display_name`` and ``address`` keys when available. ``None`` is
        returned when ``branch_name`` is falsy or the document cannot be
        retrieved.
    """

    if not branch_name:
        return None

    try:
        branch_doc = frappe.get_cached_doc("Branch", branch_name)
    except Exception:
        # Fall back to returning the provided branch name only.
        return {"name": branch_name}

    details: Dict[str, str] = {"name": branch_doc.name}

    branch_title = branch_doc.get("branch") or branch_doc.get("branch_name")
    if branch_title:
        details["display_name"] = branch_title

    address_display: Optional[str] = None
    address_name: Optional[str] = None

    # Common custom fields that may link to an Address document.
    address_link_fields = [
        "branch_address",
        "imogi_branch_address",
        "custom_branch_address",
        "address",
    ]
    for field in address_link_fields:
        value = branch_doc.get(field)
        if value:
            address_name = value
            try:
                address_display = frappe.db.get_value(
                    "Address", value, "address_display"
                )
            except Exception:
                address_display = None
            if address_display:
                break

    # Fallback to inline address fields if no Address link is set.
    if not address_display:
        inline_parts = []
        for field in (
            "address_line1",
            "address_line2",
            "city",
            "state",
            "pincode",
            "country",
        ):
            value = branch_doc.get(field)
            if value:
                inline_parts.append(str(value))
        if inline_parts:
            address_display = "\n".join(inline_parts)

    if address_name:
        details["address_name"] = address_name

    if address_display:
        details["address"] = address_display

    return details
