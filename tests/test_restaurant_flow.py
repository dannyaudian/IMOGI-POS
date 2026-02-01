"""
Integration Test: Restaurant Flow - Waiter to Cashier Bill Request & Payment

Tests the complete flow:
1. Waiter creates dine-in order for table
2. Waiter requests bill (request_payment=1)
3. Cashier claims order (claimed_by set)
4. Cashier processes payment
5. Table auto-released (status=Available, current_pos_order=null)

Run:
    bench --site [site_name] run-tests --test test_restaurant_flow
"""

import frappe
import unittest
from frappe.utils import now_datetime
from imogi_pos.api.orders import (
    create_order,
    add_item_to_order,
    request_bill,
    claim_order,
    release_table_if_done
)
from imogi_pos.api.cashier import (
    create_invoice_from_order,
    process_payment,
    complete_order
)


class TestRestaurantFlow(unittest.TestCase):
    """Integration test for restaurant bill request flow"""
    
    @classmethod
    def setUpClass(cls):
        """Setup test data once for all tests"""
        frappe.set_user("Administrator")
        
        # Create test POS Profile if not exists
        if not frappe.db.exists("POS Profile", "Test Restaurant Profile"):
            pos_profile = frappe.get_doc({
                "doctype": "POS Profile",
                "name": "Test Restaurant Profile",
                "company": frappe.defaults.get_global_default("company"),
                "imogi_mode": "Table",
                "imogi_enable_waiter": 1
            })
            pos_profile.insert(ignore_permissions=True)
        
        # Create test branch
        if not frappe.db.exists("Branch", "Test Branch"):
            branch = frappe.get_doc({
                "doctype": "Branch",
                "branch": "Test Branch",
                "company": frappe.defaults.get_global_default("company")
            })
            branch.insert(ignore_permissions=True)
        
        # Create test floor
        if not frappe.db.exists("Restaurant Floor", "Test Floor"):
            floor = frappe.get_doc({
                "doctype": "Restaurant Floor",
                "floor_name": "Test Floor",
                "branch": "Test Branch"
            })
            floor.insert(ignore_permissions=True)
        
        # Create test table
        if not frappe.db.exists("Restaurant Table", "T-TEST-01"):
            table = frappe.get_doc({
                "doctype": "Restaurant Table",
                "name": "T-TEST-01",
                "table_name": "T-TEST-01",
                "floor": "Test Floor",
                "branch": "Test Branch",
                "status": "Available",
                "minimum_seating": 2,
                "maximum_seating": 4
            })
            table.insert(ignore_permissions=True)
        
        # Create test item
        if not frappe.db.exists("Item", "Test Item"):
            item = frappe.get_doc({
                "doctype": "Item",
                "item_code": "Test Item",
                "item_name": "Test Item",
                "item_group": "Products",
                "stock_uom": "Nos",
                "standard_rate": 10000
            })
            item.insert(ignore_permissions=True)
        
        frappe.db.commit()
    
    def setUp(self):
        """Setup for each test"""
        frappe.set_user("Administrator")
        
        # Reset table status
        table = frappe.get_doc("Restaurant Table", "T-TEST-01")
        table.status = "Available"
        table.current_pos_order = None
        table.save(ignore_permissions=True)
        frappe.db.commit()
    
    def tearDown(self):
        """Cleanup after each test"""
        # Clean up test orders
        frappe.db.sql("""
            DELETE FROM `tabPOS Order` 
            WHERE pos_profile = 'Test Restaurant Profile' 
            AND table = 'T-TEST-01'
        """)
        frappe.db.commit()
    
    def test_01_waiter_creates_order(self):
        """Test: Waiter creates dine-in order for table"""
        order = create_order(
            order_type="Dine-in",
            pos_profile="Test Restaurant Profile",
            branch="Test Branch",
            table="T-TEST-01",
            customer="Guest"
        )
        
        self.assertIsNotNone(order)
        self.assertEqual(order["order_type"], "Dine-in")
        self.assertEqual(order["table"], "T-TEST-01")
        
        # Check table status updated
        table = frappe.get_doc("Restaurant Table", "T-TEST-01")
        self.assertEqual(table.status, "Occupied")
        self.assertEqual(table.current_pos_order, order["name"])
    
    def test_02_waiter_requests_bill(self):
        """Test: Waiter requests bill for order"""
        # Create order
        order = create_order(
            order_type="Dine-in",
            pos_profile="Test Restaurant Profile",
            branch="Test Branch",
            table="T-TEST-01",
            customer="Guest"
        )
        
        # Add item
        add_item_to_order(
            pos_order=order["name"],
            item="Test Item",
            qty=2
        )
        
        # Request bill
        result = request_bill(order["name"])
        
        self.assertTrue(result["success"])
        self.assertEqual(result["request_payment"], 1)
        self.assertIsNotNone(result["requested_payment_at"])
        
        # Verify database
        order_doc = frappe.get_doc("POS Order", order["name"])
        self.assertEqual(order_doc.request_payment, 1)
        self.assertIsNotNone(order_doc.requested_payment_at)
    
    def test_03_cashier_claims_order(self):
        """Test: Cashier claims order for payment"""
        # Create and request bill
        order = create_order(
            order_type="Dine-in",
            pos_profile="Test Restaurant Profile",
            branch="Test Branch",
            table="T-TEST-01",
            customer="Guest"
        )
        add_item_to_order(pos_order=order["name"], item="Test Item", qty=2)
        request_bill(order["name"])
        
        # Cashier claims
        frappe.set_user("Administrator")
        result = claim_order(order["name"])
        
        self.assertTrue(result["success"])
        self.assertEqual(result["claimed_by"], "Administrator")
        self.assertIsNotNone(result["claimed_at"])
        
        # Verify database
        order_doc = frappe.get_doc("POS Order", order["name"])
        self.assertEqual(order_doc.claimed_by, "Administrator")
    
    def test_04_concurrency_guard_prevents_double_claim(self):
        """Test: Second cashier cannot claim already-claimed order"""
        # Create and claim
        order = create_order(
            order_type="Dine-in",
            pos_profile="Test Restaurant Profile",
            branch="Test Branch",
            table="T-TEST-01",
            customer="Guest"
        )
        request_bill(order["name"])
        claim_order(order["name"])
        
        # Try to claim as different user (simulate)
        order_doc = frappe.get_doc("POS Order", order["name"])
        order_doc.claimed_by = "test@example.com"
        order_doc.save(ignore_permissions=True)
        
        # Second claim should fail
        with self.assertRaises(frappe.ValidationError):
            claim_order(order["name"])
    
    def test_05_edit_lock_after_claim(self):
        """Test: Waiter cannot edit order after cashier claims"""
        # Create, claim
        order = create_order(
            order_type="Dine-in",
            pos_profile="Test Restaurant Profile",
            branch="Test Branch",
            table="T-TEST-01",
            customer="Guest"
        )
        add_item_to_order(pos_order=order["name"], item="Test Item", qty=1)
        request_bill(order["name"])
        claim_order(order["name"])
        
        # Set claimed_by to different user
        order_doc = frappe.get_doc("POS Order", order["name"])
        order_doc.claimed_by = "cashier@example.com"
        order_doc.save(ignore_permissions=True)
        
        # Try to add item (should fail)
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.PermissionError):
            add_item_to_order(pos_order=order["name"], item="Test Item", qty=1)
    
    def test_06_table_release_after_payment(self):
        """Test: Table auto-released after payment completion"""
        # Create full flow
        order = create_order(
            order_type="Dine-in",
            pos_profile="Test Restaurant Profile",
            branch="Test Branch",
            table="T-TEST-01",
            customer="Guest"
        )
        add_item_to_order(pos_order=order["name"], item="Test Item", qty=2, rate=10000)
        request_bill(order["name"])
        claim_order(order["name"])
        
        # Create invoice
        inv_result = create_invoice_from_order(order["name"])
        self.assertTrue(inv_result["success"])
        invoice_name = inv_result["invoice"]
        
        # Process payment
        pay_result = process_payment(
            invoice_name=invoice_name,
            mode_of_payment="Cash",
            paid_amount=20000,
            cash_received=20000
        )
        self.assertTrue(pay_result["success"])
        
        # Complete order
        complete_result = complete_order(order["name"], invoice_name)
        self.assertTrue(complete_result["success"])
        
        # Verify table released
        table = frappe.get_doc("Restaurant Table", "T-TEST-01")
        self.assertEqual(table.status, "Available")
        self.assertIsNone(table.current_pos_order)
        
        # Verify order closed
        order_doc = frappe.get_doc("POS Order", order["name"])
        self.assertEqual(order_doc.workflow_state, "Closed")
        self.assertIsNotNone(order_doc.paid_at)
    
    def test_07_release_table_if_done_idempotent(self):
        """Test: release_table_if_done is idempotent"""
        order = create_order(
            order_type="Dine-in",
            pos_profile="Test Restaurant Profile",
            branch="Test Branch",
            table="T-TEST-01",
            customer="Guest"
        )
        
        # Set order to closed
        order_doc = frappe.get_doc("POS Order", order["name"])
        order_doc.workflow_state = "Closed"
        order_doc.save(ignore_permissions=True)
        
        # First release
        result1 = release_table_if_done(order["name"])
        self.assertTrue(result1["success"])
        
        # Second release (idempotent)
        result2 = release_table_if_done(order["name"])
        self.assertTrue(result2["success"])
        self.assertTrue(result2.get("skipped"))


def run_tests():
    """Helper to run tests programmatically"""
    suite = unittest.TestLoader().loadTestsFromTestCase(TestRestaurantFlow)
    unittest.TextTestRunner(verbosity=2).run(suite)


if __name__ == "__main__":
    run_tests()
