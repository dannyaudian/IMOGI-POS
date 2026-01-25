# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

"""
Audit Logging System for IMOGI POS

Tracks critical operations for compliance, security, and debugging:
- Order creation and modification
- Payment processing
- Opening/closing sessions
- Discount applications
- System configuration changes
"""

import frappe
from frappe import _
from frappe.utils import now, get_url
import json


def log_operation(
    doctype: str,
    action: str,
    doc_name: str,
    details: dict = None,
    user: str = None,
    branch: str = None,
    severity: str = "INFO"
):
    """
    Log critical POS operation for audit trail.
    
    Args:
        doctype (str): DocType being accessed (Sales Invoice, POS Order, etc)
        action (str): Action performed (create, update, delete, submit, cancel, print, payment)
        doc_name (str): Name of document being accessed
        details (dict): Additional details to log (payment amount, discount, etc)
        user (str): User performing action (default: current user)
        branch (str): Branch/location (default: user's default branch)
        severity (str): Log level (INFO, WARNING, ERROR)
    """
    if not user:
        user = frappe.session.user
    
    if not branch:
        branch = frappe.defaults.get_user_default("imogi_branch") or "Unknown"
    
    try:
        # Check if Audit Log doctype exists
        if not frappe.db.exists("DocType", "Audit Log"):
            frappe.log_error("Audit Log doctype not found", "Audit Logging Error")
            return
        
        audit_doc = frappe.new_doc("Audit Log")
        audit_doc.document_type = doctype
        audit_doc.document_name = doc_name
        audit_doc.action = action
        audit_doc.user = user
        audit_doc.timestamp = now()
        audit_doc.branch = branch
        audit_doc.severity = severity
        
        if details:
            audit_doc.details = json.dumps(details)
        
        # Try to get IP address
        try:
            if hasattr(frappe, 'local') and hasattr(frappe.local, 'request'):
                audit_doc.ip_address = (
                    frappe.local.request.headers.get('X-Forwarded-For', '').split(',')[0].strip()
                    or frappe.local.request.remote_addr
                    or 'Unknown'
                )
        except:
            audit_doc.ip_address = 'Unknown'
        
        audit_doc.insert(ignore_permissions=True)
        frappe.db.commit()
        
    except Exception as e:
        frappe.log_error(f"Failed to log operation: {str(e)}", "Audit Log Error")


def log_payment(
    invoice_name: str,
    payment_method: str,
    amount: float,
    change_amount: float = 0,
    user: str = None,
    branch: str = None
):
    """
    Log payment operation.
    
    Args:
        invoice_name (str): Sales Invoice name
        payment_method (str): Mode of payment (Cash, Card, QRIS, etc)
        amount (float): Payment amount
        change_amount (float): Change given (for cash payments)
        user (str): User (default: current)
        branch (str): Branch (default: current)
    """
    log_operation(
        doctype="Sales Invoice",
        action="payment",
        doc_name=invoice_name,
        details={
            "payment_method": payment_method,
            "amount": amount,
            "change_amount": change_amount
        },
        user=user,
        branch=branch,
        severity="INFO"
    )


def log_opening_balance(
    session_name: str,
    amount: float,
    account: str = None,
    user: str = None,
    branch: str = None
):
    """
    Log opening entry creation.
    
    Args:
        session_name (str): POS Opening Entry name
        amount (float): Opening amount
        account (str): Cash account used
        user (str): User
        branch (str): Branch
    """
    log_operation(
        doctype="POS Opening Entry",
        action="create",
        doc_name=session_name,
        details={
            "opening_amount": amount,
            "cash_account": account
        },
        user=user,
        branch=branch,
        severity="INFO"
    )


def log_closing_balance(
    session_name: str,
    opening_amount: float,
    closing_amount: float,
    variance: float = 0,
    user: str = None,
    branch: str = None
):
    """
    Log session closing.
    
    Args:
        session_name (str): POS Opening Entry name
        opening_amount (float): Opening amount
        closing_amount (float): Closing amount
        variance (float): Difference between expected and actual
        user (str): User
        branch (str): Branch
    """
    severity = "WARNING" if abs(variance) > 0 else "INFO"
    
    log_operation(
        doctype="POS Opening Entry",
        action="close",
        doc_name=session_name,
        details={
            "opening_amount": opening_amount,
            "closing_amount": closing_amount,
            "variance": variance
        },
        user=user,
        branch=branch,
        severity=severity
    )


def log_discount_applied(
    invoice_name: str,
    discount_amount: float,
    discount_reason: str = None,
    user: str = None,
    branch: str = None
):
    """
    Log discount application (anomaly - always WARNING).
    
    Args:
        invoice_name (str): Sales Invoice name
        discount_amount (float): Discount amount
        discount_reason (str): Reason for discount
        user (str): User
        branch (str): Branch
    """
    log_operation(
        doctype="Sales Invoice",
        action="discount",
        doc_name=invoice_name,
        details={
            "discount_amount": discount_amount,
            "reason": discount_reason
        },
        user=user,
        branch=branch,
        severity="WARNING"  # Always warn about discounts
    )


def log_void_transaction(
    invoice_name: str,
    total_amount: float,
    reason: str = None,
    user: str = None,
    branch: str = None
):
    """
    Log void/cancellation of transaction.
    
    Args:
        invoice_name (str): Sales Invoice name
        total_amount (float): Invoice total
        reason (str): Reason for void
        user (str): User
        branch (str): Branch
    """
    log_operation(
        doctype="Sales Invoice",
        action="cancel",
        doc_name=invoice_name,
        details={
            "total_amount": total_amount,
            "reason": reason
        },
        user=user,
        branch=branch,
        severity="WARNING"
    )


def log_print_operation(
    doc_type: str,
    doc_name: str,
    print_format: str = None,
    printer_interface: str = None,
    user: str = None,
    branch: str = None
):
    """
    Log printing operation.
    
    Args:
        doc_type (str): Document type printed (Sales Invoice, KOT Ticket, etc)
        doc_name (str): Document name
        print_format (str): Print format used
        printer_interface (str): Printer interface used (LAN, USB, BT, OS)
        user (str): User
        branch (str): Branch
    """
    log_operation(
        doctype=doc_type,
        action="print",
        doc_name=doc_name,
        details={
            "print_format": print_format,
            "printer_interface": printer_interface
        },
        user=user,
        branch=branch,
        severity="INFO"
    )


@frappe.whitelist()
def get_audit_logs(
    filters: dict = None,
    limit: int = 100,
    offset: int = 0
):
    """
    Retrieve audit logs with optional filters.
    
    Args:
        filters (dict): Filter conditions (user, branch, action, doctype)
        limit (int): Number of records to return
        offset (int): Number of records to skip
    
    Returns:
        list: Audit log records
    """
    # Only admins and branch managers can view audit logs
    if not frappe.has_role(["Administrator", "Branch Manager"]):
        frappe.throw(_("Permission denied to view audit logs"))
    
    filter_conditions = []
    
    if filters:
        if filters.get("user"):
            filter_conditions.append(["user", "=", filters["user"]])
        if filters.get("branch"):
            filter_conditions.append(["branch", "=", filters["branch"]])
        if filters.get("action"):
            filter_conditions.append(["action", "=", filters["action"]])
        if filters.get("doctype"):
            filter_conditions.append(["document_type", "=", filters["doctype"]])
        if filters.get("from_date"):
            filter_conditions.append(["timestamp", ">=", filters["from_date"]])
        if filters.get("to_date"):
            filter_conditions.append(["timestamp", "<=", filters["to_date"]])
    
    try:
        logs = frappe.get_list(
            "Audit Log",
            filters=filter_conditions,
            fields=["name", "document_type", "document_name", "action", "user", "timestamp", "branch", "severity", "ip_address"],
            order_by="timestamp desc",
            limit_page_length=limit,
            limit_start=offset
        )
        
        return logs
    except Exception as e:
        frappe.log_error(f"Error retrieving audit logs: {str(e)}", "Audit Log Error")
        return []
