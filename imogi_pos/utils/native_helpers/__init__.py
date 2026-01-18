# -*- coding: utf-8 -*-
"""Native ERPNext helpers for variants, BOM, and product bundles."""

from .variant_builder import (
    ensure_attribute_exists,
    ensure_attribute_value_exists,
    create_item_template,
    create_item_variant,
    get_or_create_variant,
)

from .bom_builder import (
    create_bom,
    update_bom_items,
    get_bom_for_item,
    calculate_bom_cost,
)

from .bundle_builder import (
    create_product_bundle,
    get_bundle_items,
    validate_bundle,
)

__all__ = [
    # Variant helpers
    "ensure_attribute_exists",
    "ensure_attribute_value_exists",
    "create_item_template",
    "create_item_variant",
    "get_or_create_variant",
    # BOM helpers
    "create_bom",
    "update_bom_items",
    "get_bom_for_item",
    "calculate_bom_cost",
    # Bundle helpers
    "create_product_bundle",
    "get_bundle_items",
    "validate_bundle",
]
