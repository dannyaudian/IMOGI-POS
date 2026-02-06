"""
Test cases for POS Profile cascading validation.

Tests verify that hidden fields are properly cleared when parent toggles change,
preventing stale data from being saved.
"""
import unittest
from unittest.mock import patch, MagicMock

import frappe
from frappe.tests.utils import FrappeTestCase


class TestPOSProfileCascadingValidation(FrappeTestCase):
    """Test cascading validation for POS Profile hidden fields."""

    def setUp(self):
        """Set up test fixtures."""
        # Create a mock POS Profile with all fields populated
        self.pos_profile = frappe.new_doc("POS Profile")
        self.pos_profile.name = "Test POS Profile"
        self.pos_profile.company = frappe.defaults.get_global_default("company") or "_Test Company"
        
        # Set all domain-dependent fields
        self.pos_profile.imogi_pos_domain = "Restaurant"
        self.pos_profile.imogi_mode = "Table"
        self.pos_profile.imogi_use_table_display = 1
        self.pos_profile.imogi_enable_kot = 1
        self.pos_profile.imogi_default_floor = "Test Floor"
        self.pos_profile.imogi_default_layout_profile = "Test Layout"
        
        # Set self-order fields
        self.pos_profile.imogi_enable_self_order = 1
        self.pos_profile.imogi_self_order_mode = "Takeaway"
        self.pos_profile.imogi_self_order_require_payment = 1
        self.pos_profile.imogi_self_order_allow_guest = 1
        self.pos_profile.imogi_self_order_token_ttl = 60
        self.pos_profile.imogi_self_order_regenerate_on_close = 1
        self.pos_profile.imogi_self_order_brand_profile = "Test Brand"
        self.pos_profile.imogi_self_order_disclaimer = "Test Disclaimer"
        self.pos_profile.imogi_self_order_rate_limit = 10
        self.pos_profile.imogi_self_order_qr_sheet_format = "Self Order QR Sheet"
        
        # Set session fields
        self.pos_profile.imogi_require_pos_session = 1
        self.pos_profile.imogi_pos_session_scope = "User"
        self.pos_profile.imogi_enforce_session_on_cashier = 1
        self.pos_profile.imogi_enforce_session_on_kiosk = 1
        self.pos_profile.imogi_enforce_session_on_counter = 1
        
        # Set payment gateway fields
        self.pos_profile.imogi_enable_payment_gateway = 1
        self.pos_profile.imogi_payment_gateway_account = "Test Gateway"
        self.pos_profile.imogi_checkout_payment_mode = "Mixed"
        self.pos_profile.imogi_show_payment_qr_on_customer_display = 1
        self.pos_profile.imogi_payment_timeout_seconds = 300
        self.pos_profile.imogi_kiosk_cashless_only = 1
        
        # Set printer interface fields (LAN)
        self.pos_profile.imogi_printer_cashier_interface = "LAN"
        self.pos_profile.imogi_printer_kitchen_interface = "LAN"
        self.pos_profile.imogi_printer_cashier = "192.168.1.100"
        self.pos_profile.imogi_printer_kitchen = "192.168.1.101"
        self.pos_profile.imogi_printer_port = 9100
        
        # Set print format fields
        self.pos_profile.imogi_customer_bill_format = "Customer Bill"
        self.pos_profile.imogi_customer_bill_copies = 1
        self.pos_profile.imogi_kot_format = "KOT Ticket"
        self.pos_profile.imogi_kot_copies = 1
        self.pos_profile.imogi_hide_notes_on_table_bill = 1

    def test_clear_restaurant_fields_when_domain_changes(self):
        """Verify Restaurant-only fields are cleared when domain changes to Retail."""
        # Import the custom class
        from imogi_pos.overrides.pos_profile import CustomPOSProfile
        
        # Create instance and copy attributes
        profile = CustomPOSProfile.__new__(CustomPOSProfile)
        profile.__dict__.update(self.pos_profile.__dict__)
        profile.flags = frappe._dict()
        
        # Change domain to Retail
        profile.imogi_pos_domain = "Retail"
        
        # Call the clear method
        profile._clear_domain_dependent_fields()
        
        # Verify Restaurant fields are cleared
        self.assertEqual(profile.imogi_use_table_display, 0)
        self.assertEqual(profile.imogi_enable_kot, 0)
        self.assertIsNone(profile.imogi_default_floor)
        self.assertIsNone(profile.imogi_default_layout_profile)
        self.assertEqual(profile.imogi_enable_self_order, 0)
        self.assertIsNone(profile.imogi_customer_bill_format)
        self.assertIsNone(profile.imogi_customer_bill_copies)
        self.assertEqual(profile.imogi_hide_notes_on_table_bill, 0)

    def test_clear_self_order_fields_when_disabled(self):
        """Verify self-order fields are cleared when self-order is disabled."""
        from imogi_pos.overrides.pos_profile import CustomPOSProfile
        
        profile = CustomPOSProfile.__new__(CustomPOSProfile)
        profile.__dict__.update(self.pos_profile.__dict__)
        profile.flags = frappe._dict()
        
        # Disable self-order
        profile.imogi_enable_self_order = 0
        
        # Call the clear method
        profile._clear_self_order_fields()
        
        # Verify self-order fields are cleared
        self.assertIsNone(profile.imogi_self_order_mode)
        self.assertEqual(profile.imogi_self_order_require_payment, 0)
        self.assertEqual(profile.imogi_self_order_allow_guest, 0)
        self.assertIsNone(profile.imogi_self_order_token_ttl)
        self.assertEqual(profile.imogi_self_order_regenerate_on_close, 0)
        self.assertIsNone(profile.imogi_self_order_brand_profile)
        self.assertIsNone(profile.imogi_self_order_disclaimer)
        self.assertIsNone(profile.imogi_self_order_rate_limit)
        self.assertIsNone(profile.imogi_self_order_qr_sheet_format)

    def test_nested_self_order_payment_cleared_when_mode_changes(self):
        """Verify require_payment is cleared when self-order mode changes from Takeaway."""
        from imogi_pos.overrides.pos_profile import CustomPOSProfile
        
        profile = CustomPOSProfile.__new__(CustomPOSProfile)
        profile.__dict__.update(self.pos_profile.__dict__)
        profile.flags = frappe._dict()
        
        # Self-order enabled, but mode is Table (not Takeaway)
        profile.imogi_enable_self_order = 1
        profile.imogi_self_order_mode = "Table"
        
        # Call the clear method
        profile._clear_self_order_fields()
        
        # Verify require_payment is cleared (nested dependency)
        self.assertEqual(profile.imogi_self_order_require_payment, 0)
        # But other self-order fields should remain
        self.assertEqual(profile.imogi_self_order_allow_guest, 1)

    def test_clear_session_fields_when_disabled(self):
        """Verify session fields are cleared when session requirement is disabled."""
        from imogi_pos.overrides.pos_profile import CustomPOSProfile
        
        profile = CustomPOSProfile.__new__(CustomPOSProfile)
        profile.__dict__.update(self.pos_profile.__dict__)
        profile.flags = frappe._dict()
        
        # Disable session requirement
        profile.imogi_require_pos_session = 0
        
        # Call the clear method
        profile._clear_session_fields()
        
        # Verify session fields are cleared
        self.assertIsNone(profile.imogi_pos_session_scope)
        self.assertEqual(profile.imogi_enforce_session_on_cashier, 0)
        self.assertEqual(profile.imogi_enforce_session_on_kiosk, 0)
        self.assertEqual(profile.imogi_enforce_session_on_counter, 0)

    def test_clear_payment_gateway_fields_when_disabled(self):
        """Verify payment gateway fields are cleared when gateway is disabled."""
        from imogi_pos.overrides.pos_profile import CustomPOSProfile
        
        profile = CustomPOSProfile.__new__(CustomPOSProfile)
        profile.__dict__.update(self.pos_profile.__dict__)
        profile.flags = frappe._dict()
        
        # Disable payment gateway
        profile.imogi_enable_payment_gateway = 0
        
        # Call the clear method
        profile._clear_payment_gateway_fields()
        
        # Verify payment gateway fields are cleared
        self.assertIsNone(profile.imogi_payment_gateway_account)
        self.assertIsNone(profile.imogi_checkout_payment_mode)
        self.assertEqual(profile.imogi_show_payment_qr_on_customer_display, 0)
        self.assertIsNone(profile.imogi_payment_timeout_seconds)
        self.assertEqual(profile.imogi_kiosk_cashless_only, 0)

    def test_clear_printer_fields_on_interface_change(self):
        """Verify printer fields are cleared when interface changes."""
        from imogi_pos.overrides.pos_profile import CustomPOSProfile
        
        profile = CustomPOSProfile.__new__(CustomPOSProfile)
        profile.__dict__.update(self.pos_profile.__dict__)
        profile.flags = frappe._dict()
        
        # Set up Bluetooth interface for cashier (was LAN)
        profile.imogi_printer_cashier_interface = "Bluetooth"
        profile.imogi_bt_cashier_device_name = "BT Printer"
        profile.imogi_bt_cashier_vendor_profile = "ESC/POS"
        
        # Call the clear method
        profile._clear_printer_interface_fields()
        
        # Verify LAN fields for cashier are cleared
        self.assertIsNone(profile.imogi_printer_cashier)
        # Kitchen LAN should still be set (kitchen interface is still LAN)
        self.assertEqual(profile.imogi_printer_kitchen, "192.168.1.101")
        # Port should still be set (kitchen uses LAN)
        self.assertEqual(profile.imogi_printer_port, 9100)
        # Bluetooth fields for cashier should remain
        self.assertEqual(profile.imogi_bt_cashier_device_name, "BT Printer")

    def test_clear_kitchen_printer_when_kot_disabled(self):
        """Verify kitchen printer fields are cleared when KOT is disabled."""
        from imogi_pos.overrides.pos_profile import CustomPOSProfile
        
        profile = CustomPOSProfile.__new__(CustomPOSProfile)
        profile.__dict__.update(self.pos_profile.__dict__)
        profile.flags = frappe._dict()
        
        # Disable KOT
        profile.imogi_enable_kot = 0
        
        # Call the clear method
        profile._clear_printer_interface_fields()
        
        # Verify kitchen printer fields are cleared
        self.assertIsNone(profile.imogi_printer_kitchen_interface)
        self.assertIsNone(profile.imogi_printer_kitchen)

    def test_clear_mode_dependent_fields(self):
        """Verify mode-specific fields are cleared when mode changes."""
        from imogi_pos.overrides.pos_profile import CustomPOSProfile
        
        profile = CustomPOSProfile.__new__(CustomPOSProfile)
        profile.__dict__.update(self.pos_profile.__dict__)
        profile.flags = frappe._dict()
        
        # Set mode-specific fields for all modes
        profile.imogi_mode = "Counter"
        profile.imogi_order_customer_flow = "Order First"
        profile.imogi_kiosk_receipt_format = "Kiosk Receipt"
        profile.imogi_print_notes_on_kiosk_receipt = 1
        profile.imogi_kiosk_cashless_only = 1
        profile.imogi_queue_format = "Queue Ticket"
        profile.imogi_use_table_display = 0
        profile.imogi_default_floor = None
        profile.imogi_default_layout_profile = None
        profile.imogi_hide_notes_on_table_bill = 0
        
        # Change mode to Table
        profile.imogi_mode = "Table"
        
        # Call the clear method
        profile._clear_mode_dependent_fields()
        
        # Verify Counter-only fields are cleared
        self.assertIsNone(profile.imogi_order_customer_flow)
        # Kiosk-only fields should be cleared
        self.assertIsNone(profile.imogi_kiosk_receipt_format)
        self.assertEqual(profile.imogi_print_notes_on_kiosk_receipt, 0)
        self.assertEqual(profile.imogi_kiosk_cashless_only, 0)
        # Queue format (Kiosk/Counter) should be cleared in Table mode
        self.assertIsNone(profile.imogi_queue_format)
    
    def test_clear_table_fields_when_mode_changes(self):
        """Verify table-specific fields are cleared when mode is not Table."""
        from imogi_pos.overrides.pos_profile import CustomPOSProfile
        
        profile = CustomPOSProfile.__new__(CustomPOSProfile)
        profile.__dict__.update(self.pos_profile.__dict__)
        profile.flags = frappe._dict()
        
        # Start with Table mode
        profile.imogi_mode = "Table"
        profile.imogi_use_table_display = 1
        profile.imogi_default_floor = "Test Floor"
        profile.imogi_default_layout_profile = "Test Layout"
        profile.imogi_hide_notes_on_table_bill = 1
        
        # Change mode to Counter (not Table)
        profile.imogi_mode = "Counter"
        
        # Call the clear method
        profile._clear_mode_dependent_fields()
        
        # Verify table-specific fields are cleared
        self.assertEqual(profile.imogi_use_table_display, 0)
        self.assertIsNone(profile.imogi_default_floor)
        self.assertIsNone(profile.imogi_default_layout_profile)
        self.assertEqual(profile.imogi_hide_notes_on_table_bill, 0)

    def test_full_cascading_validation(self):
        """Test complete cascading validation flow."""
        from imogi_pos.overrides.pos_profile import CustomPOSProfile
        
        profile = CustomPOSProfile.__new__(CustomPOSProfile)
        profile.__dict__.update(self.pos_profile.__dict__)
        profile.flags = frappe._dict()
        
        # Change domain to Retail (should cascade to clear many fields)
        profile.imogi_pos_domain = "Retail"
        
        # Call the main clear method
        profile.clear_hidden_fields()
        
        # Verify cascading effect
        # Restaurant fields cleared
        self.assertEqual(profile.imogi_use_table_display, 0)
        self.assertEqual(profile.imogi_enable_kot, 0)
        # Self-order cleared (because Restaurant only and enable_self_order set to 0)
        self.assertEqual(profile.imogi_enable_self_order, 0)
        self.assertIsNone(profile.imogi_self_order_mode)
        # Kitchen printer cleared (no KOT)
        self.assertIsNone(profile.imogi_printer_kitchen_interface)


if __name__ == "__main__":
    unittest.main()
