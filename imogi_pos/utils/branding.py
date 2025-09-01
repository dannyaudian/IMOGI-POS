"""Branding utilities for IMOGI POS.

Provides helper stubs for retrieving branding context.
"""

import frappe


def get_brand_context(pos_profile=None):
    """Return branding information for templates.

    Args:
        pos_profile (str, optional): POS Profile to source branding from.

    Returns:
        dict: Branding context with colours, logos, etc.
    """
    return {}
