#!/usr/bin/env python3
"""
IMOGI POS Diagnostic Script - Run in Frappe Console
==========================================

Usage:
1. Login to Frappe Cloud site
2. Open Console (or SSH: bench console)
3. Paste this entire script
4. Check output for issues

This script checks:
- POS Profile configuration
- Item availability & menu channels
- Custom fields existence
- Restaurant settings
- User roles & permissions
- Active POS Opening
"""

import frappe
from frappe.utils import now, cint
import json

def diagnose_imogi_pos():
    print("\n" + "="*60)
    print("🔍 IMOGI POS DIAGNOSTIC REPORT")
    print("="*60 + "\n")
    
    # 1. Site Info
    print("📍 SITE INFORMATION")
    print("-" * 60)
    print(f"Site: {frappe.local.site}")
    print(f"Frappe Version: {frappe.__version__}")
    print(f"Current User: {frappe.session.user}")
    print(f"Timestamp: {now()}")
    print()
    
    # 2. App Installation
    print("📦 INSTALLED APPS")
    print("-" * 60)
    installed_apps = frappe.get_installed_apps()
    print(f"Total apps: {len(installed_apps)}")
    
    if "imogi_pos" in installed_apps:
        print("✅ imogi_pos: INSTALLED")
        try:
            from imogi_pos import __version__
            print(f"   Version: {__version__}")
        except:
            print("   Version: Unknown (check __init__.py)")
    else:
        print("❌ imogi_pos: NOT FOUND")
        print("   Action: Install app via bench get-app")
        return
    
    print(f"   Other apps: {', '.join([a for a in installed_apps if a not in ['frappe', 'imogi_pos']])}")
    print()
    
    # 3. Custom Fields
    print("🔧 CUSTOM FIELDS")
    print("-" * 60)
    
    critical_fields = [
        ("Item", "imogi_menu_channel"),
        ("POS Profile", "imogi_pos_domain"),
        ("POS Profile", "imogi_branch"),
        ("POS Opening Entry", "imogi_branch"),
    ]
    
    for doctype, fieldname in critical_fields:
        exists = frappe.get_meta(doctype).has_field(fieldname)
        status = "✅" if exists else "❌"
        print(f"{status} {doctype}.{fieldname}")
        
        if not exists and doctype == "Item" and fieldname == "imogi_menu_channel":
            print("   ⚠️  Menu channel filtering will be skipped (non-Restaurant OK)")
        elif not exists:
            print("   Action: Run 'bench migrate' or create custom field manually")
    print()
    
    # 4. Restaurant Settings
    print("⚙️  RESTAURANT SETTINGS")
    print("-" * 60)
    
    try:
        settings = frappe.get_cached_doc("Restaurant Settings", "Restaurant Settings")
        print(f"✅ Restaurant Settings exists")
        print(f"   use_native_variants: {settings.get('use_native_variants', 0)}")
        print(f"   enable_menu_channels: {settings.get('enable_menu_channels', 0)}")
        print(f"   max_items_per_query: {settings.get('max_items_per_query', 500)}")
        
        if not settings.get('use_native_variants'):
            print("   ⚠️  use_native_variants=0 (legacy mode)")
        if not settings.get('enable_menu_channels'):
            print("   ℹ️  Menu channels disabled (filter skipped for all domains)")
    except Exception as e:
        print(f"❌ Restaurant Settings not found")
        print(f"   Error: {str(e)}")
        print("   Action: Create 'Restaurant Settings' doctype or run fixtures")
    print()
    
    # 5. POS Profiles
    print("🏪 POS PROFILES")
    print("-" * 60)
    
    pos_profiles = frappe.get_all("POS Profile", 
        fields=["name", "company", "warehouse", "disabled"],
        filters={"disabled": 0}
    )
    
    if pos_profiles:
        print(f"✅ Found {len(pos_profiles)} active POS Profile(s)")
        for profile in pos_profiles:
            print(f"\n   Profile: {profile.name}")
            print(f"   Company: {profile.company}")
            print(f"   Warehouse: {profile.warehouse}")
            
            # Check custom fields
            doc = frappe.get_doc("POS Profile", profile.name)
            domain = getattr(doc, "imogi_pos_domain", None)
            branch = getattr(doc, "imogi_branch", None)
            
            if domain:
                print(f"   Domain: {domain}")
            else:
                print(f"   ⚠️  imogi_pos_domain not set (defaults to 'Restaurant')")
            
            if branch:
                print(f"   Branch: {branch}")
            
            # Check applicable users
            users = frappe.get_all("POS Profile User", 
                filters={"parent": profile.name},
                fields=["user"]
            )
            if users:
                print(f"   Users: {', '.join([u.user for u in users])}")
            else:
                print(f"   ⚠️  No users assigned to this profile")
    else:
        print("❌ No active POS Profiles found")
        print("   Action: Create at least one POS Profile")
    print()
    
    # 6. Items Check
    print("📦 ITEMS AVAILABILITY")
    print("-" * 60)
    
    # Check total items
    total_items = frappe.db.count("Item")
    print(f"Total Items: {total_items}")
    
    # Check sales items
    sales_items = frappe.db.count("Item", {"is_sales_item": 1, "disabled": 0})
    print(f"Sales Items (enabled): {sales_items}")
    
    # Check templates (has_variants)
    templates = frappe.db.count("Item", {
        "has_variants": 1, 
        "disabled": 0,
        "is_sales_item": 1
    })
    print(f"Template Items: {templates}")
    
    # Check menu channels (if field exists)
    if frappe.get_meta("Item").has_field("imogi_menu_channel"):
        channel_distribution = frappe.db.sql("""
            SELECT 
                COALESCE(imogi_menu_channel, '[NULL]') as channel,
                COUNT(*) as count
            FROM `tabItem`
            WHERE disabled = 0 AND is_sales_item = 1
            GROUP BY imogi_menu_channel
            ORDER BY count DESC
            LIMIT 10
        """, as_dict=1)
        
        if channel_distribution:
            print(f"\n   Channel Distribution:")
            for row in channel_distribution:
                print(f"   - {row.channel}: {row.count} items")
        else:
            print("   ⚠️  No items with menu channels")
    
    # Sample items
    sample_items = frappe.get_all("Item",
        filters={
            "disabled": 0,
            "is_sales_item": 1,
            "has_variants": ["in", [0, 1]]
        },
        fields=["name", "item_name", "standard_rate", "has_variants"],
        limit=5
    )
    
    if sample_items:
        print(f"\n   Sample Items:")
        for item in sample_items:
            variant_type = "Template" if item.has_variants else "Regular"
            print(f"   - {item.name} ({variant_type}): {item.standard_rate or 0}")
    else:
        print("\n   ❌ No sales items found!")
        print("   Action: Create at least one Item with is_sales_item=1")
    print()
    
    # 7. Active POS Opening
    print("🔓 ACTIVE POS OPENING")
    print("-" * 60)
    
    if pos_profiles:
        test_profile = pos_profiles[0].name
        
        active_openings = frappe.get_all("POS Opening Entry",
            filters={
                "pos_profile": test_profile,
                "docstatus": 1,
                "status": "Open"
            },
            fields=["name", "user", "posting_date", "period_start_date"],
            limit=5
        )
        
        if active_openings:
            print(f"✅ Found {len(active_openings)} active opening(s) for '{test_profile}'")
            for opening in active_openings:
                print(f"\n   Opening: {opening.name}")
                print(f"   User: {opening.user}")
                print(f"   Started: {opening.period_start_date}")
        else:
            print(f"⚠️  No active POS Opening for '{test_profile}'")
            print(f"   Action: Create POS Opening Entry or call resolve_active_pos_opening API")
    print()
    
    # 8. User Roles
    print("👤 USER ROLES & PERMISSIONS")
    print("-" * 60)
    
    current_user = frappe.session.user
    roles = frappe.get_roles(current_user)
    
    print(f"Current User: {current_user}")
    print(f"Roles: {', '.join(roles)}")
    
    required_roles_map = {
        "Cashier Console": ["Cashier", "Sales User"],
        "Kitchen Display": ["Kitchen User", "Restaurant Manager"],
        "Waiter App": ["Waiter", "Sales User"],
    }
    
    print("\nRole Requirements:")
    for app, required in required_roles_map.items():
        has_access = any(role in roles for role in required)
        status = "✅" if has_access else "❌"
        print(f"{status} {app}: {', '.join(required)}")
    
    # Check system manager
    if "System Manager" in roles:
        print("\n✅ System Manager role: Full access to all modules")
    print()
    
    # 9. API Endpoint Test
    print("🌐 API ENDPOINT TEST")
    print("-" * 60)
    
    if pos_profiles and sales_items > 0:
        test_profile = pos_profiles[0].name
        
        print(f"Testing get_template_items with profile '{test_profile}'...")
        try:
            from imogi_pos.api.variants import get_template_items
            
            items = get_template_items(
                pos_profile=test_profile,
                item_group=None,
                menu_channel="Cashier",
                limit=10
            )
            
            item_count = len(items) if items else 0
            print(f"✅ API Response: {item_count} items returned")
            
            if item_count == 0:
                print("   ⚠️  Zero items returned!")
                print("   Possible causes:")
                print("   - Menu channel filter too strict (check imogi_menu_channel)")
                print("   - Domain is not 'Restaurant' but filtering applied")
                print("   - All items have variant_of set (templates expected)")
                print("\n   Debug: Try calling with menu_channel=None")
                
                items_no_filter = get_template_items(
                    pos_profile=test_profile,
                    item_group=None,
                    menu_channel=None,
                    limit=10
                )
                no_filter_count = len(items_no_filter) if items_no_filter else 0
                print(f"   Without channel filter: {no_filter_count} items")
                
            elif item_count > 0:
                print(f"\n   Sample returned items:")
                for item in items[:3]:
                    print(f"   - {item.get('name')}: {item.get('item_name')}")
                    
        except Exception as e:
            print(f"❌ API Error: {str(e)}")
            print(f"   Action: Check backend logs or enable developer_mode")
    else:
        print("⚠️  Cannot test API: No POS Profile or no items")
    print()
    
    # 10. Workspace Pages
    print("📄 WORKSPACE PAGES")
    print("-" * 60)
    
    imogi_workspaces = frappe.get_all("Workspace",
        filters={"module": "IMOGI POS"},
        fields=["name", "title", "public"]
    )
    
    if imogi_workspaces:
        print(f"✅ Found {len(imogi_workspaces)} IMOGI workspace(s)")
        for ws in imogi_workspaces:
            visibility = "Public" if ws.public else "Private"
            print(f"   - {ws.title} ({visibility})")
    else:
        print("❌ No IMOGI workspaces found")
        print("   Action: Run 'bench migrate' to install fixtures")
    print()
    
    # 11. React Assets
    print("⚛️  REACT ASSETS")
    print("-" * 60)
    
    import os
    react_base = frappe.get_site_path("public", "react")
    
    expected_apps = [
        "cashier-console",
        "kitchen",
        "waiter",
        "kiosk",
        "self-order",
        "customer-display",
        "table-display",
        "module-select"
    ]
    
    if os.path.exists(react_base):
        for app in expected_apps:
            app_path = os.path.join(react_base, app, "static")
            exists = os.path.exists(app_path)
            status = "✅" if exists else "❌"
            print(f"{status} {app}")
            
            if not exists:
                print(f"   Action: Run 'npm run build' locally and re-deploy")
    else:
        print("❌ React assets directory not found")
        print(f"   Expected: {react_base}")
        print("   Action: Deploy with 'Build Assets' enabled in Frappe Cloud")
    print()
    
    # Summary
    print("="*60)
    print("📊 DIAGNOSTIC SUMMARY")
    print("="*60)
    
    issues = []
    
    if "imogi_pos" not in installed_apps:
        issues.append("App not installed")
    if not pos_profiles:
        issues.append("No POS Profiles configured")
    if sales_items == 0:
        issues.append("No sales items available")
    if not imogi_workspaces:
        issues.append("Workspaces not installed")
    
    if issues:
        print("❌ ISSUES FOUND:")
        for issue in issues:
            print(f"   - {issue}")
        print("\n   Recommended Actions:")
        print("   1. Run: bench migrate")
        print("   2. Run: bench clear-cache")
        print("   3. Create test data (POS Profile + Items)")
        print("   4. Re-deploy with 'Build Assets' enabled")
    else:
        print("✅ All critical components OK")
        print("   System ready for production use")
    
    print("\n" + "="*60)
    print("🎯 Next Steps:")
    print("   1. Review any ⚠️  warnings above")
    print("   2. Test API endpoints manually")
    print("   3. Access desk pages: /app/imogi-cashier")
    print("   4. Check browser console for JS errors")
    print("="*60 + "\n")

# Run diagnostic
try:
    diagnose_imogi_pos()
except Exception as e:
    print(f"\n❌ DIAGNOSTIC SCRIPT ERROR:")
    print(f"{str(e)}")
    print("\nPlease run this in Frappe Console with proper permissions.")
    import traceback
    traceback.print_exc()
