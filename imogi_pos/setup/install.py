"""Installation helpers for IMOGI POS."""

import os
import json
import frappe


def after_install():
    """Run all post-installation tasks."""
    sync_pages()
    sync_workspace_fixtures()
    create_cash_accounts()
    create_default_menu_categories()
    create_default_kitchen_setup()
    create_default_customer_settings()
    create_default_brand_profile()


def after_migrate():
    """Run all post-migration tasks."""
    sync_pages()
    sync_workspace_fixtures()
    create_cash_accounts()
    create_default_menu_categories()
    create_default_kitchen_setup()
    create_default_customer_settings()
    create_default_brand_profile()


def sync_pages():
    """Sync Page doctypes from the pages folder.

    Pages require developer mode to be created normally, but we need them
    in production. This function bypasses that check by using internal flags.
    """
    app_path = frappe.get_app_path("imogi_pos")
    pages_path = os.path.join(app_path, "pages")

    if not os.path.exists(pages_path):
        return

    for page_folder in os.listdir(pages_path):
        # Skip non-page folders
        if page_folder.startswith("_"):
            continue

        page_path = os.path.join(pages_path, page_folder)
        if not os.path.isdir(page_path):
            continue

        json_file = os.path.join(page_path, f"{page_folder}.json")
        if not os.path.exists(json_file):
            continue

        with open(json_file, "r") as f:
            page_data = json.load(f)

        page_name = page_data.get("name")
        if not page_name:
            continue

        # Check if page already exists
        if frappe.db.exists("Page", page_name):
            # Update existing page
            existing = frappe.get_doc("Page", page_name)
            for key, value in page_data.items():
                if key not in ("doctype", "name", "creation", "modified", "modified_by", "owner"):
                    setattr(existing, key, value)
            existing.flags.ignore_validate = True
            existing.flags.ignore_permissions = True
            existing.save()
        else:
            # Create new page with bypass flags
            page_doc = frappe.get_doc(page_data)
            page_doc.flags.ignore_validate = True
            page_doc.flags.ignore_permissions = True
            page_doc.insert()

        frappe.db.commit()


def sync_workspace_fixtures():
    """Sync Workspace fixtures from workspaces.json."""
    app_path = frappe.get_app_path("imogi_pos")
    fixtures_path = os.path.join(app_path, "fixtures")
    workspaces_file = os.path.join(fixtures_path, "workspaces.json")
    
    if not os.path.exists(workspaces_file):
        frappe.logger().warning(f"Workspaces fixture file not found: {workspaces_file}")
        return
    
    try:
        with open(workspaces_file, "r") as f:
            workspaces_data = json.load(f)
        
        if not isinstance(workspaces_data, list):
            frappe.logger().error("Workspaces fixture must be a JSON array")
            return
        
        for workspace_data in workspaces_data:
            workspace_name = workspace_data.get("name")
            if not workspace_name:
                continue
            
            # Check if workspace already exists
            if frappe.db.exists("Workspace", workspace_name):
                # Update existing workspace
                existing = frappe.get_doc("Workspace", workspace_name)
                for key, value in workspace_data.items():
                    if key not in ("doctype", "name", "creation", "modified", "modified_by", "owner"):
                        if key == "content" and isinstance(value, str):
                            # Keep content as-is (it's JSON string)
                            setattr(existing, key, value)
                        else:
                            setattr(existing, key, value)
                existing.flags.ignore_validate = True
                existing.flags.ignore_permissions = True
                existing.save()
                frappe.logger().info(f"Updated workspace: {workspace_name}")
            else:
                # Create new workspace
                workspace_doc = frappe.get_doc(workspace_data)
                workspace_doc.flags.ignore_validate = True
                workspace_doc.flags.ignore_permissions = True
                workspace_doc.insert()
                frappe.logger().info(f"Created workspace: {workspace_name}")
            
            frappe.db.commit()
    
    except Exception as e:
        frappe.logger().error(f"Error syncing workspace fixtures: {str(e)}")


def create_cash_accounts():
    """Ensure required cash accounts exist for each company.

    Creates "Kas Besar" and "Kas Kecil" accounts under the "Cash" group for
    every Company if missing. Also updates the single Restaurant Settings
    document with the created account names.
    """
    companies = frappe.get_all("Company", pluck="name")
    if not companies:
        return

    big_cash_name = None
    petty_cash_name = None

    for company in companies:
        cash_group = frappe.db.get_value(
            "Account",
            {"account_name": "Cash", "company": company, "is_group": 1},
            "name",
        )
        if not cash_group:
            continue

        for label, flag in (("Kas Besar", "big"), ("Kas Kecil", "petty")):
            account_name = frappe.db.get_value(
                "Account",
                {"account_name": label, "company": company},
                "name",
            )
            if not account_name:
                account_doc = frappe.get_doc(
                    {
                        "doctype": "Account",
                        "account_name": label,
                        "parent_account": cash_group,
                        "company": company,
                        "is_group": 0,
                        "account_type": "Cash",
                        "root_type": "Asset",
                    }
                )
                account_doc.insert(ignore_permissions=True)
                account_name = account_doc.name

            if flag == "big" and not big_cash_name:
                big_cash_name = account_name
            if flag == "petty" and not petty_cash_name:
                petty_cash_name = account_name

    if big_cash_name or petty_cash_name:
        settings = frappe.get_single("Restaurant Settings")
        if big_cash_name:
            settings.big_cash_account = big_cash_name
        if petty_cash_name:
            settings.petty_cash_account = petty_cash_name
        settings.save(ignore_permissions=True)


def create_default_menu_categories():
    """Create default menu categories if they don't exist."""
    default_categories = [
        {"name": "Appetizer", "sort": 10, "icon": "🥗", "description": "Starters and small plates"},
        {"name": "Main Course", "sort": 20, "icon": "🍽️", "description": "Main dishes"},
        {"name": "Dessert", "sort": 30, "icon": "🍰", "description": "Sweet treats"},
        {"name": "Beverage", "sort": 40, "icon": "🥤", "description": "Drinks"},
        {"name": "Special", "sort": 50, "icon": "⭐", "description": "Special items"},
        {"name": "Coffee", "sort": 60, "icon": "☕", "description": "Coffee drinks"},
        {"name": "Tea", "sort": 70, "icon": "🍵", "description": "Tea beverages"}
    ]
    
    created_count = 0
    for cat in default_categories:
        if not frappe.db.exists("Menu Category", cat["name"]):
            try:
                doc = frappe.get_doc({
                    "doctype": "Menu Category",
                    "category_name": cat["name"],
                    "sort_order": cat["sort"],
                    "icon": cat["icon"],
                    "description": cat.get("description", ""),
                    "is_active": 1
                })
                doc.insert(ignore_permissions=True)
                created_count += 1
            except Exception as e:
                frappe.logger().error(f"Error creating menu category {cat['name']}: {str(e)}")
    
    if created_count > 0:
        frappe.db.commit()
        frappe.logger().info(f"Created {created_count} default menu categories")


def create_default_kitchen_setup():
    """Create default Kitchen and Station setup to eliminate chicken-egg problem."""
    # Only create if Restaurant domain is active
    if "Restaurant" not in frappe.get_active_domains():
        return
    
    # Get or create default branch
    default_branch = frappe.db.get_value("Branch", {"is_group": 0}, "name")
    if not default_branch:
        # Check if any company exists
        company = frappe.db.get_value("Company", {}, "name")
        if company:
            try:
                branch_doc = frappe.get_doc({
                    "doctype": "Branch",
                    "branch": "Main Branch",
                    "company": company
                })
                branch_doc.insert(ignore_permissions=True)
                default_branch = branch_doc.name
            except Exception as e:
                frappe.logger().error(f"Error creating default branch: {str(e)}")
                return
    
    if not default_branch:
        return
    
    # Create default Kitchen if not exists
    kitchen_name = "Main Kitchen"
    if not frappe.db.exists("Kitchen", kitchen_name):
        try:
            kitchen_doc = frappe.get_doc({
                "doctype": "Kitchen",
                "kitchen_name": kitchen_name,
                "branch": default_branch,
                "description": "Default kitchen (auto-created)",
                "is_active": 1,
                "default_target_queue_time": 5,
                "default_target_prep_time": 10
            })
            kitchen_doc.insert(ignore_permissions=True)
            frappe.logger().info(f"Created default kitchen: {kitchen_name}")
        except Exception as e:
            frappe.logger().error(f"Error creating default kitchen: {str(e)}")
            return
    
    # Create default Kitchen Station if not exists
    station_name = "Main Station"
    if not frappe.db.exists("Kitchen Station", station_name):
        try:
            station_doc = frappe.get_doc({
                "doctype": "Kitchen Station",
                "station_name": station_name,
                "kitchen": kitchen_name,
                "branch": default_branch,
                "description": "Default station (auto-created)",
                "is_active": 1,
                "interface": "OS"
            })
            station_doc.insert(ignore_permissions=True)
            frappe.logger().info(f"Created default kitchen station: {station_name}")
        except Exception as e:
            frappe.logger().error(f"Error creating default station: {str(e)}")
            return
    
    # Link Kitchen to default Station (solve chicken-egg problem)
    kitchen_doc = frappe.get_doc("Kitchen", kitchen_name)
    if not kitchen_doc.default_station:
        kitchen_doc.default_station = station_name
        kitchen_doc.save(ignore_permissions=True)
        frappe.logger().info(f"Linked Kitchen '{kitchen_name}' to Station '{station_name}'")
    
    # Update Restaurant Settings with defaults
    try:
        settings = frappe.get_single("Restaurant Settings")
        if not settings.enable_kot:
            settings.enable_kot = 1
            settings.save(ignore_permissions=True)
            frappe.logger().info("Enabled KOT in Restaurant Settings")
    except Exception as e:
        frappe.logger().error(f"Error updating Restaurant Settings: {str(e)}")
    
    frappe.db.commit()


def create_default_customer_settings():
    """Create default customer classifications and age ranges."""
    # Create Customer Classifications (replacing hardcoded "Berkeluarga/Tidak Berkeluarga")
    default_classifications = [
        {"name": "Single", "sort": 10, "icon": "👤", "description": "Single individual"},
        {"name": "Family", "sort": 20, "icon": "👨‍👩‍👧‍👦", "description": "Family with dependents"},
        {"name": "Couple", "sort": 30, "icon": "👫", "description": "Couple"},
        {"name": "Group", "sort": 40, "icon": "👥", "description": "Group of people"}
    ]
    
    created_count = 0
    for cls in default_classifications:
        if not frappe.db.exists("Customer Classification", cls["name"]):
            try:
                doc = frappe.get_doc({
                    "doctype": "Customer Classification",
                    "classification_name": cls["name"],
                    "sort_order": cls["sort"],
                    "icon": cls["icon"],
                    "description": cls.get("description", ""),
                    "is_active": 1
                })
                doc.insert(ignore_permissions=True)
                created_count += 1
            except Exception as e:
                frappe.logger().error(f"Error creating customer classification {cls['name']}: {str(e)}")
    
    if created_count > 0:
        frappe.logger().info(f"Created {created_count} default customer classifications")
    
    # Create Customer Age Ranges (replacing hardcoded "< 10\n11 - 19\n20 - 29\n30 >")
    default_age_ranges = [
        {"name": "Child (< 10)", "min": 0, "max": 10, "sort": 10},
        {"name": "Teen (11-19)", "min": 11, "max": 19, "sort": 20},
        {"name": "Young Adult (20-29)", "min": 20, "max": 29, "sort": 30},
        {"name": "Adult (30-49)", "min": 30, "max": 49, "sort": 40},
        {"name": "Senior (50+)", "min": 50, "max": 999, "sort": 50}
    ]
    
    created_count = 0
    for age_range in default_age_ranges:
        if not frappe.db.exists("Customer Age Range", age_range["name"]):
            try:
                doc = frappe.get_doc({
                    "doctype": "Customer Age Range",
                    "range_name": age_range["name"],
                    "min_age": age_range["min"],
                    "max_age": age_range["max"],
                    "sort_order": age_range["sort"],
                    "description": f"Age range from {age_range['min']} to {age_range['max']}",
                    "is_active": 1
                })
                doc.insert(ignore_permissions=True)
                created_count += 1
            except Exception as e:
                frappe.logger().error(f"Error creating age range {age_range['name']}: {str(e)}")
    
    if created_count > 0:
        frappe.logger().info(f"Created {created_count} default age ranges")
    
    frappe.db.commit()


def create_default_brand_profile():
    """Create default Brand Profile if none exists."""
    # Check if any Brand Profile exists
    if frappe.db.exists("Brand Profile"):
        return
    
    try:
        # Create default Brand Profile
        brand_profile = frappe.get_doc({
            "doctype": "Brand Profile",
            "brand_name": "IMOGI POS",
            "brand_code": "IMOGI",
            "description": "Default brand profile for IMOGI POS",
            "status": "Active",
            "primary_color": "#4c5a67",
            "accent_color": "#2490ef",
            "header_bg_color": "#ffffff"
        })
        brand_profile.insert(ignore_permissions=True)
        frappe.logger().info("Created default Brand Profile: IMOGI POS")
        
        # Link to Restaurant Settings if it exists
        if frappe.db.exists("Restaurant Settings", "Restaurant Settings"):
            settings = frappe.get_single("Restaurant Settings")
            if not settings.get('brand_profile'):
                settings.brand_profile = brand_profile.name
                settings.save(ignore_permissions=True)
                frappe.logger().info("Linked default Brand Profile to Restaurant Settings")
        
        frappe.db.commit()
    
    except Exception as e:
        frappe.logger().error(f"Error creating default brand profile: {str(e)}")
    frappe.db.commit()
