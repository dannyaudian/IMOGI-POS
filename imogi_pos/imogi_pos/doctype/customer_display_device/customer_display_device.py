# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _
import uuid
import json
from datetime import datetime, timedelta


class CustomerDisplayDevice(Document):
    def validate(self):
        self.validate_profile()
    
    def validate_profile(self):
        """Validate that display profile belongs to the same branch"""
        if self.display_profile and self.branch:
            profile_branch = frappe.db.get_value("Customer Display Profile", self.display_profile, "branch")
            if profile_branch and profile_branch != self.branch:
                frappe.throw(_("Display profile must belong to the same branch as the device"))
    
    def before_save(self):
        """Generate pairing token if missing"""
        if not self.pairing_token:
            self.generate_new_token()
    
    def generate_new_token(self):
        """Generate a new pairing token"""
        token = str(uuid.uuid4()).replace("-", "")[:12].upper()
        self.pairing_token = token
        return token
    
    def link_to_order(self, pos_order):
        """Link the display to a POS Order"""
        if not pos_order:
            return
            
        # Update the linked order
        self.linked_pos_order = pos_order
        self.save()
        
        # Publish realtime update
        self.publish_update({
            "action": "linked_to_order",
            "order": pos_order
        })
        
        return {"success": True, "order": pos_order}
    
    def unlink_order(self):
        """Unlink any POS Order"""
        old_order = self.linked_pos_order
        self.linked_pos_order = None
        self.save()
        
        # Publish realtime update
        self.publish_update({
            "action": "unlinked_from_order",
            "previous_order": old_order
        })
        
        return {"success": True, "previous_order": old_order}
    
    def update_connection_info(self, device_id, ip, user_agent):
        """Update connection information"""
        self.device_id = device_id
        self.last_ip = ip
        self.last_connected = datetime.now()
        self.user_agent = user_agent
        self.save(ignore_permissions=True)
        
        return {
            "success": True,
            "device_id": device_id,
            "last_connected": self.last_connected
        }
    
    def get_display_config(self):
        """Get full display configuration"""
        if not self.display_profile:
            return {"error": "No display profile configured"}
            
        profile = frappe.get_doc("Customer Display Profile", self.display_profile)
        
        config = {
            "device": {
                "name": self.device_name,
                "id": self.device_id,
                "branch": self.branch
            },
            "layout": profile.get_block_layout(),
            "linked": {
                "pos_profile": self.linked_pos_profile,
                "pos_order": self.linked_pos_order
            }
        }
        
        # Add branding if available
        branding = profile.get_branding()
        if branding:
            config["branding"] = branding
        
        return config
    
    def publish_update(self, data):
        """Publish realtime update to this device"""
        if not self.device_id:
            return
            
        # Add branch for filtering
        if not "branch" in data and self.branch:
            data["branch"] = self.branch
            
        # Publish to device channel
        frappe.publish_realtime(
            f"customer_display:device:{self.device_id}",
            data
        )
        
        # If linked to an order, also publish to order channel
        if self.linked_pos_order:
            frappe.publish_realtime(
                f"customer_display:order:{self.linked_pos_order}",
                data
            )
    
    def post_message(self, message_type, content, timeout=None):
        """Post a message to the display"""
        data = {
            "action": "message",
            "type": message_type,
            "content": content
        }
        
        # Add timeout if provided
        if timeout:
            data["timeout"] = timeout
            
        self.publish_update(data)
        return {"success": True}
    
    def post_payment_qr(self, qr_data, amount, expiry=None):
        """Post a payment QR to the display"""
        data = {
            "action": "payment_qr",
            "qr_data": qr_data,
            "amount": amount
        }
        
        # Add expiry if provided
        if expiry:
            data["expiry"] = expiry
            
        self.publish_update(data)
        return {"success": True}
    
    def clear_display(self):
        """Clear any active overlays or messages"""
        self.publish_update({
            "action": "clear"
        })
        return {"success": True}

@frappe.whitelist()
def generate_token(name):
    """Generate a new pairing token for a device"""
    device = frappe.get_doc("Customer Display Device", name)
    token = device.generate_new_token()
    device.save()
    return token