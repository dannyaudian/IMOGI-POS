"""
Security utilities for IMOGI POS.

Provides additional security measures beyond Frappe's built-in protections:
- Rate limiting for sensitive endpoints
- IP-based access control
- Suspicious activity detection
- Security headers
"""

import frappe
from frappe import _
from functools import wraps
from datetime import datetime, timedelta
import hashlib


# Rate limiting cache key prefix
RATE_LIMIT_PREFIX = "imogi_rate_limit:"

# Failed login tracking
FAILED_LOGIN_PREFIX = "imogi_failed_login:"


def rate_limit(max_requests=10, window_seconds=60, key_func=None):
    """
    Rate limiting decorator for API endpoints.
    
    Limits the number of requests from the same source within a time window.
    
    Args:
        max_requests: Maximum number of requests allowed in the window
        window_seconds: Time window in seconds
        key_func: Optional function to generate rate limit key (default: IP + user)
    
    Example:
        @rate_limit(max_requests=5, window_seconds=60)
        def sensitive_api():
            pass
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate rate limit key
            if key_func:
                key = key_func()
            else:
                ip = frappe.local.request_ip or "unknown"
                user = frappe.session.user or "Guest"
                key = f"{ip}:{user}:{func.__name__}"
            
            cache_key = f"{RATE_LIMIT_PREFIX}{key}"
            
            # Get current count
            current = frappe.cache().get(cache_key) or 0
            
            if current >= max_requests:
                # Log rate limit hit
                frappe.log_error(
                    f"Rate limit exceeded: {key}",
                    "IMOGI Security: Rate Limit"
                )
                frappe.throw(
                    _("Too many requests. Please try again later."),
                    frappe.RateLimitExceededError
                )
            
            # Increment counter
            frappe.cache().set(cache_key, current + 1, expires_in_sec=window_seconds)
            
            return func(*args, **kwargs)
        return wrapper
    return decorator


def log_security_event(event_type, details=None, severity="INFO"):
    """
    Log security-related events for monitoring.
    
    Args:
        event_type: Type of event (LOGIN_FAILED, UNAUTHORIZED_ACCESS, etc.)
        details: Additional details dict
        severity: INFO, WARNING, ERROR, CRITICAL
    """
    ip = frappe.local.request_ip or "unknown"
    user = frappe.session.user or "Guest"
    path = frappe.request.path if frappe.request else "unknown"
    
    log_data = {
        "event_type": event_type,
        "user": user,
        "ip": ip,
        "path": path,
        "timestamp": datetime.now().isoformat(),
        "severity": severity,
        "details": details or {}
    }
    
    # Log to error log for now (can be enhanced to separate security log)
    if severity in ("ERROR", "CRITICAL"):
        frappe.log_error(str(log_data), f"IMOGI Security: {event_type}")
    else:
        frappe.logger().info(f"Security Event: {log_data}")


def track_failed_login(user_identifier):
    """
    Track failed login attempts for brute force protection.
    
    Args:
        user_identifier: Email or username that was attempted
    
    Returns:
        int: Number of failed attempts
    """
    ip = frappe.local.request_ip or "unknown"
    key = f"{FAILED_LOGIN_PREFIX}{ip}:{user_identifier}"
    
    current = frappe.cache().get(key) or 0
    new_count = current + 1
    
    # Keep track for 30 minutes
    frappe.cache().set(key, new_count, expires_in_sec=1800)
    
    # Log if suspicious
    if new_count >= 3:
        log_security_event(
            "BRUTE_FORCE_ATTEMPT",
            {"user_identifier": user_identifier, "attempts": new_count},
            "WARNING" if new_count < 10 else "ERROR"
        )
    
    return new_count


def check_account_lockout(user_identifier):
    """
    Check if account should be locked due to too many failed attempts.
    
    Args:
        user_identifier: Email or username
    
    Returns:
        bool: True if account is locked
    """
    ip = frappe.local.request_ip or "unknown"
    key = f"{FAILED_LOGIN_PREFIX}{ip}:{user_identifier}"
    
    failed_attempts = frappe.cache().get(key) or 0
    
    # Lock after 10 failed attempts
    return failed_attempts >= 10


def clear_failed_login(user_identifier):
    """
    Clear failed login attempts after successful login.
    
    Args:
        user_identifier: Email or username
    """
    ip = frappe.local.request_ip or "unknown"
    key = f"{FAILED_LOGIN_PREFIX}{ip}:{user_identifier}"
    frappe.cache().delete(key)


def validate_origin(allowed_origins=None):
    """
    Decorator to validate request origin for CORS protection.
    
    Args:
        allowed_origins: List of allowed origins. If None, only same-origin allowed.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            origin = frappe.request.headers.get("Origin", "")
            
            if allowed_origins:
                if origin and origin not in allowed_origins:
                    log_security_event(
                        "INVALID_ORIGIN",
                        {"origin": origin, "allowed": allowed_origins},
                        "WARNING"
                    )
                    frappe.throw(_("Invalid request origin"), frappe.PermissionError)
            
            return func(*args, **kwargs)
        return wrapper
    return decorator


def require_https():
    """
    Decorator to ensure request is over HTTPS.
    
    For production use only - allows HTTP in development.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Skip in development
            if frappe.conf.get("developer_mode"):
                return func(*args, **kwargs)
            
            # Check if request is HTTPS
            is_https = (
                frappe.request.is_secure or
                frappe.request.headers.get("X-Forwarded-Proto") == "https"
            )
            
            if not is_https:
                log_security_event(
                    "HTTP_ACCESS_ATTEMPT",
                    {"path": frappe.request.path},
                    "WARNING"
                )
                frappe.throw(_("Secure connection required"), frappe.PermissionError)
            
            return func(*args, **kwargs)
        return wrapper
    return decorator


def sanitize_input(value, max_length=None, allowed_chars=None):
    """
    Sanitize user input to prevent injection attacks.
    
    Args:
        value: Input value to sanitize
        max_length: Maximum allowed length
        allowed_chars: Regex pattern of allowed characters
    
    Returns:
        Sanitized value
    """
    if value is None:
        return None
    
    # Convert to string
    value = str(value)
    
    # Truncate if needed
    if max_length and len(value) > max_length:
        value = value[:max_length]
    
    # Remove null bytes
    value = value.replace("\x00", "")
    
    # Filter allowed characters if specified
    if allowed_chars:
        import re
        value = re.sub(f"[^{allowed_chars}]", "", value)
    
    return value


def generate_secure_token(length=32):
    """
    Generate a cryptographically secure random token.
    
    Args:
        length: Token length in characters
    
    Returns:
        str: Secure random token
    """
    import secrets
    return secrets.token_urlsafe(length)


def hash_sensitive_data(data, salt=None):
    """
    Hash sensitive data for secure storage/comparison.
    
    Args:
        data: Data to hash
        salt: Optional salt (generated if not provided)
    
    Returns:
        tuple: (hash, salt)
    """
    import secrets
    
    if salt is None:
        salt = secrets.token_hex(16)
    
    combined = f"{salt}{data}"
    hashed = hashlib.sha256(combined.encode()).hexdigest()
    
    return hashed, salt


# Security headers to add to responses
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
}


def add_security_headers(response):
    """
    Add security headers to HTTP response.
    
    Should be called in after_request hook.
    """
    for header, value in SECURITY_HEADERS.items():
        response.headers[header] = value
    return response


def on_login_fail(user_identifier=None):
    """
    Hook called when login fails.
    
    Tracks failed attempts for brute force protection.
    """
    if user_identifier:
        track_failed_login(user_identifier)
    else:
        # Try to get from form data
        user_identifier = frappe.form_dict.get("usr") or frappe.form_dict.get("user")
        if user_identifier:
            track_failed_login(user_identifier)
