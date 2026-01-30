# -*- coding: utf-8 -*-
"""
IMOGI POS - POS Opening resolver
Single source of truth for active POS Opening Entry resolution.
"""

from typing import Any, Dict, Optional

import frappe


def resolve_active_pos_opening(
    pos_profile: Optional[str],
    scope: Optional[str] = None,
    user: Optional[str] = None,
    device_id: Optional[str] = None,
    raise_on_device_missing: bool = False,
) -> Dict[str, Any]:
    """
    Resolve active POS Opening Entry using consistent scope filters.

    Rules:
    - Always filter by pos_profile (required for consistent behavior).
    - scope=User -> filter by user
    - scope=POS Profile -> no user filter
    - scope=Device -> filter by device_id (required; may raise or return error)
    """
    if not user:
        user = frappe.session.user

    if not pos_profile:
        return {
            "pos_opening_entry": None,
            "pos_profile_name": None,
            "opening_balance": 0,
            "timestamp": None,
            "company": None,
            "scope": scope,
            "user": user,
            "device_id": device_id,
            "error_code": "missing_pos_profile",
            "error_message": "POS Profile is required to resolve POS Opening Entry.",
        }

    if hasattr(frappe, "db") and hasattr(frappe.db, "exists"):
        try:
            if not frappe.db.exists("DocType", "POS Opening Entry"):
                return {
                    "pos_opening_entry": None,
                    "pos_profile_name": pos_profile,
                    "opening_balance": 0,
                    "timestamp": None,
                    "company": frappe.db.get_value("POS Profile", pos_profile, "company"),
                    "scope": scope,
                    "user": user,
                    "device_id": device_id,
                    "error_code": "doctype_missing",
                    "error_message": "POS Opening Entry DocType not available.",
                }
        except Exception:
            return {
                "pos_opening_entry": None,
                "pos_profile_name": pos_profile,
                "opening_balance": 0,
                "timestamp": None,
                "company": frappe.db.get_value("POS Profile", pos_profile, "company"),
                "scope": scope,
                "user": user,
                "device_id": device_id,
                "error_code": "doctype_check_failed",
                "error_message": "Failed to check POS Opening Entry DocType.",
            }

    if not scope:
        scope = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_session_scope") or "User"

    if scope == "Device" and not device_id:
        device_id = (
            frappe.local.request.headers.get("X-Device-ID")
            if hasattr(frappe.local, "request")
            else None
        )

    filters = {
        "docstatus": 1,  # Submitted
        "status": "Open",
        "pos_profile": pos_profile,
    }

    error_code = None
    error_message = None

    if scope == "User":
        filters["user"] = user
    elif scope == "Device":
        if device_id:
            filters["device_id"] = device_id
        else:
            error_code = "device_id_required"
            error_message = "Device ID required for device-scoped POS Opening Entry."
            frappe.logger("imogi_pos").warning(
                "[pos_opening] device_id_missing scope=%s pos_profile=%s user=%s",
                scope,
                pos_profile,
                user,
            )
            if raise_on_device_missing:
                frappe.throw(
                    error_message,
                    frappe.ValidationError,
                )
    elif scope == "POS Profile":
        pass
    else:
        error_code = "invalid_scope"
        error_message = f"Unsupported POS session scope: {scope}"

    if error_code:
        return {
            "pos_opening_entry": None,
            "pos_profile_name": pos_profile,
            "opening_balance": 0,
            "timestamp": None,
            "company": frappe.db.get_value("POS Profile", pos_profile, "company"),
            "scope": scope,
            "user": user,
            "device_id": device_id,
            "error_code": error_code,
            "error_message": error_message,
        }

    entry = frappe.db.get_list(
        "POS Opening Entry",
        filters=filters,
        fields=["name", "pos_profile", "user", "opening_balance", "creation", "company"],
        order_by="creation desc",
        limit_page_length=1,
    )

    found = bool(entry)
    opening_name = entry[0]["name"] if entry else None

    frappe.logger("imogi_pos").info(
        "[pos_opening] resolved scope=%s pos_profile=%s user=%s device=%s found=%s opening=%s",
        scope,
        pos_profile,
        user,
        device_id,
        found,
        opening_name,
    )

    if entry:
        return {
            "pos_opening_entry": entry[0].get("name"),
            "pos_profile_name": entry[0].get("pos_profile"),
            "opening_balance": entry[0].get("opening_balance", 0),
            "timestamp": entry[0].get("creation"),
            "company": entry[0].get("company"),
            "scope": scope,
            "user": user,
            "device_id": device_id,
            "error_code": error_code,
            "error_message": error_message,
        }

    return {
        "pos_opening_entry": None,
        "pos_profile_name": pos_profile,
        "opening_balance": 0,
        "timestamp": None,
        "company": frappe.db.get_value("POS Profile", pos_profile, "company"),
        "scope": scope,
        "user": user,
        "device_id": device_id,
        "error_code": error_code,
        "error_message": error_message,
    }
