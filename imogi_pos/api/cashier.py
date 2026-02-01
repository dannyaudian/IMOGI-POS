"""
Cashier API (ERPNext v15+ native-like POS cycle, Option 1)
- Session/Shift: POS Opening Entry
- Payments: Sales Invoice.payments (Sales Invoice Payment) -> NO Payment Entry
- Session link: Sales Invoice.imogi_pos_session (custom field)
- Order link:   Sales Invoice.imogi_pos_order (custom field)
- POS Order link to invoice: POS Order.sales_invoice

SCHEMA CONSTRAINTS:
- POS Order: pos_profile, branch, table, items, subtotal, totals, workflow_state, sales_invoice
  (NO grand_total/total/status/payment_status/invoice)
- Sales Invoice: imogi_pos_session (Link POS Opening Entry), imogi_pos_order (Link POS Order)
- POS Opening Entry: company, pos_profile, user, period_start_date, posting_date, balance_details (no currency in child for v15+)
- Payments: Sales Invoice.payments (Sales Invoice Payment child table) - NO Payment Entry
"""

import json
import frappe
from frappe import _
from frappe.utils import now, today, nowtime, flt
import frappe.utils.logger

logger = frappe.utils.logger.get_logger(__name__)


# -----------------------------
# Helpers
# -----------------------------

def _has_field(doctype: str, fieldname: str) -> bool:
    """Check if doctype has a specific field."""
    try:
        return frappe.get_meta(doctype).has_field(fieldname)
    except Exception:
        return False

def _set_if_field(doc, fieldname: str, value):
    """Set field value only if field exists in doctype schema."""
    if value is None:
        return
    try:
        if _has_field(doc.doctype, fieldname):
            setattr(doc, fieldname, value)
    except Exception as e:
        logger.warning(f"Failed to set field {fieldname} on {doc.doctype}: {str(e)}")

def _loads_if_str(val):
    """Parse JSON string if needed."""
    return json.loads(val) if isinstance(val, str) else val

def _require_cashier_role():
    """Enforce cashier role requirement."""
    if not (frappe.has_role("Cashier") or frappe.has_role("System Manager") or frappe.session.user == "Administrator"):
        logger.error(f"Unauthorized access attempt by user {frappe.session.user}")
        frappe.throw(_("Not permitted"), frappe.PermissionError)

def _get_company_from_pos_profile(pos_profile: str) -> str:
    """Get company from POS Profile."""
    if not pos_profile:
        return None
    return frappe.db.get_value("POS Profile", pos_profile, "company")

def _get_company_currency(company: str) -> str:
    """Get default currency for company."""
    if company:
        cur = frappe.db.get_value("Company", company, "default_currency")
        if cur:
            return cur
    return frappe.defaults.get_global_default("currency") or "USD"

def _safe_get_dict(doc):
    """Safely convert doc to dict, extracting from tuple if needed."""
    if isinstance(doc, dict):
        return doc
    if isinstance(doc, tuple) and len(doc) > 0:
        return doc[0] if isinstance(doc[0], dict) else {}
    try:
        return doc.as_dict() if hasattr(doc, 'as_dict') else {}
    except Exception:
        return {}

def ensure_active_opening(pos_profile: str, user: str) -> dict:
    """
    SINGLE SOURCE OF TRUTH: Resolve + validate active POS Opening.
    
    Backend enforces:
    - Only ONE active opening per (pos_profile, user)
    - Server controls opening, NOT client
    - Throws error if no opening found
    
    Args:
        pos_profile: POS Profile name
        user: User name
        
    Returns:
        {name, company, pos_profile, user, posting_date, ...} dict
        
    Raises:
        ValidationError: If no active opening found
    """
    from imogi_pos.utils.pos_opening import resolve_active_pos_opening
    
    if not pos_profile or not user:
        frappe.throw(_("POS Profile and user required"))
    
    try:
        opening = resolve_active_pos_opening(pos_profile=pos_profile, user=user)
        
        if not opening:
            logger.error(f"ensure_active_opening: No active opening for user {user} on {pos_profile}")
            frappe.throw(
                _("No active POS Opening for your session. Please create and submit a POS Opening Entry first."),
                frappe.ValidationError
            )
        
        opening_dict = _safe_get_dict(opening)
        if not opening_dict or not opening_dict.get("name"):
            logger.error(f"ensure_active_opening: Could not extract opening name")
            frappe.throw(_("Invalid opening session data"), frappe.ValidationError)
        
        logger.info(f"ensure_active_opening: Active opening validated for user {user}: {opening_dict.get('name')}")
        return opening_dict
        
    except frappe.ValidationError:
        raise
    except Exception as e:
        logger.error(f"ensure_active_opening failed: {str(e)}", exc_info=True)
        frappe.throw(_("Opening validation error: {0}").format(str(e)), frappe.ValidationError)

def _get_pos_profile_runtime_config(pos_profile: str) -> dict:
    """Get POS Profile feature flags (KOT/Table/Waiter) - opening always required in native v15."""
    if not pos_profile:
        return {}
    
    try:
        # Build field list dynamically based on schema
        meta = frappe.get_meta("POS Profile")
        available_fields = []
        
        config_fields = [
            "imogi_pos_domain",
            "imogi_mode",
            "imogi_require_pos_session",
            "imogi_enforce_session_on_cashier",
            "imogi_enable_kot",
            "imogi_use_table_display",
            "imogi_enable_waiter",
            "imogi_checkout_payment_mode",
        ]
        
        for field in config_fields:
            if meta.has_field(field):
                available_fields.append(field)
        
        # Fetch only available fields
        if available_fields:
            config = frappe.db.get_value(
                "POS Profile",
                pos_profile,
                available_fields,
                as_dict=True
            ) or {}
        else:
            config = {}
        
        # Note: In native v15, opening is ALWAYS required (removed conditional logic)
        # Config is used only for feature flags (KOT/Table/Waiter)
        
        return config
    except Exception as e:
        logger.warning(f"_get_pos_profile_runtime_config: Failed to get config for {pos_profile}: {str(e)}")
        return {}


# -----------------------------
# Context + Opening APIs
# -----------------------------

@frappe.whitelist()
def get_cashier_context():
    """Return operational context for cashier UI (native v15: always requires opening)."""
    from imogi_pos.utils.operational_context import require_operational_context

    ctx = require_operational_context()
    pos_profile = ctx.get("pos_profile")
    if not pos_profile:
        return {"success": False, "error": _("POS Profile not set in operational context")}

    company = _get_company_from_pos_profile(pos_profile)
    currency = _get_company_currency(company)
    
    # Get POS Profile config for feature flags (KOT/Table/Waiter)
    # Note: Opening is ALWAYS required (native ERPNext v15 behavior)
    pos_profile_config = _get_pos_profile_runtime_config(pos_profile)

    return {
        "success": True,
        "pos_profile": pos_profile,
        "company": company,
        "currency": currency,
        "requires_opening": True,  # Native v15: always require opening
        "requires_opening_for_cashier": True,  # Native v15: always require opening
        "pos_profile_config": pos_profile_config,
    }


@frappe.whitelist()
def get_active_opening(pos_profile=None):
    """
    Get active POS Opening Entry for current user + pos_profile.
    Returns opening dict or None if no active opening found.
    
    NO DATE FILTERS: Opening from yesterday/previous days remains valid
    until explicitly closed by user.
    """
    from imogi_pos.utils.operational_context import require_operational_context
    from imogi_pos.utils.pos_opening import resolve_active_pos_opening

    try:
        ctx = require_operational_context()
        pos_profile = pos_profile or ctx.get("pos_profile")

        if not pos_profile:
            logger.warning(f"get_active_opening: No POS Profile for user {frappe.session.user}")
            return {
                "success": False, 
                "has_opening": False,
                "opening": None,
                "pos_profile": None,
                "error": _("POS Profile required")
            }

        # resolve_active_pos_opening returns dict, not doc object
        opening = resolve_active_pos_opening(pos_profile=pos_profile, user=frappe.session.user)
        
        # Check if opening was found (has name field)
        has_opening = bool(opening and opening.get("name"))
        opening_name = opening.get("name") if has_opening else None

        logger.info(
            f"get_active_opening: user={frappe.session.user} pos_profile={pos_profile} "
            f"found={has_opening} opening={opening_name}"
        )

        return {
            "success": True,
            "has_opening": has_opening,
            "opening": opening if has_opening else None,
            "pos_profile": pos_profile,
        }
    except Exception as e:
        logger.error(f"get_active_opening failed: {str(e)}", exc_info=True)
        return {
            "success": False,
            "has_opening": False,
            "opening": None,
            "pos_profile": pos_profile,
            "error": str(e)
        }


@frappe.whitelist()
def create_pos_opening(pos_profile, opening_balances):
    """
    Create & submit POS Opening Entry (v15+: no currency in child).
    opening_balances: [{"mode_of_payment":"Cash","opening_amount":0}, ...]
    
    Returns: {success, opening, company, pos_profile}
    """
    _require_cashier_role()

    opening_balances = _loads_if_str(opening_balances) or []
    if not pos_profile:
        logger.error("create_pos_opening: No POS Profile provided")
        frappe.throw(_("POS Profile required"))

    company = _get_company_from_pos_profile(pos_profile)
    if not company:
        logger.error(f"create_pos_opening: No company for POS Profile {pos_profile}")
        frappe.throw(_("Company not found for POS Profile {0}").format(pos_profile))

    if not isinstance(opening_balances, list) or not opening_balances:
        logger.error("create_pos_opening: Invalid opening balances")
        frappe.throw(_("Opening balances required"))

    # Check for existing active opening
    from imogi_pos.utils.pos_opening import resolve_active_pos_opening
    existing = resolve_active_pos_opening(pos_profile=pos_profile, user=frappe.session.user)
    if existing:
        existing_dict = _safe_get_dict(existing)
        logger.warning(f"create_pos_opening: Active opening already exists: {existing_dict.get('name')}")
        return {
            "success": False, 
            "error": _("Active opening already exists: {0}").format(existing_dict.get('name')),
            "existing_opening": existing_dict.get('name')
        }

    try:
        doc = frappe.new_doc("POS Opening Entry")
        doc.period_start_date = now()
        doc.posting_date = today()
        doc.company = company
        doc.pos_profile = pos_profile
        doc.user = frappe.session.user

        for row in opening_balances:
            mop = (row or {}).get("mode_of_payment")
            amt = flt((row or {}).get("opening_amount", 0))
            if not mop:
                continue
            # v15+: no currency field in child table
            doc.append("balance_details", {
                "mode_of_payment": mop,
                "opening_amount": amt
            })

        doc.insert(ignore_permissions=True)
        doc.submit()
        frappe.db.commit()

        logger.info(f"Created POS Opening: {doc.name} for user {frappe.session.user}")

        return {
            "success": True, 
            "opening": doc.name, 
            "company": company, 
            "pos_profile": pos_profile
        }
    except Exception as e:
        frappe.db.rollback()
        logger.error(f"create_pos_opening failed: {str(e)}", exc_info=True)
        frappe.throw(_("Failed to create opening: {0}").format(str(e)))


# -----------------------------
# Orders
# -----------------------------

@frappe.whitelist()
def get_pending_orders(table=None, waiter=None, from_date=None, to_date=None):
    """
    Pending orders for cashier.
    Uses schema-safe fields from POS Order: pos_profile, branch, table, items, 
    subtotal, totals, workflow_state, sales_invoice.
    Dynamically checks for field existence (waiter may not exist).
    Guards KOT/Table features for Counter mode compatibility.
    """
    from imogi_pos.utils.operational_context import require_operational_context
    
    try:
        ctx = require_operational_context()
        pos_profile = ctx.get("pos_profile")
        
        # Get POS Profile config to check if KOT/Table enabled
        pos_profile_config = _get_pos_profile_runtime_config(pos_profile)
        enable_kot = pos_profile_config.get("imogi_enable_kot", False)
        use_table_display = pos_profile_config.get("imogi_use_table_display", False)
        
        # Check if KOT/Table DocTypes exist (Counter mode might not have them)
        kot_doctype_exists = frappe.db.exists("DocType", "KOT Ticket")
        table_doctype_exists = frappe.db.exists("DocType", "Restaurant Table")

        filters = {
            "pos_profile": pos_profile,
        }

        # Workflow state handling: prefer workflow_state, fallback to status if exists
        if _has_field("POS Order", "workflow_state"):
            filters["workflow_state"] = ["in", ["Draft", "Submitted"]]
        elif _has_field("POS Order", "status"):
            filters["status"] = ["in", ["Draft", "Submitted"]]

        # Optional filters (only if feature enabled)
        if table and use_table_display and _has_field("POS Order", "table"):
            filters["table"] = table

        if waiter and _has_field("POS Order", "waiter"):
            filters["waiter"] = waiter

        # Date range
        if from_date and to_date:
            filters["creation"] = ["between", [from_date, to_date]]
        elif from_date:
            filters["creation"] = [">=", from_date]
        elif to_date:
            filters["creation"] = ["<=", to_date]

        # Build field list dynamically based on schema
        fields = ["name", "pos_profile", "creation", "modified"]
        optional_fields = ["branch", "customer", "workflow_state", "sales_invoice", "subtotal", "totals"]
        
        # Add table field only if feature enabled
        if use_table_display:
            optional_fields.append("table")
        
        for f in optional_fields:
            if _has_field("POS Order", f):
                fields.append(f)
        
        # Check waiter separately
        if _has_field("POS Order", "waiter"):
            fields.append("waiter")

        # Deduplicate fields
        fields = list(dict.fromkeys(fields))

        orders = frappe.get_all(
            "POS Order", 
            filters=filters, 
            fields=fields, 
            order_by="creation asc"
        )

        if not orders:
            return {"success": True, "orders": [], "count": 0}

        order_names = [o["name"] for o in orders]

        # Item counts
        item_counts = frappe.db.sql("""
            SELECT parent, COUNT(*) as count
            FROM `tabPOS Order Item`
            WHERE parent IN %(orders)s
            GROUP BY parent
        """, {"orders": order_names}, as_dict=True)
        item_count_map = {ic.parent: ic.count for ic in item_counts}

        # KOT stats - only if KOT enabled and DocType exists
        kot_stat_map = {}
        if enable_kot and kot_doctype_exists:
            try:
                kot_stats = frappe.db.sql("""
                    SELECT
                        pos_order,
                        COUNT(*) as total,
                        SUM(CASE WHEN workflow_state = 'Served' THEN 1 ELSE 0 END) as served
                    FROM `tabKOT Ticket`
                    WHERE pos_order IN %(orders)s
                    GROUP BY pos_order
                """, {"orders": order_names}, as_dict=True)
                kot_stat_map = {ks.pos_order: ks for ks in kot_stats}
            except Exception as e:
                logger.warning(f"get_pending_orders: KOT stats query failed: {str(e)}")

        # Enrich orders with computed fields
        for o in orders:
            o["item_count"] = item_count_map.get(o["name"], 0)
            
            # KOT stats (only if KOT enabled)
            if enable_kot:
                ks = kot_stat_map.get(o["name"])
                if ks:
                    o["kots_total"] = ks.total
                    o["kots_served"] = ks.served
                    o["all_kots_served"] = (ks.total > 0 and ks.served == ks.total)
                else:
                    o["kots_total"] = 0
                    o["kots_served"] = 0
                    o["all_kots_served"] = False
            else:
                # Counter mode: no KOT tracking
                o["kots_total"] = 0
                o["kots_served"] = 0
                o["all_kots_served"] = True  # Always true for Counter mode

        logger.info(f"get_pending_orders: Found {len(orders)} orders for profile {pos_profile} (KOT: {enable_kot}, Table: {use_table_display})")
        return {"success": True, "orders": orders, "count": len(orders)}
        
    except Exception as e:
        logger.error(f"get_pending_orders failed: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_order_details(order_name):
    """Get detailed order information with KOT/Table guards for Counter mode."""
    if not frappe.db.exists("POS Order", order_name):
        return {"success": False, "error": _("Order not found")}

    order = frappe.get_doc("POS Order", order_name)
    
    # Get POS Profile config to check features
    pos_profile = getattr(order, "pos_profile", None)
    pos_profile_config = _get_pos_profile_runtime_config(pos_profile) if pos_profile else {}
    enable_kot = pos_profile_config.get("imogi_enable_kot", False)
    use_table_display = pos_profile_config.get("imogi_use_table_display", False)
    
    # Check DocType existence
    kot_doctype_exists = frappe.db.exists("DocType", "KOT Ticket")
    table_doctype_exists = frappe.db.exists("DocType", "Restaurant Table")

    # Fetch KOTs only if enabled and DocType exists
    kots = []
    if enable_kot and kot_doctype_exists:
        try:
            kots = frappe.get_all(
                "KOT Ticket",
                filters={"pos_order": order_name},
                fields=["name", "station", "workflow_state", "creation", "modified"],
            )

            for kot in kots:
                try:
                    kot["items"] = frappe.get_all(
                        "KOT Item",
                        filters={"parent": kot["name"]},
                        fields=["item_name", "qty", "notes"],
                    )
                except Exception as e:
                    logger.warning(f"get_order_details: Failed to fetch KOT items for {kot['name']}: {str(e)}")
                    kot["items"] = []
        except Exception as e:
            logger.warning(f"get_order_details: Failed to fetch KOTs for order {order_name}: {str(e)}")
            kots = []

    # Fetch table info only if enabled and DocType exists
    table_info = None
    if use_table_display and table_doctype_exists and getattr(order, "table", None):
        try:
            table_info = frappe.get_doc("Restaurant Table", order.table)
        except Exception as e:
            logger.warning(f"get_order_details: Failed to fetch table {order.table}: {str(e)}")
    
    # Fetch customer info (always safe)
    customer_info = None
    if getattr(order, "customer", None):
        try:
            customer_info = frappe.get_doc("Customer", order.customer)
        except Exception as e:
            logger.warning(f"get_order_details: Failed to fetch customer {order.customer}: {str(e)}")

    return {
        "success": True,
        "order": order.as_dict(),
        "kots": kots,
        "table": table_info.as_dict() if table_info else None,
        "customer": customer_info.as_dict() if customer_info else None,
    }


# -----------------------------
# Invoice + Payment (POS-native)
# -----------------------------

@frappe.whitelist()
def create_invoice_from_order(order_name, customer=None, customer_name=None):
    """
    Create draft Sales Invoice from POS Order.
    REQUIRES active opening (validates before creating invoice).
    Links: imogi_pos_session, imogi_pos_order
    Updates: POS Order.sales_invoice
    
    HARDENED: Ignores client opening_name, always uses server-resolved active opening.
    
    Returns: {success, invoice, grand_total} or error
    """
    _require_cashier_role()

    from imogi_pos.utils.operational_context import require_operational_context

    if not frappe.db.exists("POS Order", order_name):
        logger.error(f"create_invoice_from_order: Order {order_name} not found")
        return {"success": False, "error": _("Order not found")}

    order = frappe.get_doc("POS Order", order_name)

    # Check if invoice already exists (idempotency)
    if _has_field("POS Order", "sales_invoice") and getattr(order, "sales_invoice", None):
        existing_invoice = getattr(order, "sales_invoice")
        logger.info(f"Invoice already exists for order {order_name}: {existing_invoice}")
        invoice_doc = frappe.get_doc("Sales Invoice", existing_invoice)
        return {
            "success": True, 
            "invoice": existing_invoice, 
            "grand_total": flt(invoice_doc.grand_total),
            "message": _("Invoice already exists")
        }

    # KOT served validation
    kots = frappe.get_all("KOT Ticket", filters={"pos_order": order_name}, fields=["workflow_state"])
    if kots:
        unserved = [k for k in kots if k.get("workflow_state") != "Served"]
        if unserved:
            logger.warning(f"create_invoice_from_order: Order {order_name} has unserved KOTs")
            return {"success": False, "error": _("Cannot create invoice. Not all items have been served.")}

    # Get context and validate opening
    try:
        ctx = require_operational_context()
    except Exception as e:
        logger.error(f"create_invoice_from_order: Operational context error: {str(e)}")
        return {"success": False, "error": _("Operational context not available")}

    pos_profile = getattr(order, "pos_profile", None) or ctx.get("pos_profile")
    if not pos_profile:
        logger.error(f"create_invoice_from_order: No POS Profile for order {order_name}")
        return {"success": False, "error": _("POS Profile required")}

    # HARDENED: Use ensure_active_opening() - single source of truth, ignores client params
    try:
        opening_dict = ensure_active_opening(pos_profile=pos_profile, user=frappe.session.user)
        opening_name = opening_dict.get("name")
    except frappe.ValidationError as e:
        logger.error(f"create_invoice_from_order: Opening validation failed: {str(e)}")
        return {"success": False, "error": str(e)}
    
    logger.info(f"create_invoice_from_order: Using server-resolved opening {opening_name}")

    # Walk-in customer handling
    if not customer:
        customer = frappe.db.get_value("Customer", {"customer_name": "Walk-In Customer"})
        if not customer:
            try:
                walk_in = frappe.get_doc({
                    "doctype": "Customer",
                    "customer_name": "Walk-In Customer",
                    "customer_type": "Individual",
                    "customer_group": "Individual",
                })
                walk_in.insert(ignore_permissions=True)
                customer = walk_in.name
                logger.info(f"Created Walk-In Customer: {customer}")
            except Exception as e:
                logger.error(f"Failed to create Walk-In Customer: {str(e)}")
                frappe.throw(_("Failed to create Walk-In Customer"))

    company = getattr(order, "company", None) or _get_company_from_pos_profile(pos_profile) or frappe.defaults.get_defaults().get("company")
    if not company:
        logger.error(f"create_invoice_from_order: No company for order {order_name}")
        return {"success": False, "error": _("Company not found")}

    try:
        invoice = frappe.new_doc("Sales Invoice")
        invoice.customer = customer
        if customer_name and _has_field("Sales Invoice", "customer_name"):
            invoice.customer_name = customer_name

        invoice.posting_date = today()
        invoice.posting_time = nowtime()
        invoice.set_posting_time = 1

        invoice.company = company
        invoice.is_pos = 1
        
        # POS Profile + defaults
        if _has_field("Sales Invoice", "pos_profile"):
            invoice.pos_profile = pos_profile
            
        # Get POS Profile defaults for full accounting/stock cycle
        profile_doc = frappe.get_cached_doc("POS Profile", pos_profile)
        if profile_doc:
            # Set warehouse for stock updates
            if _has_field("Sales Invoice", "set_warehouse") and profile_doc.get("warehouse"):
                invoice.set_warehouse = profile_doc.warehouse
            
            # Enable stock update if POS Profile configured
            if _has_field("Sales Invoice", "update_stock") and profile_doc.get("update_stock"):
                invoice.update_stock = 1
            
            # Apply cost center if exists
            if _has_field("Sales Invoice", "cost_center") and profile_doc.get("cost_center"):
                invoice.cost_center = profile_doc.cost_center
        
        # Session + Order links (custom fields)
        # HARDENED: Always set from server-resolved opening, ignore client param
        _set_if_field(invoice, "imogi_pos_session", opening_name)
        _set_if_field(invoice, "imogi_pos_order", order_name)

        # Copy items from order
        if not hasattr(order, "items") or not order.items:
            logger.error(f"create_invoice_from_order: Order {order_name} has no items")
            return {"success": False, "error": _("Order has no items")}

        for item in order.items:
            invoice.append("items", {
                "item_code": item.item_code,
                "item_name": item.item_name,
                "description": getattr(item, "description", None),
                "qty": flt(item.qty),
                "rate": flt(item.rate),
                "amount": flt(item.amount),
                "uom": getattr(item, "uom", None),
            })

        invoice.run_method("calculate_taxes_and_totals")
        invoice.insert(ignore_permissions=True)

        # Link back to POS Order
        if _has_field("POS Order", "sales_invoice"):
            frappe.db.set_value("POS Order", order_name, "sales_invoice", invoice.name, update_modified=False)
        
        frappe.db.commit()
        logger.info(f"Created invoice {invoice.name} from order {order_name}, session {opening_name}")

        return {
            "success": True, 
            "invoice": invoice.name, 
            "grand_total": flt(invoice.grand_total),
            "session": opening_name
        }
        
    except Exception as e:
        frappe.db.rollback()
        logger.error(f"create_invoice_from_order failed: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}

    # Walk-in customer handling
    if not customer:
        customer = frappe.db.get_value("Customer", {"customer_name": "Walk-In Customer"})
        if not customer:
            try:
                walk_in = frappe.get_doc({
                    "doctype": "Customer",
                    "customer_name": "Walk-In Customer",
                    "customer_type": "Individual",
                    "customer_group": "Individual",
                })
                walk_in.insert(ignore_permissions=True)
                customer = walk_in.name
                logger.info(f"Created Walk-In Customer: {customer}")
            except Exception as e:
                logger.error(f"Failed to create Walk-In Customer: {str(e)}")
                frappe.throw(_("Failed to create Walk-In Customer"))

    company = getattr(order, "company", None) or _get_company_from_pos_profile(pos_profile) or frappe.defaults.get_defaults().get("company")
    if not company:
        logger.error(f"create_invoice_from_order: No company for order {order_name}")
        return {"success": False, "error": _("Company not found")}

    try:
        invoice = frappe.new_doc("Sales Invoice")
        invoice.customer = customer
        if customer_name and _has_field("Sales Invoice", "customer_name"):
            invoice.customer_name = customer_name

        invoice.posting_date = today()
        invoice.posting_time = nowtime()
        invoice.set_posting_time = 1

        invoice.company = company
        invoice.is_pos = 1
        
        # POS Profile + defaults
        if _has_field("Sales Invoice", "pos_profile"):
            invoice.pos_profile = pos_profile
            
        # Get POS Profile defaults for full accounting/stock cycle
        profile_doc = frappe.get_cached_doc("POS Profile", pos_profile)
        if profile_doc:
            # Set warehouse for stock updates
            if _has_field("Sales Invoice", "set_warehouse") and profile_doc.get("warehouse"):
                invoice.set_warehouse = profile_doc.warehouse
            
            # Enable stock update if POS Profile configured
            if _has_field("Sales Invoice", "update_stock") and profile_doc.get("update_stock"):
                invoice.update_stock = 1
            
            # Apply cost center if exists
            if _has_field("Sales Invoice", "cost_center") and profile_doc.get("cost_center"):
                invoice.cost_center = profile_doc.cost_center
        
        # Session + Order links (custom fields)
        # Native v15: always link invoice to session (shift-based tracking)
        _set_if_field(invoice, "imogi_pos_session", opening_name)
        _set_if_field(invoice, "imogi_pos_order", order_name)

        # Copy items from order
        if not hasattr(order, "items") or not order.items:
            logger.error(f"create_invoice_from_order: Order {order_name} has no items")
            return {"success": False, "error": _("Order has no items")}

        for item in order.items:
            invoice.append("items", {
                "item_code": item.item_code,
                "item_name": item.item_name,
                "description": getattr(item, "description", None),
                "qty": flt(item.qty),
                "rate": flt(item.rate),
                "amount": flt(item.amount),
                "uom": getattr(item, "uom", None),
            })

        invoice.run_method("calculate_taxes_and_totals")
        invoice.insert(ignore_permissions=True)

        # Link back to POS Order
        if _has_field("POS Order", "sales_invoice"):
            frappe.db.set_value("POS Order", order_name, "sales_invoice", invoice.name, update_modified=False)
        
        frappe.db.commit()
        logger.info(f"Created invoice {invoice.name} from order {order_name}, session {opening_name}")

        return {
            "success": True, 
            "invoice": invoice.name, 
            "grand_total": flt(invoice.grand_total),
            "session": opening_name
        }
        
    except Exception as e:
        frappe.db.rollback()
        logger.error(f"create_invoice_from_order failed: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def process_payment(invoice_name, payments=None, mode_of_payment=None, paid_amount=None, cash_received=None, reference_no=None):
    """
    POS-native payment (NO Payment Entry):
    - Writes into Sales Invoice.payments (Sales Invoice Payment child table)
    - Submits Sales Invoice
    - Idempotent: if invoice already submitted, returns success without modification
    
    HARDENED: Validates invoice.imogi_pos_session matches server-resolved active opening.
    
    Supports:
      - New style: payments=[{mode_of_payment, amount, reference_no?}, ...]
      - Backward compat: mode_of_payment + paid_amount
      
    Args:
        invoice_name: Sales Invoice name
        payments: List of payment dicts or JSON string
        mode_of_payment: Legacy single payment mode
        paid_amount: Legacy single payment amount
        cash_received: Cash given by customer (for change calculation)
        reference_no: Legacy payment reference
        
    Returns:
        {success, invoice, invoice_total, paid_total, cash_received?, change_amount?}
    """
    _require_cashier_role()

    if not frappe.db.exists("Sales Invoice", invoice_name):
        logger.error(f"process_payment: Invoice {invoice_name} not found")
        return {"success": False, "error": _("Invoice not found")}

    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    
    if invoice.docstatus == 2:
        logger.error(f"process_payment: Invoice {invoice_name} is cancelled")
        return {"success": False, "error": _("Invoice is cancelled")}
    
    # Get operational context and POS Profile config
    from imogi_pos.utils.operational_context import require_operational_context
    
    try:
        ctx = require_operational_context()
    except Exception as e:
        logger.error(f"process_payment: Operational context required: {str(e)}")
        return {"success": False, "error": _("Operational context not available")}
    
    pos_profile = getattr(invoice, "pos_profile", None) or ctx.get("pos_profile")
    
    if not pos_profile:
        logger.error(f"process_payment: No POS Profile for invoice {invoice_name}")
        return {"success": False, "error": _("POS Profile required")}
    
    # HARDENED: Validate active opening and session match (single source of truth)
    try:
        active_dict = ensure_active_opening(pos_profile=pos_profile, user=frappe.session.user)
        active_name = active_dict.get("name")
    except frappe.ValidationError as e:
        logger.error(f"process_payment: Opening validation failed: {str(e)}")
        return {"success": False, "error": str(e)}
    
    # Validate invoice belongs to current session (prevent cross-session payment)
    invoice_session = getattr(invoice, "imogi_pos_session", None)
    if invoice_session and invoice_session != active_name:
        logger.error(f"process_payment: Invoice {invoice_name} belongs to session {invoice_session}, but active session is {active_name}")
        return {
            "success": False, 
            "error": _("Invoice belongs to a different session. Cannot process payment across sessions.")
        }
    
    logger.info(f"process_payment: Session validation passed for invoice {invoice_name}")

    # Idempotent: if already submitted, return success
    if invoice.docstatus == 1:
        logger.info(f"process_payment: Invoice {invoice_name} already paid/submitted")
        change_amount = None
        if cash_received is not None:
            change_amount = max(0.0, flt(cash_received) - flt(invoice.grand_total))
        
        return {
            "success": True, 
            "invoice": invoice.name, 
            "invoice_total": flt(invoice.grand_total),
            "paid_total": flt(invoice.grand_total),
            "cash_received": flt(cash_received) if cash_received is not None else None,
            "change_amount": flt(change_amount) if change_amount is not None else None,
            "message": _("Invoice already paid/submitted")
        }

    # Normalize payment input (new style vs legacy)
    if payments is None and mode_of_payment and paid_amount is not None:
        payments = [{
            "mode_of_payment": mode_of_payment, 
            "amount": flt(paid_amount), 
            "reference_no": reference_no
        }]
    
    payments = _loads_if_str(payments) or []
    
    if not isinstance(payments, list) or not payments:
        logger.error(f"process_payment: No valid payments for invoice {invoice_name}")
        return {"success": False, "error": _("Payments required")}

    try:
        # Clear existing payments for idempotency (replace mode)
        invoice.set("payments", [])

        total_paid = 0.0
        for p in payments:
            mop = (p or {}).get("mode_of_payment")
            amt = flt((p or {}).get("amount") or 0)
            if not mop or amt <= 0:
                continue
                
            row = {
                "mode_of_payment": mop, 
                "amount": amt
            }
            
            # Set reference if provided - check field existence first
            ref = (p or {}).get("reference_no")
            if ref:
                if _has_field("Sales Invoice Payment", "reference_no"):
                    row["reference_no"] = ref
                elif _has_field("Sales Invoice Payment", "reference"):
                    row["reference"] = ref
                else:
                    # Fallback: append to invoice remarks
                    if not hasattr(invoice, '_ref_numbers'):
                        invoice._ref_numbers = []
                    invoice._ref_numbers.append(f"{mop}: {ref}")
                    
            invoice.append("payments", row)
            total_paid += amt

        # Validate payment amount
        if total_paid < flt(invoice.grand_total):
            logger.warning(f"process_payment: Underpayment for invoice {invoice_name}: {total_paid} < {invoice.grand_total}")
            return {
                "success": False, 
                "error": _("Payment amount {0} is less than invoice total {1}").format(total_paid, invoice.grand_total)
            }

        # Ensure POS mode
        invoice.is_pos = 1
        
        # Append reference numbers to remarks if collected (schema-safe)
        if hasattr(invoice, '_ref_numbers') and invoice._ref_numbers:
            if _has_field("Sales Invoice", "remarks"):
                ref_text = "; ".join(invoice._ref_numbers)
                existing_remarks = getattr(invoice, 'remarks', '') or ''
                invoice.remarks = f"{existing_remarks}\nPayment Refs: {ref_text}".strip()
            else:
                logger.warning(f"process_payment: Cannot store payment references - remarks field not available")
        
        # Recalculate and submit
        invoice.run_method("calculate_taxes_and_totals")
        invoice.save()
        invoice.submit()
        frappe.db.commit()

        # Calculate change if cash received
        change_amount = None
        if cash_received is not None:
            change_amount = max(0.0, flt(cash_received) - flt(invoice.grand_total))

        logger.info(f"Processed payment for invoice {invoice_name}: paid={total_paid}, total={invoice.grand_total}")

        return {
            "success": True,
            "invoice": invoice.name,
            "invoice_total": flt(invoice.grand_total),
            "paid_total": flt(total_paid),
            "cash_received": flt(cash_received) if cash_received is not None else None,
            "change_amount": flt(change_amount) if change_amount is not None else None,
        }
        
    except Exception as e:
        frappe.db.rollback()
        logger.error(f"process_payment failed for invoice {invoice_name}: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}

    # Idempotent: if already submitted, return success
    if invoice.docstatus == 1:
        logger.info(f"process_payment: Invoice {invoice_name} already paid/submitted")
        change_amount = None
        if cash_received is not None:
            change_amount = max(0.0, flt(cash_received) - flt(invoice.grand_total))
        
        return {
            "success": True, 
            "invoice": invoice.name, 
            "invoice_total": flt(invoice.grand_total),
            "paid_total": flt(invoice.grand_total),
            "cash_received": flt(cash_received) if cash_received is not None else None,
            "change_amount": flt(change_amount) if change_amount is not None else None,
            "message": _("Invoice already paid/submitted")
        }

    # Normalize payment input (new style vs legacy)
    if payments is None and mode_of_payment and paid_amount is not None:
        payments = [{
            "mode_of_payment": mode_of_payment, 
            "amount": flt(paid_amount), 
            "reference_no": reference_no
        }]
    
    payments = _loads_if_str(payments) or []
    
    if not isinstance(payments, list) or not payments:
        logger.error(f"process_payment: No valid payments for invoice {invoice_name}")
        return {"success": False, "error": _("Payments required")}

    try:
        # Clear existing payments for idempotency (replace mode)
        invoice.set("payments", [])

        total_paid = 0.0
        for p in payments:
            mop = (p or {}).get("mode_of_payment")
            amt = flt((p or {}).get("amount") or 0)
            if not mop or amt <= 0:
                continue
                
            row = {
                "mode_of_payment": mop, 
                "amount": amt
            }
            
            # Set reference if provided - check field existence first
            ref = (p or {}).get("reference_no")
            if ref:
                if _has_field("Sales Invoice Payment", "reference_no"):
                    row["reference_no"] = ref
                elif _has_field("Sales Invoice Payment", "reference"):
                    row["reference"] = ref
                else:
                    # Fallback: append to invoice remarks
                    if not hasattr(invoice, '_ref_numbers'):
                        invoice._ref_numbers = []
                    invoice._ref_numbers.append(f"{mop}: {ref}")
                    
            invoice.append("payments", row)
            total_paid += amt

        # Validate payment amount
        if total_paid < flt(invoice.grand_total):
            logger.warning(f"process_payment: Underpayment for invoice {invoice_name}: {total_paid} < {invoice.grand_total}")
            return {
                "success": False, 
                "error": _("Payment amount {0} is less than invoice total {1}").format(total_paid, invoice.grand_total)
            }

        # Ensure POS mode
        invoice.is_pos = 1
        
        # Append reference numbers to remarks if collected (schema-safe)
        if hasattr(invoice, '_ref_numbers') and invoice._ref_numbers:
            if _has_field("Sales Invoice", "remarks"):
                ref_text = "; ".join(invoice._ref_numbers)
                existing_remarks = getattr(invoice, 'remarks', '') or ''
                invoice.remarks = f"{existing_remarks}\nPayment Refs: {ref_text}".strip()
            else:
                logger.warning(f"process_payment: Cannot store payment references - remarks field not available")
        
        # Recalculate and submit
        invoice.run_method("calculate_taxes_and_totals")
        invoice.save()
        invoice.submit()
        frappe.db.commit()

        # Calculate change if cash received
        change_amount = None
        if cash_received is not None:
            change_amount = max(0.0, flt(cash_received) - flt(invoice.grand_total))

        logger.info(f"Processed payment for invoice {invoice_name}: paid={total_paid}, total={invoice.grand_total}")

        return {
            "success": True,
            "invoice": invoice.name,
            "invoice_total": flt(invoice.grand_total),
            "paid_total": flt(total_paid),
            "cash_received": flt(cash_received) if cash_received is not None else None,
            "change_amount": flt(change_amount) if change_amount is not None else None,
        }
        
    except Exception as e:
        frappe.db.rollback()
        logger.error(f"process_payment failed for invoice {invoice_name}: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}


# -----------------------------
# Completion
# -----------------------------

@frappe.whitelist()
def complete_order(order_name, invoice_name=None):
    """
    Complete order workflow (Step 6 - Native v15 with shift safety):
    1. Validate active POS Opening exists (shift safety)
    2. Validate order exists
    3. Validate invoice exists & submitted (docstatus=1)
    4. Validate session match (invoice.imogi_pos_session == active_opening)
    5. Update POS Order workflow_state to "Closed"
    6. Link invoice to order
    7. Set completion_time
    8. Clear table status to Available
    9. Close all KOT Tickets
    10. Commit then publish realtime events
    
    HARDENED: Uses ensure_active_opening() for single source of truth.
    Native v15 pattern: Always require active opening for shift-based operations.
    """
    _require_cashier_role()
    
    # Get operational context
    from imogi_pos.utils.operational_context import require_operational_context
    
    try:
        ctx = require_operational_context()
        pos_profile = ctx["pos_profile"]
    except Exception as e:
        logger.error(f"complete_order: Operational context error: {str(e)}")
        return {"success": False, "error": _("Operational context not available")}
    
    # Step 1: Validate active opening exists (hardened with ensure_active_opening)
    try:
        active_dict = ensure_active_opening(pos_profile=pos_profile, user=frappe.session.user)
        active_name = active_dict.get("name")
    except frappe.ValidationError as e:
        logger.error(f"complete_order: Opening validation failed: {str(e)}")
        return {"success": False, "error": str(e)}
    
    # Step 2: Validate order exists
    if not frappe.db.exists("POS Order", order_name):
        logger.error(f"complete_order: Order {order_name} not found")
        return {"success": False, "error": _("Order not found")}

    try:
        order = frappe.get_doc("POS Order", order_name)

        # Step 3: Validate invoice exists & submitted
        if invoice_name:
            if not frappe.db.exists("Sales Invoice", invoice_name):
                logger.error(f"complete_order: Invoice {invoice_name} not found")
                return {"success": False, "error": _("Invoice not found")}
                
            inv = frappe.get_doc("Sales Invoice", invoice_name)
            if inv.docstatus != 1:
                logger.warning(f"complete_order: Invoice {invoice_name} not submitted yet")
                return {"success": False, "error": _("Invoice not submitted/paid yet")}
            
            # Step 4: Validate session match (shift safety - hardened validation)
            invoice_session = getattr(inv, "imogi_pos_session", None)
            if invoice_session and invoice_session != active_name:
                logger.error(
                    f"complete_order: Invoice {invoice_name} belongs to session {invoice_session}, "
                    f"but active session is {active_name}"
                )
                return {
                    "success": False,
                    "error": _("Invoice belongs to a different session. Cannot complete order across sessions.")
                }

        # Step 5: Update workflow/status to "Closed" - use workflow API if workflow is configured
        # Check if workflow is configured for POS Order (IMOGI POS Order workflow: Served -> Closed via "Close Order" action)
        has_workflow = frappe.db.exists("Workflow", {"document_type": "POS Order", "is_active": 1})
        
        if has_workflow and _has_field("POS Order", "workflow_state"):
            # Use workflow API for proper state transition
            try:
                from frappe.model.workflow import get_transitions, apply_workflow
                
                # Get available transitions from current state for this user
                transitions = get_transitions(order)
                
                # Find action that leads to "Closed" state (IMOGI POS Order workflow final state)
                close_action = None
                for transition in (transitions or []):
                    if transition.get("state") == "Closed":
                        close_action = transition.get("action")
                        break
                
                if close_action:
                    # Apply workflow if user has permission for this transition
                    apply_workflow(order, close_action)
                    logger.info(f"complete_order: Applied workflow action '{close_action}' to reach Closed state for {order_name}")
                else:
                    # No transition available - log available actions for debugging
                    available_actions = [t.get("action") for t in (transitions or [])]
                    logger.warning(
                        f"complete_order: No workflow transition to 'Closed' state available for user {frappe.session.user}. "
                        f"Available actions: {available_actions}. Setting workflow_state directly."
                    )
                    order.workflow_state = "Closed"
                    # Ensure docstatus matches final workflow state (Closed = docstatus 1)
                    if hasattr(order, "docstatus") and order.docstatus == 0:
                        order.docstatus = 1
            except Exception as e:
                # Fallback to direct field set if workflow handling fails
                logger.warning(f"complete_order: Workflow transition failed ({str(e)}), setting workflow_state directly")
                order.workflow_state = "Closed"
                # Ensure docstatus matches final workflow state
                if hasattr(order, "docstatus") and order.docstatus == 0:
                    order.docstatus = 1
        elif _has_field("POS Order", "workflow_state"):
            order.workflow_state = "Closed"
            # Ensure docstatus=1 for closed state
            if hasattr(order, "docstatus") and order.docstatus == 0:
                order.docstatus = 1
            logger.info(f"complete_order: No workflow configured, set workflow_state=Closed for {order_name}")
        elif _has_field("POS Order", "status"):
            order.status = "Closed"
            logger.info(f"complete_order: Set status=Closed for {order_name}")

        # Step 6: Link invoice if provided
        if invoice_name and _has_field("POS Order", "sales_invoice"):
            order.sales_invoice = invoice_name

        # Step 7: Set completion time if field exists
        if _has_field("POS Order", "completion_time"):
            order.completion_time = now()

        order.save()

        # Step 8: Clear table status
        table_name = getattr(order, "table", None)
        if table_name and frappe.db.exists("Restaurant Table", table_name):
            if _has_field("Restaurant Table", "status"):
                frappe.db.set_value("Restaurant Table", table_name, "status", "Available", update_modified=False)
                logger.info(f"complete_order: Cleared table {table_name}")

        # Step 9: Close all KOTs (schema-safe)
        kots = frappe.get_all("KOT Ticket", filters={"pos_order": order_name}, fields=["name"])
        if kots:
            # Determine target workflow state for KOT Ticket
            kot_meta = frappe.get_meta("KOT Ticket")
            kot_has_workflow_state = kot_meta.has_field("workflow_state")
            
            if kot_has_workflow_state:
                # Check which state is valid: prefer "Completed", fallback to "Closed"
                kot_workflow = frappe.db.get_value(
                    "Workflow", 
                    {"document_type": "KOT Ticket", "is_active": 1}, 
                    "name"
                )
                
                target_state = "Completed"  # Default preference
                if kot_workflow:
                    # Verify "Completed" state exists in workflow
                    completed_exists = frappe.db.exists(
                        "Workflow Document State",
                        {"parent": kot_workflow, "state": "Completed"}
                    )
                    if not completed_exists:
                        # Check if "Closed" exists
                        closed_exists = frappe.db.exists(
                            "Workflow Document State",
                            {"parent": kot_workflow, "state": "Closed"}
                        )
                        target_state = "Closed" if closed_exists else "Completed"
                
                for k in kots:
                    frappe.db.set_value("KOT Ticket", k["name"], "workflow_state", target_state, update_modified=False)
                
                logger.info(f"complete_order: Set {len(kots)} KOT tickets to workflow_state='{target_state}' for order {order_name}")
            else:
                logger.info(f"complete_order: KOT Ticket has no workflow_state field, skipping KOT closure")

        # Step 10: Commit all changes BEFORE publishing realtime events
        frappe.db.commit()
        
        # Realtime events for UI updates
        frappe.publish_realtime(
            event="order_completed",
            message={"order": order_name, "table": table_name, "invoice": invoice_name},
            room=f"order:{order_name}",
        )

        if table_name:
            frappe.publish_realtime(
                event="table_cleared",
                message={"table": table_name},
                room=f"table:{table_name}",
            )

        logger.info(f"Order {order_name} completed successfully")

        return {
            "success": True, 
            "message": _("Order completed successfully"), 
            "order": order_name, 
            "table": table_name,
            "invoice": invoice_name
        }
        
    except Exception as e:
        frappe.db.rollback()
        logger.error(f"complete_order failed for {order_name}: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}
    
    # Step 2: Validate order exists
    if not frappe.db.exists("POS Order", order_name):
        logger.error(f"complete_order: Order {order_name} not found")
        return {"success": False, "error": _("Order not found")}

    try:
        order = frappe.get_doc("POS Order", order_name)

        # Step 3: Validate invoice exists & submitted
        if invoice_name:
            if not frappe.db.exists("Sales Invoice", invoice_name):
                logger.error(f"complete_order: Invoice {invoice_name} not found")
                return {"success": False, "error": _("Invoice not found")}
                
            inv = frappe.get_doc("Sales Invoice", invoice_name)
            if inv.docstatus != 1:
                logger.warning(f"complete_order: Invoice {invoice_name} not submitted yet")
                return {"success": False, "error": _("Invoice not submitted/paid yet")}
            
            # Step 4: Validate session match (shift safety)
            invoice_session = getattr(inv, "imogi_pos_session", None)
            if invoice_session and invoice_session != active_name:
                logger.error(
                    f"complete_order: Invoice {invoice_name} belongs to session {invoice_session}, "
                    f"but active session is {active_name}"
                )
                return {
                    "success": False,
                    "error": _("Invoice belongs to session {0}, but your active session is {1}. Cannot complete order.").format(
                        invoice_session, active_name
                    )
                }

        # Step 5: Update workflow/status to "Closed" - use workflow API if workflow is configured
        # Check if workflow is configured for POS Order (IMOGI POS Order workflow: Served -> Closed via "Close Order" action)
        has_workflow = frappe.db.exists("Workflow", {"document_type": "POS Order", "is_active": 1})
        
        if has_workflow and _has_field("POS Order", "workflow_state"):
            # Use workflow API for proper state transition
            try:
                from frappe.model.workflow import get_transitions, apply_workflow
                
                # Get available transitions from current state for this user
                transitions = get_transitions(order)
                
                # Find action that leads to "Closed" state (IMOGI POS Order workflow final state)
                close_action = None
                for transition in (transitions or []):
                    if transition.get("state") == "Closed":
                        close_action = transition.get("action")
                        break
                
                if close_action:
                    # Apply workflow if user has permission for this transition
                    apply_workflow(order, close_action)
                    logger.info(f"complete_order: Applied workflow action '{close_action}' to reach Closed state for {order_name}")
                else:
                    # No transition available - log available actions for debugging
                    available_actions = [t.get("action") for t in (transitions or [])]
                    logger.warning(
                        f"complete_order: No workflow transition to 'Closed' state available for user {frappe.session.user}. "
                        f"Available actions: {available_actions}. Setting workflow_state directly."
                    )
                    order.workflow_state = "Closed"
                    # Ensure docstatus matches final workflow state (Closed = docstatus 1)
                    if hasattr(order, "docstatus") and order.docstatus == 0:
                        order.docstatus = 1
            except Exception as e:
                # Fallback to direct field set if workflow handling fails
                logger.warning(f"complete_order: Workflow transition failed ({str(e)}), setting workflow_state directly")
                order.workflow_state = "Closed"
                # Ensure docstatus matches final workflow state
                if hasattr(order, "docstatus") and order.docstatus == 0:
                    order.docstatus = 1
        elif _has_field("POS Order", "workflow_state"):
            order.workflow_state = "Closed"
            # Ensure docstatus=1 for closed state
            if hasattr(order, "docstatus") and order.docstatus == 0:
                order.docstatus = 1
            logger.info(f"complete_order: No workflow configured, set workflow_state=Closed for {order_name}")
        elif _has_field("POS Order", "status"):
            order.status = "Closed"
            logger.info(f"complete_order: Set status=Closed for {order_name}")

        # Step 6: Link invoice if provided
        if invoice_name and _has_field("POS Order", "sales_invoice"):
            order.sales_invoice = invoice_name

        # Step 7: Set completion time if field exists
        if _has_field("POS Order", "completion_time"):
            order.completion_time = now()

        order.save()

        # Step 8: Clear table status
        table_name = getattr(order, "table", None)
        if table_name and frappe.db.exists("Restaurant Table", table_name):
            if _has_field("Restaurant Table", "status"):
                frappe.db.set_value("Restaurant Table", table_name, "status", "Available", update_modified=False)
                logger.info(f"complete_order: Cleared table {table_name}")

        # Step 9: Close all KOTs (schema-safe)
        kots = frappe.get_all("KOT Ticket", filters={"pos_order": order_name}, fields=["name"])
        if kots:
            # Determine target workflow state for KOT Ticket
            kot_meta = frappe.get_meta("KOT Ticket")
            kot_has_workflow_state = kot_meta.has_field("workflow_state")
            
            if kot_has_workflow_state:
                # Check which state is valid: prefer "Completed", fallback to "Closed"
                kot_workflow = frappe.db.get_value(
                    "Workflow", 
                    {"document_type": "KOT Ticket", "is_active": 1}, 
                    "name"
                )
                
                target_state = "Completed"  # Default preference
                if kot_workflow:
                    # Verify "Completed" state exists in workflow
                    completed_exists = frappe.db.exists(
                        "Workflow Document State",
                        {"parent": kot_workflow, "state": "Completed"}
                    )
                    if not completed_exists:
                        # Check if "Closed" exists
                        closed_exists = frappe.db.exists(
                            "Workflow Document State",
                            {"parent": kot_workflow, "state": "Closed"}
                        )
                        target_state = "Closed" if closed_exists else "Completed"
                
                for k in kots:
                    frappe.db.set_value("KOT Ticket", k["name"], "workflow_state", target_state, update_modified=False)
                
                logger.info(f"complete_order: Set {len(kots)} KOT tickets to workflow_state='{target_state}' for order {order_name}")
            else:
                logger.info(f"complete_order: KOT Ticket has no workflow_state field, skipping KOT closure")

        # Step 10: Commit all changes BEFORE publishing realtime events
        frappe.db.commit()
        
        # Realtime events for UI updates
        frappe.publish_realtime(
            event="order_completed",
            message={"order": order_name, "table": table_name, "invoice": invoice_name},
            room=f"order:{order_name}",
        )

        if table_name:
            frappe.publish_realtime(
                event="table_cleared",
                message={"table": table_name},
                room=f"table:{table_name}",
            )

        logger.info(f"Order {order_name} completed successfully")

        return {
            "success": True, 
            "message": _("Order completed successfully"), 
            "order": order_name, 
            "table": table_name,
            "invoice": invoice_name
        }
        
    except Exception as e:
        frappe.db.rollback()
        logger.error(f"complete_order failed for {order_name}: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}


# -----------------------------
# Opening Summary + Closing
# -----------------------------

@frappe.whitelist()
def get_opening_summary(opening_name=None):
    """
    Step 7: View Summary - Aggregate POS payments per mode_of_payment for active session.
    
    HARDENED: Auto-resolves active opening if not provided, validates if provided.
    
    Native v15 shift-based flow:
    1. Resolve active opening (docstatus=1 + no pos_closing_entry)
    2. Aggregate payments from Sales Invoice Payment child table
    3. Filter by imogi_pos_session = opening_name
    4. Group by mode_of_payment with totals
    
    UI Guard Required:
    - Frontend MUST check get_active_opening() first
    - If no opening: Show error + redirect to /app/pos-opening-entry
    - NO modal "Start Shift" - use native POS Opening Entry flow
    
    Args:
        opening_name: POS Opening Entry name (optional, will auto-resolve active opening)
        
    Returns:
        {success, opening, totals_by_mode: [{mode_of_payment, total, invoice_count}], grand_total}
    """
    try:
        from imogi_pos.utils.operational_context import require_operational_context
        
        if not opening_name:
            # Auto-resolve active opening (hardened approach)
            try:
                ctx = require_operational_context()
                pos_profile = ctx.get("pos_profile")
                
                if not pos_profile:
                    logger.warning("get_opening_summary: No POS Profile in context")
                    return {
                        "success": False, 
                        "error": _("No POS Profile configured")
                    }
                
                # Use ensure_active_opening to get server-resolved opening
                opening_dict = ensure_active_opening(pos_profile=pos_profile, user=frappe.session.user)
                opening_name = opening_dict.get("name")
                
            except frappe.ValidationError as e:
                logger.error(f"get_opening_summary: Opening validation failed: {str(e)}")
                return {"success": False, "error": str(e)}
        else:
            # If opening_name provided, validate it matches active opening
            try:
                ctx = require_operational_context()
                pos_profile = ctx.get("pos_profile")
                
                if pos_profile:
                    # Check if provided opening matches active opening
                    try:
                        active_dict = ensure_active_opening(pos_profile=pos_profile, user=frappe.session.user)
                        active_name = active_dict.get("name")
                        
                        if active_name and opening_name != active_name:
                            logger.error(f"get_opening_summary: Provided opening {opening_name} != active {active_name}")
                            return {
                                "success": False,
                                "error": _("Provided opening does not match your active session")
                            }
                    except frappe.ValidationError:
                        # No active opening, but one was provided - validate it exists at least
                        if not frappe.db.exists("POS Opening Entry", opening_name):
                            logger.error(f"get_opening_summary: Opening {opening_name} not found")
                            return {"success": False, "error": _("Opening not found")}
            except Exception as e:
                logger.warning(f"get_opening_summary: Context error (continuing): {str(e)}")
                # Continue with provided opening_name even if context unavailable

        if not opening_name:
            return {"success": False, "error": _("Could not determine opening name")}

        # Aggregate payments from Sales Invoice Payment (POS-native)
        rows = frappe.db.sql("""
            SELECT 
                sip.mode_of_payment, 
                SUM(sip.amount) AS total,
                COUNT(DISTINCT si.name) AS invoice_count
            FROM `tabSales Invoice` si
            JOIN `tabSales Invoice Payment` sip ON sip.parent = si.name
            WHERE si.docstatus = 1
              AND si.imogi_pos_session = %(opening)s
            GROUP BY sip.mode_of_payment
            ORDER BY sip.mode_of_payment
        """, {"opening": opening_name}, as_dict=True)

        # Calculate grand total
        grand_total = sum(flt(r.total) for r in rows)

        logger.info(f"get_opening_summary: Session {opening_name} has {len(rows)} payment modes, total {grand_total}")

        return {
            "success": True, 
            "opening": opening_name, 
            "totals_by_mode": rows,
            "grand_total": grand_total
        }
        
    except Exception as e:
        logger.error(f"get_opening_summary failed: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def close_pos_opening(opening_name, counted_balances):
    """
    Create POS Closing Entry and reconcile.
    counted_balances: [{mode_of_payment, closing_amount}, ...]
    
    HARDENED: Validates opening_name matches active opening before proceeding.
    
    Native ERPNext v15: Closing always applicable (shift-based accounting).
    
    Process:
    1. Validate opening exists and is submitted
    2. Validate opening matches active opening
    3. Calculate expected amounts from opening + collected payments
    4. Compare with counted amounts
    5. Create and submit POS Closing Entry with reconciliation
    6. Link closing back to opening
    
    Returns: {success, closing, opening, reconciliation_summary}
    """
    _require_cashier_role()

    counted_balances = _loads_if_str(counted_balances) or []
    
    if not opening_name:
        logger.error("close_pos_opening: No opening name provided")
        frappe.throw(_("Opening name required"))
    
    if not isinstance(counted_balances, list) or not counted_balances:
        logger.error("close_pos_opening: Counted balances required")
        frappe.throw(_("Counted balances required for closing"))

    if not frappe.db.exists("POS Opening Entry", opening_name):
        logger.error(f"close_pos_opening: Opening {opening_name} not found")
        frappe.throw(_("Opening not found"))

    try:
        opening = frappe.get_doc("POS Opening Entry", opening_name)
        if opening.docstatus != 1:
            logger.error(f"close_pos_opening: Opening {opening_name} not submitted")
            frappe.throw(_("Opening must be submitted"))

        # HARDENED: Validate provided opening matches active opening
        from imogi_pos.utils.operational_context import require_operational_context
        
        try:
            ctx = require_operational_context()
            pos_profile = ctx.get("pos_profile")
            
            if pos_profile:
                try:
                    active_dict = ensure_active_opening(pos_profile=pos_profile, user=frappe.session.user)
                    active_name = active_dict.get("name")
                    
                    if active_name and opening_name != active_name:
                        logger.error(f"close_pos_opening: Provided opening {opening_name} != active {active_name}")
                        frappe.throw(_("Cannot close a session that is not your active session"))
                except frappe.ValidationError as e:
                    logger.error(f"close_pos_opening: Active opening validation failed: {str(e)}")
                    frappe.throw(_("Your active session was not found or expired"))
        except Exception as e:
            logger.warning(f"close_pos_opening: Context check failed (continuing): {str(e)}")
            # Continue with closing even if context unavailable (may be closing old session)

        # Check if already closed
        if _has_field("POS Opening Entry", "pos_closing_entry"):
            existing_closing = getattr(opening, "pos_closing_entry", None)
            if existing_closing:
                logger.info(f"close_pos_opening: Opening {opening_name} already closed with {existing_closing}")
                return {
                    "success": True,
                    "closing": existing_closing,
                    "opening": opening_name,
                    "message": _("Opening already closed")
                }

        # Build opening amounts map
        opening_map = {}
        for d in opening.balance_details:
            opening_map[d.mode_of_payment] = flt(d.opening_amount or 0)

        # Calculate expected totals from invoices in this session
        paid_rows = frappe.db.sql("""
            SELECT sip.mode_of_payment, SUM(sip.amount) AS total
            FROM `tabSales Invoice` si
            JOIN `tabSales Invoice Payment` sip ON sip.parent = si.name
            WHERE si.docstatus = 1
              AND si.imogi_pos_session = %(opening)s
            GROUP BY sip.mode_of_payment
        """, {"opening": opening_name}, as_dict=True)
        paid_map = {r.mode_of_payment: flt(r.total or 0) for r in paid_rows}

        # Create Closing Entry
        closing = frappe.new_doc("POS Closing Entry")

        _set_if_field(closing, "pos_opening_entry", opening_name)
        _set_if_field(closing, "company", opening.company)
        _set_if_field(closing, "pos_profile", opening.pos_profile)
        _set_if_field(closing, "user", frappe.session.user)

        _set_if_field(closing, "period_start_date", opening.period_start_date)
        _set_if_field(closing, "period_end_date", now())
        _set_if_field(closing, "posting_date", today())
        _set_if_field(closing, "posting_time", nowtime())

        # Build comprehensive reconciliation rows
        # Include ALL modes from: opening + paid + counted (to avoid missing expected amounts)
        all_modes = set(opening_map.keys()) | set(paid_map.keys())
        
        # Build counted map
        counted_map = {}
        for c in counted_balances:
            mop = (c or {}).get("mode_of_payment")
            if mop:
                counted_map[mop] = flt((c or {}).get("closing_amount") or 0)
        
        all_modes |= set(counted_map.keys())
        
        reconciliation_summary = []
        total_difference = 0.0
        
        for mop in sorted(all_modes):
            opening_amt = flt(opening_map.get(mop, 0))
            paid_amt = flt(paid_map.get(mop, 0))
            expected_amt = opening_amt + paid_amt
            closing_amt = flt(counted_map.get(mop, 0))
            diff = closing_amt - expected_amt

            row = {
                "mode_of_payment": mop,
                "opening_amount": opening_amt,
                "expected_amount": expected_amt,
                "closing_amount": closing_amt,
                "difference": diff,
            }
            closing.append("payment_reconciliation", row)
            
            reconciliation_summary.append({
                "mode_of_payment": mop,
                "expected": expected_amt,
                "counted": closing_amt,
                "difference": diff
            })
            total_difference += diff

        closing.insert(ignore_permissions=True)
        closing.submit()

        # Link back to opening
        if _has_field("POS Opening Entry", "pos_closing_entry"):
            frappe.db.set_value("POS Opening Entry", opening_name, "pos_closing_entry", closing.name, update_modified=False)
        
        frappe.db.commit()
        logger.info(f"Closed POS Opening {opening_name} with Closing Entry {closing.name}, total difference: {total_difference}")

        return {
            "success": True, 
            "closing": closing.name, 
            "opening": opening_name,
            "reconciliation_summary": reconciliation_summary,
            "total_difference": total_difference
        }
        
    except Exception as e:
        frappe.db.rollback()
        logger.error(f"close_pos_opening failed for {opening_name}: {str(e)}", exc_info=True)
        frappe.throw(_("Failed to close opening: {0}").format(str(e)))


# -----------------------------
# Split Bill (stub for Counter mode compatibility)
# -----------------------------

@frappe.whitelist()
def split_bill(order_name, split_config):
    """
    Split bill functionality (stub for Counter mode).
    
    TODO: Implement full split bill logic:
    - Validate order exists and has invoice
    - Parse split_config (by amount, by item, by percentage, etc.)
    - Create multiple invoices from single order
    - Update order references
    - Handle partial payments
    
    Args:
        order_name: POS Order name
        split_config: JSON/dict with split configuration
        
    Returns:
        {success, error} - Currently not implemented
    """
    _require_cashier_role()
    
    logger.warning(f"split_bill called for order {order_name} - not implemented yet")
    
    return {
        "success": False,
        "error": _("Split Bill feature is not yet implemented in Counter mode. Please use single invoice flow.")
    }


# -----------------------------
# Payment methods (unchanged, but keep simple)
# -----------------------------

@frappe.whitelist()
def get_payment_methods():
    methods = frappe.get_all(
        "Mode of Payment",
        filters={"enabled": 1},
        fields=["name", "mode_of_payment", "type"],
    )
    return {"success": True, "methods": methods}
