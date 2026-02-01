#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test: Verify POS Opening Response Shape Fix

Tests that get_active_opening returns consistent response with 'name' field,
and that opening from previous days remains valid (no date filters).
"""

import frappe
import unittest
from datetime import datetime, timedelta


class TestPOSOpeningResponseFix(unittest.TestCase):
    """Test POS Opening response shape and date filter removal."""

    @classmethod
    def setUpClass(cls):
        """Set up test data once for all tests."""
        frappe.set_user("Administrator")
        
        # Get or create test POS Profile
        if not frappe.db.exists("POS Profile", "Test Cashier Profile"):
            pos_profile = frappe.get_doc({
                "doctype": "POS Profile",
                "name": "Test Cashier Profile",
                "company": frappe.defaults.get_global_default("company") or "Test Company",
                "warehouse": "Stores - TC",
                "currency": "IDR",
                "write_off_account": "Write Off - TC",
                "write_off_cost_center": "Main - TC"
            })
            pos_profile.insert(ignore_permissions=True)
        
        cls.pos_profile = "Test Cashier Profile"
        cls.user = "Administrator"

    def setUp(self):
        """Clean up before each test."""
        # Close any existing test openings
        existing = frappe.get_all(
            "POS Opening Entry",
            filters={
                "pos_profile": self.pos_profile,
                "user": self.user,
                "status": "Open",
                "docstatus": 1
            },
            pluck="name"
        )
        
        for opening_name in existing:
            opening = frappe.get_doc("POS Opening Entry", opening_name)
            opening.status = "Closed"
            opening.period_end_date = datetime.now()
            opening.save(ignore_permissions=True)

    def test_response_shape_with_opening(self):
        """Test that response has correct shape when opening exists."""
        # Create opening
        opening = self._create_test_opening()
        
        # Call API
        from imogi_pos.api.cashier import get_active_opening
        response = get_active_opening(pos_profile=self.pos_profile)
        
        # Assertions
        self.assertTrue(response.get("success"), "Response should be successful")
        self.assertTrue(response.get("has_opening"), "Should have opening")
        self.assertIsNotNone(response.get("opening"), "Opening object should not be None")
        self.assertEqual(response.get("pos_profile"), self.pos_profile)
        
        # Check opening object structure
        opening_data = response.get("opening")
        self.assertIsNotNone(opening_data, "Opening data should exist")
        
        # CRITICAL: Check 'name' field exists
        self.assertIn("name", opening_data, "Opening MUST have 'name' field")
        self.assertEqual(opening_data.get("name"), opening.name, "Name should match")
        
        # Backward compatibility fields
        self.assertIn("pos_opening_entry", opening_data, "Should have pos_opening_entry for backward compat")
        self.assertIn("pos_profile", opening_data, "Should have pos_profile field")
        
        print(f"✅ Response shape correct: {opening_data.get('name')}")

    def test_response_shape_without_opening(self):
        """Test that response has correct shape when no opening exists."""
        from imogi_pos.api.cashier import get_active_opening
        response = get_active_opening(pos_profile=self.pos_profile)
        
        # Assertions
        self.assertTrue(response.get("success"), "Response should be successful even without opening")
        self.assertFalse(response.get("has_opening"), "Should not have opening")
        self.assertIsNone(response.get("opening"), "Opening should be None (not undefined)")
        self.assertEqual(response.get("pos_profile"), self.pos_profile)
        
        print("✅ Response shape correct when no opening")

    def test_opening_from_yesterday_is_valid(self):
        """
        Test that opening from yesterday is still valid.
        NO DATE FILTERS should be applied - opening remains active until explicitly closed.
        """
        # Create opening with yesterday's date
        yesterday = datetime.now() - timedelta(days=1)
        opening = self._create_test_opening(period_start=yesterday)
        
        # Call API
        from imogi_pos.api.cashier import get_active_opening
        response = get_active_opening(pos_profile=self.pos_profile)
        
        # Assertions
        self.assertTrue(response.get("success"), "Should be successful")
        self.assertTrue(response.get("has_opening"), "Should find opening from yesterday")
        self.assertIsNotNone(response.get("opening"), "Opening should not be None")
        self.assertEqual(response.get("opening").get("name"), opening.name, "Should return yesterday's opening")
        
        print(f"✅ Opening from yesterday still valid: {opening.name}")

    def test_resolve_active_pos_opening_returns_dict(self):
        """Test that resolve_active_pos_opening returns dict (not doc object)."""
        from imogi_pos.utils.pos_opening import resolve_active_pos_opening
        
        # Create opening
        opening = self._create_test_opening()
        
        # Call function
        result = resolve_active_pos_opening(
            pos_profile=self.pos_profile,
            user=self.user
        )
        
        # Assertions
        self.assertIsInstance(result, dict, "Should return dict")
        self.assertIn("name", result, "Dict should have 'name' field")
        self.assertIn("pos_opening_entry", result, "Dict should have 'pos_opening_entry' for backward compat")
        self.assertEqual(result.get("name"), opening.name)
        self.assertEqual(result.get("pos_opening_entry"), opening.name)
        
        print(f"✅ resolve_active_pos_opening returns dict with name: {result.get('name')}")

    def test_name_and_pos_opening_entry_match(self):
        """Test that 'name' and 'pos_opening_entry' fields have the same value."""
        opening = self._create_test_opening()
        
        from imogi_pos.api.cashier import get_active_opening
        response = get_active_opening(pos_profile=self.pos_profile)
        
        opening_data = response.get("opening")
        self.assertEqual(
            opening_data.get("name"),
            opening_data.get("pos_opening_entry"),
            "name and pos_opening_entry should match"
        )
        
        print(f"✅ name == pos_opening_entry: {opening_data.get('name')}")

    def _create_test_opening(self, period_start=None):
        """Helper to create test opening."""
        if period_start is None:
            period_start = datetime.now()
        
        opening = frappe.get_doc({
            "doctype": "POS Opening Entry",
            "pos_profile": self.pos_profile,
            "user": self.user,
            "company": frappe.db.get_value("POS Profile", self.pos_profile, "company"),
            "period_start_date": period_start,
            "balance_details": [
                {
                    "mode_of_payment": "Cash",
                    "opening_amount": 0
                }
            ]
        })
        opening.insert(ignore_permissions=True)
        opening.submit()
        
        return opening

    @classmethod
    def tearDownClass(cls):
        """Clean up test data after all tests."""
        # Close test openings
        openings = frappe.get_all(
            "POS Opening Entry",
            filters={
                "pos_profile": cls.pos_profile,
                "user": cls.user,
                "status": "Open"
            },
            pluck="name"
        )
        
        for opening_name in openings:
            opening = frappe.get_doc("POS Opening Entry", opening_name)
            opening.status = "Closed"
            opening.period_end_date = datetime.now()
            opening.save(ignore_permissions=True)


def run_tests():
    """Run all tests."""
    print("\n" + "="*60)
    print("TESTING: POS Opening Response Fix")
    print("="*60 + "\n")
    
    suite = unittest.TestLoader().loadTestsFromTestCase(TestPOSOpeningResponseFix)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print("\n" + "="*60)
    if result.wasSuccessful():
        print("✅ ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
    print("="*60 + "\n")
    
    return result.wasSuccessful()


if __name__ == "__main__":
    run_tests()
