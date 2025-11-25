"""Currency utilities for IMOGI POS."""
import frappe


def get_currency_symbol():
    """Return the symbol for the system default currency.

    Looks up the default currency and fetches its symbol from the Currency doctype.
    Falls back to the currency code if no symbol is defined.
    """
    currency = frappe.db.get_default("currency")
    if currency:
        return frappe.db.get_value("Currency", currency, "symbol") or currency
    return ""
