"""
Diagnostic script to test get_template_items API with different menu_channel values.
Run this in ERPNext console or as a script to diagnose why catalog is empty.

Usage in ERPNext console:
    bench --site [your-site] console
    >>> exec(open('scripts/diagnose_catalog_items.py').read())
"""

import frappe
from frappe.utils import cint, flt

def diagnose_catalog_items(pos_profile="Dirnosaurus"):
    """
    Test get_template_items with different menu_channel values.
    
    Args:
        pos_profile: POS Profile name to test (default: Dirnosaurus)
    """
    print("\n" + "="*80)
    print("CATALOG ITEMS DIAGNOSTIC")
    print("="*80)
    
    # Test 0: Check if imogi_menu_channel field exists in Item DocType
    print("\n[0] Field Existence Check:")
    print("-" * 40)
    
    try:
        item_meta = frappe.get_meta("Item")
        has_channel_field = item_meta.has_field("imogi_menu_channel")
        
        if has_channel_field:
            field = item_meta.get_field("imogi_menu_channel")
            print(f"  ✓ imogi_menu_channel field EXISTS in Item DocType")
            print(f"    Field Type: {field.fieldtype}")
            print(f"    Label: {field.label or 'N/A'}")
        else:
            print(f"  ✗ imogi_menu_channel field NOT FOUND in Item DocType")
            print(f"    WARNING: Backend will fetch NULL for this field!")
            print(f"    ACTION REQUIRED: Run 'bench --site [site] migrate' or add custom field")
    except Exception as e:
        print(f"  Error checking field: {e}")
    
    # Test 1: Check basic Item counts
    print("\n[1] Basic Item Counts:")
    print("-" * 40)
    
    total_items = frappe.db.count("Item")
    enabled_items = frappe.db.count("Item", {"disabled": 0})
    sales_items = frappe.db.count("Item", {"disabled": 0, "is_sales_item": 1})
    template_items = frappe.db.sql("""
        SELECT COUNT(*) as count
        FROM `tabItem`
        WHERE disabled = 0
            AND is_sales_item = 1
            AND (variant_of IS NULL OR variant_of = '')
    """, as_dict=True)[0].count
    
    print(f"  Total items: {total_items}")
    print(f"  Enabled items: {enabled_items}")
    print(f"  Sales items (enabled): {sales_items}")
    print(f"  Template/regular items (not variant children): {template_items}")
    
    # Test 2: Check menu_channel distribution
    print("\n[2] Menu Channel Distribution:")
    print("-" * 40)
    
    channel_dist = frappe.db.sql("""
        SELECT 
            COALESCE(imogi_menu_channel, '[NULL/Empty]') as channel,
            COUNT(*) as count
        FROM `tabItem`
        WHERE disabled = 0
            AND is_sales_item = 1
            AND (variant_of IS NULL OR variant_of = '')
        GROUP BY imogi_menu_channel
        ORDER BY count DESC
    """, as_dict=True)
    
    for row in channel_dist:
        print(f"  {row.channel}: {row.count} items")
    
    # Test 3: Check Restaurant Settings
    print("\n[3] Restaurant Settings:")
    print("-" * 40)
    
    try:
        settings = frappe.get_doc("Restaurant Settings", "Restaurant Settings")
        print(f"  enable_menu_channels: {settings.get('enable_menu_channels', 0)}")
        print(f"  use_native_variants: {settings.get('use_native_variants', 1)}")
    except Exception as e:
        print(f"  Error fetching settings: {e}")
    
    # Test 4: Test API with different menu_channel values
    print("\n[4] Testing get_template_items API:")
    print("-" * 40)
    
    test_channels = [None, "", "Cashier", "cashier", "Self Order", "Kiosk", "All", "Both"]
    
    for channel in test_channels:
        try:
            result = frappe.call(
                "imogi_pos.api.variants.get_template_items",
                pos_profile=pos_profile,
                item_group=None,
                menu_channel=channel
            )
            
            items = result if isinstance(result, list) else result.get("message", [])
            count = len(items) if items else 0
            
            channel_display = f'"{channel}"' if channel else "None"
            print(f"  menu_channel={channel_display:15s} → {count} items")
            
            # Show sample items for successful calls
            if count > 0 and count <= 3:
                for item in items[:3]:
                    ch = item.get("imogi_menu_channel") or "[empty]"
                    print(f"    - {item.get('item_name')} (channel: {ch})")
                    
        except Exception as e:
            print(f"  menu_channel=\"{channel}\" → ERROR: {str(e)[:60]}")
    
    # Test 5: Check POS Profile
    print("\n[5] POS Profile Check:")
    print("-" * 40)
    
    try:
        profile = frappe.get_doc("POS Profile", pos_profile)
        print(f"  Name: {profile.name}")
        print(f"  Disabled: {profile.disabled}")
        print(f"  Selling Price List: {profile.selling_price_list}")
        print(f"  Warehouse: {profile.warehouse}")
    except Exception as e:
        print(f"  Error: {e}")
    
    # Test 6: Sample items with all details
    print("\n[6] Sample Items (first 5):")
    print("-" * 40)
    
    sample_items = frappe.db.sql("""
        SELECT 
            name,
            item_name,
            item_group,
            imogi_menu_channel,
            disabled,
            is_sales_item,
            has_variants,
            variant_of
        FROM `tabItem`
        WHERE disabled = 0
            AND is_sales_item = 1
            AND (variant_of IS NULL OR variant_of = '')
        LIMIT 5
    """, as_dict=True)
    
    for item in sample_items:
        print(f"\n  Item: {item.item_name}")
        print(f"    Code: {item.name}")
        print(f"    Group: {item.item_group}")
        print(f"    Channel: {item.imogi_menu_channel or '[empty]'}")
        print(f"    Has Variants: {item.has_variants}")
    
    print("\n" + "="*80)
    print("DIAGNOSTIC COMPLETE")
    print("="*80 + "\n")


if __name__ == "__main__":
    # Run diagnostic with default POS Profile
    diagnose_catalog_items()
