from frappe.model.document import Document
from frappe.model.naming import make_autoname


class CashierDeviceSession(Document):
    def autoname(self):
        self.name = make_autoname("SHF-.YYYYMMDD.-.###")
