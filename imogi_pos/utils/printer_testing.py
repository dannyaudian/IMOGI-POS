# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

"""
Printer Connection Testing and Validation Module

Provides utilities for testing printer connectivity and managing fallback options.
"""

import socket
import subprocess
import frappe
from frappe import _


def test_printer_connection(adapter_settings: dict) -> tuple:
    """
    Test if printer is reachable based on configured interface.
    
    Args:
        adapter_settings (dict): Printer configuration with interface and adapter_config
    
    Returns:
        tuple: (is_reachable: bool, message: str)
    """
    interface = adapter_settings.get("interface", "OS")
    config = adapter_settings.get("adapter_config", {})
    
    try:
        if interface == "LAN":
            host = config.get("host")
            port = config.get("port", 9100)
            
            if not host:
                return False, "LAN host/IP not configured"
            
            try:
                sock = socket.create_connection((host, port), timeout=2)
                sock.close()
                return True, f"LAN printer {host}:{port} is reachable"
            except socket.timeout:
                return False, f"LAN printer {host}:{port} timeout - connection took too long"
            except ConnectionRefusedError:
                return False, f"LAN printer {host}:{port} connection refused - printer may be offline"
            except socket.gaierror:
                return False, f"LAN printer {host} - hostname resolution failed"
            except Exception as e:
                return False, f"Cannot reach LAN printer: {str(e)}"
        
        elif interface == "USB":
            device_path = config.get("device_path")
            if not device_path:
                return False, "USB device path not configured"
            
            import os
            if os.path.exists(device_path):
                return True, f"USB printer {device_path} device exists"
            else:
                return False, f"USB printer {device_path} not found - check connection"
        
        elif interface == "Bluetooth":
            device_name = config.get("device_name")
            if not device_name:
                return False, "Bluetooth device name not configured"
            
            # Try to list Bluetooth devices
            try:
                result = subprocess.run(
                    ["system_profiler", "SPBluetoothDataType"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if device_name in result.stdout:
                    return True, f"Bluetooth printer {device_name} is paired and available"
                else:
                    return False, f"Bluetooth printer {device_name} not found in paired devices"
            except Exception:
                # Fallback: assume available if we can't detect
                return True, f"Bluetooth printer {device_name} - assuming available (detection not supported)"
        
        elif interface == "OS":
            # OS printer always assumed available
            return True, "Using system default printer"
        
        else:
            return False, f"Unknown printer interface: {interface}"
    
    except Exception as e:
        return False, f"Error testing printer: {str(e)}"


def get_available_printer_interface(pos_profile: str, job_type: str = "receipt"):
    """
    Get first available printer interface with fallback logic.
    
    Tries in order: LAN → USB → Bluetooth → OS (ultimate fallback)
    
    Args:
        pos_profile (str): POS Profile name
        job_type (str): Type of print job (receipt, kot, etc)
    
    Returns:
        dict: Printer configuration for available interface
    """
    from imogi_pos.api.printing import get_print_adapter_settings
    
    fallback_order = ["LAN", "USB", "Bluetooth", "OS"]
    
    for interface in fallback_order:
        try:
            settings = get_print_adapter_settings(
                interface,
                pos_profile=pos_profile
            )
            
            is_reachable, message = test_printer_connection(settings)
            
            if is_reachable:
                frappe.logger().info(
                    f"Printer available ({interface}): {message}"
                )
                return settings
            else:
                frappe.logger().warning(
                    f"Printer {interface} unavailable: {message}"
                )
        
        except Exception as e:
            frappe.logger().error(
                f"Error checking {interface} printer: {str(e)}"
            )
            continue
    
    # Ultimate fallback: OS printer
    frappe.logger().warning(
        "All configured printers unavailable, using OS default"
    )
    from imogi_pos.api.printing import get_print_adapter_settings
    return get_print_adapter_settings("OS", pos_profile=pos_profile)


@frappe.whitelist()
def test_printer_connection_api(pos_profile: str, job_type: str = "receipt"):
    """
    API endpoint to test printer connection for given POS Profile.
    
    Args:
        pos_profile (str): POS Profile name
        job_type (str): Type of print job (receipt, kot, etc)
    
    Returns:
        dict: Test result with is_reachable, message, and config
    """
    # Validate branch access
    branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
    if branch:
        validate_branch_access(branch)
    
    from imogi_pos.api.printing import get_print_adapter_settings
    
    adapter_type = "kitchen" if job_type == "kot" else "cashier"
    config = get_print_adapter_settings(adapter_type, pos_profile=pos_profile)
    
    is_reachable, message = test_printer_connection(config)
    
    return {
        "is_reachable": is_reachable,
        "message": message,
        "interface": config.get("interface"),
        "config": config
    }


@frappe.whitelist()
def send_to_printer_with_fallback(content: str, pos_profile: str, job_type: str = "receipt"):
    """
    Send content to printer with automatic fallback to next available interface.
    
    Args:
        content (str): Print content (HTML or formatted text)
        pos_profile (str): POS Profile name
        job_type (str): Type of print job
    
    Returns:
        dict: Send result with success, message, and interface_used
    """
    try:
        # Get printer with fallback
        settings = get_available_printer_interface(pos_profile, job_type)
        
        # Send to printer (placeholder - actual implementation depends on adapter)
        from imogi_pos.api.printing import send_to_printer
        result = send_to_printer(settings, content)
        
        return {
            "success": True,
            "message": f"Sent to {settings['interface']} printer",
            "interface_used": settings["interface"]
        }
    
    except Exception as e:
        frappe.logger().error(f"Print with fallback failed: {str(e)}")
        return {
            "success": False,
            "message": f"Print failed: {str(e)}",
            "interface_used": None
        }
