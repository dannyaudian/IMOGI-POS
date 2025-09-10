# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import now, get_url
from imogi_pos.utils.branding import (
    PRIMARY_COLOR,
    ACCENT_COLOR,
    HEADER_BG_COLOR,
)
from imogi_pos.utils.permissions import validate_branch_access

__all__ = [
    "health",
    "get_branding",
    "get_active_branch",
    "set_active_branch",
    "check_session",
    "get_current_user_info",
    "check_permission",
    "record_opening_balance",
]

@frappe.whitelist(allow_guest=True)
def health():
    """
    Simple health check endpoint to verify the service is running.
    
    Returns:
        dict: Status information including timestamp and app version
    """
    return {
        "status": "ok",
        "timestamp": now(),
        "app_version": frappe.get_app_version("imogi_pos"),
        "server": get_url()
    }

@frappe.whitelist()
def get_branding(pos_profile=None):
    """
    Get branding information based on the provided POS Profile or fallback
    to global settings.
    
    Args:
        pos_profile (str, optional): Name of the POS Profile. Defaults to None.
    
    Returns:
        dict: Branding information including logo URLs and colors
    """
    result = {
        "brand_name": frappe.defaults.get_global_default('company') or "IMOGI POS",
        "logo": None,
        "logo_dark": None,
        "primary_color": PRIMARY_COLOR,
        "accent_color": ACCENT_COLOR,
        "header_bg": HEADER_BG_COLOR,
        "show_header": True,
        "home_url": get_url(),
        "css_vars": ""
    }
    
    # Try to get branding from POS Profile
    if pos_profile:
        try:
            profile = frappe.get_doc("POS Profile", pos_profile)
            
            if profile.get("imogi_brand_name"):
                result["brand_name"] = profile.imogi_brand_name
                
            if profile.get("imogi_brand_logo"):
                result["logo"] = profile.imogi_brand_logo
                
            if profile.get("imogi_brand_logo_dark"):
                result["logo_dark"] = profile.imogi_brand_logo_dark
                
            if profile.get("imogi_brand_color_primary"):
                result["primary_color"] = profile.imogi_brand_color_primary
                
            if profile.get("imogi_brand_color_accent"):
                result["accent_color"] = profile.imogi_brand_color_accent
                
            if profile.get("imogi_brand_header_bg"):
                result["header_bg"] = profile.imogi_brand_header_bg
                
            if profile.get("imogi_show_header_on_pages") is not None:
                result["show_header"] = profile.imogi_show_header_on_pages
                
            if profile.get("imogi_brand_home_url"):
                result["home_url"] = profile.imogi_brand_home_url
                
            if profile.get("imogi_brand_css_vars"):
                result["css_vars"] = profile.imogi_brand_css_vars
                
        except frappe.DoesNotExistError:
            frappe.log_error(f"POS Profile {pos_profile} not found for branding")

    # Fallback to Restaurant Settings if POS Profile doesn't have branding
    if not result["logo"]:
        try:
            restaurant_settings = frappe.get_doc("Restaurant Settings")
            if restaurant_settings.get("imogi_brand_logo"):
                result["logo"] = restaurant_settings.imogi_brand_logo

            if restaurant_settings.get("imogi_brand_logo_dark"):
                result["logo_dark"] = restaurant_settings.imogi_brand_logo_dark
        except frappe.DoesNotExistError:
            frappe.log_error("Restaurant Settings not found for branding")
        except Exception as err:
            frappe.log_error(f"Unexpected error loading Restaurant Settings for branding: {err}")
    
    # Final fallback to company logo
    if not result["logo"]:
        company = frappe.defaults.get_global_default('company')
        if company:
            company_logo = frappe.get_value("Company", company, "company_logo")
            if company_logo:
                result["logo"] = company_logo
    
    # Format URLs for logo paths
    if result["logo"] and not result["logo"].startswith(("http:", "https:", "/")):
        result["logo"] = get_url(result["logo"])

    if result["logo_dark"] and not result["logo_dark"].startswith(("http:", "https:", "/")):
        result["logo_dark"] = get_url(result["logo_dark"])

    return result


@frappe.whitelist()
def get_active_branch():
    """Return the active branch for the current user.

    Checks the user's default branch setting and falls back to the branch
    associated with their default POS Profile.

    Returns:
        str | None: Branch name if available.
    """

    branch = frappe.defaults.get_user_default("imogi_branch")
    if branch:
        return branch

    pos_profile = frappe.defaults.get_user_default("imogi_pos_profile")
    if pos_profile:
        branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
        if branch:
            return branch

    return None


@frappe.whitelist()
def set_active_branch(branch):
    """Persist the user's active branch after verifying access rights.

    Args:
        branch (str): Branch name to set as active.

    Returns:
        str | None: The branch that was set, or ``None`` if input was falsy.
    """

    if not branch:
        return None

    validate_branch_access(branch)
    frappe.defaults.set_user_default("imogi_branch", branch)
    return branch


@frappe.whitelist(allow_guest=True)
def check_session():
    """Check if the current session is valid.

    Returns:
        dict: Session information with validity flag.
    """

    user = getattr(frappe.session, "user", "Guest")
    if user and user != "Guest":
        return {
            "valid": True,
            "user": user,
        }

    return {
        "valid": False,
        "user": "Guest",
    }


@frappe.whitelist()
def get_current_user_info():
    """Return information about the currently logged-in user.

    Returns:
        dict: User details including full name and roles.
    """

    user = frappe.session.user
    if not user or user == "Guest":
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    user_doc = frappe.get_doc("User", user)
    return {
        "user": user,
        "full_name": user_doc.full_name,
        "email": user_doc.email,
        "roles": frappe.get_roles(user),
    }


@frappe.whitelist()
def check_permission(doctype, perm_type="read"):
    """Check if current user has the given permission on a DocType.

    Args:
        doctype (str): DocType to check.
        perm_type (str): Permission type like read, write, create, etc.

    Returns:
        bool: ``True`` if user has permission, else ``False``.
    """

    if frappe.session.user == "Guest":
        return False

    return bool(frappe.has_permission(doctype=doctype, permtype=perm_type))


@frappe.whitelist()
def record_opening_balance(device_type, opening_balance):
    """Record the opening balance for a user's device session.

    Args:
        device_type (str): Identifier for the device being registered.
        opening_balance (float): Starting cash balance for the session.

    Returns:
        dict: Confirmation status.
    """

    user = frappe.session.user

    cache = frappe.cache()
    if cache.hget("active_devices", user):
        frappe.throw(_("Active device already registered for user"))

    cache.hset("active_devices", user, device_type)

    doc = frappe.get_doc(
        {
            "doctype": "Cashier Device Session",
            "user": user,
            "device": device_type,
            "opening_balance": opening_balance,
            "timestamp": now(),
        }
    )
    doc.insert(ignore_permissions=True)

    # Post a Journal Entry moving funds from the big cash account to the
    # petty cash account for the opening balance of this session. The
    # required accounts are fetched from the singleton Restaurant Settings
    # document. If either account is missing we silently skip creating the
    # Journal Entry.
    settings = frappe.get_cached_doc("Restaurant Settings")
    big_cash = getattr(settings, "big_cash_account", None)
    petty_cash = getattr(settings, "petty_cash_account", None)

    if big_cash and petty_cash and opening_balance:
        je = frappe.get_doc(
            {
                "doctype": "Journal Entry",
                "posting_date": now(),
                "accounts": [
                    {"account": petty_cash, "debit": opening_balance},
                    {"account": big_cash, "credit": opening_balance},
                ],
            }
        )
        je.insert(ignore_permissions=True)

    return {"status": "ok"}

