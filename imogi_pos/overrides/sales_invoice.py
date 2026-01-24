"""
Sales Invoice Override

Override Sales Invoice to auto-sync customer fields from Customer master
"""

import frappe
from erpnext.accounts.doctype.sales_invoice.sales_invoice import SalesInvoice
from imogi_pos.utils.customer_sync import sync_customer_fields_to_invoice


class CustomSalesInvoice(SalesInvoice):
	"""Extended Sales Invoice with customer field auto-sync"""
	
	def validate(self):
		"""Validate and sync customer fields"""
		self.sync_customer_fields()
		super().validate()
	
	def sync_customer_fields(self):
		"""Auto-sync customer fields from Customer master if customer selected"""
		if self.customer and self.customer != "Guest":
			sync_customer_fields_to_invoice(self)
