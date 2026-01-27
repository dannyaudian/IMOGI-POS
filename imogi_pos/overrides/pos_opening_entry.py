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
    
    def get_redirect_url(self):
        """
        Menentukan redirect URL berdasarkan POS Profile mode
        Tidak di-expose sebagai API - redirect handled by frontend
        """
        if not self.pos_profile:
            return "/counter/pos"
        
        pos_profile = frappe.get_cached_doc("POS Profile", self.pos_profile)
        mode = pos_profile.get("imogi_mode", "Counter")
        
        # Redirect berdasarkan operation mode
        if mode == "Table":
            return "/restaurant/waiter"
        elif mode == "Counter":
            return "/counter/pos"
        elif mode == "Kiosk":
            return "/restaurant/waiter?mode=kiosk"
        elif mode == "Self-Order":
            return "/restaurant/self-order"
        else:
            # Default ke counter POS
            return "/counter/pos"


def get_custom_redirect_url(doc, method=None):
    """
    Hook untuk override redirect setelah submit POS Opening Entry.
    Ini akan dipanggil dari doc_events hook.
    """
    if doc.docstatus == 1:  # Submitted
        pos_profile = frappe.get_cached_doc("POS Profile", doc.pos_profile) if doc.pos_profile else None
        
        if pos_profile:
            mode = pos_profile.get("imogi_mode", "Counter")
            
            # Redirect berdasarkan operation mode
            if mode == "Table":
                redirect_url = "/restaurant/waiter"
                message = "POS Opening Entry created. Redirecting to Restaurant POS..."
            elif mode == "Counter":
                redirect_url = "/counter/pos"
                message = "POS Opening Entry created. Redirecting to Counter POS..."
            elif mode == "Kiosk":
                redirect_url = "/restaurant/waiter?mode=kiosk"
                message = "POS Opening Entry created. Redirecting to Kiosk Mode..."
            elif mode == "Self-Order":
                redirect_url = "/restaurant/self-order"
                message = "POS Opening Entry created. Redirecting to Self-Order..."
            else:
                redirect_url = "/counter/pos"
                message = "POS Opening Entry created. Redirecting to POS..."
            
            # Store redirect info in cache untuk diambil oleh frontend
            cache_key = f"pos_opening_redirect_{doc.name}"
            frappe.cache().set_value(cache_key, redirect_url, expires_in_sec=30)
            
            frappe.msgprint(
                msg=message,
                title="Success",
                indicator="green"
            )
