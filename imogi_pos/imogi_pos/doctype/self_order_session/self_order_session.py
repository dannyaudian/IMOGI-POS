# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import uuid
import secrets
import string
from datetime import datetime, timedelta

class SelfOrderSession(Document):
    """
    Self Order Session for IMOGI POS.
    
    Represents an active self-order session initiated via QR scan.
    Sessions have expiry times and can be associated with tables and POS Orders.
    """
    
    def autoname(self):
        """Set document name to token value"""
        if not self.token:
            self.token = self.generate_token()
        self.name = self.token
    
    def before_save(self):
        """Generate token and slug if not provided"""
        if not self.token:
            self.token = self.generate_token()
        
        if not self.slug:
            self.slug = self.generate_slug()
            
        if not self.expires_on:
            self.set_default_expiry()
            
        # Track the source IP and user agent when creating/updating
        if not self.last_ip:
            self.last_ip = frappe.local.request_ip
            
        if not self.user_agent and frappe.request:
            self.user_agent = frappe.request.headers.get('User-Agent', '')
    
    def validate(self):
        """Validate session data"""
        self.validate_branch()
        self.validate_pos_profile()
        self.validate_expiry()
    
    def validate_branch(self):
        """Ensure branch is specified"""
        if not self.branch:
            # Try to get branch from pos_profile
            if self.pos_profile:
                pos_profile = frappe.get_doc("POS Profile", self.pos_profile)
                if hasattr(pos_profile, 'imogi_branch') and pos_profile.imogi_branch:
                    self.branch = pos_profile.imogi_branch
                    return
            
            frappe.throw("Branch is required for Self Order Session")
    
    def validate_pos_profile(self):
        """Ensure POS Profile is specified and self-order is enabled"""
        if not self.pos_profile:
            frappe.throw("POS Profile is required for Self Order Session")
            
        pos_profile = frappe.get_doc("POS Profile", self.pos_profile)
        if not hasattr(pos_profile, 'imogi_enable_self_order') or not pos_profile.imogi_enable_self_order:
            frappe.throw(f"Self Order is not enabled for POS Profile {self.pos_profile}")
    
    def validate_expiry(self):
        """Ensure expiry date is in the future"""
        if not self.expires_on:
            self.set_default_expiry()
        elif frappe.utils.now_datetime() > frappe.utils.get_datetime(self.expires_on):
            frappe.throw("Expiry date must be in the future")
    
    def set_default_expiry(self):
        """Set default expiry time based on POS Profile settings or fallback to 60 minutes"""
        ttl_minutes = 60  # default 60 minutes
        
        if self.pos_profile:
            pos_profile = frappe.get_cached_doc("POS Profile", self.pos_profile)
            if hasattr(pos_profile, 'imogi_self_order_token_ttl') and pos_profile.imogi_self_order_token_ttl:
                ttl_minutes = pos_profile.imogi_self_order_token_ttl
        
        self.expires_on = frappe.utils.now_datetime() + timedelta(minutes=ttl_minutes)
    
    def generate_token(self):
        """Generate a random secure token"""
        return str(uuid.uuid4())
    
    def generate_slug(self):
        """Generate a short, readable slug for user-friendly URLs"""
        characters = string.ascii_letters + string.digits
        slug = ''.join(secrets.choice(characters) for _ in range(8))
        
        # Ensure uniqueness
        while frappe.db.exists("Self Order Session", {"slug": slug}):
            slug = ''.join(secrets.choice(characters) for _ in range(8))
            
        return slug
    
    def is_valid(self):
        """Check if the session is valid (not expired)"""
        if not self.expires_on:
            return False
            
        expiry = frappe.utils.get_datetime(self.expires_on)
        return frappe.utils.now_datetime() <= expiry
    
    def is_associated_with_order(self):
        """Check if the session is associated with a POS Order"""
        return bool(self.order_linkage)
    
    def extend_expiry(self, minutes=30):
        """Extend the session expiry time"""
        if not self.expires_on:
            self.set_default_expiry()
        else:
            expiry = frappe.utils.get_datetime(self.expires_on)
            self.expires_on = expiry + timedelta(minutes=minutes)
        
        self.save()
        
    def link_to_order(self, pos_order):
        """Link this session to a POS Order"""
        self.order_linkage = pos_order
        self.save()
        
    @frappe.whitelist()
    def end_session(self):
        """End the session by setting expiry to now"""
        self.expires_on = frappe.utils.now_datetime()
        self.save()


def get_permission_query_conditions(user):
    """
    Return additional conditions for permission query based on user
    """
    if not user:
        user = frappe.session.user
        
    if user == "Administrator" or user == "Guest":
        return ""
        
    # For non-admin, non-guest users, only show sessions in their branches
    # based on user permissions
    if frappe.permissions.has_permission("Branch"):
        return """(`tabSelf Order Session`.branch in 
            (select distinct bp.`branch` from `tabBranch Permission` bp 
            where bp.`user`=%s))""" % frappe.db.escape(user)
    
    return ""