# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class KitchenStation(Document):
    def validate(self):
        self.validate_domain()
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
        
        # Inherit printer profile from kitchen if not set
        if not self.printer_profile and kitchen.default_printer_profile:
            self.printer_profile = kitchen.default_printer_profile
    
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
                title="Kitchen Station Update Error",
                message=f"Error updating kitchen stations: {e}",
            )
    
    def get_print_settings(self):
        """Get the print settings for this station from Printer Profile"""
        # Get printer profile for this station or fallback to kitchen default
        printer_profile = self.printer_profile
        
        if not printer_profile and self.kitchen:
            kitchen = frappe.get_doc("Kitchen", self.kitchen)
            printer_profile = kitchen.default_printer_profile
        
        if not printer_profile:
            # Return OS default if no profile configured
            return {
                "interface": "OS",
                "thermal_width": 32,
                "paper_width_mm": 58,
                "dpi": 203
            }
        
        # Fetch and return printer configuration from Printer Profile
        try:
            printer_doc = frappe.get_doc("Printer Profile", printer_profile)
            return printer_doc.get_printer_config()
        except Exception as e:
            frappe.log_error(
                title="Printer Profile Error",
                message=f"Error getting printer config for {printer_profile}: {str(e)}"
            )
            return {
                "interface": "OS",
                "thermal_width": 32,
                "paper_width_mm": 58,
                "dpi": 203
            }
            })
            
            # Add bridge settings if provided
            if self.print_bridge_url:
                settings.update({
                    "bridge_url": self.print_bridge_url,
                    "bridge_token": self.print_bridge_token
                })
        
        return settings