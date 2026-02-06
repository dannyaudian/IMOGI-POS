# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import cint, now_datetime, get_url
from imogi_pos.utils.permission_manager import check_branch_access
import json
import os
import base64


def get_print_adapter_settings(adapter_type, source_doc=None, pos_profile=None, kitchen_station=None):
    """
    Gets settings for a print adapter based on context.
    Follows cascading priority: Kitchen Station > POS Profile > OS (default)
    
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
    
    # Default to OS if no adapter config found
    if not settings["adapter_config"]:
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


@frappe.whitelist()
def get_printer_config(pos_profile=None, job_type="receipt"):
    """Return printer configuration for a POS profile and job type."""

    adapter_map = {
        "kot": "kitchen",
        "receipt": "cashier",
        "customer_bill": "cashier",
        "queue_ticket": "cashier",
        "test": "cashier",
    }
    adapter_type = adapter_map.get(job_type, "cashier")

    if pos_profile:
        profile_doc = frappe.get_doc("POS Profile", pos_profile)
        if profile_doc.get("imogi_branch"):
            check_branch_access(profile_doc.imogi_branch)
        
        # Get printer settings from POS Profile
        config = {
            "pos_profile": pos_profile,
            "job_type": job_type
        }
        
        # Determine interface type
        if adapter_type == "kitchen":
            interface = profile_doc.get("imogi_printer_kitchen_interface") or "OS"
        else:
            interface = profile_doc.get("imogi_printer_cashier_interface") or "OS"
        
        config["printer_type"] = interface.lower()  # LAN -> network, USB -> usb, Bluetooth -> bluetooth
        
        # Printer width for ESC/POS
        config["printer_width"] = int(profile_doc.get("imogi_printer_width") or 32)
        
        # Network (LAN) settings
        if interface == "LAN":
            if adapter_type == "kitchen":
                config["printer_ip"] = profile_doc.get("imogi_printer_kitchen")
            else:
                config["printer_ip"] = profile_doc.get("imogi_printer_cashier")
            config["printer_port"] = profile_doc.get("imogi_printer_port") or 9100
        
        # USB settings
        elif interface == "USB":
            if adapter_type == "kitchen":
                config["device_path"] = profile_doc.get("imogi_usb_kitchen_device")
            else:
                config["device_path"] = profile_doc.get("imogi_usb_cashier_device")
        
        # Bluetooth settings
        elif interface == "Bluetooth":
            if adapter_type == "kitchen":
                config["bluetooth_name"] = profile_doc.get("imogi_bt_kitchen_device_name")
                config["bluetooth_profile"] = profile_doc.get("imogi_bt_kitchen_vendor_profile") or "ESC/POS"
            else:
                config["bluetooth_name"] = profile_doc.get("imogi_bt_cashier_device_name")
                config["bluetooth_profile"] = profile_doc.get("imogi_bt_cashier_vendor_profile") or "ESC/POS"
            config["bluetooth_retry"] = profile_doc.get("imogi_bt_retry") or 3
        
        # Print Bridge settings (for Bluetooth)
        if interface == "Bluetooth" or interface == "USB":
            config["bridge_url"] = profile_doc.get("imogi_print_bridge_url") or "http://localhost:5555"
            config["bridge_token"] = profile_doc.get("imogi_print_bridge_token")
        
        return config
    
    return {}

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
    
    # Always use frappe.get_print to let Frappe handle both classic and builder
    # print formats correctly. Directly rendering ``format_data`` would fail for
    # JSON-based print formats (builder templates) resulting in ``Can't compile
    # non template nodes`` errors.
    return frappe.get_print(doc.doctype, doc.name, print_format=print_format_name)

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
        check_branch_access(kot_doc.branch)
        
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
            
            # Default to standard KOT format if not configured
            if not print_format:
                print_format = "KOT Ticket"
        
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
def get_customer_bill_html(pos_order, pos_profile=None):
    """Get rendered HTML and format for a customer bill."""

    try:
        order_doc = frappe.get_doc("POS Order", pos_order)
        check_branch_access(order_doc.branch)

        if not pos_profile:
            pos_profile = order_doc.pos_profile

        print_format = None
        hide_notes = False

        if pos_profile:
            profile_doc = frappe.get_doc("POS Profile", pos_profile)
            if profile_doc.get("imogi_branch"):
                check_branch_access(profile_doc.imogi_branch)
            print_format = profile_doc.get("imogi_customer_bill_format")
            if profile_doc.imogi_mode == "Table" and profile_doc.get("imogi_hide_notes_on_table_bill"):
                hide_notes = True

        # Default to standard bill format if not configured
        if not print_format:
            print_format = "Bill"

        html_content = get_print_format_html(order_doc, print_format)

        if hide_notes:
            html_content = html_content.replace("<!-- ITEM_NOTES_START -->", "<!-- ")
            html_content = html_content.replace("<!-- ITEM_NOTES_END -->", " -->")

        return {
            "html": html_content,
            "print_format": print_format,
        }

    except Exception as e:
        frappe.log_error(f"Error generating customer bill HTML: {str(e)}")
        return {"error": str(e)}


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
    if not pos_order:
        frappe.throw(_("POS Order is required"), frappe.ValidationError)

    try:
        # Get POS Order details
        order_doc = frappe.get_doc("POS Order", pos_order)
        check_branch_access(order_doc.branch)

        # Get print format name if not provided
        if not print_format and order_doc.pos_profile:
            profile_doc = frappe.get_doc("POS Profile", order_doc.pos_profile)
            print_format = profile_doc.get("imogi_customer_bill_format")

        # Default to standard bill format if not configured
        if not print_format:
            print_format = "Bill"

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
        check_branch_access(invoice_doc.branch)
        
        # Get print format name if not provided
        if not print_format and invoice_doc.pos_profile:
            profile_doc = frappe.get_doc("POS Profile", invoice_doc.pos_profile)
            print_format = profile_doc.get("imogi_receipt_format")
        
        if not print_format:
            print_format = "Receipt"
        
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
def get_queue_ticket_html(sales_invoice, pos_profile=None):
    """Get rendered HTML and format for a queue ticket."""

    try:
        invoice_doc = frappe.get_doc("Sales Invoice", sales_invoice)
        check_branch_access(invoice_doc.branch)

        if not pos_profile:
            pos_profile = invoice_doc.pos_profile

        print_format = None
        if pos_profile:
            profile_doc = frappe.get_doc("POS Profile", pos_profile)
            if profile_doc.get("imogi_branch"):
                check_branch_access(profile_doc.imogi_branch)
            print_format = profile_doc.get("imogi_queue_format")

        # Default to standard queue format if not configured
        if not print_format:
            print_format = "Queue Ticket"

        queue_no = (
            invoice_doc.get("queue_no")
            or invoice_doc.get("queue_number")
            or sales_invoice
        )

        queue_data = {
            "queue_no": queue_no,
            "timestamp": now_datetime().isoformat(),
            "branch": invoice_doc.branch,
        }

        template_path = os.path.join(
            frappe.get_app_path("imogi_pos", "templates", "queue_ticket.html")
        )

        if os.path.exists(template_path):
            with open(template_path, "r") as f:
                template = f.read()
            html_content = frappe.render_template(template, queue_data)
        else:
            html_content = f"""
            <div style=\"text-align: center; padding: 20px;\">
                <h1>Queue Ticket</h1>
                <h2 style=\"font-size: 48px; margin: 20px 0;\">{queue_no}</h2>
                <p>{now_datetime().strftime('%Y-%m-%d %H:%M:%S')}</p>
                <p>Thank you for your order!</p>
            </div>
            """

        return {"html": html_content, "print_format": print_format}

    except Exception as e:
        frappe.log_error(f"Error generating queue ticket HTML: {str(e)}")
        return {"error": str(e)}


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
                check_branch_access(profile_doc.imogi_branch)
        
        # Default to standard queue format if not configured
        if not print_format:
            print_format = "Queue Ticket"
        
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
def submit_print_job(interface, job, adapter_config=None):
    """Accept a print job from the client and dispatch it through the server."""

    if isinstance(adapter_config, str):
        try:
            adapter_config = json.loads(adapter_config)
        except ValueError:
            adapter_config = {}

    adapter_config = adapter_config or {}

    if isinstance(job, str):
        try:
            job = json.loads(job)
        except ValueError:
            job = {"data": job}

    job = job or {}

    interface = interface or "LAN"

    if interface != "LAN":
        frappe.throw(_("Client initiated printing is only supported for LAN printers"))

    job_format = (job.get("format") or "html").lower()
    copies = cint(job.get("copies") or 1)
    if copies < 1:
        copies = 1

    options = job.get("options") or {}
    if options.get("paper_width_mm") and not adapter_config.get("paper_width_mm"):
        adapter_config["paper_width_mm"] = options.get("paper_width_mm")

    if job_format == "html":
        from imogi_pos.utils.printing import print_document

        html_content = _extract_html_from_job(job.get("data"))
        if not html_content:
            frappe.throw(_("No HTML content provided for print job"))

        return print_document(html_content, interface, adapter_config, copies=copies)

    if job_format in {"raw", "command"}:
        from imogi_pos.utils.printing import print_via_lan

        payload_bytes = _coerce_print_bytes(job.get("data"))

        if not payload_bytes:
            frappe.throw(_("No print data provided for raw print job"))

        host = adapter_config.get("host")
        port = cint(adapter_config.get("port") or 9100)

        if not host:
            frappe.throw(_("LAN printer host/IP is required for LAN interface"))

        results = []
        for _ in range(copies):
            results.append(print_via_lan(host, port, payload_bytes))

        success = all(result.get("success") for result in results)

        return {
            "success": success,
            "copies": copies,
            "details": results,
            "host": host,
            "port": port,
            "error": None if success else _("Failed to print one or more copies")
        }

    frappe.throw(_("Unsupported print job format: {0}").format(job_format))


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


def _extract_html_from_job(data):
    """Extract HTML string from job data."""

    if not data:
        return ""

    if isinstance(data, str):
        return data

    if isinstance(data, dict):
        for key in ["html", "data", "content", "body"]:
            value = data.get(key)
            if value:
                return value

    if isinstance(data, list):
        return "".join(str(item) for item in data)

    return str(data)


def _coerce_print_bytes(data):
    """Convert job data to bytes for raw LAN printing."""

    if data is None:
        return b""

    if isinstance(data, bytes):
        return data

    if isinstance(data, bytearray):
        return bytes(data)

    if isinstance(data, str):
        try:
            return data.encode("latin-1")
        except UnicodeEncodeError:
            return data.encode("utf-8")

    if isinstance(data, dict):
        base64_value = data.get("base64")
        if base64_value:
            try:
                return base64.b64decode(base64_value)
            except Exception:
                return b""
        if data.get("raw"):
            return _coerce_print_bytes(data.get("raw"))
        if data.get("data"):
            return _coerce_print_bytes(data.get("data"))

    if isinstance(data, list):
        try:
            return bytes(data)
        except Exception:
            return "".join(str(item) for item in data).encode("utf-8")

    return str(data).encode("utf-8")


# ===== ESC/POS Direct Mode Support =====
# Control Characters
ESC = b'\x1b'
GS = b'\x1d'
LF = b'\x0a'

# Printer initialization
INIT = ESC + b'@'

# Text alignment
ALIGN_LEFT = ESC + b'a\x00'
ALIGN_CENTER = ESC + b'a\x01'
ALIGN_RIGHT = ESC + b'a\x02'

# Text formatting
BOLD_ON = ESC + b'E\x01'
BOLD_OFF = ESC + b'E\x00'
UNDERLINE_ON = ESC + b'-\x01'
UNDERLINE_OFF = ESC + b'-\x00'

# Font sizes
FONT_NORMAL = GS + b'!\x00'
FONT_DOUBLE_HEIGHT = GS + b'!\x01'
FONT_DOUBLE_WIDTH = GS + b'!\x10'
FONT_DOUBLE = GS + b'!\x11'
FONT_TRIPLE = GS + b'!\x22'

# Paper cutting
CUT_FULL = GS + b'V\x00'
CUT_PARTIAL = GS + b'V\x01'

# Line feed
FEED_LINE = LF


@frappe.whitelist()
def generate_receipt_escpos(invoice_name, printer_width=32):
	"""
	Generate ESC/POS commands for POS Invoice receipt
	Supports Network, USB, and Bluetooth thermal printers
	
	Args:
		invoice_name: Name of POS Invoice
		printer_width: Character width of printer (32 or 48)
	
	Returns:
		dict with base64 encoded ESC/POS commands
	"""
	try:
		doc = frappe.get_doc('POS Invoice', invoice_name)
		
		# Build receipt
		receipt = build_pos_receipt_escpos(doc, int(printer_width))
		
		# Encode to base64 for transmission
		receipt_base64 = base64.b64encode(receipt).decode('utf-8')
		
		return {
			'success': True,
			'data': receipt_base64,
			'invoice': invoice_name,
			'format': 'escpos'
		}
		
	except Exception as e:
		frappe.log_error(f"ESC/POS Generation Error: {str(e)}", "Printing Error")
		return {
			'success': False,
			'error': str(e)
		}


def build_pos_receipt_escpos(doc, printer_width=32):
	"""Build complete ESC/POS receipt from POS Invoice"""
	from datetime import datetime
	
	receipt = bytearray()
	
	# Initialize printer
	receipt.extend(INIT)
	
	# Header - Company/Store Name
	receipt.extend(ALIGN_CENTER)
	receipt.extend(FONT_DOUBLE)
	receipt.extend(_encode_text(doc.company or "IMOGI POS"))
	receipt.extend(FEED_LINE)
	
	# Company details
	receipt.extend(FONT_NORMAL)
	company_details = get_company_details(doc.company)
	if company_details:
		if company_details.get('address'):
			receipt.extend(_encode_text(company_details['address']))
			receipt.extend(FEED_LINE)
		if company_details.get('phone'):
			receipt.extend(_encode_text(f"Tel: {company_details['phone']}"))
			receipt.extend(FEED_LINE)
	
	# Divider
	receipt.extend(_encode_text('=' * printer_width))
	receipt.extend(FEED_LINE)
	
	# Invoice info
	receipt.extend(ALIGN_LEFT)
	receipt.extend(FONT_NORMAL)
	receipt.extend(_encode_text(f"Invoice: {doc.name}"))
	receipt.extend(FEED_LINE)
	
	# Date & Time
	posting_datetime = str(doc.posting_date)
	if hasattr(doc, 'posting_time') and doc.posting_time:
		posting_datetime = f"{doc.posting_date} {doc.posting_time}"
	receipt.extend(_encode_text(f"Date: {posting_datetime}"))
	receipt.extend(FEED_LINE)
	
	# Cashier
	receipt.extend(_encode_text(f"Cashier: {doc.owner}"))
	receipt.extend(FEED_LINE)
	
	# Customer
	if doc.customer and doc.customer != "Guest":
		receipt.extend(_encode_text(f"Customer: {doc.customer}"))
		receipt.extend(FEED_LINE)
	
	# Table number (if restaurant)
	if hasattr(doc, 'table_number') and doc.table_number:
		receipt.extend(_encode_text(f"Table: {doc.table_number}"))
		receipt.extend(FEED_LINE)
	
	receipt.extend(_encode_text('=' * printer_width))
	receipt.extend(FEED_LINE)
	
	# Items header
	receipt.extend(BOLD_ON)
	receipt.extend(_encode_text("Item                 Qty   Amount"))
	receipt.extend(FEED_LINE)
	receipt.extend(BOLD_OFF)
	receipt.extend(_encode_text('-' * printer_width))
	receipt.extend(FEED_LINE)
	
	# Items
	for item in doc.items:
		# Item name (truncate if too long)
		item_name = (item.item_name or item.item_code)[:printer_width]
		receipt.extend(_encode_text(item_name))
		receipt.extend(FEED_LINE)
		
		# Quantity and price
		qty_str = f"{item.qty:.0f}x"
		price_str = f"{item.rate:,.0f}"
		amount_str = f"{item.amount:,.0f}"
		
		# Format: "  2x @ 25,000        50,000"
		detail_line = f"  {qty_str} @ {price_str}".ljust(printer_width - len(amount_str)) + amount_str
		receipt.extend(_encode_text(detail_line))
		receipt.extend(FEED_LINE)
		
		# Item discount if any
		if hasattr(item, 'discount_amount') and item.discount_amount and item.discount_amount > 0:
			discount_line = f"  Discount".ljust(printer_width - len(f"{item.discount_amount:,.0f}")) + f"-{item.discount_amount:,.0f}"
			receipt.extend(_encode_text(discount_line))
			receipt.extend(FEED_LINE)
	
	receipt.extend(_encode_text('=' * printer_width))
	receipt.extend(FEED_LINE)
	
	# Subtotal
	subtotal_line = _format_total_line("Subtotal:", doc.net_total, printer_width)
	receipt.extend(_encode_text(subtotal_line))
	receipt.extend(FEED_LINE)
	
	# Discount
	if hasattr(doc, 'discount_amount') and doc.discount_amount and doc.discount_amount > 0:
		discount_line = _format_total_line("Discount:", -doc.discount_amount, printer_width)
		receipt.extend(_encode_text(discount_line))
		receipt.extend(FEED_LINE)
	
	# Tax
	if hasattr(doc, 'total_taxes_and_charges') and doc.total_taxes_and_charges and doc.total_taxes_and_charges > 0:
		tax_line = _format_total_line("Tax:", doc.total_taxes_and_charges, printer_width)
		receipt.extend(_encode_text(tax_line))
		receipt.extend(FEED_LINE)
	
	receipt.extend(_encode_text('=' * printer_width))
	receipt.extend(FEED_LINE)
	
	# Grand total
	receipt.extend(BOLD_ON)
	receipt.extend(FONT_DOUBLE_HEIGHT)
	total_line = _format_total_line("TOTAL:", doc.grand_total, printer_width)
	receipt.extend(_encode_text(total_line))
	receipt.extend(FEED_LINE)
	receipt.extend(BOLD_OFF)
	receipt.extend(FONT_NORMAL)
	
	receipt.extend(_encode_text('=' * printer_width))
	receipt.extend(FEED_LINE)
	
	# Payment details
	if hasattr(doc, 'payments') and doc.payments:
		receipt.extend(BOLD_ON)
		receipt.extend(_encode_text("PAYMENT"))
		receipt.extend(FEED_LINE)
		receipt.extend(BOLD_OFF)
		
		for payment in doc.payments:
			payment_line = _format_total_line(f"{payment.mode_of_payment}:", payment.amount, printer_width)
			receipt.extend(_encode_text(payment_line))
			receipt.extend(FEED_LINE)
		
		# Change
		if hasattr(doc, 'change_amount') and doc.change_amount and doc.change_amount > 0:
			receipt.extend(BOLD_ON)
			change_line = _format_total_line("CHANGE:", doc.change_amount, printer_width)
			receipt.extend(_encode_text(change_line))
			receipt.extend(FEED_LINE)
			receipt.extend(BOLD_OFF)
	
	receipt.extend(FEED_LINE)
	
	# Footer
	receipt.extend(ALIGN_CENTER)
	receipt.extend(_encode_text("Thank You!"))
	receipt.extend(FEED_LINE)
	receipt.extend(_encode_text("Please Come Again"))
	receipt.extend(FEED_LINE)
	receipt.extend(FEED_LINE)
	
	# Extra line feeds before cut
	receipt.extend(FEED_LINE)
	receipt.extend(FEED_LINE)
	receipt.extend(FEED_LINE)
	
	# Cut paper
	receipt.extend(CUT_PARTIAL)
	
	return bytes(receipt)


@frappe.whitelist()
def generate_kot_escpos(order_name, printer_width=32):
	"""
	Generate ESC/POS commands for Kitchen Order Ticket (KOT)
	
	Args:
		order_name: Name of order/invoice
		printer_width: Character width of printer
	
	Returns:
		dict with base64 encoded ESC/POS commands
	"""
	from datetime import datetime
	
	try:
		# Try to get POS Invoice first
		doc = frappe.get_doc('POS Invoice', order_name)
		
		kot = bytearray()
		
		# Initialize
		kot.extend(INIT)
		
		# Header
		kot.extend(ALIGN_CENTER)
		kot.extend(FONT_TRIPLE)
		kot.extend(BOLD_ON)
		kot.extend(_encode_text("KITCHEN ORDER"))
		kot.extend(FEED_LINE)
		kot.extend(BOLD_OFF)
		kot.extend(FONT_NORMAL)
		
		kot.extend(_encode_text('=' * printer_width))
		kot.extend(FEED_LINE)
		
		# Order info
		kot.extend(ALIGN_LEFT)
		kot.extend(FONT_DOUBLE_HEIGHT)
		kot.extend(BOLD_ON)
		
		# Order number
		kot.extend(_encode_text(f"Order: {doc.name}"))
		kot.extend(FEED_LINE)
		
		# Table
		if hasattr(doc, 'table_number') and doc.table_number:
			kot.extend(_encode_text(f"Table: {doc.table_number}"))
			kot.extend(FEED_LINE)
		
		kot.extend(BOLD_OFF)
		kot.extend(FONT_NORMAL)
		
		# Time
		kot.extend(_encode_text(f"Time: {datetime.now().strftime('%H:%M:%S')}"))
		kot.extend(FEED_LINE)
		
		kot.extend(_encode_text('=' * printer_width))
		kot.extend(FEED_LINE)
		kot.extend(FEED_LINE)
		
		# Items
		for item in doc.items:
			# Quantity with large font
			kot.extend(FONT_TRIPLE)
			kot.extend(BOLD_ON)
			kot.extend(_encode_text(f"{item.qty:.0f}x"))
			kot.extend(FEED_LINE)
			kot.extend(BOLD_OFF)
			
			# Item name
			kot.extend(FONT_DOUBLE)
			item_name = item.item_name or item.item_code
			kot.extend(_encode_text(item_name))
			kot.extend(FEED_LINE)
			kot.extend(FONT_NORMAL)
			
			# Notes/customizations
			if hasattr(item, 'notes') and item.notes:
				kot.extend(_encode_text(f"  ** {item.notes} **"))
				kot.extend(FEED_LINE)
			
			kot.extend(FEED_LINE)
		
		kot.extend(_encode_text('=' * printer_width))
		kot.extend(FEED_LINE)
		
		# Footer
		kot.extend(ALIGN_CENTER)
		kot.extend(FONT_NORMAL)
		kot.extend(_encode_text(f"Printed: {datetime.now().strftime('%H:%M:%S')}"))
		kot.extend(FEED_LINE)
		kot.extend(FEED_LINE)
		kot.extend(FEED_LINE)
		
		# Cut
		kot.extend(CUT_PARTIAL)
		
		# Encode to base64
		kot_base64 = base64.b64encode(bytes(kot)).decode('utf-8')
		
		return {
			'success': True,
			'data': kot_base64,
			'order': order_name,
			'format': 'escpos'
		}
		
	except Exception as e:
		frappe.log_error(f"KOT ESC/POS Generation Error: {str(e)}", "Printing Error")
		return {
			'success': False,
			'error': str(e)
		}


def get_company_details(company_name):
	"""Get company address and phone for receipt header"""
	try:
		company = frappe.get_doc('Company', company_name)
		details = {}
		
		# Get default address
		if hasattr(company, 'company_address') and company.company_address:
			address = frappe.get_doc('Address', company.company_address)
			address_lines = []
			if hasattr(address, 'address_line1') and address.address_line1:
				address_lines.append(address.address_line1)
			if hasattr(address, 'city') and address.city:
				address_lines.append(address.city)
			if address_lines:
				details['address'] = ', '.join(address_lines)
		
		# Phone
		if hasattr(company, 'phone_no') and company.phone_no:
			details['phone'] = company.phone_no
		
		return details
	except:
		return {}


def _encode_text(text):
	"""Encode text to bytes with proper character handling"""
	try:
		return text.encode('utf-8')
	except:
		return text.encode('ascii', errors='ignore')


def _format_total_line(label, amount, width=32):
	"""Format total line with right-aligned amount"""
	amount_str = f"{amount:,.0f}"
	label_width = width - len(amount_str)
	return f"{label:<{label_width}}{amount_str}"


@frappe.whitelist()
def test_printer_escpos(printer_width=32):
	"""
	Generate test receipt for ESC/POS printer testing
	
	Args:
		printer_width: Character width of printer
	
	Returns:
		dict with base64 encoded test receipt
	"""
	from datetime import datetime
	
	try:
		receipt = bytearray()
		receipt.extend(INIT)
		receipt.extend(ALIGN_CENTER)
		receipt.extend(FONT_DOUBLE)
		receipt.extend(BOLD_ON)
		receipt.extend(_encode_text("PRINTER TEST"))
		receipt.extend(FEED_LINE)
		receipt.extend(BOLD_OFF)
		receipt.extend(FONT_NORMAL)
		receipt.extend(_encode_text('=' * printer_width))
		receipt.extend(FEED_LINE)
		receipt.extend(ALIGN_LEFT)
		receipt.extend(_encode_text(f"IMOGI POS - ESC/POS Direct"))
		receipt.extend(FEED_LINE)
		receipt.extend(_encode_text(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"))
		receipt.extend(FEED_LINE)
		receipt.extend(_encode_text('=' * printer_width))
		receipt.extend(FEED_LINE)
		receipt.extend(ALIGN_CENTER)
		receipt.extend(BOLD_ON)
		receipt.extend(_encode_text("Test Successful!"))
		receipt.extend(FEED_LINE)
		receipt.extend(BOLD_OFF)
		receipt.extend(FEED_LINE)
		receipt.extend(FEED_LINE)
		receipt.extend(FEED_LINE)
		receipt.extend(CUT_PARTIAL)
		
		receipt_base64 = base64.b64encode(bytes(receipt)).decode('utf-8')
		
		return {
			'success': True,
			'data': receipt_base64,
			'format': 'escpos'
		}
		
	except Exception as e:
		frappe.log_error(f"Test Printer Error: {str(e)}", "Printing Error")
		return {
			'success': False,
			'error': str(e)
		}
