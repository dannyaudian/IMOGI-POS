#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Diagnostic Script for IMOGI POS Catalog Items
==============================================

Tests catalog item filtering to diagnose empty results in Cashier Console.

Usage:
    bench --site [your-site] execute scripts.diagnose_catalog_items.run_all_tests
    
Or from Frappe console:
    bench --site [your-site] console
    >>> from scripts.diagnose_catalog_items import run_all_tests
    >>> run_all_tests()

Tests:
- Test 0: Check if imogi_menu_channel field exists on Item
- Test 1: Count items matching base POS filters
- Test 2: Channel distribution (NULL/Empty/Cashier/Self Order/Kiosk/Universal)
- Test 3: Test get_template_items with menu_channel=None vs "Cashier"
- Test 4: Check Restaurant Settings and POS Profile domain
"""

import frappe
from frappe.utils import cint


def print_header(title):
    """Print a formatted test header."""
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)


def test_0_field_exists():
    """Test 0: Check if imogi_menu_channel field exists on Item DocType."""
    print_header("TEST 0: Check imogi_menu_channel Field Existence")
    
    try:
        item_meta = frappe.get_meta("Item")
        has_field = item_meta.has_field("imogi_menu_channel")
        
        if has_field:
            field = item_meta.get_field("imogi_menu_channel")
            print(f"✅ Field EXISTS on Item DocType")
            print(f"   Field Type: {field.fieldtype}")
            print(f"   Options: {field.options or 'N/A'}")
            print(f"   Label: {field.label}")
        else:
            print(f"❌ Field DOES NOT EXIST on Item DocType")
            print(f"   ACTION: Create Custom Field 'imogi_menu_channel' (Select/Data)")
            print(f"   or run: bench migrate")
            
        return has_field
    except Exception as e:
        print(f"❌ ERROR checking field: {e}")
        return False


def test_1_item_count():
    """Test 1: Count items matching base POS filters."""
    print_header("TEST 1: Item Count with Base POS Filters")
    
    try:
        # Base filters (same as get_template_items)
        filters = [
            ["Item", "disabled", "=", 0],
            ["Item", "is_sales_item", "=", 1],
            ["Item", "variant_of", "is", "not set"],
        ]
        
        total_items = frappe.db.count("Item", filters=filters)
        print(f"Total items matching base filters: {total_items}")
        
        if total_items == 0:
            print(f"❌ ZERO items found!")
            print(f"   Check:")
            print(f"   1. Do you have any items with disabled=0?")
            print(f"   2. Do you have any items with is_sales_item=1?")
            print(f"   3. Are all your items variant children (variant_of != null)?")
            
            # Count all items
            all_items = frappe.db.count("Item")
            print(f"\n   Total items in system: {all_items}")
            
            # Count by status
            disabled_count = frappe.db.count("Item", {"disabled": 1})
            print(f"   Disabled items: {disabled_count}")
            
            # Count variant children
            variant_children = frappe.db.sql("""
                SELECT COUNT(*) as cnt 
                FROM `tabItem` 
                WHERE variant_of IS NOT NULL AND variant_of != ''
            """, as_dict=True)[0].cnt
            print(f"   Variant children: {variant_children}")
            
        else:
            print(f"✅ Found {total_items} items")
            
            # Show sample items
            sample_items = frappe.get_all(
                "Item",
                filters=filters,
                fields=["name", "item_name", "has_variants"],
                limit_page_length=5
            )
            print(f"\n   Sample items:")
            for item in sample_items:
                variant_flag = "📦 (template)" if item.has_variants else "📄 (regular)"
                print(f"     - {item.name} | {item.item_name} {variant_flag}")
                
        return total_items
    except Exception as e:
        print(f"❌ ERROR counting items: {e}")
        import traceback
        traceback.print_exc()
        return 0


def test_2_channel_distribution():
    """Test 2: Analyze channel distribution."""
    print_header("TEST 2: Channel Distribution Analysis")
    
    has_field = test_0_field_exists()
    if not has_field:
        print("⚠️  Skipping - imogi_menu_channel field does not exist")
        return {}
    
    try:
        filters = [
            ["Item", "disabled", "=", 0],
            ["Item", "is_sales_item", "=", 1],
            ["Item", "variant_of", "is", "not set"],
        ]
        
        items = frappe.get_all(
            "Item",
            filters=filters,
            fields=["name", "item_name", "imogi_menu_channel"],
            limit_page_length=1000
        )
        
        # Count by channel
        channel_dist = {}
        for item in items:
            channel = item.get("imogi_menu_channel") or "[NULL/Empty]"
            if channel not in channel_dist:
                channel_dist[channel] = []
            channel_dist[channel].append(item.name)
        
        print(f"Channel distribution ({len(items)} total items):")
        for channel, item_list in sorted(channel_dist.items(), key=lambda x: -len(x[1])):
            count = len(item_list)
            percentage = (count / len(items) * 100) if items else 0
            print(f"   {channel:20s}: {count:4d} items ({percentage:5.1f}%)")
            # Show first 3 items
            for item_name in item_list[:3]:
                print(f"      - {item_name}")
            if count > 3:
                print(f"      ... and {count - 3} more")
        
        # Warnings
        if "[NULL/Empty]" in channel_dist and len(channel_dist["[NULL/Empty]"]) > 0:
            null_count = len(channel_dist["[NULL/Empty]"])
            print(f"\n⚠️  WARNING: {null_count} items have NULL/Empty channel")
            print(f"   These will match 'All/Universal' but may cause confusion")
            print(f"   ACTION: Set imogi_menu_channel to 'Cashier' or 'Universal'")
        
        if "Cashier" not in channel_dist or len(channel_dist.get("Cashier", [])) == 0:
            print(f"\n⚠️  WARNING: NO items have channel='Cashier'")
            print(f"   If you filter by menu_channel='Cashier', result will be EMPTY")
            print(f"   ACTION: Update items to have imogi_menu_channel='Cashier' or 'All'")
            
        return channel_dist
    except Exception as e:
        print(f"❌ ERROR analyzing channels: {e}")
        import traceback
        traceback.print_exc()
        return {}


def test_3_endpoint_calls(pos_profile=None):
    """Test 3: Test get_template_items endpoint with different parameters."""
    print_header("TEST 3: Test get_template_items Endpoint")
    
    # Get or create test POS Profile
    if not pos_profile:
        pos_profiles = frappe.get_all("POS Profile", limit_page_length=1)
        if pos_profiles:
            pos_profile = pos_profiles[0].name
        else:
            print("⚠️  No POS Profile found - some tests will be limited")
    
    if pos_profile:
        print(f"Using POS Profile: {pos_profile}")
    
    try:
        from imogi_pos.api.variants import get_template_items
        
        # Test 1: No channel filter
        print("\n--- Test 3.1: menu_channel=None (no filter) ---")
        items_none = get_template_items(
            pos_profile=pos_profile,
            menu_channel=None,
            limit=1000
        )
        print(f"   Result: {len(items_none)} items")
        if len(items_none) > 0:
            print(f"   Sample: {items_none[0].get('name')} - {items_none[0].get('item_name')}")
        
        # Test 2: menu_channel="Cashier"
        print("\n--- Test 3.2: menu_channel='Cashier' ---")
        items_cashier = get_template_items(
            pos_profile=pos_profile,
            menu_channel="Cashier",
            limit=1000
        )
        print(f"   Result: {len(items_cashier)} items")
        if len(items_cashier) > 0:
            sample = items_cashier[0]
            channel = sample.get('imogi_menu_channel') or '[NULL]'
            print(f"   Sample: {sample.get('name')} - {sample.get('item_name')} (channel: {channel})")
        else:
            print(f"   ❌ ZERO items returned!")
            print(f"   This is the problem! Check:")
            print(f"   1. Are items' imogi_menu_channel set to 'Cashier' or 'All/Universal'?")
            print(f"   2. Is Restaurant Settings enable_menu_channels = 1?")
            print(f"   3. Is POS Profile domain = 'Restaurant'?")
        
        # Test 3: menu_channel="Self Order"
        print("\n--- Test 3.3: menu_channel='Self Order' ---")
        items_selforder = get_template_items(
            pos_profile=pos_profile,
            menu_channel="Self Order",
            limit=1000
        )
        print(f"   Result: {len(items_selforder)} items")
        
        # Summary
        print("\n--- Summary ---")
        print(f"   No filter: {len(items_none)} items")
        print(f"   Cashier:   {len(items_cashier)} items")
        print(f"   Self Order: {len(items_selforder)} items")
        
        if len(items_none) > 0 and len(items_cashier) == 0:
            print(f"\n❌ PROBLEM DETECTED: Items exist but Cashier filter returns nothing")
            print(f"   Root cause: Channel filtering is too strict or items not tagged correctly")
            
        return {
            "none": len(items_none),
            "cashier": len(items_cashier),
            "self_order": len(items_selforder)
        }
    except Exception as e:
        print(f"❌ ERROR calling endpoint: {e}")
        import traceback
        traceback.print_exc()
        return {}


def test_4_settings_check(pos_profile=None):
    """Test 4: Check Restaurant Settings and POS Profile domain."""
    print_header("TEST 4: Check Settings and Domain")
    
    try:
        # Check Restaurant Settings
        print("--- Restaurant Settings ---")
        try:
            settings = frappe.get_cached_doc("Restaurant Settings", "Restaurant Settings")
            enable_menu_channels = settings.get("enable_menu_channels", 0)
            max_items = settings.get("max_items_per_query", 500)
            
            print(f"   enable_menu_channels: {enable_menu_channels}")
            if enable_menu_channels:
                print(f"      ✅ Channel filtering is ENABLED")
            else:
                print(f"      ⚠️  Channel filtering is DISABLED (all items returned regardless of channel)")
                
            print(f"   max_items_per_query:  {max_items}")
        except Exception as e:
            print(f"   ❌ ERROR reading Restaurant Settings: {e}")
        
        # Check POS Profile domain
        if not pos_profile:
            pos_profiles = frappe.get_all("POS Profile", limit_page_length=1)
            if pos_profiles:
                pos_profile = pos_profiles[0].name
        
        if pos_profile:
            print(f"\n--- POS Profile: {pos_profile} ---")
            try:
                domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain")
                print(f"   imogi_pos_domain: {domain or '[NOT SET]'}")
                
                if domain == "Restaurant":
                    print(f"      ✅ Domain is Restaurant - channel filtering can apply")
                else:
                    print(f"      ⚠️  Domain is '{domain}' (not Restaurant) - channel filtering SKIPPED")
                    print(f"          All items will be returned regardless of menu_channel parameter")
                    
            except Exception as e:
                print(f"   ❌ ERROR reading POS Profile: {e}")
        else:
            print(f"\n⚠️  No POS Profile found to check")
            
    except Exception as e:
        print(f"❌ ERROR in settings check: {e}")
        import traceback
        traceback.print_exc()


def run_all_tests(pos_profile=None):
    """
    Run all diagnostic tests.
    
    Args:
        pos_profile (str, optional): POS Profile name to test with.
            If not provided, will use first available POS Profile.
    
    Usage:
        bench --site [site] execute scripts.diagnose_catalog_items.run_all_tests
        
    Or with specific POS Profile:
        bench --site [site] execute "scripts.diagnose_catalog_items.run_all_tests('POS-001')"
    """
    print("\n")
    print("╔" + "=" * 78 + "╗")
    print("║" + " " * 78 + "║")
    print("║" + "  IMOGI POS - Catalog Items Diagnostic Script".center(78) + "║")
    print("║" + " " * 78 + "║")
    print("╚" + "=" * 78 + "╝")
    
    test_0_field_exists()
    test_1_item_count()
    test_2_channel_distribution()
    test_4_settings_check(pos_profile)
    test_3_endpoint_calls(pos_profile)
    
    print_header("DIAGNOSTIC COMPLETE")
    print("\nNext steps:")
    print("1. Review warnings above")
    print("2. Fix any configuration issues (Restaurant Settings, POS Profile domain)")
    print("3. Update Item records to set imogi_menu_channel correctly")
    print("4. Re-run this script to verify")
    print("5. Test in Cashier Console (Network tab should show items returned)")
    print("\n")


if __name__ == "__main__":
    # For direct execution (not common in Frappe)
    run_all_tests()
