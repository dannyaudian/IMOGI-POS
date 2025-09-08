import frappe


def report_error(status_code=None):
    """Minimal stub of frappe.utils.response.report_error for tests.

    Logs the traceback and attempts to print it, handling BrokenPipeError
    gracefully by logging it again with a specific title.
    """
    message = frappe.get_traceback()
    frappe.log_error(message)
    try:
        frappe.errprint(message)
    except BrokenPipeError:
        frappe.log_error(message, "BrokenPipeError")
