import frappe
from imogi_pos.setup.install import create_cash_accounts


def execute():
    """Create cash accounts for existing sites."""
    create_cash_accounts()
