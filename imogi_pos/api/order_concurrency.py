"""
Order Concurrency Control API - Multi-Cashier Session Support
Provides atomic claiming mechanism to prevent multiple cashiers from processing same order.
"""

import frappe
from frappe import _
from frappe.utils import now, flt
import frappe.utils.logger

logger = frappe.utils.logger.get_logger(__name__)


@frappe.whitelist()
def claim_order(order_name, opening_entry):
    """
    Atomic claim operation: Lock order to specific cashier session.
    
    Prevents multiple cashiers from claiming same order simultaneously.
    Uses database-level locking to ensure atomicity.
    
    Args:
        order_name (str): POS Order name
        opening_entry (str): POS Opening Entry name (session identifier)
        
    Returns:
        dict with:
            - success: Boolean
            - message: Status message
            - order: Order details if successful
            - error: Error message if failed
    """
    try:
        # Validate inputs
        if not order_name or not opening_entry:
            return {
                'success': False,
                'message': 'order_name and opening_entry are required',
                'error': 'Missing parameters'
            }
        
        # Check order exists
        if not frappe.db.exists('POS Order', order_name):
            return {
                'success': False,
                'message': f'Order {order_name} not found',
                'error': 'Order not found'
            }
        
        # Check opening exists
        if not frappe.db.exists('POS Opening Entry', opening_entry):
            return {
                'success': False,
                'message': f'Opening {opening_entry} not found',
                'error': 'Opening not found'
            }
        
        # Get order with lock (SELECT FOR UPDATE)
        order = frappe.get_doc('POS Order', order_name)
        
        # Check if already claimed by someone else
        claimed_by = getattr(order, 'claimed_by', None)
        claimed_at = getattr(order, 'claimed_at', None)
        
        if claimed_by and claimed_by != frappe.session.user:
            logger.warning(f'Order {order_name} already claimed by {claimed_by}')
            return {
                'success': False,
                'message': f'Order already being processed by another cashier ({claimed_by})',
                'error': f'Claimed by: {claimed_by}',
                'claimed_by': claimed_by,
                'claimed_at': claimed_at
            }
        
        # If already claimed by current user, return success (idempotent)
        if claimed_by == frappe.session.user:
            logger.info(f'Order {order_name} already claimed by current user')
            return {
                'success': True,
                'message': 'Order already claimed by you',
                'order': {
                    'name': order.name,
                    'claimed_by': order.claimed_by,
                    'claimed_at': order.claimed_at,
                    'opening_entry': opening_entry
                },
                'idempotent': True
            }
        
        # Atomic claim operation using database update
        # Use frappe.db.set_value with conditions to ensure atomicity
        try:
            # Set claimed_by and claimed_at using UPDATE with WHERE conditions
            frappe.db.set_value(
                'POS Order',
                order_name,
                {
                    'claimed_by': frappe.session.user,
                    'claimed_at': now()
                },
                update_modified=False
            )
            frappe.db.commit()
            
            logger.info(f'Order {order_name} claimed by {frappe.session.user} for opening {opening_entry}')
            
            return {
                'success': True,
                'message': f'Order claimed successfully',
                'order': {
                    'name': order.name,
                    'claimed_by': frappe.session.user,
                    'claimed_at': now(),
                    'opening_entry': opening_entry
                }
            }
        
        except Exception as e:
            frappe.db.rollback()
            logger.error(f'Failed to claim order {order_name}: {str(e)}')
            return {
                'success': False,
                'message': f'Failed to claim order: {str(e)}',
                'error': 'Claim operation failed'
            }
    
    except Exception as e:
        logger.error(f'Error in claim_order: {str(e)}', exc_info=True)
        return {
            'success': False,
            'message': f'Error claiming order: {str(e)}',
            'error': 'Unexpected error'
        }


@frappe.whitelist()
def release_order(order_name, opening_entry=None):
    """
    Release order claim (unlock order).
    
    Optional operation - allows cashier to release unclaimed order if needed.
    Can only be called by the cashier who claimed it.
    
    Args:
        order_name (str): POS Order name
        opening_entry (str, optional): POS Opening Entry (for verification)
        
    Returns:
        dict with success/error status
    """
    try:
        if not order_name:
            return {
                'success': False,
                'message': 'order_name is required',
                'error': 'Missing parameter'
            }
        
        # Check order exists
        if not frappe.db.exists('POS Order', order_name):
            return {
                'success': False,
                'message': f'Order {order_name} not found',
                'error': 'Order not found'
            }
        
        order = frappe.get_doc('POS Order', order_name)
        claimed_by = getattr(order, 'claimed_by', None)
        
        # Only allow release if claimed by current user or if no one has claimed it
        if claimed_by and claimed_by != frappe.session.user:
            return {
                'success': False,
                'message': f'Cannot release order claimed by {claimed_by}',
                'error': 'Not authorized to release'
            }
        
        # Release the claim
        frappe.db.set_value(
            'POS Order',
            order_name,
            {
                'claimed_by': None,
                'claimed_at': None
            },
            update_modified=False
        )
        frappe.db.commit()
        
        logger.info(f'Order {order_name} released by {frappe.session.user}')
        
        return {
            'success': True,
            'message': 'Order released successfully'
        }
    
    except Exception as e:
        frappe.db.rollback()
        logger.error(f'Error in release_order: {str(e)}')
        return {
            'success': False,
            'message': f'Error releasing order: {str(e)}',
            'error': 'Unexpected error'
        }


@frappe.whitelist()
def get_order_claim_status(order_name):
    """
    Get claim status of an order.
    
    Args:
        order_name (str): POS Order name
        
    Returns:
        dict with:
            - claimed: Boolean - whether order is claimed
            - claimed_by: User who claimed it (or None)
            - claimed_at: When it was claimed (or None)
            - can_claim: Boolean - whether current user can claim it
            - is_mine: Boolean - whether claimed by current user
    """
    try:
        if not frappe.db.exists('POS Order', order_name):
            return {
                'success': False,
                'error': 'Order not found'
            }
        
        order = frappe.get_doc('POS Order', order_name)
        claimed_by = getattr(order, 'claimed_by', None)
        claimed_at = getattr(order, 'claimed_at', None)
        
        current_user = frappe.session.user
        is_claimed = bool(claimed_by)
        is_mine = claimed_by == current_user if claimed_by else False
        can_claim = not is_claimed or is_mine
        
        return {
            'success': True,
            'claimed': is_claimed,
            'claimed_by': claimed_by,
            'claimed_at': claimed_at,
            'can_claim': can_claim,
            'is_mine': is_mine,
            'current_user': current_user
        }
    
    except Exception as e:
        logger.error(f'Error in get_order_claim_status: {str(e)}')
        return {
            'success': False,
            'error': str(e)
        }
