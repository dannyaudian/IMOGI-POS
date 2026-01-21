"""
Migration patch to update URLs from old structure to new architecture.

This patch updates:
- User default redirects
- Device configuration URLs
- Saved preferences
- Custom links
"""

import frappe
from frappe import _


def execute():
    """Execute the migration."""
    frappe.reload_doctype("User", force=True)
    
    # URL mapping for migration
    url_mapping = {
        "/create-order": "/restaurant/waiter",
        "/waiter_order": "/restaurant/waiter",
        "/kiosk": "/restaurant/waiter?mode=kiosk",
        "/cashier-console": "/counter/pos",
        "/customer-display": "/devices/displays",
        "/kitchen_display": "/restaurant/kitchen",
        "/table_display": "/restaurant/tables",
        "/imogi-login": "/shared/login",
        "/device-select": "/shared/device-select",
        "/service-select": "/shared/service-select",
        "/so": "/restaurant/self-order",
    }
    
    print("Starting URL migration...")
    
    # Update User defaults
    update_user_defaults(url_mapping)
    
    # Update Customer Display Device URLs
    update_customer_display_devices(url_mapping)
    
    # Update Kiosk Device URLs
    update_kiosk_devices(url_mapping)
    
    # Update custom links if any
    update_custom_links(url_mapping)
    
    # Clear cache to ensure new routes are loaded
    frappe.clear_cache()
    
    print("URL migration completed successfully!")


def update_user_defaults(url_mapping):
    """Update user default redirect URLs."""
    print("Updating user default redirects...")
    
    users_updated = 0
    for old_url, new_url in url_mapping.items():
        # Get users with old default redirect
        users = frappe.get_all(
            "DefaultValue",
            filters={
                "defkey": "default_redirect",
                "defvalue": old_url
            },
            fields=["parent"]
        )
        
        for user in users:
            frappe.db.set_value(
                "DefaultValue",
                {
                    "parent": user.parent,
                    "defkey": "default_redirect",
                    "defvalue": old_url
                },
                "defvalue",
                new_url
            )
            users_updated += 1
    
    if users_updated > 0:
        frappe.db.commit()
        print(f"  ✓ Updated {users_updated} user default redirects")
    else:
        print("  - No user defaults to update")


def update_customer_display_devices(url_mapping):
    """Update Customer Display Device configuration URLs."""
    if not frappe.db.exists("DocType", "Customer Display Device"):
        print("  - Customer Display Device DocType not found, skipping")
        return
    
    print("Updating Customer Display Device URLs...")
    
    devices_updated = 0
    devices = frappe.get_all("Customer Display Device", fields=["name"])
    
    for device in devices:
        doc = frappe.get_doc("Customer Display Device", device.name)
        updated = False
        
        # Check and update any URL fields
        for field in doc.meta.get("fields"):
            if field.fieldtype in ["Data", "Small Text"] and "url" in field.fieldname.lower():
                old_value = doc.get(field.fieldname)
                if old_value:
                    for old_url, new_url in url_mapping.items():
                        if old_url in old_value:
                            new_value = old_value.replace(old_url, new_url)
                            doc.set(field.fieldname, new_value)
                            updated = True
        
        if updated:
            doc.save(ignore_permissions=True)
            devices_updated += 1
    
    if devices_updated > 0:
        frappe.db.commit()
        print(f"  ✓ Updated {devices_updated} Customer Display Devices")
    else:
        print("  - No Customer Display Devices to update")


def update_kiosk_devices(url_mapping):
    """Update Kiosk Device configuration URLs."""
    if not frappe.db.exists("DocType", "Kiosk Device"):
        print("  - Kiosk Device DocType not found, skipping")
        return
    
    print("Updating Kiosk Device URLs...")
    
    devices_updated = 0
    devices = frappe.get_all("Kiosk Device", fields=["name"])
    
    for device in devices:
        doc = frappe.get_doc("Kiosk Device", device.name)
        updated = False
        
        # Check and update any URL fields
        for field in doc.meta.get("fields"):
            if field.fieldtype in ["Data", "Small Text"] and "url" in field.fieldname.lower():
                old_value = doc.get(field.fieldname)
                if old_value:
                    for old_url, new_url in url_mapping.items():
                        if old_url in old_value:
                            new_value = old_value.replace(old_url, new_url)
                            doc.set(field.fieldname, new_value)
                            updated = True
        
        if updated:
            doc.save(ignore_permissions=True)
            devices_updated += 1
    
    if devices_updated > 0:
        frappe.db.commit()
        print(f"  ✓ Updated {devices_updated} Kiosk Devices")
    else:
        print("  - No Kiosk Devices to update")


def update_custom_links(url_mapping):
    """Update custom links in Workspace, etc."""
    print("Updating custom links...")
    
    # Update Workspace links
    workspaces = frappe.get_all("Workspace", fields=["name"])
    workspaces_updated = 0
    
    for workspace in workspaces:
        doc = frappe.get_doc("Workspace", workspace.name)
        updated = False
        
        # Check Workspace Links
        for link in doc.get("links", []):
            if link.link_to:
                for old_url, new_url in url_mapping.items():
                    if old_url in link.link_to:
                        link.link_to = link.link_to.replace(old_url, new_url)
                        updated = True
        
        if updated:
            doc.save(ignore_permissions=True)
            workspaces_updated += 1
    
    if workspaces_updated > 0:
        frappe.db.commit()
        print(f"  ✓ Updated {workspaces_updated} Workspaces")
    else:
        print("  - No Workspaces to update")
