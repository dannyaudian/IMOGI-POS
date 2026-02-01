#!/usr/bin/env python3
"""
IMOGI POS Quick Fix Script - Run in Frappe Console
==================================================

Auto-fixes common deployment issues:
- Creates missing Restaurant Settings
- Creates test items if catalog empty
- Creates POS Opening if missing
- Assigns default roles to users
- Clears problematic cache

Usage (Frappe Console):
    exec(open('apps/imogi_pos/scripts/quick_fix_production.py').read())
"""

import frappe
from frappe.utils import now, today, cint

def quick_fix():
    print("\n" + "="*60)
    print("🔧 IMOGI POS QUICK FIX")
    print("="*60 + "\n")
    
    fixes_applied = []
    
    # Fix 1: Restaurant Settings
    print("1️⃣  Checking Restaurant Settings...")
    try:
        settings = frappe.get_doc("Restaurant Settings", "Restaurant Settings")
        print("   ✅ Restaurant Settings exists")
    except frappe.DoesNotExistError:
        print("   ⚠️  Creating Restaurant Settings...")
        settings = frappe.get_doc({
            "doctype": "Restaurant Settings",
            "use_native_variants": 1,
            "enable_menu_channels": 1,
            "max_items_per_query": 500,
        })
        settings.insert(ignore_permissions=True)
        frappe.db.commit()
        print("   ✅ Restaurant Settings created")
        fixes_applied.append("Created Restaurant Settings")
    
    # Ensure proper values
    if not settings.get("use_native_variants"):
        settings.use_native_variants = 1
        settings.save(ignore_permissions=True)
        print("   ✅ Enabled native variants")
        fixes_applied.append("Enabled use_native_variants")
    
    # Fix 2: Check Item availability
    print("\n2️⃣  Checking Items...")
    sales_items = frappe.db.count("Item", {"is_sales_item": 1, "disabled": 0})
    
    if sales_items == 0:
        print("   ⚠️  No sales items found! Creating test items...")
        
        # Get or create default Item Group
        item_group = frappe.db.exists("Item Group", "Products")
        if not item_group:
            item_group = "All Item Groups"
        
        test_items = [
            {"code": "COFFEE-ESP", "name": "Espresso", "rate": 25000, "channel": "Cashier"},
            {"code": "COFFEE-LAT", "name": "Latte", "rate": 30000, "channel": "Cashier"},
            {"code": "FOOD-SAND", "name": "Sandwich", "rate": 35000, "channel": "Cashier"},
        ]
        
        has_channel_field = frappe.get_meta("Item").has_field("imogi_menu_channel")
        
        for item_data in test_items:
            if not frappe.db.exists("Item", item_data["code"]):
                item_doc = {
                    "doctype": "Item",
                    "item_code": item_data["code"],
                    "item_name": item_data["name"],
                    "item_group": item_group,
                    "stock_uom": "Unit",
                    "is_sales_item": 1,
                    "is_stock_item": 0,
                    "standard_rate": item_data["rate"],
                }
                
                if has_channel_field:
                    item_doc["imogi_menu_channel"] = item_data["channel"]
                
                item = frappe.get_doc(item_doc)
                item.insert(ignore_permissions=True)
                print(f"   ✅ Created test item: {item_data['name']}")
        
        frappe.db.commit()
        fixes_applied.append(f"Created {len(test_items)} test items")
    else:
        print(f"   ✅ Found {sales_items} sales items")
    
    # Fix 3: POS Profile check
    print("\n3️⃣  Checking POS Profiles...")
    pos_profiles = frappe.get_all("POS Profile", filters={"disabled": 0}, limit=1)
    
    if not pos_profiles:
        print("   ⚠️  No POS Profile found!")
        print("   Action: Create POS Profile manually via UI")
        print("   Path: POS Profile → New")
    else:
        profile_name = pos_profiles[0].name
        print(f"   ✅ Found POS Profile: {profile_name}")
        
        # Check if has domain set
        doc = frappe.get_doc("POS Profile", profile_name)
        if hasattr(doc, "imogi_pos_domain"):
            if not doc.imogi_pos_domain:
                doc.imogi_pos_domain = "Restaurant"
                doc.save(ignore_permissions=True)
                frappe.db.commit()
                print("   ✅ Set domain to 'Restaurant'")
                fixes_applied.append(f"Set domain for {profile_name}")
        
        # Fix 4: POS Opening
        print("\n4️⃣  Checking POS Opening...")
        current_user = frappe.session.user
        
        active_opening = frappe.db.exists("POS Opening Entry", {
            "pos_profile": profile_name,
            "user": current_user,
            "docstatus": 1,
            "status": "Open"
        })
        
        if not active_opening:
            print(f"   ⚠️  No active opening for {current_user}")
            print(f"   Creating POS Opening for {profile_name}...")
            
            try:
                opening = frappe.get_doc({
                    "doctype": "POS Opening Entry",
                    "period_start_date": now(),
                    "posting_date": today(),
                    "user": current_user,
                    "pos_profile": profile_name,
                    "company": doc.company,
                })
                
                # Add opening balance if needed
                balance_details = []
                for mode in frappe.get_all("Mode of Payment", fields=["name"], limit=1):
                    balance_details.append({
                        "mode_of_payment": mode.name,
                        "opening_amount": 0
                    })
                
                opening.balance_details = balance_details
                opening.insert(ignore_permissions=True)
                opening.submit()
                frappe.db.commit()
                
                print(f"   ✅ Created POS Opening: {opening.name}")
                fixes_applied.append(f"Created POS Opening for {current_user}")
            except Exception as e:
                print(f"   ❌ Error creating opening: {str(e)}")
        else:
            print(f"   ✅ Active opening exists")
    
    # Fix 5: User roles
    print("\n5️⃣  Checking User Roles...")
    current_user = frappe.session.user
    roles = frappe.get_roles(current_user)
    
    required_roles = ["Cashier", "Sales User"]
    missing_roles = [r for r in required_roles if r not in roles]
    
    if missing_roles and current_user != "Administrator":
        print(f"   ⚠️  Adding missing roles: {', '.join(missing_roles)}")
        user_doc = frappe.get_doc("User", current_user)
        for role in missing_roles:
            user_doc.add_roles(role)
        fixes_applied.append(f"Added roles to {current_user}")
    else:
        print(f"   ✅ User has required roles")
    
    # Fix 6: Cache clear
    print("\n6️⃣  Clearing cache...")
    frappe.clear_cache()
    print("   ✅ Cache cleared")
    fixes_applied.append("Cleared cache")
    
    # Summary
    print("\n" + "="*60)
    print("📊 FIX SUMMARY")
    print("="*60)
    
    if fixes_applied:
        print(f"✅ Applied {len(fixes_applied)} fix(es):")
        for fix in fixes_applied:
            print(f"   - {fix}")
    else:
        print("✅ No fixes needed - system looks healthy")
    
    print("\n🎯 Next Steps:")
    print("   1. Reload browser (Ctrl+Shift+R)")
    print("   2. Access: /app/imogi-cashier")
    print("   3. Check catalog loads items")
    print("   4. Test create order workflow")
    print("="*60 + "\n")

# Run fixes
try:
    quick_fix()
except Exception as e:
    print(f"\n❌ ERROR DURING FIX:")
    print(f"{str(e)}")
    import traceback
    traceback.print_exc()
    print("\nSome fixes may have been applied. Check individual steps above.")
