"""Queue number utilities for POS orders."""

import frappe


def get_next_queue_number(branch: str) -> int:
    """Return the next queue number for a branch based on today's orders.

    The sequence resets every day at midnight.
    """
    try:
        result = frappe.db.sql(
            """
            SELECT MAX(queue_number) as max_number
            FROM `tabPOS Order`
            WHERE DATE(creation) = CURDATE()
            AND branch = %s
            AND queue_number IS NOT NULL
            """,
            branch,
            as_dict=True,
        )
        max_number = result[0].get("max_number") if result else None
        return (max_number or 0) + 1
    except Exception:
        return 1
