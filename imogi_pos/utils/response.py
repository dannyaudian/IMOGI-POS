# -*- coding: utf-8 -*-
"""
IMOGI POS - Standard Response Formatter
========================================

Provides consistent response formatting for API endpoints.

Standard response format:
{
    "message": <data>,        # Main response data
    "exc": None|str,          # Exception type if error
    "success": True|False,    # Success flag
    "_server_messages": []    # User-facing messages
}

Usage:
    from imogi_pos.utils.response import success_response, error_response, permission_error
    
    # Success response
    @frappe.whitelist()
    def get_orders():
        orders = get_orders_list()
        return success_response(orders, "Orders retrieved successfully")
    
    # Error response
    @frappe.whitelist()
    def submit_order(order_name):
        if not frappe.db.exists("POS Order", order_name):
            return error_response("Order not found", "NotFoundError", 404)
        # ...
    
    # Permission error
    @frappe.whitelist()
    def delete_order(order_name):
        if not has_permission(order_name):
            return permission_error("Insufficient permissions to delete order")
        # ...
"""

import frappe
from frappe import _
import logging

logger = logging.getLogger(__name__)


def success_response(data, message=None):
    """
    Standard success response format
    
    Args:
        data: Response data (will be returned as r.message on client)
        message: Optional user-facing success message
        
    Returns:
        dict: Standard response object
    """
    response = {
        "message": data,
        "exc": None,
        "success": True
    }
    
    if message:
        response["_server_messages"] = [
            frappe.as_json({"message": message, "indicator": "green"})
        ]
        logger.info(f"[imogi][response] Success: {message}")
    else:
        response["_server_messages"] = []
        logger.debug(f"[imogi][response] Success (no message)")
    
    return response


def error_response(message, exc_type="ValidationError", http_status=400):
    """
    Standard error response format
    
    Args:
        message: User-facing error message
        exc_type: Exception type string (ValidationError, NotFoundError, etc.)
        http_status: HTTP status code (default: 400)
        
    Returns:
        dict: Standard error response object
        
    Note:
        Sets frappe.local.response['http_status_code'] for proper HTTP status
    """
    # Set HTTP status code
    frappe.local.response['http_status_code'] = http_status
    
    response = {
        "message": None,
        "exc": exc_type,
        "exc_type": exc_type,
        "success": False,
        "_server_messages": [
            frappe.as_json({"message": message, "indicator": "red"})
        ]
    }
    
    logger.error(f"[imogi][response] Error {http_status}: {message} ({exc_type})")
    
    return response


def permission_error(message="Insufficient permissions"):
    """
    Standard permission error (403 Forbidden)
    
    Args:
        message: User-facing permission error message
        
    Returns:
        dict: Standard permission error response
    """
    logger.warning(f"[imogi][response] Permission denied: {message}")
    return error_response(message, "PermissionError", 403)


def not_found_error(doctype, name=None):
    """
    Standard not found error (404)
    
    Args:
        doctype: DocType name
        name: Document name (optional)
        
    Returns:
        dict: Standard not found error response
    """
    if name:
        message = _("{0} {1} not found").format(doctype, name)
    else:
        message = _("{0} not found").format(doctype)
    
    logger.warning(f"[imogi][response] Not found: {doctype} {name or ''}")
    return error_response(message, "NotFoundError", 404)


def validation_error(message):
    """
    Standard validation error (400 Bad Request)
    
    Args:
        message: User-facing validation error message
        
    Returns:
        dict: Standard validation error response
    """
    logger.warning(f"[imogi][response] Validation error: {message}")
    return error_response(message, "ValidationError", 400)


def auth_error(message="Authentication required"):
    """
    Standard authentication error (401 Unauthorized)
    
    Args:
        message: User-facing auth error message
        
    Returns:
        dict: Standard auth error response
        
    Note:
        Client should redirect to login on 401
    """
    logger.warning(f"[imogi][response] Auth error: {message}")
    return error_response(message, "AuthenticationError", 401)


def expectation_failed_error(message):
    """
    Standard expectation failed error (417)
    
    This is used by Frappe for:
    - Session expired
    - CSRF token mismatch
    - Other expectation failures
    
    Args:
        message: User-facing error message
        
    Returns:
        dict: Standard 417 error response
        
    Note:
        Client should check if this is truly an auth issue or validation issue
    """
    logger.warning(f"[imogi][response] Expectation failed (417): {message}")
    return error_response(message, "ExpectationFailed", 417)


def internal_error(message="Internal server error", exception=None):
    """
    Standard internal server error (500)
    
    Args:
        message: User-facing error message
        exception: Exception object (optional, will be logged)
        
    Returns:
        dict: Standard internal error response
    """
    if exception:
        logger.error(f"[imogi][response] Internal error: {message}", exc_info=exception)
    else:
        logger.error(f"[imogi][response] Internal error: {message}")
    
    return error_response(message, "InternalError", 500)


def paginated_response(data, page=1, page_size=20, total=None):
    """
    Standard paginated response format
    
    Args:
        data: List of items for current page
        page: Current page number (1-indexed)
        page_size: Items per page
        total: Total number of items (optional)
        
    Returns:
        dict: Standard response with pagination metadata
    """
    response_data = {
        "items": data,
        "page": page,
        "page_size": page_size,
        "count": len(data)
    }
    
    if total is not None:
        response_data["total"] = total
        response_data["total_pages"] = (total + page_size - 1) // page_size
        response_data["has_next"] = page < response_data["total_pages"]
        response_data["has_prev"] = page > 1
    
    logger.debug(f"[imogi][response] Paginated response: page {page}, {len(data)} items")
    
    return success_response(response_data)


# Backward compatibility aliases
ok_response = success_response
err_response = error_response
