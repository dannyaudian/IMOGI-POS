"""Installation helpers for IMOGI POS."""

import os
import json
import frappe


def after_install():
    """Run all post-installation tasks."""
    sync_pages()
    sync_workspace_fixtures()
    create_cash_accounts()


def after_migrate():
    """Run all post-migration tasks."""
    sync_pages()
    sync_workspace_fixtures()
    create_cash_accounts()


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
