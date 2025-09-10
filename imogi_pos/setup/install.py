"""Installation helpers for IMOGI POS."""

import frappe


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
