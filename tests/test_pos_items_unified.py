# -*- coding: utf-8 -*-
# Copyright (c) 2026, IMOGI and contributors
# For license information, please see license.txt

"""
Test unified get_pos_items() API for item visibility.
Validates sellable/template/both modes and filter behavior.
"""

from __future__ import unicode_literals
import frappe
import unittest
from frappe.utils import nowdate


class TestPOSItemsUnified(unittest.TestCase):
    """Test unified get_pos_items API for consistent item visibility."""
    
    @classmethod
    def setUpClass(cls):
        """Create test fixtures once for all tests."""
        frappe.set_user("Administrator")
        
        # Create test Item Group
        if not frappe.db.exists("Item Group", "Test POS Items"):
            frappe.get_doc({
                "doctype": "Item Group",
                "item_group_name": "Test POS Items",
                "parent_item_group": "All Item Groups"
            }).insert(ignore_permissions=True)
        
        # Create test Price List
        if not frappe.db.exists("Price List", "Test POS Price List"):
            frappe.get_doc({
                "doctype": "Price List",
                "price_list_name": "Test POS Price List",
                "selling": 1,
                "currency": "IDR"
            }).insert(ignore_permissions=True)
        
        # Create test items
        cls._create_test_items()
        frappe.db.commit()
    
    @classmethod
    def _create_test_items(cls):
        """Create test items: template, variant, standalone, and edge cases."""
        
        # 1) Template item (has_variants=1)
        if not frappe.db.exists("Item", "TEST-TEMPLATE-001"):
            template = frappe.get_doc({
                "doctype": "Item",
                "item_code": "TEST-TEMPLATE-001",
                "item_name": "Test Template Item",
                "item_group": "Test POS Items",
                "stock_uom": "Nos",
                "is_sales_item": 1,
                "has_variants": 1,
                "disabled": 0,
                "standard_rate": 10000,
                "menu_category": "Test Category"
            })
            template.insert(ignore_permissions=True)
        
        # 2) Variant item (has_variants=0, variant_of=template)
        if not frappe.db.exists("Item", "TEST-VARIANT-001"):
            variant = frappe.get_doc({
                "doctype": "Item",
                "item_code": "TEST-VARIANT-001",
                "item_name": "Test Variant Item",
                "item_group": "Test POS Items",
                "stock_uom": "Nos",
                "is_sales_item": 1,
                "has_variants": 0,
                "variant_of": "TEST-TEMPLATE-001",
                "disabled": 0,
                "standard_rate": 12000,
                "menu_category": "Test Category"
            })
            variant.insert(ignore_permissions=True)
        
        # 3) Standalone item (has_variants=0, variant_of=null)
        if not frappe.db.exists("Item", "TEST-STANDALONE-001"):
            standalone = frappe.get_doc({
                "doctype": "Item",
                "item_code": "TEST-STANDALONE-001",
                "item_name": "Test Standalone Item",
                "item_group": "Test POS Items",
                "stock_uom": "Nos",
                "is_sales_item": 1,
                "has_variants": 0,
                "disabled": 0,
                "standard_rate": 15000,
                "menu_category": "Test Category"
            })
            standalone.insert(ignore_permissions=True)
        
        # 4) Item WITHOUT menu_category (edge case)
        if not frappe.db.exists("Item", "TEST-NO-CATEGORY-001"):
            no_category = frappe.get_doc({
                "doctype": "Item",
                "item_code": "TEST-NO-CATEGORY-001",
                "item_name": "Test No Category Item",
                "item_group": "Test POS Items",
                "stock_uom": "Nos",
                "is_sales_item": 1,
                "has_variants": 0,
                "disabled": 0,
                "standard_rate": 8000,
                # menu_category intentionally not set
            })
            no_category.insert(ignore_permissions=True)
        
        # 5) Disabled item (should never appear)
        if not frappe.db.exists("Item", "TEST-DISABLED-001"):
            disabled = frappe.get_doc({
                "doctype": "Item",
                "item_code": "TEST-DISABLED-001",
                "item_name": "Test Disabled Item",
                "item_group": "Test POS Items",
                "stock_uom": "Nos",
                "is_sales_item": 1,
                "has_variants": 0,
                "disabled": 1,
                "standard_rate": 5000,
                "menu_category": "Test Category"
            })
            disabled.insert(ignore_permissions=True)
        
        # 6) Non-sales item (should never appear)
        if not frappe.db.exists("Item", "TEST-NONSALES-001"):
            nonsales = frappe.get_doc({
                "doctype": "Item",
                "item_code": "TEST-NONSALES-001",
                "item_name": "Test Non-Sales Item",
                "item_group": "Test POS Items",
                "stock_uom": "Nos",
                "is_sales_item": 0,
                "has_variants": 0,
                "disabled": 0,
                "standard_rate": 3000,
                "menu_category": "Test Category"
            })
            nonsales.insert(ignore_permissions=True)
        
        # Add Item Prices for pricing tests
        for item_code, rate in [
            ("TEST-VARIANT-001", 12500),
            ("TEST-STANDALONE-001", 16000),
            ("TEST-NO-CATEGORY-001", 8500)
        ]:
            if not frappe.db.exists("Item Price", {
                "item_code": item_code,
                "price_list": "Test POS Price List"
            }):
                frappe.get_doc({
                    "doctype": "Item Price",
                    "item_code": item_code,
                    "price_list": "Test POS Price List",
                    "price_list_rate": rate
                }).insert(ignore_permissions=True)
    
    def test_mode_sellable_only_shows_sellable_items(self):
        """Test mode=sellable shows only sellable items (has_variants=0)."""
        from imogi_pos.api.items import get_pos_items
        
        items = get_pos_items(
            mode="sellable",
            item_group="Test POS Items"
        )
        
        item_codes = [item["item_code"] for item in items]
        
        # Should include: variant + standalone + no_category (all has_variants=0)
        self.assertIn("TEST-VARIANT-001", item_codes, "Variant should be visible in sellable mode")
        self.assertIn("TEST-STANDALONE-001", item_codes, "Standalone should be visible in sellable mode")
        self.assertIn("TEST-NO-CATEGORY-001", item_codes, "No category item should be visible (no silent filter)")
        
        # Should exclude: template (has_variants=1), disabled, non-sales
        self.assertNotIn("TEST-TEMPLATE-001", item_codes, "Template should NOT be visible in sellable mode")
        self.assertNotIn("TEST-DISABLED-001", item_codes, "Disabled item should NOT be visible")
        self.assertNotIn("TEST-NONSALES-001", item_codes, "Non-sales item should NOT be visible")
        
        # Verify all returned items have has_variants=0
        for item in items:
            if item["item_code"].startswith("TEST-"):
                self.assertEqual(item["has_variants"], 0, 
                    f"Item {item['item_code']} should have has_variants=0 in sellable mode")
    
    def test_mode_template_shows_templates_and_standalone(self):
        """Test mode=template shows templates (for variant picker) and standalone items."""
        from imogi_pos.api.items import get_pos_items
        
        items = get_pos_items(
            mode="template",
            item_group="Test POS Items"
        )
        
        item_codes = [item["item_code"] for item in items]
        
        # Should include: template + standalone + no_category
        self.assertIn("TEST-TEMPLATE-001", item_codes, "Template should be visible in template mode")
        self.assertIn("TEST-STANDALONE-001", item_codes, "Standalone should be visible in template mode")
        self.assertIn("TEST-NO-CATEGORY-001", item_codes, "No category item should be visible")
        
        # Should exclude: variant children (variant_of is set)
        self.assertNotIn("TEST-VARIANT-001", item_codes, 
            "Variant child should NOT be visible in template mode (variant_of is set)")
    
    def test_mode_variant_shows_only_children_of_template(self):
        """Test mode=variant shows only variant children of specific template."""
        from imogi_pos.api.items import get_pos_items
        
        # Should require item_code parameter
        with self.assertRaises(Exception) as context:
            get_pos_items(mode="variant")
        self.assertIn("item_code is required", str(context.exception),
            "Should raise error when item_code not provided for variant mode")
        
        # Fetch variants of template
        items = get_pos_items(
            mode="variant",
            item_code="TEST-TEMPLATE-001"
        )
        
        item_codes = [item["item_code"] for item in items]
        
        # Should include: only variant children of TEST-TEMPLATE-001
        self.assertIn("TEST-VARIANT-001", item_codes, 
            "Variant child should be visible in variant mode")
        
        # Should exclude: template itself, other standalone items
        self.assertNotIn("TEST-TEMPLATE-001", item_codes,
            "Template itself should NOT be in variant list")
        self.assertNotIn("TEST-STANDALONE-001", item_codes,
            "Standalone item should NOT be in variant list")
        
        # Verify all items have variant_of = template
        for item in items:
            if item["item_code"].startswith("TEST-"):
                self.assertEqual(item.get("variant_of"), "TEST-TEMPLATE-001",
                    f"Item {item['item_code']} should have variant_of=TEST-TEMPLATE-001")
    
    def test_variant_mode_includes_attributes(self):
        """Test that variant mode includes attribute enrichment."""
        from imogi_pos.api.items import get_pos_items
        
        items = get_pos_items(
            mode="variant",
            item_code="TEST-TEMPLATE-001"
        )
        
        # All variants should have 'attributes' field
        for item in items:
            self.assertIn("attributes", item,
                f"Variant {item['item_code']} should have 'attributes' field")
            self.assertIsInstance(item["attributes"], dict,
                "Attributes should be a dictionary")
    
    def test_mode_both_shows_all_valid_items(self):
        """Test mode=both shows all items regardless of variant status."""
        from imogi_pos.api.items import get_pos_items
        
        items = get_pos_items(
            mode="both",
            item_group="Test POS Items"
        )
        
        item_codes = [item["item_code"] for item in items]
        
        # Should include: template + variant + standalone + no_category
        self.assertIn("TEST-TEMPLATE-001", item_codes, "Template should be visible in both mode")
        self.assertIn("TEST-VARIANT-001", item_codes, "Variant should be visible in both mode")
        self.assertIn("TEST-STANDALONE-001", item_codes, "Standalone should be visible in both mode")
        self.assertIn("TEST-NO-CATEGORY-001", item_codes, "No category item should be visible in both mode")
        
        # Should still exclude: disabled + non-sales (base filters always apply)
        self.assertNotIn("TEST-DISABLED-001", item_codes, "Disabled item should NOT be visible")
        self.assertNotIn("TEST-NONSALES-001", item_codes, "Non-sales item should NOT be visible")
    
    def test_menu_category_not_blocking_by_default(self):
        """Test that items without menu_category are NOT silently filtered by default."""
        from imogi_pos.api.items import get_pos_items
        
        # Default: require_menu_category=0 (should include items without menu_category)
        items = get_pos_items(
            mode="sellable",
            item_group="Test POS Items",
            require_menu_category=0
        )
        
        item_codes = [item["item_code"] for item in items]
        self.assertIn("TEST-NO-CATEGORY-001", item_codes, 
            "Item without menu_category should be visible when require_menu_category=0")
    
    def test_menu_category_filter_when_explicitly_required(self):
        """Test that items without menu_category ARE filtered when explicitly required."""
        from imogi_pos.api.items import get_pos_items
        
        # Explicit: require_menu_category=1 (should exclude items without menu_category)
        items = get_pos_items(
            mode="sellable",
            item_group="Test POS Items",
            require_menu_category=1
        )
        
        item_codes = [item["item_code"] for item in items]
        self.assertNotIn("TEST-NO-CATEGORY-001", item_codes, 
            "Item without menu_category should NOT be visible when require_menu_category=1")
        
        # Items WITH menu_category should still be visible
        self.assertIn("TEST-VARIANT-001", item_codes, 
            "Item with menu_category should still be visible")
        self.assertIn("TEST-STANDALONE-001", item_codes, 
            "Item with menu_category should still be visible")
    
    def test_search_term_filters_by_code_name_description(self):
        """Test that search_term filters items by item_code, item_name, or description."""
        from imogi_pos.api.items import get_pos_items
        
        # Search by item_code
        items = get_pos_items(
            mode="sellable",
            item_group="Test POS Items",
            search_term="STANDALONE"
        )
        item_codes = [item["item_code"] for item in items]
        self.assertIn("TEST-STANDALONE-001", item_codes, "Should find by item_code")
        self.assertNotIn("TEST-VARIANT-001", item_codes, "Should NOT include non-matching items")
        
        # Search by item_name (case-insensitive)
        items = get_pos_items(
            mode="sellable",
            item_group="Test POS Items",
            search_term="variant"
        )
        item_codes = [item["item_code"] for item in items]
        self.assertIn("TEST-VARIANT-001", item_codes, "Should find by item_name (case-insensitive)")
    
    def test_pricing_fallback_to_standard_rate(self):
        """Test that pricing falls back to standard_rate when price_list_rate is not available."""
        from imogi_pos.api.items import get_pos_items
        
        # Without price list
        items = get_pos_items(
            mode="sellable",
            item_group="Test POS Items"
        )
        
        standalone = [item for item in items if item["item_code"] == "TEST-STANDALONE-001"][0]
        # Should use standard_rate (15000) as fallback
        self.assertEqual(standalone["price_list_rate"], 15000, 
            "Should fallback to standard_rate when no price list")
        
        # With price list
        items = get_pos_items(
            mode="sellable",
            item_group="Test POS Items",
            price_list="Test POS Price List"
        )
        
        standalone = [item for item in items if item["item_code"] == "TEST-STANDALONE-001"][0]
        # Should use price_list_rate (16000) from Item Price
        self.assertEqual(standalone["price_list_rate"], 16000, 
            "Should use price_list_rate when available")
    
    def test_debug_mode_returns_metadata(self):
        """Test that debug=1 returns metadata along with items."""
        from imogi_pos.api.items import get_pos_items
        
        response = get_pos_items(
            mode="sellable",
            item_group="Test POS Items",
            search_term="Test",
            debug=1
        )
        
        # Should return dict with 'items' and 'debug' keys
        self.assertIsInstance(response, dict, "Debug mode should return dict")
        self.assertIn("items", response, "Should have 'items' key")
        self.assertIn("debug", response, "Should have 'debug' key")
        
        # Validate debug metadata
        debug = response["debug"]
        self.assertEqual(debug["mode"], "sellable", "Debug should include mode")
        self.assertIsInstance(debug["total_before_search"], int, "Should include count before search")
        self.assertIsInstance(debug["total_after_search"], int, "Should include count after search")
        self.assertIn("filters_applied", debug, "Should include filters applied")
    
    def test_invalid_mode_throws_error(self):
        """Test that invalid mode parameter raises error."""
        from imogi_pos.api.items import get_pos_items
        
        with self.assertRaises(Exception) as context:
            get_pos_items(mode="invalid_mode")
        
        self.assertIn("Invalid mode", str(context.exception), 
            "Should raise error for invalid mode")
    
    @classmethod
    def tearDownClass(cls):
        """Clean up test fixtures."""
        # Clean up test items
        for item_code in [
            "TEST-TEMPLATE-001",
            "TEST-VARIANT-001",
            "TEST-STANDALONE-001",
            "TEST-NO-CATEGORY-001",
            "TEST-DISABLED-001",
            "TEST-NONSALES-001"
        ]:
            if frappe.db.exists("Item", item_code):
                frappe.delete_doc("Item", item_code, force=1, ignore_permissions=True)
        
        # Clean up Item Prices
        frappe.db.sql("""
            DELETE FROM `tabItem Price` 
            WHERE price_list = 'Test POS Price List'
        """)
        
        # Clean up Price List
        if frappe.db.exists("Price List", "Test POS Price List"):
            frappe.delete_doc("Price List", "Test POS Price List", force=1, ignore_permissions=True)
        
        # Clean up Item Group
        if frappe.db.exists("Item Group", "Test POS Items"):
            frappe.delete_doc("Item Group", "Test POS Items", force=1, ignore_permissions=True)
        
        frappe.db.commit()


def run_tests():
    """Run tests programmatically."""
    import sys
    suite = unittest.TestLoader().loadTestsFromTestCase(TestPOSItemsUnified)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)


if __name__ == "__main__":
    run_tests()
