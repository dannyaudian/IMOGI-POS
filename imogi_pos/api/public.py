# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import now, nowdate, get_url, flt
from imogi_pos.utils.branding import (
    PRIMARY_COLOR,
    ACCENT_COLOR,
    HEADER_BG_COLOR,
)
from imogi_pos.utils.permissions import validate_branch_access

__all__ = [
    "health",
    "get_branding",
    "get_active_branch",
    "set_active_branch",
    "check_session",
    "get_current_user_info",
    "check_permission",
    "record_opening_balance",
    "get_cashier_device_sessions",
]

@frappe.whitelist(allow_guest=True)
def health():
    """
    Simple health check endpoint to verify the service is running.
    
    Returns:
        dict: Status information including timestamp and app version
    """
    return {
        "status": "ok",
        "timestamp": now(),
        "app_version": frappe.get_app_version("imogi_pos"),
        "server": get_url()
    }

@frappe.whitelist()
def get_branding(pos_profile=None):
    """
    Get branding information based on the provided POS Profile or fallback
    to global settings.
    
    Args:
        pos_profile (str, optional): Name of the POS Profile. Defaults to None.
    
    Returns:
        dict: Branding information including logo URLs and colors
    """
    result = {
        "brand_name": frappe.defaults.get_global_default('company') or "IMOGI POS",
        "logo": None,
        "logo_dark": None,
        "primary_color": PRIMARY_COLOR,
        "accent_color": ACCENT_COLOR,
        "header_bg": HEADER_BG_COLOR,
        "show_header": True,
        "home_url": get_url(),
        "css_vars": ""
    }
    
    # Try to get branding from POS Profile
    if pos_profile:
        try:
            profile = frappe.get_doc("POS Profile", pos_profile)
            
            if profile.get("imogi_brand_name"):
                result["brand_name"] = profile.imogi_brand_name
                
            if profile.get("imogi_brand_logo"):
                result["logo"] = profile.imogi_brand_logo
                
            if profile.get("imogi_brand_logo_dark"):
                result["logo_dark"] = profile.imogi_brand_logo_dark
                
            if profile.get("imogi_brand_color_primary"):
                result["primary_color"] = profile.imogi_brand_color_primary
                
            if profile.get("imogi_brand_color_accent"):
                result["accent_color"] = profile.imogi_brand_color_accent
                
            if profile.get("imogi_brand_header_bg"):
                result["header_bg"] = profile.imogi_brand_header_bg
                
            if profile.get("imogi_show_header_on_pages") is not None:
                result["show_header"] = profile.imogi_show_header_on_pages
                
            if profile.get("imogi_brand_home_url"):
                result["home_url"] = profile.imogi_brand_home_url
                
            if profile.get("imogi_brand_css_vars"):
                result["css_vars"] = profile.imogi_brand_css_vars
                
        except frappe.DoesNotExistError:
            frappe.log_error(f"POS Profile {pos_profile} not found for branding")

    # Fallback to Restaurant Settings if POS Profile doesn't have branding
    if not result["logo"]:
        try:
            restaurant_settings = frappe.get_doc("Restaurant Settings")
            if restaurant_settings.get("imogi_brand_logo"):
                result["logo"] = restaurant_settings.imogi_brand_logo

            if restaurant_settings.get("imogi_brand_logo_dark"):
                result["logo_dark"] = restaurant_settings.imogi_brand_logo_dark
        except frappe.DoesNotExistError:
            frappe.log_error("Restaurant Settings not found for branding")
        except Exception as err:
            frappe.log_error(f"Unexpected error loading Restaurant Settings for branding: {err}")
    
    # Final fallback to company logo
    if not result["logo"]:
        company = frappe.defaults.get_global_default('company')
        if company:
            company_logo = frappe.get_value("Company", company, "company_logo")
            if company_logo:
                result["logo"] = company_logo
    
    # Format URLs for logo paths
    if result["logo"] and not result["logo"].startswith(("http:", "https:", "/")):
        result["logo"] = get_url(result["logo"])

    if result["logo_dark"] and not result["logo_dark"].startswith(("http:", "https:", "/")):
        result["logo_dark"] = get_url(result["logo_dark"])

    return result


@frappe.whitelist()
def get_active_branch():
    """Return the active branch for the current user.

    Checks the user's default branch setting and falls back to the branch
    associated with their default POS Profile.

    Returns:
        str | None: Branch name if available.
    """

    branch = frappe.defaults.get_user_default("imogi_branch")
    if branch:
        return branch

    pos_profile = frappe.defaults.get_user_default("imogi_pos_profile")
    if pos_profile:
        branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
        if branch:
            return branch

    return None


@frappe.whitelist()
def set_active_branch(branch):
    """Persist the user's active branch after verifying access rights.

    Args:
        branch (str): Branch name to set as active.

    Returns:
        str | None: The branch that was set, or ``None`` if input was falsy.
    """

    if not branch:
        return None

    validate_branch_access(branch)
    frappe.defaults.set_user_default("imogi_branch", branch)
    return branch


@frappe.whitelist(allow_guest=True)
def check_session():
    """Check if the current session is valid.

    Returns:
        dict: Session information with validity flag.
    """

    user = getattr(frappe.session, "user", "Guest")
    if user and user != "Guest":
        return {
            "valid": True,
            "user": user,
        }

    return {
        "valid": False,
        "user": "Guest",
    }


@frappe.whitelist()
def get_current_user_info():
    """Return information about the currently logged-in user.

    Returns:
        dict: User details including full name and roles.
    """

    user = frappe.session.user
    if not user or user == "Guest":
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    user_doc = frappe.get_doc("User", user)
    return {
        "user": user,
        "full_name": user_doc.full_name,
        "email": user_doc.email,
        "roles": frappe.get_roles(user),
    }


@frappe.whitelist()
def check_permission(doctype, perm_type="read"):
    """Check if current user has the given permission on a DocType.

    Args:
        doctype (str): DocType to check.
        perm_type (str): Permission type like read, write, create, etc.

    Returns:
        bool: ``True`` if user has permission, else ``False``.
    """

    if frappe.session.user == "Guest":
        return False

    return bool(frappe.has_permission(doctype=doctype, permtype=perm_type))


@frappe.whitelist()
def record_opening_balance(device_type, opening_balance, denominations=None):
    """Record the opening balance for a user's device session.

    Args:
        device_type (str): Jenis perangkat kasir.
        opening_balance (float): Total saldo pembukaan.
        denominations (list | None): Rincian pecahan uang yang diterima.
    """
    from frappe.utils import flt, now, nowdate
    from frappe import _
    import frappe

    user = frappe.session.user

    # --- Cegah multi device aktif untuk user
    cache = frappe.cache()
    if cache.hget("active_devices", user):
        frappe.throw(_("Active device already registered for user"))

    # --- Validasi input
    opening_balance = flt(opening_balance)
    if opening_balance <= 0:
        frappe.throw(_("Opening balance must be greater than 0"))

    # --- Buat record sesi device (akan ikut rollback bila error di bawah)
    doc = frappe.get_doc({
        "doctype": "Cashier Device Session",
        "user": user,
        "device": device_type,
        "opening_balance": opening_balance,
        "timestamp": now(),
    })
    doc.insert(ignore_permissions=True)

    # --- Ambil / siapkan akun kas dari Restaurant Settings (auto-create bila kosong)
    settings = frappe.get_cached_doc("Restaurant Settings")
    big_cash_account = getattr(settings, "big_cash_account", None)
    petty_cash_account = getattr(settings, "petty_cash_account", None)

    if not big_cash_account or not petty_cash_account:
        # coba auto-create sesuai code kamu
        try:
            from imogi_pos.setup.install import create_cash_accounts
            create_cash_accounts()
        except Exception:
            # biarkan lanjut ke pengecekan & error user-friendly di bawah
            pass

        # refresh settings setelah auto-create
        settings = frappe.get_cached_doc("Restaurant Settings")
        big_cash_account = getattr(settings, "big_cash_account", None)
        petty_cash_account = getattr(settings, "petty_cash_account", None)

    if not big_cash_account or not petty_cash_account:
        frappe.throw(_(
            "Cash accounts are not configured in Restaurant Settings. "
            "Please configure big and petty cash accounts."
        ))

    company = (
        frappe.defaults.get_user_default("company")
        or frappe.defaults.get_global_default("company")
    )
    if not company:
        frappe.throw(_("Default Company is not set"))

    # --- Helper aturan sisi akun
    def account_rule(acc_name: str):
        acc = frappe.db.get_value(
            "Account", acc_name,
            ["root_type", "balance_must_be", "company"],
            as_dict=True,
        )
        if not acc:
            frappe.throw(_("Account {0} not found").format(acc_name))

        # Jika dikunci, pakai aturan kunci. Jika tidak, pakai default root_type.
        if acc.balance_must_be in ("Debit", "Credit"):
            normal_side = acc.balance_must_be
        else:
            # Default: Asset/Expense -> Debit ; Liability/Equity/Income -> Credit
            normal_side = "Credit" if acc.root_type in ("Liability", "Equity", "Income") else "Debit"

        return normal_side, acc

    def ensure_side_allowed(acc_name: str, side: str):
        must = frappe.db.get_value("Account", acc_name, "balance_must_be")
        if must in ("Debit", "Credit") and must != side:
            frappe.throw(_(
                "Account {0} is locked to {1} postings, cannot post {2}. "
                "Adjust Chart of Accounts / Restaurant Settings."
            ).format(acc_name, must, side))

    # --- Tentukan sisi yang dipakai: tambah saldo petty pada sisi normalnya
    petty_side, _ = account_rule(petty_cash_account)
    offset_side = "Credit" if petty_side == "Debit" else "Debit"

    # Validasi dua akun sesuai sisi yang akan diposting
    ensure_side_allowed(petty_cash_account, petty_side)
    ensure_side_allowed(big_cash_account, offset_side)

    # --- Susun baris JE sesuai aturan sisi
    petty_row = {
        "account": petty_cash_account,
        "reference_type": "Cashier Device Session",
        "reference_name": doc.name,
    }
    offset_row = {
        "account": big_cash_account,
        "reference_type": "Cashier Device Session",
        "reference_name": doc.name,
    }

    if petty_side == "Debit":
        petty_row["debit_in_account_currency"] = opening_balance
        petty_row["credit_in_account_currency"] = 0
        offset_row["credit_in_account_currency"] = opening_balance
        offset_row["debit_in_account_currency"] = 0
    else:
        # Jika petty direquire Credit, balik sisi
        petty_row["credit_in_account_currency"] = opening_balance
        petty_row["debit_in_account_currency"] = 0
        offset_row["debit_in_account_currency"] = opening_balance
        offset_row["credit_in_account_currency"] = 0

    # --- Buat & submit Journal Entry
    je = frappe.new_doc("Journal Entry")
    je.voucher_type = "Cash Entry"  # atau "Journal Entry" sesuai kebijakan
    je.posting_date = nowdate()
    je.company = company
    je.append("accounts", petty_row)
    je.append("accounts", offset_row)

    je.insert(ignore_permissions=True)
    je.submit()

    # Simpan relasi JE pada sesi (jika field tersedia)
    if doc.meta.get_field("journal_entry"):
        doc.db_set("journal_entry", je.name)

    # --- SET LOCK cache SETELAH semua sukses agar tidak nyangkut bila error di atas
    cache.hset("active_devices", user, device_type)

    return {"status": "ok"}




@frappe.whitelist(allow_guest=True)
def get_cashier_device_sessions(limit=5, device=None):
    """Retrieve recent cashier device sessions for the current user.

    Args:
        limit (int, optional): Number of records to fetch. Defaults to 5.
        device (str, optional): Device type to filter sessions by. Defaults to None.

    Returns:
        list[dict]: List of session records.
    """

    user = frappe.session.user
    filters = {"user": user}

    if device:
        filters["device"] = device

    return frappe.get_all(
        "Cashier Device Session",
        filters=filters,
        fields=["name", "device", "opening_balance", "timestamp", "user"],
        order_by="timestamp desc",
        limit=limit,
    )

