# -*- coding: utf-8 -*-
"""
IMOGI POS - POS Opening resolver
Single source of truth for active POS Opening Entry resolution.
"""

from typing import Any, Dict, List, Optional

import frappe


def _resolve_pos_opening_date_field() -> str:
    """Resolve date field name for POS Opening Entry (dynamic compatibility)."""
    if frappe.db.has_column("POS Opening Entry", "posting_date"):
        return "posting_date"
    if frappe.db.has_column("POS Opening Entry", "period_start_date"):
        return "period_start_date"
    return "creation"


def _resolve_currency_for_opening(opening_name: str) -> str:
    """
    Resolve currency for POS Opening Entry (ERPNext v15+ compatibility).
    
    Fallback hierarchy:
    1. Company.default_currency (via POS Opening Entry.company field)
    2. Company.default_currency (via POS Opening Entry.pos_profile → POS Profile.company)
    3. Global default currency (frappe.defaults.get_global_default("currency"))
    4. USD (international standard fallback with warning)
    
    Note: We use USD as final fallback (not regional currency like IDR) because
    ERPNext is an international framework. USD is the most common default in
    multi-currency scenarios. Proper configuration should set Company.default_currency.
    
    Args:
        opening_name: Name of POS Opening Entry
    
    Returns:
        Currency code (e.g., 'IDR', 'USD', 'EUR')
    
    Raises:
        No exception raised - always returns valid currency code
    """
    try:
        # Priority 1: Get company directly from POS Opening Entry
        # This is the most direct and accurate source
        company_name = frappe.db.get_value(
            "POS Opening Entry",
            opening_name,
            "company"
        )
        
        # Priority 2: If company not in opening, get from POS Profile
        if not company_name:
            pos_profile_name = frappe.db.get_value(
                "POS Opening Entry",
                opening_name,
                "pos_profile"
            )
            
            if pos_profile_name:
                company_name = frappe.db.get_value(
                    "POS Profile",
                    pos_profile_name,
                    "company"
                )
        
        # Get currency from Company
        if company_name:
            currency = frappe.db.get_value(
                "Company",
                company_name,
                "default_currency"
            )
            
            if currency:
                frappe.logger("imogi_pos").debug(
                    f"[pos_opening] Resolved currency from Company '{company_name}': {currency} "
                    f"(opening: {opening_name})"
                )
                return currency
            else:
                # Company exists but no default_currency configured
                frappe.logger("imogi_pos").warning(
                    f"[pos_opening] Company '{company_name}' has no default_currency set. "
                    f"Opening: {opening_name}. "
                    f"Action: Set default currency in Company '{company_name}' master."
                )
        else:
            # No company found at all
            frappe.logger("imogi_pos").warning(
                f"[pos_opening] No company found for opening {opening_name}. "
                f"Action: Ensure POS Opening Entry has company field or POS Profile has company."
            )
        
        # Priority 3: Global default currency
        global_currency = frappe.defaults.get_global_default("currency")
        if global_currency:
            frappe.logger("imogi_pos").info(
                f"[pos_opening] Using global default currency: {global_currency} "
                f"(opening: {opening_name}). "
                f"Hint: Configure Company.default_currency for proper accounting."
            )
            return global_currency
        
        # Priority 4: International standard fallback (USD)
        # Rationale: ERPNext is international framework, USD most common in multi-currency
        frappe.logger("imogi_pos").warning(
            f"[pos_opening] No currency configured anywhere for opening {opening_name}. "
            f"Using USD fallback. "
            f"Action: Configure Company.default_currency in Company master OR "
            f"set global default via 'System Settings → Currency'."
        )
        return "USD"
        
    except Exception as e:
        # Log error but don't crash - return safe fallback
        frappe.log_error(
            title="IMOGI POS: Currency Resolution Error",
            message=(
                f"Error resolving currency for opening: {opening_name}\n"
                f"Error Type: {type(e).__name__}\n"
                f"Error: {str(e)}\n\n"
                f"Fallback: Using USD\n\n"
                f"Action Required:\n"
                f"1. Check Company master has default_currency set\n"
                f"2. Verify POS Opening Entry '{opening_name}' has valid company/pos_profile\n"
                f"3. Set global default currency if needed"
            )
        )
        return "USD"


def _check_currency_field_exists() -> bool:
    """
    Check if 'currency' field exists in POS Opening Entry Detail.
    
    Uses frappe.get_meta() first (preferred, more accurate for custom fields),
    falls back to frappe.db.has_column() if meta is unavailable.
    
    Failure mode: If both methods fail, returns False (assume ERPNext v15+ behavior)
    to allow graceful degradation with currency fallback.
    
    Returns:
        bool: True if currency field exists, False otherwise
    """
    doctype = "POS Opening Entry Detail"
    field_name = "currency"
    
    # Priority 1: Use get_meta (more accurate, includes custom fields)
    try:
        meta = frappe.get_meta(doctype)
        if meta:
            has_field = meta.has_field(field_name)
            frappe.logger("imogi_pos").debug(
                f"[pos_opening] Field check via get_meta: {doctype}.{field_name} = {has_field}"
            )
            return has_field
    except frappe.DoesNotExistError:
        # DocType tidak ada - lanjut ke fallback
        frappe.logger("imogi_pos").debug(
            f"[pos_opening] DocType {doctype} not found in get_meta, trying has_column"
        )
    except frappe.PermissionError:
        # Permission issue - lanjut ke fallback
        frappe.logger("imogi_pos").debug(
            f"[pos_opening] Permission error on get_meta for {doctype}, trying has_column"
        )
    except Exception as e:
        # Unexpected error (e.g., during install, cache issue) - lanjut ke fallback
        frappe.logger("imogi_pos").debug(
            f"[pos_opening] get_meta failed for {doctype}: {str(e)}, trying has_column"
        )
    
    # Priority 2: Fallback to DB column check
    try:
        has_column = frappe.db.has_column(doctype, field_name)
        frappe.logger("imogi_pos").debug(
            f"[pos_opening] Field check via has_column: {doctype}.{field_name} = {has_column}"
        )
        return has_column
    except Exception as e:
        # If both methods fail, assume field doesn't exist (ERPNext v15+ default)
        # This allows graceful degradation with currency fallback
        frappe.logger("imogi_pos").info(
            f"[pos_opening] Could not check field existence for {doctype}.{field_name} "
            f"(both get_meta and has_column failed). Assuming False (ERPNext v15+ default). "
            f"Error: {str(e)}"
        )
        return False


def _fetch_balance_details(opening_name: str) -> List[Dict[str, Any]]:
    """
    Fetch balance details dari POS Opening Entry Detail.
    
    ERPNext v15+ Compatibility:
    - Field 'currency' removed from child table in v15+
    - Currency resolved dari parent: POS Opening Entry → Company
    - Dynamic field detection for backward compatibility
    
    Output Contract:
    - Always returns list of dict with keys: mode_of_payment, opening_amount, currency
    - 'currency' key is guaranteed (either from field or fallback)
    
    Returns:
        List[Dict[str, Any]]: Balance details with currency
    
    Raises:
        frappe.ValidationError: If query fails (logged with context)
    """
    if not opening_name:
        return []
    
    # Early exit if DocType doesn't exist
    if not frappe.db.exists("DocType", "POS Opening Entry Detail"):
        frappe.logger("imogi_pos").debug(
            "[pos_opening] POS Opening Entry Detail DocType not found, returning empty list"
        )
        return []
    
    # Build dynamic fields list (ERPNext v15+ best practice)
    base_fields = ["mode_of_payment", "opening_amount"]
    
    # Check if currency field exists (backward compatibility)
    has_currency_field = _check_currency_field_exists()
    
    if has_currency_field:
        base_fields.append("currency")
    
    # Query balance details
    try:
        details = frappe.get_all(
            "POS Opening Entry Detail",
            filters={"parent": opening_name},
            fields=base_fields,
            order_by="idx asc",
        )
    except Exception as e:
        # Check if error is schema-related (column not found)
        error_msg = str(e).lower()
        is_schema_error = (
            "unknown column" in error_msg or
            "1054" in error_msg or  # MySQL error code for unknown column
            "no such column" in error_msg  # SQLite error
        )
        
        # Determine if this is expected (v15+ behavior) or actual schema issue
        if is_schema_error and "currency" in error_msg:
            # This is likely ERPNext v15+ where currency field was removed
            schema_explanation = (
                "ERPNext v15+ removed 'currency' field from POS Opening Entry Detail child table. "
                "This is expected behavior. Currency should be resolved from parent/company instead."
            )
        else:
            # Unexpected schema error - might need migration
            schema_explanation = (
                "Unexpected database schema issue. "
                "If custom fields exist but not in DB, run 'bench migrate' to sync schema."
            )
        
        # Log detailed error for debugging
        frappe.log_error(
            title="IMOGI POS: POS Opening Detail Query Error",
            message=(
                f"Error fetching balance details\n"
                f"Opening: {opening_name}\n"
                f"DocType: POS Opening Entry Detail\n"
                f"Requested Fields: {base_fields}\n"
                f"Schema Error Detected: {is_schema_error}\n"
                f"Error Type: {type(e).__name__}\n"
                f"Error: {str(e)}\n\n"
                f"Analysis: {schema_explanation}\n\n"
                f"Recommendation:\n"
                f"- If ERPNext v15+: This error should not occur (code should not request 'currency')\n"
                f"- If custom fields: Run 'bench migrate' to sync schema\n"
                f"- Check has_currency_field detection logic"
            )
        )
        
        # Provide user-friendly error message
        if is_schema_error:
            frappe.throw(
                (
                    f"Database schema mismatch for POS Opening Entry Detail. "
                    f"{schema_explanation} "
                    f"Check Error Log for details."
                ),
                exc=frappe.ValidationError
            )
        else:
            frappe.throw(
                f"Failed to fetch POS Opening balance details: {str(e)}",
                exc=frappe.ValidationError
            )
    
    if not details:
        return []
    
    # Preserve output contract: inject currency if not in schema
    if not has_currency_field:
        fallback_currency = _resolve_currency_for_opening(opening_name)
        
        frappe.logger("imogi_pos").debug(
            f"[pos_opening] Injecting fallback currency '{fallback_currency}' "
            f"to {len(details)} balance detail rows (opening: {opening_name})"
        )
        
        # Inject currency to all detail entries
        for detail in details:
            detail["currency"] = fallback_currency
    
    return details


def resolve_active_pos_opening(
    pos_profile: Optional[str],
    scope: Optional[str] = None,
    user: Optional[str] = None,
    device_id: Optional[str] = None,
    raise_on_device_missing: bool = False,
) -> Dict[str, Any]:
    """
    Resolve active POS Opening Entry using consistent scope filters.

    Rules:
    - Always filter by pos_profile (required for consistent behavior).
    - scope=User -> filter by user
    - scope=POS Profile -> no user filter
    - scope=Device -> filter by device_id (required; may raise or return error)
    """
    if not user:
        user = frappe.session.user

    if not pos_profile:
        return {
            "pos_opening_entry": None,
            "pos_profile_name": None,
            "opening_balance": 0,
            "balance_details": [],
            "timestamp": None,
            "company": None,
            "status": None,
            "scope": scope,
            "user": user,
            "device_id": device_id,
            "error_code": "missing_pos_profile",
            "error_message": "POS Profile is required to resolve POS Opening Entry.",
        }

    if hasattr(frappe, "db") and hasattr(frappe.db, "exists"):
        try:
            if not frappe.db.exists("DocType", "POS Opening Entry"):
                return {
                    "pos_opening_entry": None,
                    "pos_profile_name": pos_profile,
                    "opening_balance": 0,
                    "balance_details": [],
                    "timestamp": None,
                    "company": frappe.db.get_value("POS Profile", pos_profile, "company"),
                    "status": None,
                    "scope": scope,
                    "user": user,
                    "device_id": device_id,
                    "error_code": "doctype_missing",
                    "error_message": "POS Opening Entry DocType not available.",
                }
        except Exception:
            return {
                "pos_opening_entry": None,
                "pos_profile_name": pos_profile,
                "opening_balance": 0,
                "balance_details": [],
                "timestamp": None,
                "company": frappe.db.get_value("POS Profile", pos_profile, "company"),
                "status": None,
                "scope": scope,
                "user": user,
                "device_id": device_id,
                "error_code": "doctype_check_failed",
                "error_message": "Failed to check POS Opening Entry DocType.",
            }

    if not scope:
        scope = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_session_scope") or "User"

    if scope == "Device" and not device_id:
        device_id = (
            frappe.local.request.headers.get("X-Device-ID")
            if hasattr(frappe.local, "request")
            else None
        )

    filters = {
        "docstatus": 1,  # Submitted
        "status": "Open",
        "pos_profile": pos_profile,
    }

    error_code = None
    error_message = None
    warnings = []

    if scope == "User":
        filters["user"] = user
    elif scope == "Device":
        if frappe.db.has_column("POS Opening Entry", "device_id"):
            if device_id:
                filters["device_id"] = device_id
            else:
                warnings.append("Device ID required for device-scoped POS Opening Entry.")
                error_code = "device_id_required"
                error_message = "Device ID required for device-scoped POS Opening Entry."
                frappe.logger("imogi_pos").warning(
                    "[pos_opening] device_id_missing scope=%s pos_profile=%s user=%s",
                    scope,
                    pos_profile,
                    user,
                )
                if raise_on_device_missing:
                    frappe.throw(
                        error_message,
                        frappe.ValidationError,
                    )
        else:
            warnings.append("POS Opening Entry missing device_id field; device scope ignored.")
    elif scope == "POS Profile":
        pass
    else:
        error_code = "invalid_scope"
        error_message = f"Unsupported POS session scope: {scope}"

    if error_code:
        return {
            "pos_opening_entry": None,
            "pos_profile_name": pos_profile,
            "opening_balance": 0,
            "balance_details": [],
            "timestamp": None,
            "company": frappe.db.get_value("POS Profile", pos_profile, "company"),
            "status": None,
            "scope": scope,
            "user": user,
            "device_id": device_id,
            "error_code": error_code,
            "error_message": error_message,
            "warnings": warnings,
        }

    date_field = _resolve_pos_opening_date_field()
    entry = frappe.db.get_list(
        "POS Opening Entry",
        filters=filters,
        fields=[
            "name",
            "pos_profile",
            "user",
            "creation",
            "company",
            "status",
            date_field,
        ],
        order_by="creation desc",
        limit_page_length=1,
    )

    found = bool(entry)
    opening_name = entry[0]["name"] if entry else None

    frappe.logger("imogi_pos").info(
        "[pos_opening] resolved scope=%s pos_profile=%s user=%s device=%s found=%s opening=%s",
        scope,
        pos_profile,
        user,
        device_id,
        found,
        opening_name,
    )

    if entry:
        balance_details = _fetch_balance_details(entry[0].get("name"))
        opening_balance = sum(
            detail.get("opening_amount", 0) or 0 for detail in balance_details
        )
        opening_name = entry[0].get("name")
        return {
            "name": opening_name,  # Frontend expects 'name' field
            "pos_opening_entry": opening_name,  # Backward compatibility
            "pos_profile": entry[0].get("pos_profile"),  # Frontend expects 'pos_profile'
            "pos_profile_name": entry[0].get("pos_profile"),  # Backward compatibility
            "opening_balance": opening_balance,
            "balance_details": balance_details,
            "timestamp": entry[0].get(date_field) or entry[0].get("creation"),
            "company": entry[0].get("company"),
            "status": entry[0].get("status"),
            "scope": scope,
            "user": entry[0].get("user"),  # Include user from DB for validation
            "device_id": device_id,
            "error_code": error_code,
            "error_message": error_message,
            "warnings": warnings,
        }

    return {
        "pos_opening_entry": None,
        "pos_profile_name": pos_profile,
        "opening_balance": 0,
        "balance_details": [],
        "timestamp": None,
        "company": frappe.db.get_value("POS Profile", pos_profile, "company"),
        "status": None,
        "scope": scope,
        "user": user,
        "device_id": device_id,
        "error_code": error_code,
        "error_message": error_message,
        "warnings": warnings,
    }
