from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt


@frappe.whitelist()
def open_kiosk_session(pos_profile: str, opening_balance: float) -> dict:
    """Create an opening shift and POS session for kiosk use.

    Args:
        pos_profile: POS Profile name to attach the session to.
        opening_balance: Opening cash balance provided by the operator.

    Returns:
        dict with created session details ``{"name": <session>, "pos_opening_shift": <shift>}``
    """
    opening_balance = flt(opening_balance)

    if not pos_profile:
        frappe.throw(_("POS Profile is required"))

    # If POS Session doctype is unavailable (e.g. ERPNext not installed)
    if not frappe.db.exists("DocType", "POS Session"):
        return {}

    company = frappe.defaults.get_user_default("Company")

    try:
        opening = frappe.new_doc("POS Opening Shift")
        opening.pos_profile = pos_profile
        opening.user = frappe.session.user
        opening.company = company
        opening.set("balance_details", [{
            "mode_of_payment": "Cash",
            "opening_amount": opening_balance,
        }])
        opening.insert(ignore_permissions=True)
        opening.submit()

        session = frappe.new_doc("POS Session")
        session.pos_profile = pos_profile
        session.user = frappe.session.user
        session.company = company
        session.status = "Open"
        session.pos_opening_shift = opening.name
        session.insert(ignore_permissions=True)

        return {"name": session.name, "pos_opening_shift": opening.name}
    except Exception as err:
        frappe.log_error(f"Failed to open kiosk session: {err}")
        frappe.throw(_("Failed to open POS session"))

