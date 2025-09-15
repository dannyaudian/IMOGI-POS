# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
import socket
import requests
import json
import os
import tempfile
from bs4 import BeautifulSoup
import re
import base64
from typing import Dict, Any, Union, Optional, List


def format_kot_options(options: Union[str, Dict[str, Any], List[Any], None]) -> str:
    """Format item options for display on KOT tickets.

    Args:
        options: Item options as a dict, list or JSON string.

    Returns:
        str: Human-readable string representation of the options.
    """

    if not options:
        return ""

    if isinstance(options, str):
        try:
            options = json.loads(options)
        except Exception:
            return options

    parts: List[str] = []

    if isinstance(options, dict):
        for key, value in options.items():
            label = key.replace("_", " ").title()
            if isinstance(value, dict):
                name = value.get("name") or value.get("label") or str(value)
                parts.append(f"{label}: {name}")
            elif isinstance(value, list):
                names = [
                    (item.get("name") or item.get("label") or str(item))
                    if isinstance(item, dict)
                    else str(item)
                    for item in value
                ]
                parts.append(f"{label}: {', '.join(names)}")
            else:
                parts.append(f"{label}: {value}")
    elif isinstance(options, list):
        names = [
            (item.get("name") or item.get("label") or str(item))
            if isinstance(item, dict)
            else str(item)
            for item in options
        ]
        parts.append(", ".join(names))
    else:
        return str(options)

    return " | ".join(parts)

def print_document(html_content: str, interface: str, adapter_config: Dict[str, Any], copies: int = 1) -> Dict[str, Any]:
    """
    Print a document using the specified interface and adapter configuration.
    
    Args:
        html_content (str): HTML content to print
        interface (str): Printing interface (LAN/Bluetooth/OS)
        adapter_config (dict): Adapter-specific configuration
        copies (int, optional): Number of copies to print. Defaults to 1.
    
    Returns:
        dict: Print result with success flag and any error messages
    """
    try:
        # Create context for the print operation
        context = {
            "html_content": html_content,
            "adapter_config": adapter_config,
            "copies": copies,
            "interface": interface
        }
        
        # Determine paper width for thermal printing (default to 80mm)
        paper_width_mm = adapter_config.get("paper_width_mm", 80)
        
        # Convert HTML to thermal-printer-friendly format
        if interface in ["LAN", "Bluetooth"]:
            # For direct printing, convert HTML to bytes
            print_data = render_html_to_bytes_for_thermal(html_content, paper_width_mm)
            context["print_data"] = print_data
        
        # Dispatch to the appropriate printing method
        return dispatch_print(interface, context)
        
    except Exception as e:
        frappe.log_error(f"Print error: {str(e)}", "IMOGI Print Error")
        return {
            "success": False,
            "error": str(e)
        }

def dispatch_print(interface: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Dispatches the print job to the appropriate interface.
    
    Args:
        interface (str): Printing interface (LAN/Bluetooth/OS)
        context (dict): Print context including configuration and data
    
    Returns:
        dict: Print result with success flag and any error messages
    """
    try:
        if interface == "LAN":
            # LAN/Network printing
            config = context["adapter_config"]
            host = config.get("host")
            port = config.get("port", 9100)
            
            if not host:
                return {
                    "success": False,
                    "error": _("Missing printer host address")
                }
            
            # Get the print data
            print_data = context["print_data"]
            copies = context.get("copies", 1)
            
            # Print multiple copies if requested
            results = []
            for i in range(copies):
                result = print_via_lan(host, port, print_data)
                results.append(result)
            
            # Check if all copies were successful
            all_success = all(result.get("success", False) for result in results)
            
            return {
                "success": all_success,
                "error": None if all_success else _("Failed to print one or more copies"),
                "details": results
            }
            
        elif interface == "Bluetooth":
            # Bluetooth printing via bridge
            config = context["adapter_config"]
            bridge_url = config.get("bridge_url")
            bridge_token = config.get("bridge_token")
            device_name = config.get("device_name")
            
            if bridge_url and device_name:
                # Use print bridge
                print_data = context["print_data"]
                copies = context.get("copies", 1)
                
                # Additional Bluetooth config
                bt_config = {
                    "device_name": device_name,
                    "vendor_profile": config.get("vendor_profile", "ESC/POS"),
                    "retry_count": config.get("retry_count", 2)
                }
                
                # Print multiple copies if requested
                results = []
                for i in range(copies):
                    result = print_via_bridge(bridge_url, bridge_token, print_data, bt_config)
                    results.append(result)
                
                # Check if all copies were successful
                all_success = all(result.get("success", False) for result in results)
                
                return {
                    "success": all_success,
                    "error": None if all_success else _("Failed to print one or more copies via Bluetooth bridge"),
                    "details": results
                }
            else:
                # Return error for missing configuration
                return {
                    "success": False,
                    "error": _("Missing Bluetooth bridge URL or device name")
                }
                
        elif interface == "OS":
            # OS printing (spooler)
            # Just return the HTML content for client-side printing
            return {
                "success": True,
                "html_content": context["html_content"],
                "print_mode": "os_spooler"
            }
        
        else:
            return {
                "success": False,
                "error": _("Unsupported print interface: {0}").format(interface)
            }
            
    except Exception as e:
        frappe.log_error(f"Dispatch print error: {str(e)}", "IMOGI Print Error")
        return {
            "success": False,
            "error": str(e)
        }

def print_via_lan(host: str, port: int = 9100, payload_bytes: bytes = None) -> Dict[str, Any]:
    """
    Prints data to a networked printer via TCP/IP.
    
    Args:
        host (str): Printer IP address or hostname
        port (int, optional): Printer port. Defaults to 9100.
        payload_bytes (bytes, optional): Data to print. Defaults to None.
    
    Returns:
        dict: Print result with success flag and any error messages
    """
    if not payload_bytes:
        return {
            "success": False,
            "error": _("No data to print")
        }
    
    try:
        # Create a socket connection to the printer
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)  # 5 second timeout
        
        # Connect to the printer
        sock.connect((host, port))
        
        # Send the data
        sock.sendall(payload_bytes)
        
        # Close the connection
        sock.close()
        
        return {
            "success": True,
            "host": host,
            "port": port,
            "bytes_sent": len(payload_bytes)
        }
        
    except socket.timeout:
        return {
            "success": False,
            "error": _("Connection to printer timed out"),
            "host": host,
            "port": port
        }
        
    except socket.error as e:
        return {
            "success": False,
            "error": _("Socket error: {0}").format(str(e)),
            "host": host,
            "port": port
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "host": host,
            "port": port
        }

def print_via_bridge(url: str, token: str, payload_bytes: bytes, bt_config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Prints data to a Bluetooth printer via the IMOGI Print Bridge.
    
    Args:
        url (str): Print Bridge URL
        token (str): Authentication token
        payload_bytes (bytes): Data to print
        bt_config (dict): Bluetooth configuration
    
    Returns:
        dict: Print result with success flag and any error messages
    """
    if not payload_bytes:
        return {
            "success": False,
            "error": _("No data to print")
        }
    
    try:
        # Encode the binary data as base64 for JSON transmission
        payload_base64 = base64.b64encode(payload_bytes).decode('utf-8')
        
        # Prepare the request data
        request_data = {
            "action": "print",
            "interface": "bluetooth",
            "device_name": bt_config.get("device_name"),
            "vendor_profile": bt_config.get("vendor_profile", "ESC/POS"),
            "data": payload_base64,
            "retry_count": bt_config.get("retry_count", 2)
        }
        
        # Set up headers with authentication
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }
        
        # Send the request to the bridge
        response = requests.post(
            url,
            json=request_data,
            headers=headers,
            timeout=15  # 15 second timeout
        )
        
        # Parse the response
        if response.status_code == 200:
            try:
                result = response.json()
                return {
                    "success": result.get("success", False),
                    "bridge_response": result,
                    "bytes_sent": len(payload_bytes)
                }
            except json.JSONDecodeError:
                return {
                    "success": False,
                    "error": _("Invalid response from print bridge"),
                    "response_text": response.text
                }
        else:
            return {
                "success": False,
                "error": _("Print bridge returned error: {0}").format(response.status_code),
                "response_text": response.text
            }
            
    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "error": _("Error connecting to print bridge: {0}").format(str(e))
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def render_print_format_to_html(doctype: str, name: str, print_format: Optional[str] = None) -> str:
    """
    Renders a document to HTML using the specified print format.
    
    Args:
        doctype (str): DocType of the document
        name (str): Name of the document
        print_format (str, optional): Print Format to use. Defaults to None.
    
    Returns:
        str: HTML content
    """
    try:
        # Get the HTML content using frappe's print utility
        html_content = frappe.get_print(
            doctype,
            name,
            print_format=print_format
        )
        
        return html_content
        
    except Exception as e:
        frappe.log_error(f"Error rendering print format: {str(e)}", "IMOGI Print Error")
        raise

def render_html_to_bytes_for_thermal(html: str, paper_width_mm: int = 80) -> bytes:
    """
    Converts HTML content to ESC/POS byte commands suitable for thermal printers.
    
    Args:
        html (str): HTML content to convert
        paper_width_mm (int, optional): Paper width in mm. Defaults to 80.
    
    Returns:
        bytes: ESC/POS formatted binary data
    """
    try:
        # In a real implementation, this would use a library like python-escpos
        # to convert HTML to printer commands based on the specific printer profile.
        # For this stub, we'll simulate the conversion with a simplified approach.
        
        # Parse the HTML to extract plain text
        soup = BeautifulSoup(html, 'html.parser')
        
        # Calculate character width based on paper size
        # Standard thermal printer: 80mm ~ 48 chars, 58mm ~ 32 chars
        chars_per_line = 48 if paper_width_mm >= 80 else 32
        
        # Build a basic ESC/POS sequence
        # This is a simplified version - a real implementation would handle
        # styling, images, and proper ESC/POS command sequences
        
        # Initialize printer
        esc_init = b'\x1B\x40'  # ESC @ - Initialize printer
        
        # Center align for header
        esc_center = b'\x1B\x61\x01'  # ESC a 1 - Center alignment
        
        # Left align for content
        esc_left = b'\x1B\x61\x00'  # ESC a 0 - Left alignment
        
        # Bold on/off
        esc_bold_on = b'\x1B\x45\x01'  # ESC E 1 - Bold on
        esc_bold_off = b'\x1B\x45\x00'  # ESC E 0 - Bold off
        
        # Double height/width for header
        esc_dh_on = b'\x1B\x21\x10'  # ESC ! 16 - Double height
        esc_dh_off = b'\x1B\x21\x00'  # ESC ! 0 - Normal size
        
        # Cut paper
        esc_cut = b'\x1D\x56\x41\x10'  # GS V A 16 - Cut paper
        
        # Extract text and format
        title = soup.find('h1')
        title_text = title.get_text() if title else "Receipt"
        
        # Build the output
        output = bytearray()
        output.extend(esc_init)
        output.extend(esc_center)
        output.extend(esc_bold_on)
        output.extend(esc_dh_on)
        output.extend(title_text.encode('utf-8'))
        output.extend(b'\n\n')
        output.extend(esc_dh_off)
        output.extend(esc_bold_off)
        
        # Extract company/date info
        company = soup.find('h2')
        if company:
            output.extend(company.get_text().encode('utf-8'))
            output.extend(b'\n')
        
        # Date/time
        date_elem = soup.find('p', string=re.compile(r'\d{4}-\d{2}-\d{2}'))
        if date_elem:
            output.extend(date_elem.get_text().encode('utf-8'))
            output.extend(b'\n\n')
        
        # Switch to left alignment for content
        output.extend(esc_left)
        
        # Process table if exists (simplified)
        table = soup.find('table')
        if table:
            # Try to extract table headers
            headers = []
            for th in table.find_all('th'):
                headers.append(th.get_text().strip())
            
            if headers:
                # Print header row
                header_line = " | ".join(headers)
                output.extend(esc_bold_on)
                output.extend(header_line.encode('utf-8'))
                output.extend(b'\n')
                output.extend(esc_bold_off)
                
                # Print separator
                output.extend(('-' * chars_per_line).encode('utf-8'))
                output.extend(b'\n')
            
            # Process table rows
            for tr in table.find_all('tr')[1:]:  # Skip header row
                cells = []
                for td in tr.find_all('td'):
                    cells.append(td.get_text().strip())
                
                if cells:
                    row_text = " | ".join(cells)
                    output.extend(row_text.encode('utf-8'))
                    output.extend(b'\n')
        
        # Fallback to generic text extraction if no table
        if not table:
            # Get all paragraphs
            for p in soup.find_all('p'):
                p_text = p.get_text().strip()
                if p_text:
                    output.extend(p_text.encode('utf-8'))
                    output.extend(b'\n')
        
        # Add total if it exists
        total_elem = soup.find('strong', string=re.compile(r'Total|Amount', re.IGNORECASE))
        if total_elem and total_elem.parent:
            output.extend(b'\n')
            output.extend(esc_bold_on)
            output.extend(total_elem.parent.get_text().strip().encode('utf-8'))
            output.extend(esc_bold_off)
            output.extend(b'\n')
        
        # Add footer
        output.extend(b'\n')
        output.extend(esc_center)
        output.extend(b'Thank you for your business\n\n')
        
        # Cut the paper
        output.extend(esc_cut)
        
        return bytes(output)
        
    except Exception as e:
        frappe.log_error(f"Error converting HTML to ESC/POS: {str(e)}", "IMOGI Print Error")
        # Return a fallback simple text representation
        return f"ERROR: Could not format for printer.\nPlease check the print format.\n\nError: {str(e)}".encode('utf-8')