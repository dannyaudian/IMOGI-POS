# -*- coding: utf-8 -*-
# Copyright (c) 2024, IMOGI and contributors
# For license information, please see license.txt

"""
Override POS Opening Entry to redirect to IMOGI POS instead of native ERPNext POS
"""

from __future__ import unicode_literals
import frappe
from erpnext.accounts.doctype.pos_opening_entry.pos_opening_entry import POSOpeningEntry


class CustomPOSOpeningEntry(POSOpeningEntry):
    """
    Custom POS Opening Entry yang redirect ke IMOGI POS
    """
    
    def on_submit(self):
        """Override on_submit to prevent default POS redirect"""
        super().on_submit()
        
        # Clear any redirect messages that would send to native POS
        # We'll let the frontend handle where to go
        pass
    
    @frappe.whitelist()
    def get_redirect_url(self):
        """
        Menentukan redirect URL berdasarkan POS Profile domain
        """
        if not self.pos_profile:
            return "/app/imogi-pos"
        
        pos_profile = frappe.get_cached_doc("POS Profile", self.pos_profile)
        domain = pos_profile.get("imogi_pos_domain")
        
        # Redirect berdasarkan domain
        if domain == "Restaurant":
            return "/restaurant/waiter"
        elif domain == "Counter":
            return "/counter/pos"
        else:
            # Default ke custom POS
            return "/counter/pos"


def get_custom_redirect_url(doc, method=None):
    """
    Hook untuk override redirect setelah submit POS Opening Entry.
    Ini akan dipanggil dari doc_events hook.
    """
    if doc.docstatus == 1:  # Submitted
        pos_profile = frappe.get_cached_doc("POS Profile", doc.pos_profile) if doc.pos_profile else None
        
        if pos_profile and pos_profile.get("imogi_pos_domain"):
            domain = pos_profile.get("imogi_pos_domain")
            
            # Set custom redirect message
            if domain == "Restaurant":
                redirect_url = "/restaurant/waiter"
                message = "POS Session opened. Redirecting to Restaurant POS..."
            elif domain == "Counter":
                redirect_url = "/counter/pos"
                message = "POS Session opened. Redirecting to Counter POS..."
            else:
                redirect_url = "/counter/pos"
                message = "POS Session opened. Redirecting to POS..."
            
            # Store redirect info in cache untuk diambil oleh frontend
            frappe.cache().hset(
                f"pos_opening_redirect_{doc.name}", 
                "redirect_url", 
                redirect_url,
                expires_in_sec=30
            )
            
            frappe.msgprint(
                msg=message,
                title="Success",
                indicator="green"
            )
