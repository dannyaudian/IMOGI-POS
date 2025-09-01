"""Branding utilities for IMOGI POS.

This module centralises default branding colours used across the
application so that all components stay in sync.  Import these constants
instead of hard coding colour values in individual modules.
"""


# Default brand colours
PRIMARY_COLOR: str = "#4c5a67"
"""Fallback primary colour used when no specific branding is configured."""

ACCENT_COLOR: str = "#2490ef"
"""Fallback accent colour used when no specific branding is configured."""

HEADER_BG_COLOR: str = "#ffffff"
"""Default background colour for headers when none is provided."""


def get_brand_context(pos_profile: str | None = None) -> dict:
    """Return branding information for templates.

    Args:
        pos_profile: POS Profile to source branding from.

    Returns:
        dict: Branding context with colours, logos, etc.
    """

    return {
        "primary_color": PRIMARY_COLOR,
        "accent_color": ACCENT_COLOR,
        "header_bg_color": HEADER_BG_COLOR,
    }
