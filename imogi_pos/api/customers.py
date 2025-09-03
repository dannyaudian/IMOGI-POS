# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
import re

def validate_branch_access(branch):
    """
    Validates that the current user has access to the specified branch.
    
    Args:
        branch (str): Branch name
    
    Raises:
        frappe.PermissionError: If user doesn't have access to the branch
    """
    if not frappe.has_permission("Branch", doc=branch):
        frappe.throw(_("You don't have access to branch: {0}").format(branch), 
                    frappe.PermissionError)

def normalize_phone_number(phone):
    """
    Normalizes phone number by removing spaces, dashes, and handling 
    Indonesia's country code (+62 vs 0).
    
    Args:
        phone (str): Phone number to normalize
    
    Returns:
        list: List of possible normalized phone number formats
    """
    if not phone:
        return []
    
    # Remove all non-digit characters
    clean_phone = re.sub(r'\D', '', phone)
    
    # Handle empty result
    if not clean_phone:
        return []
    
    results = [clean_phone]
    
    # Handle Indonesia country code conversion (most common case)
    # +62 format to 0 format
    if clean_phone.startswith('62'):
        zero_format = '0' + clean_phone[2:]
        results.append(zero_format)
    
    # 0 format to +62 format
    elif clean_phone.startswith('0'):
        intl_format = '62' + clean_phone[1:]
        results.append(intl_format)
    
    # With plus sign for display
    if clean_phone.startswith('62'):
        plus_format = '+' + clean_phone
        results.append(plus_format)
    
    return results

@frappe.whitelist()
def find_customer_by_phone(phone):
    """
    Finds customers by phone number, searching both Customer and Contact.
    Handles various phone number formats.
    
    Args:
        phone (str): Phone number to search for
    
    Returns:
        list: List of matching customers with details
    """
    if not phone or len(phone) < 5:
        return []
    
    # Normalize phone number to handle different formats
    normalized_phones = normalize_phone_number(phone)
    if not normalized_phones:
        return []
    
    # Build conditions for the different phone formats
    phone_conditions = " OR ".join(["c.mobile_no LIKE %s"] * len(normalized_phones))
    phone_params = [f"%{p}%" for p in normalized_phones]
    
    contact_phone_conditions = " OR ".join(["co.mobile_no LIKE %s"] * len(normalized_phones))
    contact_phone_params = [f"%{p}%" for p in normalized_phones]
    
    # First check Customer table directly
    customers_direct = frappe.db.sql(f"""
        SELECT 
            c.name as customer,
            c.customer_name,
            c.customer_type,
            c.customer_group,
            c.territory,
            c.mobile_no as phone,
            c.email_id as email,
            c.tax_id,
            c.customer_primary_address as primary_address,
            NULL as contact
        FROM `tabCustomer` c
        WHERE {phone_conditions}
        ORDER BY c.modified DESC
    """, phone_params, as_dict=1)
    
    # Then check via Contact links
    customers_via_contact = frappe.db.sql(f"""
        SELECT 
            c.name as customer,
            c.customer_name,
            c.customer_type,
            c.customer_group,
            c.territory,
            co.mobile_no as phone,
            co.email_id as email,
            c.tax_id,
            c.customer_primary_address as primary_address,
            co.name as contact
        FROM `tabContact` co
        JOIN `tabDynamic Link` dl ON dl.parent = co.name
        JOIN `tabCustomer` c ON c.name = dl.link_name
        WHERE dl.link_doctype = 'Customer'
        AND ({contact_phone_conditions})
        ORDER BY co.modified DESC
    """, contact_phone_params, as_dict=1)
    
    # Combine results, removing duplicates
    seen_customers = set()
    combined_results = []
    
    for customer in customers_direct + customers_via_contact:
        if customer['customer'] not in seen_customers:
            seen_customers.add(customer['customer'])
            combined_results.append(customer)
    
    return combined_results

@frappe.whitelist()
def quick_create_customer_with_contact(
    customer_name=None,
    mobile_no=None,
    email_id=None,
    name=None,
    phone=None,
    email=None,
    customer_group=None,
    territory=None,
):
    """
    Quickly creates a Customer and associated Contact in one operation.

    Args:
        customer_name (str): Customer name.
        mobile_no (str): Phone number.
        email_id (str, optional): Email address. Defaults to None.
        customer_group (str, optional): Customer Group. Defaults to None.
        territory (str, optional): Territory. Defaults to None.
        name, phone, email: Backward compatible aliases for the above fields.

    Returns:
        dict: Created Customer details

    Raises:
        frappe.ValidationError: If required fields are missing or validation fails
    """
    # Backward compatibility for old parameter names
    name = customer_name or name
    phone = mobile_no or phone
    email = email_id or email

    if not name:
        frappe.throw(_("Customer name is required"), frappe.ValidationError)

    if not phone:
        frappe.throw(_("Phone number is required"), frappe.ValidationError)

    # Normalize phone
    normalized_phones = normalize_phone_number(phone)
    if not normalized_phones:
        frappe.throw(_("Invalid phone number format"), frappe.ValidationError)
    
    normalized_phone = normalized_phones[0]
    
    # Get default customer group and territory if not provided
    if not customer_group:
        customer_group = frappe.db.get_single_value("Selling Settings", "customer_group") or \
                        frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
    
    if not territory:
        territory = frappe.db.get_single_value("Selling Settings", "territory") or \
                   frappe.db.get_value("Territory", {"is_group": 0}, "name")
    
    try:
        # First check if a customer with this phone already exists
        existing_customers = find_customer_by_phone(normalized_phone)
        if existing_customers:
            return {
                "success": False,
                "message": _("A customer with this phone number already exists"),
                "customer": existing_customers[0]
            }
        
        # Create the customer
        customer = frappe.get_doc({
            "doctype": "Customer",
            "customer_name": name,
            "customer_group": customer_group,
            "territory": territory,
            "customer_type": "Individual",
            "mobile_no": normalized_phone,
            "email_id": email
        })
        
        customer.insert(ignore_permissions=True)
        
        # Create the contact
        contact = frappe.get_doc({
            "doctype": "Contact",
            "first_name": name,
            "mobile_no": normalized_phone,
            "email_id": email,
            "links": [{
                "link_doctype": "Customer",
                "link_name": customer.name
            }]
        })
        
        contact.insert(ignore_permissions=True)
        
        # Return customer details
        return {
            "success": True,
            "customer": {
                "customer": customer.name,
                "customer_name": customer.customer_name,
                "customer_type": customer.customer_type,
                "customer_group": customer.customer_group,
                "territory": customer.territory,
                "phone": customer.mobile_no,
                "email": customer.email_id,
                "contact": contact.name
            }
        }
        
    except Exception as e:
        frappe.log_error(f"Error creating customer: {str(e)}")
        return {
            "success": False,
            "message": str(e)
        }

@frappe.whitelist()
def attach_customer_to_order_or_invoice(customer, pos_order=None, sales_invoice=None):
    """
    Attaches a customer to a POS Order or Sales Invoice.
    
    Args:
        customer (str): Customer name
        pos_order (str, optional): POS Order name. Defaults to None.
        sales_invoice (str, optional): Sales Invoice name. Defaults to None.
    
    Returns:
        dict: Status of the operation
    
    Raises:
        frappe.ValidationError: If neither POS Order nor Sales Invoice is provided
    """
    if not customer:
        frappe.throw(_("Customer is required"), frappe.ValidationError)
    
    if not pos_order and not sales_invoice:
        frappe.throw(_("Either POS Order or Sales Invoice must be provided"), frappe.ValidationError)
    
    result = {
        "success": False,
        "customer": customer,
        "pos_order": pos_order,
        "sales_invoice": sales_invoice,
        "message": ""
    }
    
    try:
        # Get customer details
        customer_doc = frappe.get_doc("Customer", customer)
        
        # Attach to POS Order
        if pos_order:
            pos_order_doc = frappe.get_doc("POS Order", pos_order)
            validate_branch_access(pos_order_doc.branch)
            
            # Update customer
            pos_order_doc.customer = customer
            pos_order_doc.save(ignore_permissions=True)
            
            result["success"] = True
            result["message"] = _("Customer attached to POS Order")
        
        # Attach to Sales Invoice
        if sales_invoice:
            invoice_doc = frappe.get_doc("Sales Invoice", sales_invoice)
            validate_branch_access(invoice_doc.branch)
            
            # Ensure invoice is not already submitted
            if invoice_doc.docstatus == 1:
                frappe.throw(_("Cannot update customer on submitted Sales Invoice"), frappe.ValidationError)
            
            # Update customer
            invoice_doc.customer = customer
            if hasattr(customer_doc, "customer_name"):
                invoice_doc.customer_name = customer_doc.customer_name
            
            invoice_doc.save(ignore_permissions=True)
            
            result["success"] = True
            result["message"] += _("Customer attached to Sales Invoice")
        
        return result
        
    except Exception as e:
        frappe.log_error(f"Error attaching customer: {str(e)}")
        return {
            "success": False,
            "message": str(e),
            "customer": customer,
            "pos_order": pos_order,
            "sales_invoice": sales_invoice
        }