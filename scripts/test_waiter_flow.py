#!/usr/bin/env python3
"""
Waiter Flow Test Script - Bench Console
Tests waiter order creation, KOT generation, bill request, and cashier claim flow.

Usage in bench console:
    bench --site [your-site] console
    >>> exec(open('scripts/test_waiter_flow.py').read())
"""

import frappe
from frappe import _
import json
from datetime import datetime

print("\n" + "="*80)
print("WAITER FLOW TEST SCRIPT")
print("Testing: create_table_order → send_to_kitchen → request_bill → claim_order")
print("="*80 + "\n")

# Configuration
TEST_BRANCH = "Main Branch"  # Change to your branch name
TEST_TABLE = "T-001"  # Change to your table name
TEST_WAITER = "waiter@example.com"  # Change to your waiter user email
TEST_CASHIER = "cashier@example.com"  # Change to your cashier user email
TEST_ITEM_CODE = "FOOD-001"  # Change to your item code

def test_create_table_order():
    """Test 1: Create table order via Waiter"""
    print("\n[TEST 1] Creating Table Order")
    print("-" * 40)
    
    try:
        # Set operational context (simulating logged-in waiter)
        frappe.set_user(TEST_WAITER)
        
        # Get POS Profile for branch
        pos_profile = frappe.db.get_value("POS Profile", {"branch": TEST_BRANCH}, "name")
        if not pos_profile:
            print(f"❌ ERROR: No POS Profile found for branch {TEST_BRANCH}")
            return None
        
        print(f"✓ Using POS Profile: {pos_profile}")
        
        # Set operational context
        from imogi_pos.utils.operational_context import set_operational_context
        set_operational_context(branch=TEST_BRANCH, pos_profile=pos_profile)
        
        # Get test item details
        item = frappe.db.get_value("Item", TEST_ITEM_CODE, ["standard_rate", "item_name", "stock_uom"], as_dict=True)
        if not item:
            print(f"❌ ERROR: Item {TEST_ITEM_CODE} not found")
            return None
        
        print(f"✓ Using Item: {TEST_ITEM_CODE} - {item.item_name} @ {item.standard_rate}")
        
        # Create order
        order_data = {
            "customer": "Walk-in Customer",
            "waiter": TEST_WAITER,
            "table": TEST_TABLE,
            "mode": "Dine-in",
            "notes": "Test order - Bench console",
            "items": [
                {
                    "item_code": TEST_ITEM_CODE,
                    "item_name": item.item_name,
                    "qty": 2,
                    "rate": item.standard_rate,
                    "uom": item.stock_uom,
                    "notes": "Extra spicy"
                }
            ]
        }
        
        result = frappe.call("imogi_pos.api.orders.create_table_order", **order_data)
        
        print(f"✅ Order Created: {result['name']}")
        print(f"   Table: {result['table']}")
        print(f"   Waiter: {result['waiter']}")
        print(f"   Total: {result['grand_total']}")
        print(f"   State: {result['workflow_state']}")
        
        return result['name']
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        print(f"   Error Type: {type(e).__name__}")
        import traceback
        print(traceback.format_exc())
        return None
    finally:
        frappe.db.rollback()


def test_send_to_kitchen(order_name):
    """Test 2: Send order to kitchen (create KOT)"""
    print("\n[TEST 2] Sending Order to Kitchen")
    print("-" * 40)
    
    if not order_name:
        print("⚠️  SKIPPED: No order to send")
        return None
    
    try:
        frappe.set_user(TEST_WAITER)
        
        # Get order items
        order = frappe.get_doc("POS Order", order_name)
        
        # Group items by station
        items_by_station = {}
        for item in order.items:
            station = item.production_station or "Main Kitchen"
            if station not in items_by_station:
                items_by_station[station] = []
            
            items_by_station[station].append({
                "item_code": item.item_code,
                "item_name": item.item_name,
                "qty": item.qty,
                "uom": item.uom,
                "rate": item.rate,
                "notes": item.notes
            })
        
        print(f"✓ Order has items for {len(items_by_station)} station(s)")
        
        # Send to kitchen
        result = frappe.call(
            "imogi_pos.api.kot.send_to_kitchen",
            order_name=order_name,
            items_by_station=items_by_station
        )
        
        print(f"✅ Sent to Kitchen: {result['total_kots']} KOT(s) created")
        for station, kot_name in result['kots'].items():
            print(f"   {station}: {kot_name}")
        
        return result
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        print(f"   Error Type: {type(e).__name__}")
        import traceback
        print(traceback.format_exc())
        return None
    finally:
        frappe.db.rollback()


def test_request_bill(order_name):
    """Test 3: Waiter requests bill"""
    print("\n[TEST 3] Requesting Bill")
    print("-" * 40)
    
    if not order_name:
        print("⚠️  SKIPPED: No order to request bill for")
        return None
    
    try:
        frappe.set_user(TEST_WAITER)
        
        result = frappe.call(
            "imogi_pos.api.orders.request_bill",
            pos_order_name=order_name
        )
        
        print(f"✅ Bill Requested: {result['pos_order']}")
        print(f"   Table: {result['table']}")
        print(f"   Requested At: {result['requested_payment_at']}")
        print(f"   State: {result['workflow_state']}")
        
        return result
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        print(f"   Error Type: {type(e).__name__}")
        import traceback
        print(traceback.format_exc())
        return None
    finally:
        frappe.db.rollback()


def test_claim_order(order_name):
    """Test 4: Cashier claims order for payment"""
    print("\n[TEST 4] Claiming Order (Cashier)")
    print("-" * 40)
    
    if not order_name:
        print("⚠️  SKIPPED: No order to claim")
        return None
    
    try:
        frappe.set_user(TEST_CASHIER)
        
        # Get cashier's active opening
        opening = frappe.db.get_value(
            "POS Opening Entry",
            {"user": TEST_CASHIER, "docstatus": 1, "pos_closing_entry": ["is", "not set"]},
            "name"
        )
        
        if not opening:
            print(f"❌ ERROR: No active opening for cashier {TEST_CASHIER}")
            print("   Create opening first: bench --site [site] console")
            print("   >>> from imogi_pos.api.cashier import create_opening")
            return None
        
        print(f"✓ Using Opening: {opening}")
        
        # Claim order
        result = frappe.call(
            "imogi_pos.api.order_concurrency.claim_order",
            order_name=order_name,
            opening_entry=opening
        )
        
        if result.get('success'):
            print(f"✅ Order Claimed: {result['order']['name']}")
            print(f"   Claimed By: {result['order']['claimed_by']}")
            print(f"   Claimed At: {result['order']['claimed_at']}")
            if result.get('idempotent'):
                print("   (Idempotent - already claimed by you)")
        else:
            print(f"❌ Claim Failed: {result.get('message')}")
        
        return result
        
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        print(f"   Error Type: {type(e).__name__}")
        import traceback
        print(traceback.format_exc())
        return None
    finally:
        frappe.db.rollback()


def test_error_scenarios():
    """Test 5: Error scenarios"""
    print("\n[TEST 5] Error Scenarios")
    print("-" * 40)
    
    # Test 5a: Create order without items
    print("\n[5a] Create order without items (should fail)")
    try:
        frappe.set_user(TEST_WAITER)
        result = frappe.call(
            "imogi_pos.api.orders.create_table_order",
            customer="Walk-in Customer",
            waiter=TEST_WAITER,
            table=TEST_TABLE,
            items=[]
        )
        print(f"❌ UNEXPECTED: Should have failed but got: {result}")
    except Exception as e:
        print(f"✅ Expected Error: {str(e)}")
    finally:
        frappe.db.rollback()
    
    # Test 5b: Request bill for non-existent order
    print("\n[5b] Request bill for non-existent order (should fail)")
    try:
        frappe.set_user(TEST_WAITER)
        result = frappe.call(
            "imogi_pos.api.orders.request_bill",
            pos_order_name="NONEXISTENT-ORDER-123"
        )
        print(f"❌ UNEXPECTED: Should have failed but got: {result}")
    except Exception as e:
        print(f"✅ Expected Error: {str(e)}")
    finally:
        frappe.db.rollback()
    
    # Test 5c: Send empty items to kitchen
    print("\n[5c] Send empty items to kitchen (should fail)")
    try:
        frappe.set_user(TEST_WAITER)
        result = frappe.call(
            "imogi_pos.api.kot.send_to_kitchen",
            order_name="POS-ORDER-2024-00001",
            items_by_station={}
        )
        print(f"❌ UNEXPECTED: Should have failed but got: {result}")
    except Exception as e:
        print(f"✅ Expected Error: {str(e)}")
    finally:
        frappe.db.rollback()


def run_all_tests():
    """Run complete waiter flow test suite"""
    print("\n🚀 Starting Complete Waiter Flow Test Suite\n")
    
    # Test 1: Create order
    order_name = test_create_table_order()
    
    # Test 2: Send to kitchen
    if order_name:
        test_send_to_kitchen(order_name)
    
    # Test 3: Request bill
    if order_name:
        test_request_bill(order_name)
    
    # Test 4: Claim order
    if order_name:
        test_claim_order(order_name)
    
    # Test 5: Error scenarios
    test_error_scenarios()
    
    print("\n" + "="*80)
    print("TEST SUITE COMPLETED")
    print("="*80)
    print("\n📝 NOTES:")
    print("   - All tests use rollback (no data committed)")
    print("   - Check Error Log for detailed error messages")
    print("   - Update TEST_* variables at top of script for your environment")
    print("   - For production verification, remove frappe.db.rollback() calls")
    print("\n")


# Auto-run when executed
if __name__ == "__main__":
    run_all_tests()
else:
    # Manual execution functions available
    print("Waiter Flow Test Functions Loaded:")
    print("  - test_create_table_order()")
    print("  - test_send_to_kitchen(order_name)")
    print("  - test_request_bill(order_name)")
    print("  - test_claim_order(order_name)")
    print("  - test_error_scenarios()")
    print("  - run_all_tests()")
    print("\nOr run: run_all_tests()")
