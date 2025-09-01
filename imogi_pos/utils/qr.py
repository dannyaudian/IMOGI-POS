import hashlib
import hmac
import json
import uuid
from typing import Dict, Optional, Tuple, Union

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime


def build_order_qr_payload(
    table: Optional[str] = None, 
    branch: Optional[str] = None,
    pos_profile: Optional[str] = None, 
    ttl_minutes: int = 120
) -> Dict[str, Union[str, int]]:
    """
    Build a secure payload for Order QR codes.
    
    Args:
        table: Optional table reference for dine-in mode
        branch: The branch for this order
        pos_profile: The POS profile to use for this order
        ttl_minutes: Token validity period in minutes
        
    Returns:
        Dict containing token, signature, and other order parameters
    """
    if not branch:
        branch = frappe.db.get_single_value("Restaurant Settings", "default_branch")
        if not branch:
            frappe.throw(_("Branch is required to generate Order QR"))

    if not pos_profile:
        pos_profile = frappe.db.get_single_value("Restaurant Settings", "default_self_order_pos_profile")
        if not pos_profile:
            frappe.throw(_("POS Profile is required to generate Order QR"))
    
    # Generate unique token/slug
    token = str(uuid.uuid4())[:8]
    
    # Calculate expiry timestamp
    expires_on = now_datetime().timestamp() + (ttl_minutes * 60)
    
    # Create payload
    payload = {
        "token": token,
        "branch": branch,
        "pos_profile": pos_profile,
        "expires_on": int(expires_on)
    }
    
    # Add table if provided
    if table:
        payload["table"] = table
    
    # Generate signature
    signature = _generate_signature(payload)
    payload["signature"] = signature
    
    return payload


def verify_order_qr_token(token_data: Union[str, Dict]) -> Tuple[bool, Dict]:
    """
    Verify the validity and authenticity of an Order QR token.
    
    Args:
        token_data: Either a JSON string or dict containing the token data
        
    Returns:
        Tuple of (is_valid, payload_dict)
    """
    if isinstance(token_data, str):
        try:
            payload = json.loads(token_data)
        except json.JSONDecodeError:
            return False, {"error": "Invalid token format"}
    else:
        payload = token_data
    
    # Check required fields
    required_fields = ["token", "branch", "pos_profile", "expires_on", "signature"]
    if not all(field in payload for field in required_fields):
        return False, {"error": "Missing required fields in token"}
    
    # Check expiry
    current_time = now_datetime().timestamp()
    if current_time > payload["expires_on"]:
        return False, {"error": "Token has expired", "payload": payload}
    
    # Verify signature
    original_signature = payload.pop("signature")
    calculated_signature = _generate_signature(payload)
    payload["signature"] = original_signature  # Restore signature for return
    
    if not hmac.compare_digest(original_signature, calculated_signature):
        return False, {"error": "Invalid token signature", "payload": payload}
    
    return True, payload


def _generate_signature(payload: Dict) -> str:
    """
    Generate a secure signature for the payload using the site's encryption key.
    
    Args:
        payload: The data to sign
        
    Returns:
        Signature string
    """
    # Get a copy of payload without any existing signature
    payload_copy = payload.copy()
    payload_copy.pop("signature", None)
    
    # Sort keys for consistent ordering
    sorted_payload = json.dumps(payload_copy, sort_keys=True)
    
    # Use site's encryption key or fallback to a secret
    secret = frappe.get_site_config().get("encryption_key", frappe.flags.session_obj.sid)
    
    # Create HMAC signature
    signature = hmac.new(
        secret.encode('utf-8'),
        sorted_payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return signature


def get_qr_expiry_datetime(expires_on_timestamp: int) -> str:
    """
    Convert expiry timestamp to a readable datetime string.
    
    Args:
        expires_on_timestamp: Expiry timestamp in seconds
        
    Returns:
        Formatted datetime string
    """
    from datetime import datetime
    expiry_dt = datetime.fromtimestamp(expires_on_timestamp)
    return get_datetime(expiry_dt).strftime("%Y-%m-%d %H:%M:%S")


def refresh_table_qr_token(table_name: str) -> Dict:
    """
    Refresh the QR token for a specific table.
    
    Args:
        table_name: Name of the Restaurant Table
        
    Returns:
        New QR payload
    """
    table_doc = frappe.get_doc("Restaurant Table", table_name)
    
    # Get POS Profile from the table's floor or default
    pos_profile = None
    if table_doc.floor:
        floor_doc = frappe.get_doc("Restaurant Floor", table_doc.floor)
        pos_profile = floor_doc.get("default_pos_profile")
    
    if not pos_profile:
        pos_profile = frappe.db.get_single_value("Restaurant Settings", "default_self_order_pos_profile")
    
    # Get TTL from settings
    ttl_minutes = frappe.db.get_single_value("Restaurant Settings", "self_order_token_ttl") or 120
    
    # Generate new QR payload
    payload = build_order_qr_payload(
        table=table_name,
        branch=table_doc.branch,
        pos_profile=pos_profile,
        ttl_minutes=ttl_minutes
    )
    
    # Update the table document with new token
    table_doc.qr_slug = payload["token"]
    table_doc.save()
    
    return payload