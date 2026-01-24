"""
Customer Fields Auto-Sync Utilities

Utilities for synchronizing customer information from Customer master
to POS Order and Sales Invoice to maintain data consistency.
"""

import frappe


def sync_customer_fields_to_order(order_doc, customer_name=None):
	"""
	Sync customer fields from Customer master to POS Order
	
	Args:
		order_doc: POS Order document
		customer_name: Customer name (optional, uses order_doc.customer if not provided)
	"""
	if not customer_name:
		customer_name = order_doc.customer
	
	if not customer_name or customer_name == "Guest":
		return
	
	try:
		customer = frappe.get_doc("Customer", customer_name)
		
		# Sync fields if not already set in order
		if not order_doc.customer_full_name and customer.customer_name:
			order_doc.customer_full_name = customer.customer_name
		
		if not order_doc.customer_gender and customer.gender:
			order_doc.customer_gender = customer.gender
		
		if not order_doc.customer_phone and customer.mobile_no:
			order_doc.customer_phone = customer.mobile_no
		
		# Sync custom fields
		if not order_doc.customer_age and customer.customer_age:
			order_doc.customer_age = customer.customer_age
		
		# Note: customer_identification might not exist on Customer yet
		if hasattr(customer, 'customer_identification') and not order_doc.get('customer_identification'):
			if customer.customer_identification:
				order_doc.customer_identification = customer.customer_identification
	
	except frappe.DoesNotExistError:
		frappe.log_error(
			title="Customer Sync Error",
			message=f"Customer {customer_name} not found for order {order_doc.name}"
		)
	except Exception as e:
		frappe.log_error(
			title="Customer Sync Error",
			message=f"Error syncing customer fields to order {order_doc.name}: {str(e)}"
		)


def sync_customer_fields_to_invoice(invoice_doc, customer_name=None):
	"""
	Sync customer fields from Customer master to Sales Invoice
	
	Args:
		invoice_doc: Sales Invoice document
		customer_name: Customer name (optional, uses invoice_doc.customer if not provided)
	"""
	if not customer_name:
		customer_name = invoice_doc.customer
	
	if not customer_name or customer_name == "Guest":
		return
	
	try:
		customer = frappe.get_doc("Customer", customer_name)
		
		# Sync fields if not already set in invoice
		if not invoice_doc.customer_full_name and customer.customer_name:
			invoice_doc.customer_full_name = customer.customer_name
		
		if not invoice_doc.customer_gender and customer.gender:
			invoice_doc.customer_gender = customer.gender
		
		if not invoice_doc.customer_phone and customer.mobile_no:
			invoice_doc.customer_phone = customer.mobile_no
		
		# Sync custom fields
		if not invoice_doc.customer_age and customer.customer_age:
			invoice_doc.customer_age = customer.customer_age
		
		if hasattr(customer, 'customer_identification') and not invoice_doc.get('customer_identification'):
			if customer.customer_identification:
				invoice_doc.customer_identification = customer.customer_identification
	
	except frappe.DoesNotExistError:
		frappe.log_error(
			title="Customer Sync Error",
			message=f"Customer {customer_name} not found for invoice {invoice_doc.name}"
		)
	except Exception as e:
		frappe.log_error(
			title="Customer Sync Error",
			message=f"Error syncing customer fields to invoice {invoice_doc.name}: {str(e)}"
		)


def update_customer_from_order(customer_name, order_doc):
	"""
	Update Customer master from POS Order data (reverse sync for guest upgrades)
	
	Args:
		customer_name: Customer name
		order_doc: POS Order document with customer data
	"""
	if not customer_name or customer_name == "Guest":
		return
	
	try:
		customer = frappe.get_doc("Customer", customer_name)
		
		# Update fields if they are set in order but not in customer master
		updated = False
		
		if order_doc.customer_gender and not customer.gender:
			customer.gender = order_doc.customer_gender
			updated = True
		
		if order_doc.customer_phone and not customer.mobile_no:
			customer.mobile_no = order_doc.customer_phone
			updated = True
		
		if order_doc.customer_age and not customer.customer_age:
			customer.customer_age = order_doc.customer_age
			updated = True
		
		if hasattr(order_doc, 'customer_identification') and order_doc.customer_identification:
			if hasattr(customer, 'customer_identification') and not customer.customer_identification:
				customer.customer_identification = order_doc.customer_identification
				updated = True
		
		if updated:
			customer.save(ignore_permissions=True)
			frappe.logger().info(f"Updated customer {customer_name} from order {order_doc.name}")
	
	except frappe.DoesNotExistError:
		pass  # Customer doesn't exist yet
	except Exception as e:
		frappe.log_error(
			title="Customer Update Error",
			message=f"Error updating customer {customer_name} from order: {str(e)}"
		)


@frappe.whitelist()
def get_customer_quick_info(customer_name):
	"""
	Get quick customer info for POS/Order screens
	
	Args:
		customer_name: Customer name
	
	Returns:
		dict: Customer info including full name, gender, phone, age, classification
	"""
	if not customer_name or customer_name == "Guest":
		return {}
	
	try:
		customer = frappe.get_doc("Customer", customer_name)
		
		info = {
			"customer_name": customer.customer_name,
			"gender": customer.gender,
			"mobile_no": customer.mobile_no,
			"email_id": customer.email_id
		}
		
		# Add custom fields if they exist
		if hasattr(customer, 'customer_age'):
			info["customer_age"] = customer.customer_age
		
		if hasattr(customer, 'customer_identification'):
			info["customer_identification"] = customer.customer_identification
		
		return info
	
	except frappe.DoesNotExistError:
		return {}
	except Exception as e:
		frappe.log_error(
			title="Get Customer Info Error",
			message=f"Error getting info for customer {customer_name}: {str(e)}"
		)
		return {}
