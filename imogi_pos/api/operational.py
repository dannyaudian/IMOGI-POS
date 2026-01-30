# -*- coding: utf-8 -*-
"""
Operational context API endpoints for IMOGI POS.
"""

import frappe
from frappe import _
from typing import Optional

from imogi_pos.utils.operational_context import set_active_operational_context
from imogi_pos.utils.pos_profile_resolver import validate_pos_profile_access


def _get_default_pos_profile(user: str) -> Optional[str]:
    return frappe.db.get_value(
        "POS Profile User",
        {"user": user, "default": 1},
        "parent",
        order_by="idx asc",
    )


def _get_device_id() -> Optional[str]:
    if hasattr(frappe, "get_request_header"):
        return frappe.get_request_header("X-Device-ID")
    if hasattr(frappe.local, "request") and frappe.local.request:
        return frappe.local.request.headers.get("X-Device-ID")
    return None


@frappe.whitelist(methods=["POST"])
def ensure_context(pos_profile=None, branch=None, route=None, module=None):
    """
    Resolve and persist operational context for the current user.

    Resolution priority:
        1) pos_profile argument
        2) default POS Profile User (default=1)
    """
    user = frappe.session.user
    if not user or user == "Guest":
        frappe.throw(_("Please login to continue."), frappe.AuthenticationError)

    resolved_from = {}

    if pos_profile:
        resolved_from["pos_profile"] = "arg"
    else:
        pos_profile = _get_default_pos_profile(user)
        resolved_from["pos_profile"] = "default"

    if not pos_profile:
        frappe.throw(
            _("Context Required: POS Profile is required."),
            frappe.ValidationError,
            title=_("Context Required"),
        )

    if not validate_pos_profile_access(pos_profile, user):
        frappe.throw(
            _("You do not have access to POS Profile: {0}").format(pos_profile),
            frappe.PermissionError,
        )

    profile = frappe.db.get_value(
        "POS Profile",
        pos_profile,
        ["imogi_branch", "company", "imogi_pos_session_scope"],
        as_dict=True,
    )

    if not profile:
        frappe.throw(
            _("POS Profile not found: {0}").format(pos_profile),
            frappe.ValidationError,
        )

    if branch:
        resolved_from["branch"] = "arg"
    else:
        branch = profile.get("imogi_branch")
        resolved_from["branch"] = "profile"

    if not branch:
        frappe.throw(
            _("Context Required: Branch is required."),
            frappe.ValidationError,
            title=_("Context Required"),
        )

    company = profile.get("company")
    if not company:
        frappe.throw(
            _("Context Required: Company is required."),
            frappe.ValidationError,
            title=_("Context Required"),
        )

    scope = profile.get("imogi_pos_session_scope") or "User"
    device_id = None
    if scope == "Device":
        device_id = _get_device_id()
        if not device_id:
            frappe.throw(
                _("Context Required: Device ID is required for device scope."),
                frappe.ValidationError,
                title=_("Context Required"),
            )

    set_active_operational_context(
        user=user,
        pos_profile=pos_profile,
        branch=branch,
        company=company,
        scope=scope,
        device_id=device_id,
        resolved_from=resolved_from,
        route=route,
        module=module,
    )

    return {
        "pos_profile": pos_profile,
        "branch": branch,
        "company": company,
        "scope": scope,
        "device_id": device_id,
        "resolved_from": resolved_from,
    }
