# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _
import json


class CustomerDisplayProfile(Document):
    def validate(self):
        self.validate_blocks()
    
    def validate_blocks(self):
        """Validate that blocks have required properties based on type"""
        block_types = {
            "summary": ["title", "show_items", "show_total"],
            "payment": ["title", "qr_size", "show_instructions"],
            "ticker": ["content", "speed", "loop"],
            "ad": ["content", "duration", "transition"]
        }
        
        for block in self.blocks:
            if block.block_type not in block_types:
                frappe.throw(_("Invalid block type: {0}").format(block.block_type))
            
            # Check if properties exist as JSON
            if block.properties:
                try:
                    props = json.loads(block.properties)
                except Exception:
                    frappe.throw(_("Invalid JSON in properties for block {0}").format(block.idx))
                
                # Check required properties based on type
                required_props = block_types[block.block_type]
                missing_props = [prop for prop in required_props if prop not in props]
                
                if missing_props:
                    frappe.msgprint(
                        _("Block {0} is missing required properties: {1}").format(
                            block.idx, ", ".join(missing_props)
                        ),
                        indicator="orange",
                        alert=True
                    )
    
    def get_block_layout(self):
        """Get the block layout configuration for the frontend"""
        layout = {
            "type": self.layout_type,
            "grid": {
                "columns": self.grid_columns,
                "rows": self.grid_rows
            },
            "blocks": []
        }
        
        for block in self.blocks:
            block_data = {
                "id": block.name,
                "type": block.block_type,
                "order": block.display_order,
                "span": block.grid_span or 1,
                "height": block.grid_height or 1
            }
            
            # Add properties if available
            if block.properties:
                try:
                    block_data["properties"] = json.loads(block.properties)
                except Exception:
                    block_data["properties"] = {}
            
            layout["blocks"].append(block_data)
        
        return layout
    
    def get_branding(self):
        """Get branding configuration"""
        if not self.override_brand:
            return None
            
        branding = {
            "logo": self.brand_logo,
            "logoDark": self.brand_logo_dark,
            "name": self.brand_name,
            "colors": {
                "primary": self.brand_color_primary,
                "accent": self.brand_color_accent,
                "headerBg": self.brand_header_bg
            }
        }
        
        return branding