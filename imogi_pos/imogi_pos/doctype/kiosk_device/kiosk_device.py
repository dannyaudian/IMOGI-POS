# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import uuid
import time

class KioskDevice(Document):
    """
    Kiosk Device for IMOGI POS.
    
    Represents a physical kiosk device that can be paired with a profile.
    """
    
    def before_save(self):
        """Generate pairing code if needed"""
        if not self.pairing_code or self.generate_new_pairing_code:
            self.pairing_code = self.generate_pairing_code()
            self.pairing_expiry = frappe.utils.now_datetime() + frappe.utils.datetime.timedelta(hours=24)
            self.generate_new_pairing_code = 0
            
    def generate_pairing_code(self):
        """Generate a unique 6-digit pairing code"""
        # Create a unique code based on time and random values
        unique_id = str(int(time.time() * 1000))[-6:].zfill(6)
        return unique_id
    
    def verify_pairing_code(self, code):
        """Verify if the provided pairing code matches and is valid"""
        if not self.pairing_code:
            return False
            
        if self.pairing_code != code:
            return False
            
        if frappe.utils.now_datetime() > self.pairing_expiry:
            return False
            
        return True
        
    def register_connection(self, user_agent, ip_address):
        """Register a new connection from a kiosk device"""
        self.last_connected = frappe.utils.now_datetime()
        self.last_ip_address = ip_address
        self.last_user_agent = user_agent
        self.connection_count = (self.connection_count or 0) + 1
        self.save(ignore_permissions=True)