# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class KitchenStation(Document):
    def validate(self):
        self.validate_domain()
        self.validate_printer_settings()
        self.set_defaults_from_kitchen()
    
    def validate_domain(self):
        """Validate that kitchen features are only used in Restaurant domain"""
        # Check if any POS Profile has the Restaurant domain
        has_restaurant_domain = frappe.db.exists(
            "POS Profile", 
            {"imogi_pos_domain": "Restaurant"}
        )
        
        if not has_restaurant_domain:
            frappe.msgprint(
                _("No POS Profile with Restaurant domain found. Kitchen features are only available for Restaurant domain."),
                indicator="orange",
                alert=True
            )
    
    def validate_printer_settings(self):
        """Validate that required printer settings are provided based on interface"""
        if self.interface == "LAN" and not self.lan_host:
            frappe.throw(_("LAN Printer Host/IP is required for LAN interface"))
            
        if self.interface == "Bluetooth" and not self.bt_device_name:
            frappe.throw(_("Bluetooth Device Name is required for Bluetooth interface"))
    
    def set_defaults_from_kitchen(self):
        """Set defaults from the linked kitchen if not already set"""
        if not self.kitchen:
            return
            
        kitchen = frappe.get_doc("Kitchen", self.kitchen)
        
        # Set branch from kitchen if not set
        if not self.branch and kitchen.branch:
            self.branch = kitchen.branch
        
        # Set SLA defaults if not set
        if not self.target_queue_time and kitchen.default_target_queue_time:
            self.target_queue_time = kitchen.default_target_queue_time
            
        if not self.target_prep_time and kitchen.default_target_prep_time:
            self.target_prep_time = kitchen.default_target_prep_time
        
        # Set printer defaults if not set
        if not self.interface and kitchen.default_printer_interface:
            self.interface = kitchen.default_printer_interface
            
        if self.interface == "LAN":
            if not self.lan_host and kitchen.default_printer:
                self.lan_host = kitchen.default_printer
                
            if not self.lan_port and kitchen.default_printer_port:
                self.lan_port = kitchen.default_printer_port
                
        elif self.interface == "Bluetooth":
            if not self.bt_device_name and kitchen.default_bt_device_name:
                self.bt_device_name = kitchen.default_bt_device_name
                
            if not self.bt_mac and kitchen.default_bt_mac:
                self.bt_mac = kitchen.default_bt_mac
                
            if not self.bt_vendor_profile and kitchen.default_bt_vendor_profile:
                self.bt_vendor_profile = kitchen.default_bt_vendor_profile
    
    def after_insert(self):
        """Update kitchen's stations list after insert"""
        self.update_kitchen_stations()
    
    def on_update(self):
        """Update kitchen's stations list after update"""
        self.update_kitchen_stations()
    
    def on_trash(self):
        """Update kitchen's stations list after delete"""
        self.update_kitchen_stations(remove=True)
    
    def update_kitchen_stations(self, remove=False):
        """Update the parent kitchen's stations list"""
        if not self.kitchen:
            return
            
        try:
            kitchen = frappe.get_doc("Kitchen", self.kitchen)
            kitchen.update_station_links()
        except Exception as e:
            frappe.log_error(
                f"Error updating kitchen stations: {str(e)}",
                "Kitchen Station Update Error"
            )
    
    def get_print_settings(self):
        """Get the print settings for this station"""
        settings = {
            "interface": self.interface
        }
        
        # Add settings based on interface type
        if self.interface == "LAN":
            settings.update({
                "host": self.lan_host,
                "port": self.lan_port or 9100
            })
        elif self.interface == "Bluetooth":
            settings.update({
                "device_name": self.bt_device_name,
                "mac": self.bt_mac,
                "vendor_profile": self.bt_vendor_profile or "ESC/POS",
                "retry": self.bt_retry or 3
            })
            
            # Add bridge settings if provided
            if self.print_bridge_url:
                settings.update({
                    "bridge_url": self.print_bridge_url,
                    "bridge_token": self.print_bridge_token
                })
        
        return settings