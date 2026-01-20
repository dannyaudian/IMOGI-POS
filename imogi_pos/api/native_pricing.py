# -*- coding: utf-8 -*-
"""
Native ERPNext Pricing Rule Integration for IMOGI POS
Provides wrapper functions to leverage native ERPNext pricing and promotional features.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import frappe
from frappe import _
from frappe.utils import flt, nowdate


@frappe.whitelist()
def get_applicable_pricing_rules(
    item_code: str,
    customer: Optional[str] = None,
    price_list: Optional[str] = None,
    qty: float = 1.0,
    transaction_date: Optional[str] = None,
    pos_profile: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get applicable native ERPNext Pricing Rules for an item.
    
    Args:
        item_code: Item code to check
        customer: Customer name
        price_list: Price list name
        qty: Quantity
        transaction_date: Transaction date (defaults to today)
        pos_profile: POS Profile name
    
    Returns:
        dict: Pricing rule details including discount and free items
    """
    try:
        from erpnext.accounts.doctype.pricing_rule.pricing_rule import (
            get_pricing_rule_for_item,
        )
    except ImportError:
        return {
            "success": False,
            "error": "ERPNext pricing module not found",
            "pricing_rules": []
        }
    
    if not transaction_date:
        transaction_date = nowdate()
    
    # Get company from POS Profile or default
    company = frappe.defaults.get_user_default("Company")
    if pos_profile:
        company = frappe.db.get_value("POS Profile", pos_profile, "company") or company
    
    # Get currency from price list or company
    currency = None
    if price_list:
        currency = frappe.db.get_value("Price List", price_list, "currency")
    if not currency:
        currency = frappe.db.get_value("Company", company, "default_currency")
    
    try:
        args = {
            "item_code": item_code,
            "customer": customer,
            "price_list": price_list,
            "currency": currency,
            "company": company,
            "transaction_date": transaction_date,
            "qty": flt(qty),
            "doctype": "Sales Invoice",  # POS uses Sales Invoice
            "transaction_type": "selling",
        }
        
        pricing_rule = get_pricing_rule_for_item(args)
        
        if pricing_rule:
            return {
                "success": True,
                "has_rule": True,
                "pricing_rule": pricing_rule.name,
                "discount_percentage": flt(pricing_rule.discount_percentage or 0),
                "discount_amount": flt(pricing_rule.discount_amount or 0),
                "rate": flt(pricing_rule.price_or_product_discount == "Price" and pricing_rule.rate or 0),
                "free_item": pricing_rule.price_or_product_discount == "Product" and pricing_rule.free_item or None,
                "free_qty": flt(pricing_rule.free_qty or 0),
                "apply_multiple_pricing_rules": pricing_rule.apply_multiple_pricing_rules or 0,
                "priority": pricing_rule.priority or 0,
            }
        else:
            return {
                "success": True,
                "has_rule": False,
                "pricing_rule": None,
            }
            
    except Exception as e:
        frappe.log_error(f"Error getting pricing rule: {str(e)}", "Native Pricing Integration")
        return {
            "success": False,
            "error": str(e),
            "has_rule": False,
        }


@frappe.whitelist()
def get_promotional_schemes(
    item_code: Optional[str] = None,
    customer: Optional[str] = None,
    price_list: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Get active native ERPNext Promotional Schemes.
    
    Args:
        item_code: Filter by item code
        customer: Filter by customer
        price_list: Filter by price list
    
    Returns:
        list: Active promotional schemes
    """
    if not frappe.db.exists("DocType", "Promotional Scheme"):
        return []
    
    filters = {
        "disabled": 0,
        "selling": 1,
    }
    
    today = nowdate()
    
    schemes = frappe.get_all(
        "Promotional Scheme",
        filters=filters,
        fields=[
            "name",
            "title",
            "apply_on",
            "price_or_product_discount",
            "valid_from",
            "valid_upto",
            "priority",
            "apply_multiple_pricing_rules",
        ],
    )
    
    # Filter by date
    valid_schemes = []
    for scheme in schemes:
        is_valid = True
        if scheme.valid_from and scheme.valid_from > today:
            is_valid = False
        if scheme.valid_upto and scheme.valid_upto < today:
            is_valid = False
        
        if is_valid:
            valid_schemes.append(scheme)
    
    return valid_schemes


@frappe.whitelist()
def apply_pricing_rules_to_items(
    items: List[Dict[str, Any]],
    customer: Optional[str] = None,
    price_list: Optional[str] = None,
    pos_profile: Optional[str] = None,
    transaction_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Apply native ERPNext pricing rules to multiple items.
    
    Args:
        items: List of item dicts with item_code, qty, rate
        customer: Customer name
        price_list: Price list name
        pos_profile: POS Profile name
        transaction_date: Transaction date
    
    Returns:
        dict: Items with applied pricing rules and summary
    """
    if not items:
        return {
            "items": [],
            "total_discount_amount": 0,
            "total_discount_percentage": 0,
            "free_items": [],
        }
    
    if isinstance(items, str):
        items = frappe.parse_json(items)
    
    processed_items = []
    total_discount_amount = 0
    free_items = []
    
    for item in items:
        item_code = item.get("item_code") or item.get("item")
        qty = flt(item.get("qty", 1))
        
        if not item_code:
            processed_items.append(item)
            continue
        
        # Get pricing rule
        rule_result = get_applicable_pricing_rules(
            item_code=item_code,
            customer=customer,
            price_list=price_list,
            qty=qty,
            transaction_date=transaction_date,
            pos_profile=pos_profile,
        )
        
        if rule_result.get("has_rule"):
            item["pricing_rule"] = rule_result.get("pricing_rule")
            item["discount_percentage"] = rule_result.get("discount_percentage", 0)
            item["discount_amount"] = rule_result.get("discount_amount", 0)
            
            # Calculate actual discount
            if item.get("discount_percentage"):
                rate = flt(item.get("rate", 0))
                discount = rate * qty * (item["discount_percentage"] / 100)
                total_discount_amount += discount
            elif item.get("discount_amount"):
                total_discount_amount += item["discount_amount"]
            
            # Check for free items
            if rule_result.get("free_item"):
                free_items.append({
                    "item_code": rule_result.get("free_item"),
                    "qty": rule_result.get("free_qty", 0),
                    "pricing_rule": rule_result.get("pricing_rule"),
                    "is_free_item": 1,
                })
        
        processed_items.append(item)
    
    return {
        "items": processed_items,
        "total_discount_amount": total_discount_amount,
        "free_items": free_items,
        "has_pricing_rules": len([i for i in processed_items if i.get("pricing_rule")]) > 0,
    }


@frappe.whitelist()
def validate_coupon_code(coupon_code: str, customer: Optional[str] = None) -> Dict[str, Any]:
    """
    Validate native ERPNext Coupon Code.
    
    Args:
        coupon_code: Coupon code to validate
        customer: Customer name
    
    Returns:
        dict: Validation result with coupon details
    """
    if not frappe.db.exists("DocType", "Coupon Code"):
        return {
            "valid": False,
            "error": "Coupon code feature not available",
        }
    
    try:
        from erpnext.accounts.doctype.pricing_rule.utils import validate_coupon_code as native_validate
        
        result = native_validate(coupon_code, customer)
        
        if result:
            return {
                "valid": True,
                "coupon_code": coupon_code,
                "pricing_rule": result,
            }
        else:
            return {
                "valid": False,
                "error": _("Invalid or expired coupon code"),
            }
            
    except Exception as e:
        return {
            "valid": False,
            "error": str(e),
        }


@frappe.whitelist()
def get_crm_lead_from_customer(customer: str) -> Optional[Dict[str, Any]]:
    """
    Get native ERPNext CRM Lead linked to customer.
    
    Args:
        customer: Customer name
    
    Returns:
        dict: Lead details or None
    """
    if not frappe.db.exists("DocType", "Lead"):
        return None
    
    # Check if customer has linked lead
    lead_name = frappe.db.get_value("Customer", customer, "lead_name")
    
    if not lead_name:
        # Try to find lead by phone/email
        customer_doc = frappe.get_doc("Customer", customer)
        
        filters = []
        if customer_doc.mobile_no:
            filters.append(["mobile_no", "=", customer_doc.mobile_no])
        if customer_doc.email_id:
            filters.append(["email_id", "=", customer_doc.email_id])
        
        if filters:
            lead_name = frappe.db.get_value("Lead", {"or": filters}, "name")
    
    if lead_name:
        lead = frappe.get_doc("Lead", lead_name)
        return {
            "name": lead.name,
            "lead_name": lead.lead_name,
            "status": lead.status,
            "source": lead.source,
            "email_id": lead.email_id,
            "mobile_no": lead.mobile_no,
        }
    
    return None


@frappe.whitelist()
def create_opportunity_from_order(
    pos_order: str,
    customer: str,
    items: Optional[List[Dict[str, Any]]] = None,
) -> Optional[str]:
    """
    Create native ERPNext Opportunity from POS Order.
    
    Args:
        pos_order: POS Order name
        customer: Customer name
        items: List of items (optional)
    
    Returns:
        str: Opportunity name or None
    """
    if not frappe.db.exists("DocType", "Opportunity"):
        return None
    
    try:
        order = frappe.get_doc("POS Order", pos_order)
        
        opportunity = frappe.get_doc({
            "doctype": "Opportunity",
            "opportunity_from": "Customer",
            "party_name": customer,
            "source": "POS",
            "transaction_date": nowdate(),
            "with_items": 1 if items else 0,
        })
        
        # Add items if provided
        if items:
            if isinstance(items, str):
                items = frappe.parse_json(items)
            
            for item in items:
                opportunity.append("items", {
                    "item_code": item.get("item_code") or item.get("item"),
                    "qty": flt(item.get("qty", 1)),
                    "uom": item.get("uom") or frappe.db.get_value("Item", item.get("item_code"), "stock_uom"),
                })
        
        opportunity.insert(ignore_permissions=True)
        
        return opportunity.name
        
    except Exception as e:
        frappe.log_error(f"Error creating opportunity: {str(e)}", "Native CRM Integration")
        return None
