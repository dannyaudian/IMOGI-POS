"""
Test Script: POS Order Creation & Menu Channel Filtering
=========================================================

Script untuk testing dan debugging:
1. Create POS Order dengan proper error logging
2. Verify menu channel filtering behavior

Run in bench console:
>>> bench console
>>> exec(open("scripts/test_pos_order_menu_filtering.py").read())
"""

import frappe
from frappe.utils import flt, now_datetime


def test_order_creation():
    """Test POS Order creation with detailed error capture"""
    print("\n" + "="*60)
    print("TEST 1: POS Order Creation with Error Logging")
    print("="*60)
    
    # Get first POS Profile
    pos_profile = frappe.db.get_value("POS Profile", {"disabled": 0}, "name")
    if not pos_profile:
        print("❌ No active POS Profile found!")
        return
    
    print(f"✓ Using POS Profile: {pos_profile}")
    
    # Get branch from POS Profile
    branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
    if not branch:
        print("❌ POS Profile has no branch assigned!")
        return
    
    print(f"✓ Branch: {branch}")
    
    # Get customer
    customer = frappe.db.get_value("Customer", {"customer_name": "Walk-In Customer"})
    if not customer:
        print("⚠️  Walk-In Customer not found, will create on demand")
        customer = None
    
    # Get a test item
    test_item = frappe.db.get_value(
        "Item",
        {"disabled": 0, "is_sales_item": 1},
        "name"
    )
    
    if not test_item:
        print("❌ No active sales items found!")
        return
    
    print(f"✓ Test item: {test_item}")
    
    # Try to create order
    try:
        print("\n📝 Creating test POS Order...")
        
        result = frappe.call(
            "imogi_pos.api.orders.create_order",
            order_type="Counter",
            pos_profile=pos_profile,
            branch=branch,
            customer=customer,
            items=[{
                "item_code": test_item,
                "qty": 1,
                "rate": 10000
            }]
        )
        
        if result and result.get("name"):
            print(f"✅ SUCCESS! Order created: {result.get('name')}")
            print(f"   Order Type: {result.get('order_type')}")
            print(f"   Workflow State: {result.get('workflow_state')}")
            print(f"   Items: {len(result.get('items', []))}")
            
            # Clean up test order
            frappe.db.rollback()
            print("   (Rolled back for testing)")
            
        else:
            print("❌ Order creation returned no data")
            
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        print(f"\nℹ️  Check Error Log for full traceback:")
        print(f"   Go to: Error Log > Filter by 'Error creating POS Order'")
        print(f"   Or run: frappe.get_doc('Error Log', '{{latest_error_log}}').message")


def test_menu_channel_filtering():
    """Test menu channel filtering behavior"""
    print("\n" + "="*60)
    print("TEST 2: Menu Channel Filtering")
    print("="*60)
    
    # Get Restaurant Settings
    try:
        settings = frappe.get_single("Restaurant Settings")
        enable_menu_channels = settings.get("enable_menu_channels", 0)
        
        print(f"✓ Restaurant Settings loaded")
        print(f"  Enable Menu Channels: {enable_menu_channels}")
        
        if enable_menu_channels == 0:
            print("\n✅ Menu Channel Filtering is DISABLED")
            print("   → All items will be shown regardless of channel assignment")
        else:
            print("\n✅ Menu Channel Filtering is ENABLED")
            print("   → Only items matching channel context will be shown")
            
    except Exception as e:
        print(f"❌ Failed to load Restaurant Settings: {str(e)}")
        return
    
    # Get POS Profile
    pos_profile = frappe.db.get_value("POS Profile", {"disabled": 0}, "name")
    if not pos_profile:
        print("❌ No active POS Profile found!")
        return
    
    domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain")
    print(f"\n✓ POS Profile: {pos_profile}")
    print(f"  Domain: {domain or 'Restaurant (default)'}")
    
    # Count items by channel assignment
    has_channel_field = frappe.db.has_column("Item", "imogi_menu_channel")
    
    if has_channel_field:
        print("\n📊 Item Distribution by Menu Channel:")
        
        channel_stats = frappe.db.sql("""
            SELECT 
                COALESCE(imogi_menu_channel, '[NULL]') as channel,
                COUNT(*) as count
            FROM `tabItem`
            WHERE disabled = 0 
                AND is_sales_item = 1
            GROUP BY imogi_menu_channel
            ORDER BY count DESC
        """, as_dict=True)
        
        total_items = 0
        for stat in channel_stats:
            print(f"  {stat.channel}: {stat.count} items")
            total_items += stat.count
        
        print(f"\n  Total Active Sales Items: {total_items}")
        
        # Test API calls
        print("\n🔍 Testing get_template_items API:")
        
        # Test 1: Without channel filter
        try:
            result1 = frappe.call(
                "imogi_pos.api.variants.get_template_items",
                pos_profile=pos_profile,
                menu_channel=None,
                limit=100
            )
            print(f"  Without channel filter: {len(result1) if result1 else 0} items")
        except Exception as e:
            print(f"  ❌ Error: {str(e)}")
        
        # Test 2: With channel filter (Restaurant)
        try:
            result2 = frappe.call(
                "imogi_pos.api.variants.get_template_items",
                pos_profile=pos_profile,
                menu_channel="Restaurant",
                limit=100
            )
            print(f"  With channel='Restaurant': {len(result2) if result2 else 0} items")
        except Exception as e:
            print(f"  ❌ Error: {str(e)}")
        
        # Test 3: With channel filter (POS)
        try:
            result3 = frappe.call(
                "imogi_pos.api.variants.get_template_items",
                pos_profile=pos_profile,
                menu_channel="POS",
                limit=100
            )
            print(f"  With channel='POS': {len(result3) if result3 else 0} items")
        except Exception as e:
            print(f"  ❌ Error: {str(e)}")
        
        if enable_menu_channels == 0:
            print("\n💡 EXPECTED BEHAVIOR:")
            print("   Since Enable Menu Channels = 0:")
            print("   → All three API calls should return SAME count")
            print("   → Channel filter should be IGNORED")
        else:
            print("\n💡 EXPECTED BEHAVIOR:")
            print("   Since Enable Menu Channels = 1:")
            print("   → Without channel: all items")
            print("   → With channel: only matching items")
            print("   → Items with NULL/empty channel: depend on _channel_matches logic")
            
    else:
        print("\n⚠️  imogi_menu_channel field not found on Item doctype")
        print("   Menu channel filtering not available")


def test_error_log_quality():
    """Check latest Error Logs for proper traceback"""
    print("\n" + "="*60)
    print("TEST 3: Error Log Quality Check")
    print("="*60)
    
    # Get recent error logs related to order creation
    recent_errors = frappe.get_all(
        "Error Log",
        filters={
            "error": ["like", "%POS Order%"],
            "creation": [">=", frappe.utils.add_days(now_datetime(), -7)]
        },
        fields=["name", "method", "error", "creation"],
        order_by="creation desc",
        limit=5
    )
    
    if not recent_errors:
        print("✅ No recent POS Order errors found (good!)")
        return
    
    print(f"⚠️  Found {len(recent_errors)} recent POS Order errors:")
    
    for err in recent_errors:
        print(f"\n  Error: {err.name}")
        print(f"  Method: {err.method}")
        print(f"  Time: {err.creation}")
        print(f"  Message: {err.error[:100]}...")
        
        # Check if error has traceback
        err_doc = frappe.get_doc("Error Log", err.name)
        has_traceback = "Traceback" in (err_doc.error or "")
        has_context = any(
            keyword in (err_doc.error or "")
            for keyword in ["Context:", "POS Profile:", "Branch:", "User:"]
        )
        
        if has_traceback and has_context:
            print("  ✅ Has traceback and context")
        elif has_traceback:
            print("  ⚠️  Has traceback but missing context")
        else:
            print("  ❌ Missing traceback")


def run_all_tests():
    """Run all tests"""
    print("\n" + "🧪 " * 30)
    print("POS ORDER & MENU CHANNEL TESTING")
    print("🧪 " * 30)
    
    test_order_creation()
    test_menu_channel_filtering()
    test_error_log_quality()
    
    print("\n" + "="*60)
    print("TESTING COMPLETE")
    print("="*60)
    print("\n📋 NEXT STEPS:")
    print("1. If order creation fails, check Error Log for detailed traceback")
    print("2. If menu channels not working, toggle 'Enable Menu Channels' in Restaurant Settings")
    print("3. If items missing, check Item.imogi_menu_channel assignments")
    print("\n✅ All fixes have been applied to code")


if __name__ == "__main__":
    run_all_tests()
