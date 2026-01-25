# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import now_datetime, cint, get_datetime, random_string
from frappe.realtime import publish_realtime
import json
import hashlib
from imogi_pos.utils.permissions import validate_branch_access


# ===== REALTIME DISPLAY UPDATES (Phase 2) =====

@frappe.whitelist()
def send_order_to_display(device, order_data):
    """
    Send order data to customer display
    
    Args:
        device: Customer Display Profile name
        order_data: Order information to display
    
    Returns:
        Success status
    """
    try:
        # Get display configuration
        profile = frappe.get_doc("Customer Display Profile", device)
        
        # Publish realtime event to display
        frappe.publish_realtime(
            event="display_order",
            message={
                "type": "order",
                "data": order_data,
                "config": profile.config if hasattr(profile, 'config') else {}
            },
            room=f"customer_display:{device}"
        )
        
        # Log display update
        frappe.logger().info(f"Order sent to display {device}")
        
        return {
            "success": True,
            "device": device
        }
        
    except Exception as e:
        frappe.log_error(f"Error in send_order_to_display: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


@frappe.whitelist()
def update_display_status(device, status, data=None):
    """
    Update customer display status
    
    Args:
        device: Customer Display Profile name
        status: Display status (idle, order, payment, complete)
        data: Additional data for the status
    
    Returns:
        Success status
    """
    try:
        # Validate status
        valid_statuses = ["idle", "order", "payment", "processing", "complete", "thank_you"]
        if status not in valid_statuses:
            return {
                "success": False,
                "error": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
            }
        
        # Publish realtime event
        frappe.publish_realtime(
            event="display_status_update",
            message={
                "status": status,
                "data": data or {},
                "timestamp": frappe.utils.now()
            },
            room=f"customer_display:{device}"
        )
        
        return {
            "success": True,
            "device": device,
            "status": status
        }
        
    except Exception as e:
        frappe.log_error(f"Error in update_display_status: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


@frappe.whitelist()
def clear_display(device):
    """
    Clear customer display and return to idle screen
    
    Args:
        device: Customer Display Profile name
    
    Returns:
        Success status
    """
    try:
        # Get display configuration
        profile = frappe.get_doc("Customer Display Profile", device)
        
        # Publish clear event
        frappe.publish_realtime(
            event="display_clear",
            message={
                "type": "idle",
                "config": profile.config if hasattr(profile, 'config') else {}
            },
            room=f"customer_display:{device}"
        )
        
        return {
            "success": True,
            "device": device
        }
        
    except Exception as e:
        frappe.log_error(f"Error in clear_display: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


@frappe.whitelist()
def get_display_for_table(table):
    """
    Get customer display device assigned to a table
    
    Args:
        table: Restaurant Table name
    
    Returns:
        Display profile name
    """
    try:
        # Get table document
        table_doc = frappe.get_doc("Restaurant Table", table)
        
        # Check if table has assigned display
        display = None
        if hasattr(table_doc, 'customer_display'):
            display = table_doc.customer_display
        else:
            # Get default display for branch
            branch = table_doc.branch if hasattr(table_doc, 'branch') else None
            if branch:
                display = frappe.db.get_value(
                    "Customer Display Profile",
                    {"branch": branch, "is_active": 1},
                    "name"
                )
        
        return {
            "success": True,
            "display": display,
            "table": table
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_display_for_table: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


@frappe.whitelist()
def show_payment_processing(device, payment_method, amount):
    """
    Show payment processing screen
    
    Args:
        device: Customer Display Profile name
        payment_method: Payment method being used
        amount: Amount being processed
    
    Returns:
        Success status
    """
    try:
        frappe.publish_realtime(
            event="display_payment_processing",
            message={
                "type": "payment_processing",
                "payment_method": payment_method,
                "amount": amount,
                "timestamp": frappe.utils.now()
            },
            room=f"customer_display:{device}"
        )
        
        return {
            "success": True,
            "device": device
        }
        
    except Exception as e:
        frappe.log_error(f"Error in show_payment_processing: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


@frappe.whitelist()
def show_thank_you(device, invoice_name, total_paid, change_amount=0):
    """
    Show thank you screen after payment
    
    Args:
        device: Customer Display Profile name
        invoice_name: Invoice number
        total_paid: Total amount paid
        change_amount: Change to return
    
    Returns:
        Success status
    """
    try:
        frappe.publish_realtime(
            event="display_thank_you",
            message={
                "type": "thank_you",
                "invoice": invoice_name,
                "total_paid": total_paid,
                "change": change_amount,
                "timestamp": frappe.utils.now()
            },
            room=f"customer_display:{device}"
        )
        
        # Auto-clear after 30 seconds
        frappe.enqueue(
            clear_display,
            device=device,
            queue="short",
            timeout=30
        )
        
        return {
            "success": True,
            "device": device
        }
        
    except Exception as e:
        frappe.log_error(f"Error in show_thank_you: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


# ===== ORIGINAL DISPLAY DEVICE FUNCTIONS =====

def get_device_by_id(device_id):
    """
    Retrieves customer display device information.
    
    Args:
        device_id (str): Device ID
    
    Returns:
        dict: Device information
    
    Raises:
        frappe.DoesNotExistError: If device is not found
    """
    device = frappe.get_doc("Customer Display Device", device_id)
    
    if not device:
        frappe.throw(_("Customer Display Device not found"), frappe.DoesNotExistError)
    
    return device

@frappe.whitelist()
def register_display_device(device_name, branch, profile=None):
    """
    Registers a new customer display device or updates an existing one.
    
    Args:
        device_name (str): Display name
        branch (str): Branch name
        profile (str, optional): Customer Display Profile. Defaults to None.
    
    Returns:
        dict: Device information including pairing code
    """
    validate_branch_access(branch)
    
    # Generate a unique device ID if not found by name
    device_id = None
    
    # Check if a device with this name already exists
    existing_device = frappe.db.get_value("Customer Display Device", 
                                        {"device_name": device_name, "branch": branch}, 
                                        ["name", "pairing_code", "last_heartbeat", "status"])
    
    if existing_device:
        device_id = existing_device[0]
        pairing_code = existing_device[1]
        last_heartbeat = existing_device[2]
        status = existing_device[3]
        
        # If device exists but status is offline/unpaired for a long time, generate new pairing code
        current_time = now_datetime()
        if status == "Unpaired" or (status == "Offline" and 
                                   get_datetime(last_heartbeat) < frappe.utils.add_to_date(current_time, hours=-24)):
            pairing_code = generate_pairing_code()
            frappe.db.set_value("Customer Display Device", device_id, "pairing_code", pairing_code)
            frappe.db.set_value("Customer Display Device", device_id, "last_heartbeat", current_time)
            frappe.db.set_value("Customer Display Device", device_id, "status", "Awaiting Pairing")
    else:
        # Create a new device
        pairing_code = generate_pairing_code()
        device_doc = frappe.get_doc({
            "doctype": "Customer Display Device",
            "device_name": device_name,
            "branch": branch,
            "profile": profile,
            "pairing_code": pairing_code,
            "status": "Awaiting Pairing",
            "last_heartbeat": now_datetime()
        })
        device_doc.insert(ignore_permissions=True)
        device_id = device_doc.name
    
    # Return device information
    return {
        "device_id": device_id,
        "device_name": device_name,
        "branch": branch,
        "pairing_code": pairing_code,
        "profile": profile,
        "registered_at": now_datetime().isoformat()
    }

@frappe.whitelist()
def link_display_to_order(device_id, pos_order=None, sales_invoice=None):
    """
    Links a customer display to a POS Order or Sales Invoice.
    
    Args:
        device_id (str): Display device ID
        pos_order (str, optional): POS Order name. Defaults to None.
        sales_invoice (str, optional): Sales Invoice name. Defaults to None.
    
    Returns:
        dict: Link status and device information
    
    Raises:
        frappe.ValidationError: If neither POS Order nor Sales Invoice is provided
    """
    if not pos_order and not sales_invoice:
        frappe.throw(_("Either POS Order or Sales Invoice must be provided"), frappe.ValidationError)
    
    # Get device
    device = get_device_by_id(device_id)
    
    # Validate branch access
    validate_branch_access(device.branch)
    
    # Validate device status
    if device.status not in ["Online", "Paired"]:
        frappe.throw(_("Device is not paired or online"), frappe.ValidationError)
    
    # Get POS Order from Sales Invoice if needed
    if sales_invoice and not pos_order:
        pos_order = frappe.db.get_value("Sales Invoice", sales_invoice, "imogi_pos_order")
    
    # Update device with current order
    frappe.db.set_value("Customer Display Device", device_id, "current_order", pos_order)
    frappe.db.set_value("Customer Display Device", device_id, "current_invoice", sales_invoice)
    
    # If we have a POS Order, check if it has a Sales Invoice
    if pos_order and not sales_invoice:
        sales_invoice = frappe.db.get_value("POS Order", pos_order, "sales_invoice")
        if sales_invoice:
            frappe.db.set_value("Customer Display Device", device_id, "current_invoice", sales_invoice)
    
    # Prepare order data
    order_data = {}
    if pos_order:
        order_doc = frappe.get_doc("POS Order", pos_order)
        order_data = {
            "name": pos_order,
            "customer": order_doc.customer,
            "table": order_doc.table,
            "order_type": order_doc.order_type,
            "status": order_doc.workflow_state,
            "created_at": order_doc.creation
        }
    
    # Prepare invoice data
    invoice_data = {}
    if sales_invoice:
        invoice_doc = frappe.get_doc("Sales Invoice", sales_invoice)
        invoice_data = {
            "name": sales_invoice,
            "customer": invoice_doc.customer,
            "grand_total": invoice_doc.grand_total,
            "currency": invoice_doc.currency,
            "status": invoice_doc.status,
            "created_at": invoice_doc.creation
        }
    
    # Publish update to the display
    publish_customer_display_update(
        f"customer_display:device:{device_id}", 
        {
            "type": "link_update",
            "pos_order": order_data if pos_order else None,
            "sales_invoice": invoice_data if sales_invoice else None,
            "timestamp": now_datetime().isoformat()
        }
    )
    
    return {
        "success": True,
        "device_id": device_id,
        "pos_order": pos_order,
        "sales_invoice": sales_invoice,
        "timestamp": now_datetime().isoformat()
    }

@frappe.whitelist()
def get_customer_display_config(device_id=None, pairing_code=None):
    """
    Gets configuration for a customer display.
    If device_id is provided, checks if device exists.
    If pairing_code is provided, attempts to pair the device.
    
    Args:
        device_id (str, optional): Device ID for existing device. Defaults to None.
        pairing_code (str, optional): Pairing code for new device. Defaults to None.
    
    Returns:
        dict: Display configuration
    
    Raises:
        frappe.ValidationError: If device not found or pairing fails
    """
    # If pairing code is provided, try to find and pair device
    if pairing_code and not device_id:
        device = frappe.db.get_value("Customer Display Device", 
                                   {"pairing_code": pairing_code, "status": ["in", ["Awaiting Pairing", "Unpaired"]]},
                                   ["name", "branch", "device_name", "profile"])
        
        if not device:
            frappe.throw(_("Invalid or expired pairing code"), frappe.ValidationError)
        
        device_id = device[0]
        branch = device[1]
        device_name = device[2]
        profile = device[3]
        
        # Update device status
        frappe.db.set_value("Customer Display Device", device_id, "status", "Paired")
        frappe.db.set_value("Customer Display Device", device_id, "last_heartbeat", now_datetime())
        
        # Log pairing
        frappe.log_error(f"Customer Display Device {device_name} paired with code {pairing_code}", "Display Pairing")
    
    # If device_id is provided, get device configuration
    if device_id:
        try:
            device = get_device_by_id(device_id)
            validate_branch_access(device.branch)
            
            # Get profile configuration
            profile_config = {}
            if device.profile:
                profile_doc = frappe.get_doc("Customer Display Profile", device.profile)
                
                # Get blocks configuration
                blocks = []
                for block in profile_doc.blocks:
                    block_data = frappe.get_doc("Customer Display Block", block.block)
                    blocks.append({
                        "id": block_data.name,
                        "title": block_data.title,
                        "type": block_data.block_type,
                        "position_x": block.position_x,
                        "position_y": block.position_y,
                        "width": block.width,
                        "height": block.height,
                        "config": block_data.configuration,
                        "content": block_data.content,
                        "style": block_data.custom_style
                    })
                
                profile_config = {
                    "name": profile_doc.name,
                    "title": profile_doc.title,
                    "layout_type": profile_doc.layout_type,
                    "canvas_width": profile_doc.canvas_width,
                    "canvas_height": profile_doc.canvas_height,
                    "background_color": profile_doc.background_color,
                    "background_image": profile_doc.background_image,
                    "blocks": blocks
                }
            
            # Get branding from POS Profile or Restaurant Settings
            branding = {}
            pos_profile = None
            
            # Try to get current order's POS Profile
            if device.current_order:
                pos_profile = frappe.db.get_value("POS Order", device.current_order, "pos_profile")
            
            # If no POS Profile, try to get a default one for the branch
            if not pos_profile:
                pos_profile = frappe.db.get_value("POS Profile", 
                                                {"branch": device.branch, "user": ["is", "not set"]}, 
                                                "name")
            
            # Get branding from API
            if pos_profile:
                from imogi_pos.api.public import get_branding
                branding = get_branding(pos_profile)
            
            # Return configuration
            return {
                "device_id": device_id,
                "device_name": device.device_name,
                "branch": device.branch,
                "status": device.status,
                "profile": profile_config,
                "branding": branding,
                "current_order": device.current_order,
                "current_invoice": device.current_invoice,
                "timestamp": now_datetime().isoformat()
            }
            
        except Exception as e:
            frappe.log_error(f"Error getting customer display config: {str(e)}")
            frappe.throw(_("Error getting display configuration: {0}").format(str(e)))
    
    frappe.throw(_("Either device_id or pairing_code must be provided"), frappe.ValidationError)

@frappe.whitelist()
def post_display_heartbeat(device_id):
    """
    Updates the last heartbeat time for a display device.
    
    Args:
        device_id (str): Display device ID
    
    Returns:
        dict: Heartbeat status and timestamp
    """
    try:
        device = get_device_by_id(device_id)
        
        # Validate branch access
        validate_branch_access(device.branch)
        
        # Update heartbeat
        current_time = now_datetime()
        frappe.db.set_value("Customer Display Device", device_id, "last_heartbeat", current_time)
        
        # Update status if needed
        if device.status in ["Awaiting Pairing", "Offline"]:
            frappe.db.set_value("Customer Display Device", device_id, "status", "Online")
        
        # Get current linked data
        current_order = device.current_order
        current_invoice = device.current_invoice
        
        # Check if order is still valid
        order_data = None
        if current_order:
            try:
                order_doc = frappe.get_doc("POS Order", current_order)
                order_data = {
                    "name": current_order,
                    "status": order_doc.workflow_state
                }
            except:
                # Order no longer exists or accessible
                current_order = None
                frappe.db.set_value("Customer Display Device", device_id, "current_order", None)
        
        # Check if invoice is still valid
        invoice_data = None
        if current_invoice:
            try:
                invoice_doc = frappe.get_doc("Sales Invoice", current_invoice)
                invoice_data = {
                    "name": current_invoice,
                    "status": invoice_doc.status
                }
            except:
                # Invoice no longer exists or accessible
                current_invoice = None
                frappe.db.set_value("Customer Display Device", device_id, "current_invoice", None)
        
        return {
            "success": True,
            "device_id": device_id,
            "timestamp": current_time.isoformat(),
            "current_order": order_data,
            "current_invoice": invoice_data
        }
        
    except Exception as e:
        frappe.log_error(f"Error updating display heartbeat: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "timestamp": now_datetime().isoformat()
        }

@frappe.whitelist()
def publish_customer_display_update(target_channel, payload):
    """
    Publishes an update to a customer display.
    
    Args:
        target_channel (str): Target channel (device ID or order)
        payload (dict or str): Data to publish
    
    Returns:
        dict: Publication status
    """
    try:
        # Parse payload if it's a string
        if isinstance(payload, str):
            payload = json.loads(payload)
        
        # Add timestamp if not present
        if "timestamp" not in payload:
            payload["timestamp"] = now_datetime().isoformat()
        
        # Add branch information if available
        if ":" in target_channel:
            channel_type, channel_id = target_channel.split(":", 1)
            
            if channel_type == "customer_display:device":
                device = frappe.db.get_value("Customer Display Device", channel_id, "branch")
                if device:
                    payload["branch"] = device
            
            elif channel_type == "customer_display:order":
                order = frappe.db.get_value("POS Order", channel_id, "branch")
                if order:
                    payload["branch"] = order
        
        # Publish to the target channel
        publish_realtime(target_channel, payload)
        
        return {
            "success": True,
            "channel": target_channel,
            "timestamp": payload["timestamp"]
        }
        
    except Exception as e:
        frappe.log_error(f"Error publishing to customer display: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "timestamp": now_datetime().isoformat()
        }

@frappe.whitelist()
def check_display_status(branch):
    """
    Checks if a customer display device is online for the specified branch.
    
    Args:
        branch (str): Branch name
    
    Returns:
        dict: Status information with 'online' boolean
    """
    if not branch:
        return {"online": False}
    
    try:
        # Validate branch access (skip for now if Branch doctype doesn't exist)
        if frappe.db.exists("DocType", "Branch"):
            validate_branch_access(branch)
    except frappe.DoesNotExistError:
        # Branch doctype may not exist in this setup
        pass
    except frappe.PermissionError:
        # User doesn't have branch access
        return {"online": False, "error": "No branch access"}
    
    # Check if Customer Display Device doctype exists
    if not frappe.db.exists("DocType", "Customer Display Device"):
        return {"online": False, "error": "Customer Display not configured"}
    
    # Check if there's an active display device for this branch
    devices = frappe.get_all(
        "Customer Display Device",
        filters={
            "branch": branch,
            "is_active": 1
        },
        fields=["name", "last_heartbeat"],
        limit=1
    )
    
    if not devices:
        return {"online": False}
    
    device = devices[0]
    
    # Check last heartbeat - consider online if heartbeat within last 60 seconds
    if device.get("last_heartbeat"):
        from frappe.utils import get_datetime, now_datetime
        from datetime import timedelta
        
        last_heartbeat = get_datetime(device["last_heartbeat"])
        current_time = now_datetime()
        
        # Online if heartbeat within 60 seconds
        is_online = (current_time - last_heartbeat) < timedelta(seconds=60)
        
        return {
            "online": is_online,
            "device": device["name"],
            "last_heartbeat": device["last_heartbeat"]
        }
    
    # No heartbeat recorded yet
    return {"online": False, "device": device["name"]}

def generate_pairing_code():
    """
    Generates a 6-digit pairing code for customer display devices.
    
    Returns:
        str: 6-digit pairing code
    """
    # Generate a random string and hash it
    random = random_string(10)
    hash_object = hashlib.sha256(random.encode())
    hash_hex = hash_object.hexdigest()
    
    # Take first 6 digits of the hash
    code = hash_hex[:6].upper()
    
    return code