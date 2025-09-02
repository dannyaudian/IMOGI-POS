"""Branding utilities for IMOGI POS.

This module centralises default branding colours used across the
application so that all components stay in sync.  Import these constants
instead of hard coding colour values in individual modules.
"""

from __future__ import annotations

from typing import Any

import frappe


# Default brand colours
PRIMARY_COLOR: str = "#4c5a67"
"""Fallback primary colour used when no specific branding is configured."""

ACCENT_COLOR: str = "#2490ef"
"""Fallback accent colour used when no specific branding is configured."""

HEADER_BG_COLOR: str = "#ffffff"
"""Default background colour for headers when none is provided."""


def get_brand_context(pos_profile: str | None = None) -> dict[str, Any]:
    """Return branding information for templates.

    Args:
        pos_profile: POS Profile to source branding from.  This may be a
            document name or ``None``.  If no profile or branding details
            are provided, sensible defaults are returned.

    Returns:
        dict: Branding context with colours, logos, etc.
    """

    branding: dict[str, Any] = {
        "logo": None,
        "logo_dark": None,
        "name": "IMOGI POS",
        "home_url": "/",
        "primary_color": PRIMARY_COLOR,
        "accent_color": ACCENT_COLOR,
        "header_bg": HEADER_BG_COLOR,
        "css_vars": None,
    }

    try:
        profile_doc = None
        if pos_profile:
            profile_doc = (
                frappe.get_doc("POS Profile", pos_profile)
                if isinstance(pos_profile, str)
                else pos_profile
            )

        brand_profile = None
        if profile_doc:
            brand_profile_name = getattr(
                profile_doc, "imogi_self_order_brand_profile", None
            ) or getattr(profile_doc, "imogi_brand_profile", None)
            if brand_profile_name:
                brand_profile = frappe.get_doc("Brand Profile", brand_profile_name)

        source = brand_profile or profile_doc
        if source:
            # Data from brand profile takes precedence over POS profile
            for key, attr in (
                ("logo", "logo"),
                ("logo_dark", "logo_dark"),
                ("name", "brand_name"),
                ("home_url", "brand_url"),
                ("primary_color", "primary_color"),
                ("accent_color", "accent_color"),
                ("header_bg", "header_bg_color"),
                ("css_vars", "custom_css"),
            ):
                value = getattr(source, attr, None)
                if value:
                    branding[key] = value

            if source is profile_doc:
                # POS Profile uses different fieldnames
                for key, attr in (
                    ("logo", "imogi_brand_logo"),
                    ("logo_dark", "imogi_brand_logo_dark"),
                    ("name", "imogi_brand_name"),
                    ("home_url", "imogi_brand_home_url"),
                    ("primary_color", "imogi_brand_color_primary"),
                    ("accent_color", "imogi_brand_color_accent"),
                    ("header_bg", "imogi_brand_header_bg"),
                    ("css_vars", "imogi_brand_css_vars"),
                ):
                    value = getattr(profile_doc, attr, None)
                    if value:
                        branding[key] = value

        if not branding["logo"] or branding["name"] == "IMOGI POS":
            settings = frappe.get_cached_doc("Restaurant Settings")
            if not branding["logo"] and getattr(settings, "imogi_brand_logo", None):
                branding["logo"] = settings.imogi_brand_logo
            if not branding["logo_dark"] and getattr(settings, "imogi_brand_logo_dark", None):
                branding["logo_dark"] = settings.imogi_brand_logo_dark
            if branding["name"] == "IMOGI POS" and getattr(
                settings, "imogi_brand_name", None
            ):
                branding["name"] = settings.imogi_brand_name
            if branding["home_url"] == "/" and getattr(
                settings, "imogi_brand_home_url", None
            ):
                branding["home_url"] = settings.imogi_brand_home_url
            if not branding["css_vars"] and getattr(settings, "imogi_brand_css_vars", None):
                branding["css_vars"] = settings.imogi_brand_css_vars

        if not branding["logo"]:
            company = frappe.defaults.get_user_default("Company") or frappe.defaults.get_global_default(
                "company"
            )
            if company:
                company_doc = frappe.get_cached_doc("Company", company)
                if company_doc.company_logo:
                    branding["logo"] = company_doc.company_logo
                if branding["name"] == "IMOGI POS":
                    branding["name"] = company_doc.company_name
    except Exception:
        # Failing silently keeps calling code simple and ensures defaults
        pass

    return branding
