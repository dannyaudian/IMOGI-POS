"""
Cashier API
Handles cashier operations including order checkout, payment processing, and invoice generation

IMPORTANT: This module uses "KOT Ticket" as the DocType name.
Verify the correct DocType name in your Frappe instance before deployment.
"""

import frappe
from frappe import _
import json
from datetime import datetime


@frappe.whitelist()
def get_pending_orders(pos_profile=None, branch=None, table=None, waiter=None, from_date=None, to_date=None):
    """
    Get list of orders pending payment
    
    Args:
        pos_profile: POS Profile name (PREFERRED - primary filter)
        branch: Filter by branch (DEPRECATED - use pos_profile)
        table: Filter by specific table
        waiter: Filter by waiter
        from_date: Filter orders from date
        to_date: Filter orders to date
    
    Returns:
        List of pending orders with summary info
    """
    try:
        # Deprecation warning
        if branch and not pos_profile:
            frappe.log("DEPRECATION WARNING: get_pending_orders(branch=...) is deprecated. Use pos_profile parameter instead.")
        
        filters = {
            "docstatus": ["<", 2],  # Not cancelled
            "status": ["in", ["Draft", "Submitted"]],
        }
        
        # Priority 1: Filter by POS Profile if provided
        if pos_profile:
            filters["pos_profile"] = pos_profile
        # Priority 2: Fallback to branch (deprecated)
        elif branch:
            filters["branch"] = branch
        if table:
            filters["table"] = table
        if waiter:
            filters["waiter"] = waiter
        
        # Fix: Use 'between' for date range to avoid filter overwriting
        if from_date and to_date:
            filters["creation"] = ["between", [from_date, to_date]]
        elif from_date:
            filters["creation"] = [">=", from_date]
        elif to_date:
            filters["creation"] = ["<=", to_date]
        
        orders = frappe.get_all(
            "POS Order",
            filters=filters,
            fields=[
                "name",
                "table",
                "customer",
                "waiter",
                "total",
                "grand_total",
                "status",
                "creation",
                "modified",
                "payment_status"
            ],
            order_by="creation asc"  # FIFO - oldest first
        )
        
        if not orders:
            return {"success": True, "orders": [], "count": 0}
        
        # Optimize: Get item counts for all orders in one query
        order_names = [o.name for o in orders]
        item_counts = frappe.db.sql("""
            SELECT parent, COUNT(*) as count
            FROM `tabPOS Order Item`
            WHERE parent IN %(orders)s
            GROUP BY parent
        """, {"orders": order_names}, as_dict=True)
        item_count_map = {ic.parent: ic.count for ic in item_counts}
        
        # Optimize: Get KOT status for all orders in one query
        kot_stats = frappe.db.sql("""
            SELECT 
                pos_order,
                COUNT(*) as total,
                SUM(CASE WHEN workflow_state = 'Served' THEN 1 ELSE 0 END) as served
            FROM `tabKOT Ticket`
            WHERE pos_order IN %(orders)s
            GROUP BY pos_order
        """, {"orders": order_names}, as_dict=True)
        kot_stat_map = {ks.pos_order: ks for ks in kot_stats}
        
        # Enrich orders with cached data
        for order in orders:
            # Item count from cache
            order["item_count"] = item_count_map.get(order.name, 0)
            
            # KOT status from cache
            kot_stat = kot_stat_map.get(order.name)
            if kot_stat:
                order["kots_total"] = kot_stat.total
                order["kots_served"] = kot_stat.served
                order["all_kots_served"] = (kot_stat.total > 0 and kot_stat.served == kot_stat.total)
            else:
                order["kots_total"] = 0
                order["kots_served"] = 0
                order["all_kots_served"] = False
            
            # Format timestamps
            order["creation_display"] = frappe.utils.format_datetime(order.creation, "dd MMM yyyy HH:mm")
            order["time_elapsed"] = frappe.utils.pretty_date(order.creation)
        
        return {
            "success": True,
            "orders": orders,
            "count": len(orders)
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_pending_orders: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


@frappe.whitelist()
def get_order_details(order_name):
    """
    Get complete order details for checkout
    
    Args:
        order_name: POS Order name
    
    Returns:
        Complete order document with items, KOTs, customer info
    """
    try:
        if not frappe.db.exists("POS Order", order_name):
            return {
                "success": False,
                "error": _("Order not found")
            }
        
        # Get order document
        order = frappe.get_doc("POS Order", order_name)
        
        # Get KOT details
        kots = frappe.get_all(
            "KOT Ticket",
            filters={"pos_order": order_name},
            fields=[
                "name",
                "station",
                "workflow_state",
                "creation",
                "modified"
            ]
        )
        
        # Get KOT items
        for kot in kots:
            kot_items = frappe.get_all(
                "KOT Item",
                filters={"parent": kot.name},
                fields=["item_name", "qty", "notes"]
            )
            kot["items"] = kot_items
        
        # Get table info
        table_info = None
        if order.table:
            table_info = frappe.get_doc("Restaurant Table", order.table)
        
        # Get customer info
        customer_info = None
        if order.customer:
            customer_info = frappe.get_doc("Customer", order.customer)
        
        return {
            "success": True,
            "order": order.as_dict(),
            "kots": kots,
            "table": table_info.as_dict() if table_info else None,
            "customer": customer_info.as_dict() if customer_info else None
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_order_details: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


@frappe.whitelist()
def create_invoice_from_order(order_name, customer=None, customer_name=None):
    """
    Create Sales Invoice from POS Order
    
    Args:
        order_name: POS Order name
        customer: Customer ID (optional, defaults to Walk-In Customer)
        customer_name: Customer name for walk-in
    
    Returns:
        Sales Invoice name
    """
    try:
        # Authorization: Check if user has permission for cashier operations
        # TODO: Implement role check (e.g., has_role('POS Cashier')) or branch-level permissions
        
        # Get POS Order
        order = frappe.get_doc("POS Order", order_name)
        
        # Verify all KOTs are served
        kots = frappe.get_all(
            "KOT Ticket",
            filters={"pos_order": order_name},
            fields=["workflow_state"]
        )
        
        if kots:
            unserved = [k for k in kots if k.workflow_state != "Served"]
            if unserved:
                return {
                    "success": False,
                    "error": _("Cannot create invoice. Not all items have been served.")
                }
        
        # Set customer
        if not customer:
            # Get or create Walk-In Customer
            walk_in = frappe.db.get_value("Customer", {"customer_name": "Walk-In Customer"})
            if not walk_in:
                walk_in_doc = frappe.get_doc({
                    "doctype": "Customer",
                    "customer_name": "Walk-In Customer",
                    "customer_type": "Individual",
                    "customer_group": "Individual"
                })
                walk_in_doc.insert(ignore_permissions=True)
                customer = walk_in_doc.name
            else:
                customer = walk_in
        
        # Create Sales Invoice
        invoice = frappe.new_doc("Sales Invoice")
        invoice.customer = customer
        if customer_name:
            invoice.customer_name = customer_name
        
        invoice.posting_date = frappe.utils.today()
        invoice.posting_time = frappe.utils.nowtime()
        invoice.set_posting_time = 1
        
        # Copy company and branch info
        invoice.company = order.company if hasattr(order, 'company') else frappe.defaults.get_defaults().company
        
        # Add custom field for POS Order reference
        if hasattr(invoice, 'pos_order'):
            invoice.pos_order = order_name
        
        # Copy items from POS Order
        for item in order.items:
            invoice.append("items", {
                "item_code": item.item_code,
                "item_name": item.item_name,
                "description": item.description,
                "qty": item.qty,
                "rate": item.rate,
                "amount": item.amount,
                "uom": item.uom
            })
        
        # Copy taxes if any
        if hasattr(order, 'taxes'):
            for tax in order.taxes:
                invoice.append("taxes", {
                    "charge_type": tax.charge_type,
                    "account_head": tax.account_head,
                    "description": tax.description,
                    "rate": tax.rate,
                    "tax_amount": tax.tax_amount
                })
        
        # Calculate totals
        invoice.run_method("calculate_taxes_and_totals")
        
        # Save invoice
        invoice.insert(ignore_permissions=True)
        
        # Update POS Order with invoice reference
        frappe.db.set_value("POS Order", order_name, "invoice", invoice.name)
        frappe.db.commit()
        
        return {
            "success": True,
            "invoice": invoice.name,
            "grand_total": invoice.grand_total
        }
        
    except Exception as e:
        frappe.log_error(f"Error in create_invoice_from_order: {str(e)}")
        frappe.db.rollback()
        return {
            "success": False,
            "error": str(e)
        }


@frappe.whitelist()
def process_payment(invoice_name, mode_of_payment, paid_amount, reference_no=None):
    """
    Process payment for invoice
    
    Args:
        invoice_name: Sales Invoice name
        mode_of_payment: Payment method (Cash, QRIS, Card, etc.)
        paid_amount: Amount received from customer (for change calculation)
        reference_no: Payment reference (for QRIS, card, etc.)
    
    Returns:
        Payment Entry name and change amount
    """
    try:
        # Authorization: Check if user has permission for payment operations
        # TODO: Implement role check (e.g., has_role('POS Cashier'))
        
        # Get invoice
        invoice = frappe.get_doc("Sales Invoice", invoice_name)
        
        # Validate amount
        cash_received = float(paid_amount)  # Amount customer gave
        if cash_received < invoice.grand_total:
            return {
                "success": False,
                "error": _("Cash received is less than invoice total")
            }
        
        # Calculate change
        change_amount = cash_received - invoice.grand_total
        
        # Get Mode of Payment account
        mode_doc = frappe.get_doc("Mode of Payment", mode_of_payment)
        
        # Get default company
        company = invoice.company
        
        # Find account for this company
        payment_account = None
        for account in mode_doc.accounts:
            if account.company == company:
                payment_account = account.default_account
                break
        
        if not payment_account:
            return {
                "success": False,
                "error": _("Payment account not configured for this mode of payment")
            }
        
        # Create Payment Entry
        payment = frappe.new_doc("Payment Entry")
        payment.payment_type = "Receive"
        payment.posting_date = frappe.utils.today()
        payment.mode_of_payment = mode_of_payment
        payment.party_type = "Customer"
        payment.party = invoice.customer
        payment.company = company
        
        # Set accounts
        payment.paid_from = invoice.debit_to
        payment.paid_to = payment_account
        # Both amounts equal invoice total for proper accounting
        # Cash received and change are tracked separately in the response
        payment.paid_amount = invoice.grand_total
        payment.received_amount = invoice.grand_total
        
        if reference_no:
            payment.reference_no = reference_no
            payment.reference_date = frappe.utils.today()
        
        # Add invoice reference
        payment.append("references", {
            "reference_doctype": "Sales Invoice",
            "reference_name": invoice_name,
            "allocated_amount": invoice.grand_total
        })
        
        # Save and submit
        payment.insert(ignore_permissions=True)
        payment.submit()
        
        # Submit invoice
        if invoice.docstatus == 0:
            invoice.submit()
        
        frappe.db.commit()
        
        return {
            "success": True,
            "payment_entry": payment.name,
            "change_amount": change_amount,
            "cash_received": cash_received,  # Amount customer gave
            "invoice_total": invoice.grand_total
        }
        
    except Exception as e:
        frappe.log_error(f"Error in process_payment: {str(e)}")
        frappe.db.rollback()
        return {
            "success": False,
            "error": str(e)
        }


@frappe.whitelist()
def complete_order(order_name, invoice_name=None, payment_name=None):
    """
    Complete order and cleanup
    
    Args:
        order_name: POS Order name
        invoice_name: Sales Invoice name
        payment_name: Payment Entry name
    
    Returns:
        Success message
    """
    try:
        # Authorization: Check if user has permission for order completion
        # TODO: Implement role check (e.g., has_role('POS Cashier'))
        
        # Get order
        order = frappe.get_doc("POS Order", order_name)
        
        # Update order status
        order.status = "Completed"
        if invoice_name:
            order.invoice = invoice_name
        if payment_name:
            order.payment_entry = payment_name
        order.completion_time = frappe.utils.now()
        order.save(ignore_permissions=True)
        
        # Update table status to Available
        if order.table:
            frappe.db.set_value("Restaurant Table", order.table, "status", "Available")
        
        # Close all KOTs
        kots = frappe.get_all(
            "KOT Ticket",
            filters={"pos_order": order_name}
        )
        
        for kot in kots:
            frappe.db.set_value("KOT Ticket", kot.name, {
                "workflow_state": "Completed",
                "completion_time": frappe.utils.now()
            })
        
        frappe.db.commit()
        
        # Publish realtime event
        frappe.publish_realtime(
            event="order_completed",
            message={
                "order": order_name,
                "table": order.table,
                "invoice": invoice_name
            },
            room=f"order:{order_name}"
        )
        
        if order.table:
            frappe.publish_realtime(
                event="table_cleared",
                message={"table": order.table},
                room=f"table:{order.table}"
            )
        
        # Send to customer display
        if order.table:
            send_to_customer_display(order.table, {
                "type": "order_complete",
                "invoice": invoice_name,
                "total": order.grand_total,
                "thank_you": True
            })
        
        return {
            "success": True,
            "message": _("Order completed successfully"),
            "order": order_name,
            "table": order.table
        }
        
    except Exception as e:
        frappe.log_error(f"Error in complete_order: {str(e)}")
        frappe.db.rollback()
        return {
            "success": False,
            "error": str(e)
        }


@frappe.whitelist()
def get_payment_methods(branch=None):
    """
    Get available payment methods
    
    Args:
        branch: Filter by branch (optional)
    
    Returns:
        List of payment methods with configuration
    """
    try:
        # Get all active payment methods
        methods = frappe.get_all(
            "Mode of Payment",
            filters={"enabled": 1},
            fields=["name", "mode_of_payment", "type"]
        )
        
        # Enrich with account info
        for method in methods:
            doc = frappe.get_doc("Mode of Payment", method.name)
            method["accounts"] = [acc.as_dict() for acc in doc.accounts]
            
            # Check if QRIS
            if hasattr(doc, 'is_qris') and doc.is_qris:
                method["is_qris"] = True
                if hasattr(doc, 'qris_merchant_id'):
                    method["qris_merchant_id"] = doc.qris_merchant_id
        
        return {
            "success": True,
            "methods": methods
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_payment_methods: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


@frappe.whitelist()
def split_bill(order_name, splits):
    """
    Split bill into multiple invoices
    
    Args:
        order_name: POS Order name
        splits: List of split configurations
            Example: [
                {"items": ["item1", "item2"], "customer": "CUST-001"},
                {"items": ["item3"], "customer": "CUST-002"}
            ]
    
    Returns:
        List of invoice names created
    """
    try:
        # Parse splits if string
        if isinstance(splits, str):
            splits = json.loads(splits)
        
        # Get order
        order = frappe.get_doc("POS Order", order_name)
        
        invoices = []
        
        for split in splits:
            # Create invoice for this split
            invoice = frappe.new_doc("Sales Invoice")
            invoice.customer = split.get("customer", "Walk-In Customer")
            invoice.posting_date = frappe.utils.today()
            invoice.posting_time = frappe.utils.nowtime()
            invoice.set_posting_time = 1
            invoice.company = order.company if hasattr(order, 'company') else frappe.defaults.get_defaults().company
            
            # Add items from split
            split_items = split.get("items", [])
            for item_name in split_items:
                # Find item in order
                order_item = next((i for i in order.items if i.item_code == item_name or i.item_name == item_name), None)
                if order_item:
                    invoice.append("items", {
                        "item_code": order_item.item_code,
                        "item_name": order_item.item_name,
                        "qty": order_item.qty,
                        "rate": order_item.rate,
                        "amount": order_item.amount
                    })
            
            # Calculate totals
            invoice.run_method("calculate_taxes_and_totals")
            invoice.insert(ignore_permissions=True)
            
            invoices.append(invoice.name)
        
        frappe.db.commit()
        
        return {
            "success": True,
            "invoices": invoices,
            "count": len(invoices)
        }
        
    except Exception as e:
        frappe.log_error(f"Error in split_bill: {str(e)}")
        frappe.db.rollback()
        return {
            "success": False,
            "error": str(e)
        }


def send_to_customer_display(table, data):
    """
    Helper function to send data to customer display
    
    Args:
        table: Table name
        data: Display data
    """
    try:
        # Get customer display profile for this table/branch
        # This will be implemented in customer_display.py
        frappe.publish_realtime(
            event="customer_display_update",
            message=data,
            room=f"customer_display:{table}"
        )
    except Exception as e:
        frappe.log_error(f"Error sending to customer display: {str(e)}")
