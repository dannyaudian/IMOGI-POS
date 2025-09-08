# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import cint, now_datetime, get_url
from imogi_pos.utils.permissions import validate_branch_access
import json
import os


def get_print_adapter_settings(adapter_type, source_doc=None, pos_profile=None, kitchen_station=None):
    """
    Gets settings for a print adapter based on context.
    Follows cascading priority: Kitchen Station > POS Profile > Restaurant Settings
    
    Args:
        adapter_type (str): Adapter type (LAN/Bluetooth/OS)
        source_doc (object, optional): Source document with POS Profile. Defaults to None.
        pos_profile (str, optional): POS Profile name. Defaults to None.
        kitchen_station (str, optional): Kitchen Station name. Defaults to None.
    
    Returns:
        dict: Adapter settings
    """
    settings = {
        "interface": adapter_type,
        "adapter_config": {}
    }
    
    # First priority: Kitchen Station (for KOT printing)
    if kitchen_station:
        station_doc = frappe.get_doc("Kitchen Station", kitchen_station)
        settings["interface"] = station_doc.interface or adapter_type
        
        if settings["interface"] == "LAN":
            settings["adapter_config"].update({
                "host": station_doc.lan_host,
                "port": station_doc.lan_port or 9100
            })
        elif settings["interface"] == "Bluetooth":
            settings["adapter_config"].update({
                "device_name": station_doc.bt_device_name,
                "mac_address": station_doc.bt_mac,
                "vendor_profile": station_doc.bt_vendor_profile or "ESC/POS"
            })
        
        return settings
    
    # Second priority: POS Profile
    if not pos_profile and source_doc:
        if hasattr(source_doc, 'pos_profile'):
            pos_profile = source_doc.pos_profile
    
    if pos_profile:
        profile_doc = frappe.get_doc("POS Profile", pos_profile)
        
        # Determine adapter type based on context
        is_kitchen = adapter_type == "kitchen"
        interface_field = "imogi_printer_kitchen_interface" if is_kitchen else "imogi_printer_cashier_interface"
        settings["interface"] = profile_doc.get(interface_field) or adapter_type
        
        if settings["interface"] == "LAN":
            host_field = "imogi_printer_kitchen" if is_kitchen else "imogi_printer_cashier"
            settings["adapter_config"].update({
                "host": profile_doc.get(host_field),
                "port": profile_doc.get("imogi_printer_port") or 9100
            })
        elif settings["interface"] == "Bluetooth":
            device_field = "imogi_bt_kitchen_device_name" if is_kitchen else "imogi_bt_cashier_device_name"
            profile_field = "imogi_bt_kitchen_vendor_profile" if is_kitchen else "imogi_bt_cashier_vendor_profile"
            
            settings["adapter_config"].update({
                "device_name": profile_doc.get(device_field),
                "vendor_profile": profile_doc.get(profile_field) or "ESC/POS",
                "retry_count": profile_doc.get("imogi_bt_retry") or 2
            })
            
            # Bridge configuration if available
            if profile_doc.get("imogi_print_bridge_url"):
                settings["adapter_config"].update({
                    "bridge_url": profile_doc.get("imogi_print_bridge_url"),
                    "bridge_token": profile_doc.get("imogi_print_bridge_token")
                })
    
    # Third priority: Restaurant Settings (fallback)
    if not settings["adapter_config"] or not settings["interface"]:
        try:
            restaurant_settings = frappe.get_single("Restaurant Settings")

            if not settings["interface"]:
                settings["interface"] = restaurant_settings.get("imogi_default_printer_interface") or "OS"

            # Add default settings from Restaurant Settings if needed
            if settings["interface"] == "LAN" and not settings["adapter_config"].get("host"):
                settings["adapter_config"].update({
                    "host": restaurant_settings.get("imogi_default_printer_lan_host"),
                    "port": restaurant_settings.get("imogi_default_printer_lan_port") or 9100
                })
            elif settings["interface"] == "Bluetooth" and not settings["adapter_config"].get("device_name"):
                settings["adapter_config"].update({
                    "device_name": restaurant_settings.get("imogi_default_bt_device_name"),
                    "vendor_profile": restaurant_settings.get("imogi_default_bt_vendor_profile") or "ESC/POS",
                    "bridge_url": restaurant_settings.get("imogi_default_print_bridge_url"),
                    "bridge_token": restaurant_settings.get("imogi_default_print_bridge_token")
                })
        except:
            # Fallback to OS if no Restaurant Settings
            if not settings["interface"]:
                settings["interface"] = "OS"

    validate_adapter_settings(settings)

    return settings


def validate_adapter_settings(settings):
    """Validate that required printer settings are provided based on interface"""
    interface = settings.get("interface")
    config = settings.get("adapter_config") or {}

    if not interface:
        frappe.throw(_("Printer interface is not configured"))

    if interface == "LAN" and not config.get("host"):
        frappe.throw(_("LAN printer host/IP is required for LAN interface"))

    if interface == "Bluetooth" and not config.get("device_name"):
        frappe.throw(_("Bluetooth device name is required for Bluetooth interface"))

def get_print_format_html(doc, print_format_name=None):
    """
    Gets the HTML for a print format.
    
    Args:
        doc (object): Document to print
        print_format_name (str, optional): Print Format name. Defaults to None.
    
    Returns:
        str: HTML content
    """
    if not print_format_name:
        print_format_name = frappe.db.get_value("Print Format", 
                                              {"doc_type": doc.doctype, "is_standard": "No", "is_default": 1},
                                              "name")
    
    if not print_format_name:
        # Use standard print format
        return frappe.get_print(doc.doctype, doc.name, print_format=print_format_name)
    
    # Get the Print Format
    print_format = frappe.get_doc("Print Format", print_format_name)
    
    if print_format.format_data:
        # Generate HTML from the Print Format
        html_content = frappe.render_template(print_format.format_data, {"doc": doc})
    else:
        # Use standard print format
        html_content = frappe.get_print(doc.doctype, doc.name, print_format=print_format_name)
    
    return html_content

@frappe.whitelist()
def print_kot(kot_ticket, kitchen_station=None, copies=1, reprint=False, print_format=None):
    """
    Prints a Kitchen Order Ticket (KOT) to the appropriate printer.
    
    Args:
        kot_ticket (str): KOT Ticket name
        kitchen_station (str, optional): Kitchen Station to print to. Defaults to None.
        copies (int, optional): Number of copies to print. Defaults to 1.
        reprint (bool, optional): Whether this is a reprint. Defaults to False.
        print_format (str, optional): Print Format to use. Defaults to None.
    
    Returns:
        dict: Print status
    """
    try:
        # Get KOT details
        kot_doc = frappe.get_doc("KOT Ticket", kot_ticket)
        validate_branch_access(kot_doc.branch)
        
        # Get the POS Order for additional context
        pos_order = frappe.get_doc("POS Order", kot_doc.pos_order)
        
        # Determine kitchen station if not provided
        if not kitchen_station and kot_doc.kitchen_station:
            kitchen_station = kot_doc.kitchen_station
        
        # Get print format name if not provided
        if not print_format:
            if pos_order.pos_profile:
                profile_doc = frappe.get_doc("POS Profile", pos_order.pos_profile)
                print_format = profile_doc.get("imogi_kot_format")
            
            if not print_format:
                print_format = frappe.db.get_single_value("Restaurant Settings", "imogi_default_kot_format")
        
        # Get print adapter settings
        adapter_settings = get_print_adapter_settings(
            "kitchen", 
            source_doc=pos_order, 
            kitchen_station=kitchen_station
        )
        
        # Get the HTML content for the KOT
        html_content = get_print_format_html(kot_doc, print_format)
        
        # Print using the appropriate adapter
        from imogi_pos.utils.printing import print_document
        
        print_result = print_document(
            html_content,
            adapter_settings["interface"],
            adapter_settings["adapter_config"],
            copies=int(copies)
        )
        
        # Log the printing attempt for audit
        if reprint:
            frappe.get_doc({
                "doctype": "KOT Reprint Log",
                "kot_ticket": kot_ticket,
                "user": frappe.session.user,
                "kitchen_station": kitchen_station,
                "timestamp": now_datetime(),
                "copies": copies,
                "success": print_result.get("success", False),
                "error": print_result.get("error")
            }).insert(ignore_permissions=True)
        
        return {
            "success": print_result.get("success", False),
            "kot_ticket": kot_ticket,
            "kitchen_station": kitchen_station,
            "adapter": adapter_settings["interface"],
            "copies": copies,
            "reprint": reprint,
            "timestamp": now_datetime().isoformat(),
            "error": print_result.get("error")
        }
        
    except Exception as e:
        frappe.log_error(f"Error printing KOT: {str(e)}")
        return {
            "success": False,
            "kot_ticket": kot_ticket,
            "error": str(e),
            "timestamp": now_datetime().isoformat()
        }

@frappe.whitelist()
def print_customer_bill(pos_order, print_format=None):
    """
    Prints a customer bill (pro-forma invoice) for a POS Order.
    
    Args:
        pos_order (str): POS Order name
        print_format (str, optional): Print Format to use. Defaults to None.
    
    Returns:
        dict: Print status
    """
    try:
        # Get POS Order details
        order_doc = frappe.get_doc("POS Order", pos_order)
        validate_branch_access(order_doc.branch)
        
        # Get print format name if not provided
        if not print_format and order_doc.pos_profile:
            profile_doc = frappe.get_doc("POS Profile", order_doc.pos_profile)
            print_format = profile_doc.get("imogi_customer_bill_format")
        
        if not print_format:
            print_format = frappe.db.get_single_value("Restaurant Settings", "imogi_default_customer_bill_format")
        
        # Get print adapter settings
        adapter_settings = get_print_adapter_settings(
            "cashier", 
            source_doc=order_doc
        )
        
        # For table service, we might want to hide line notes from the customer bill
        hide_notes = False
        if order_doc.pos_profile:
            profile_doc = frappe.get_doc("POS Profile", order_doc.pos_profile)
            if profile_doc.imogi_mode == "Table" and profile_doc.get("imogi_hide_notes_on_table_bill"):
                hide_notes = True
        
        # Get the HTML content
        html_content = get_print_format_html(order_doc, print_format)
        
        # If hiding notes, modify the HTML (simplified approach - in production you'd use DOM parsing)
        if hide_notes:
            # This is a simplified approach - in real implementation you would use 
            # proper DOM parsing to remove note elements based on their class/id
            html_content = html_content.replace("<!-- ITEM_NOTES_START -->", "<!-- ")
            html_content = html_content.replace("<!-- ITEM_NOTES_END -->", " -->")
        
        # Print using the appropriate adapter
        from imogi_pos.utils.printing import print_document
        
        print_result = print_document(
            html_content,
            adapter_settings["interface"],
            adapter_settings["adapter_config"]
        )
        
        return {
            "success": print_result.get("success", False),
            "pos_order": pos_order,
            "adapter": adapter_settings["interface"],
            "timestamp": now_datetime().isoformat(),
            "error": print_result.get("error")
        }
        
    except Exception as e:
        frappe.log_error(f"Error printing customer bill: {str(e)}")
        return {
            "success": False,
            "pos_order": pos_order,
            "error": str(e),
            "timestamp": now_datetime().isoformat()
        }

@frappe.whitelist()
def print_receipt(sales_invoice, print_format=None):
    """
    Prints a payment receipt for a Sales Invoice.
    
    Args:
        sales_invoice (str): Sales Invoice name
        print_format (str, optional): Print Format to use. Defaults to None.
    
    Returns:
        dict: Print status
    """
    try:
        # Get Sales Invoice details
        invoice_doc = frappe.get_doc("Sales Invoice", sales_invoice)
        validate_branch_access(invoice_doc.branch)
        
        # Get print format name if not provided
        if not print_format and invoice_doc.pos_profile:
            profile_doc = frappe.get_doc("POS Profile", invoice_doc.pos_profile)
            print_format = profile_doc.get("imogi_receipt_format")
        
        if not print_format:
            print_format = frappe.db.get_single_value("Restaurant Settings", "imogi_default_receipt_format")
        
        # Get print adapter settings
        adapter_settings = get_print_adapter_settings(
            "cashier", 
            source_doc=invoice_doc
        )
        
        # Get the HTML content
        html_content = get_print_format_html(invoice_doc, print_format)
        
        # Print using the appropriate adapter
        from imogi_pos.utils.printing import print_document
        
        print_result = print_document(
            html_content,
            adapter_settings["interface"],
            adapter_settings["adapter_config"]
        )
        
        return {
            "success": print_result.get("success", False),
            "sales_invoice": sales_invoice,
            "adapter": adapter_settings["interface"],
            "timestamp": now_datetime().isoformat(),
            "error": print_result.get("error")
        }
        
    except Exception as e:
        frappe.log_error(f"Error printing receipt: {str(e)}")
        return {
            "success": False,
            "sales_invoice": sales_invoice,
            "error": str(e),
            "timestamp": now_datetime().isoformat()
        }

@frappe.whitelist()
def print_queue_ticket(queue_no, pos_profile=None, print_format=None):
    """
    Prints a queue ticket with a queue number.
    Used for Kiosk mode to give customers a waiting number.
    
    Args:
        queue_no (str): Queue number or identifier
        pos_profile (str, optional): POS Profile name. Defaults to None.
        print_format (str, optional): Print Format to use. Defaults to None.
    
    Returns:
        dict: Print status
    """
    try:
        # Create a temporary object to hold queue data
        queue_data = {
            "queue_no": queue_no,
            "timestamp": now_datetime().isoformat(),
            "branch": frappe.db.get_value("POS Profile", pos_profile, "imogi_branch") if pos_profile else None
        }
        
        # Get print format name if not provided
        if not print_format and pos_profile:
            profile_doc = frappe.get_doc("POS Profile", pos_profile)
            print_format = profile_doc.get("imogi_queue_format")
            
            # Validate branch access if available
            if profile_doc.get("imogi_branch"):
                validate_branch_access(profile_doc.imogi_branch)
        
        if not print_format:
            print_format = frappe.db.get_single_value("Restaurant Settings", "imogi_default_queue_format")
        
        # Get print adapter settings
        adapter_settings = get_print_adapter_settings(
            "cashier", 
            pos_profile=pos_profile
        )
        
        # For queue tickets, we use a special template since there's no document
        template_path = os.path.join(
            frappe.get_app_path("imogi_pos", "templates", "queue_ticket.html")
        )
        
        if not os.path.exists(template_path):
            # Fallback to a simple template
            html_content = f"""
            <div style="text-align: center; padding: 20px;">
                <h1>Queue Ticket</h1>
                <h2 style="font-size: 48px; margin: 20px 0;">{queue_no}</h2>
                <p>{now_datetime().strftime('%Y-%m-%d %H:%M:%S')}</p>
                <p>Thank you for your order!</p>
            </div>
            """
        else:
            # Use the template file
            with open(template_path, "r") as f:
                template = f.read()
                html_content = frappe.render_template(template, queue_data)
        
        # Print using the appropriate adapter
        from imogi_pos.utils.printing import print_document
        
        print_result = print_document(
            html_content,
            adapter_settings["interface"],
            adapter_settings["adapter_config"]
        )
        
        return {
            "success": print_result.get("success", False),
            "queue_no": queue_no,
            "adapter": adapter_settings["interface"],
            "timestamp": now_datetime().isoformat(),
            "error": print_result.get("error")
        }
        
    except Exception as e:
        frappe.log_error(f"Error printing queue ticket: {str(e)}")
        return {
            "success": False,
            "queue_no": queue_no,
            "error": str(e),
            "timestamp": now_datetime().isoformat()
        }

@frappe.whitelist()
def test_print(adapter_type, target, config=None):
    """
    Sends a test print to verify printer connectivity.
    
    Args:
        adapter_type (str): Adapter type (LAN/Bluetooth/OS)
        target (str): Target printer identifier (name, IP, etc.)
        config (dict or str, optional): Additional configuration. Defaults to None.
    
    Returns:
        dict: Test result
    """
    try:
        # Parse config if provided as string
        if isinstance(config, str):
            config = json.loads(config)
        
        if not config:
            config = {}
        
        # Prepare adapter configuration
        adapter_config = {
            "test_mode": True
        }
        
        if adapter_type == "LAN":
            adapter_config.update({
                "host": target,
                "port": config.get("port", 9100)
            })
        elif adapter_type == "Bluetooth":
            adapter_config.update({
                "device_name": target,
                "vendor_profile": config.get("vendor_profile", "ESC/POS"),
                "bridge_url": config.get("bridge_url"),
                "bridge_token": config.get("bridge_token")
            })
        
        # Generate a simple test print HTML
        company = frappe.defaults.get_global_default('company') or "Test Company"
        html_content = f"""
        <div style="text-align: center; padding: 10px;">
            <h1>Print Test</h1>
            <p>{company}</p>
            <p>{now_datetime().strftime('%Y-%m-%d %H:%M:%S')}</p>
            <p>Adapter: {adapter_type}</p>
            <p>Target: {target}</p>
            <hr/>
            <p>If you can read this, printing is working correctly!</p>
            <hr/>
            <p>IMOGI POS System</p>
        </div>
        """
        
        # Print using the appropriate adapter
        from imogi_pos.utils.printing import print_document
        
        print_result = print_document(
            html_content,
            adapter_type,
            adapter_config
        )
        
        return {
            "success": print_result.get("success", False),
            "adapter": adapter_type,
            "target": target,
            "timestamp": now_datetime().isoformat(),
            "error": print_result.get("error"),
            "details": print_result.get("details")
        }
        
    except Exception as e:
        frappe.log_error(f"Error during test print: {str(e)}")
        return {
            "success": False,
            "adapter": adapter_type,
            "target": target,
            "error": str(e),
            "timestamp": now_datetime().isoformat()
        }

@frappe.whitelist()
def get_print_capabilities():
    """
    Gets information about available print capabilities.
    
    Returns:
        dict: Print capabilities information
    """
    capabilities = {
        "adapters": [
            {
                "type": "LAN",
                "name": _("Network Printer (LAN/IP)"),
                "description": _("Print to a networked printer using TCP/IP"),
                "fields": [
                    {"name": "host", "label": _("IP Address"), "type": "data", "required": 1},
                    {"name": "port", "label": _("Port"), "type": "int", "default": 9100}
                ],
                "platforms": ["all"]
            },
            {
                "type": "Bluetooth",
                "name": _("Bluetooth Printer"),
                "description": _("Print to a Bluetooth printer"),
                "fields": [
                    {"name": "device_name", "label": _("Device Name"), "type": "data", "required": 1},
                    {"name": "vendor_profile", "label": _("Vendor Profile"), "type": "select", 
                     "options": "ESC/POS\nCPCL\nZPL", "default": "ESC/POS"},
                    {"name": "bridge_url", "label": _("Print Bridge URL"), "type": "data", 
                     "description": _("Optional: Use IMOGI Print Bridge for extended compatibility")},
                    {"name": "bridge_token", "label": _("Print Bridge Token"), "type": "password"}
                ],
                "platforms": ["Web Bluetooth API: Chrome, Edge, Android", "Bridge: Windows, macOS, Linux"]
            },
            {
                "type": "OS",
                "name": _("Operating System Printer"),
                "description": _("Print using the operating system's default printer"),
                "fields": [],
                "platforms": ["all"]
            }
        ],
        "print_formats": {
            "kot": frappe.get_all("Print Format", filters={"doc_type": "KOT Ticket"}, fields=["name", "standard"]),
            "customer_bill": frappe.get_all("Print Format", filters={"doc_type": "POS Order"}, fields=["name", "standard"]),
            "receipt": frappe.get_all("Print Format", filters={"doc_type": "Sales Invoice"}, fields=["name", "standard"]),
            "queue": frappe.get_all("Print Format", filters={"doc_type": "Queue Ticket"}, fields=["name", "standard"])
        },
        "web_bluetooth_available": _detect_web_bluetooth_support(),
        "os_print_available": True
    }
    
    return capabilities

def _detect_web_bluetooth_support():
    """
    Attempts to detect if Web Bluetooth is likely supported in this environment.
    Note: This is a heuristic since we can't directly check browser capabilities server-side.
    
    Returns:
        bool: True if Web Bluetooth might be available, False otherwise
    """
    # We can only make educated guesses server-side
    # Real detection needs to be done client-side with JavaScript
    
    # Check if we're in a secure context (HTTPS)
    request = frappe.request
    if request and hasattr(request, 'url_root'):
        is_https = request.url_root.startswith('https://')
        
        if is_https:
            return True

    # If we can't determine, assume not supported for safety
    return False
