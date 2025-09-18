# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class Kitchen(Document):
    def validate(self):
        self.validate_domain()
        
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

    def after_insert(self):
        """Update linked stations after insert"""
        self.update_station_links()
    
    def on_update(self):
        """Update linked stations after update"""
        self.update_station_links()
    
    def update_station_links(self):
        """Update the stations table with current linked stations"""
        # Clear current child table
        self.stations = []

        # Gather stations linked to this kitchen
        stations = frappe.get_all(
            "Kitchen Station",
            filters={"kitchen": self.name},
            fields=["name", "station_name"],
        )

        # Prepare explicit field/value sets for persistence
        fields = [
            "name",
            "parent",
            "parenttype",
            "parentfield",
            "idx",
            "kitchen_station",
            "station_name",
        ]
        values = []
        for idx, station in enumerate(stations, start=1):
            row_values = (
                frappe.generate_hash(10),
                self.name,
                "Kitchen",
                "stations",
                idx,
                station.name,
                station.station_name,
            )

            # Keep in-memory representation for this document
            self.append("stations", {
                "kitchen_station": station.name,
                "station_name": station.station_name,
            })
            values.append(row_values)

        # Persist without modifying parent timestamps
        frappe.db.delete("Kitchen Station Link", {"parent": self.name})
        if values:
            frappe.db.bulk_insert("Kitchen Station Link", fields, values)
    
    def get_print_settings(self):
        """Get the default print settings for this kitchen"""
        settings = {
            "interface": self.default_printer_interface
        }
        
        # Add settings based on interface type
        if self.default_printer_interface == "LAN":
            settings.update({
                "printer": self.default_printer,
                "port": self.default_printer_port
            })
        elif self.default_printer_interface == "Bluetooth":
            settings.update({
                "device_name": self.default_bt_device_name,
                "mac": self.default_bt_mac,
                "vendor_profile": self.default_bt_vendor_profile
            })
        
        return settings
