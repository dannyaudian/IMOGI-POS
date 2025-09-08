import frappe


def report_error():
    """Log and print traceback safely.

    Ensures that a broken pipe while printing does not raise and the
    traceback is still logged."""
    traceback = frappe.get_traceback()
    # Always log the original traceback first
    frappe.log_error(traceback)
    try:
        frappe.errprint(traceback)
    except BrokenPipeError:
        frappe.log_error(traceback, "BrokenPipeError")
