from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import now_datetime


class CashierDeviceSession(Document):
    def autoname(self):
        date = now_datetime().strftime("%Y%m%d")
        self.name = make_autoname(f"SHF-{date}-.###")
