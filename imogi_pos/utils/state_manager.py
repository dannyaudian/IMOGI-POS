# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

"""
State transition manager for KOT workflow states.

This module centralizes all state transition logic and mapping
to ensure consistency across the application.
"""

import frappe
from frappe import _
from typing import Dict, Set, Optional, List


class StateManager:
    """
    Manages state transitions and mapping for KOT and POS Order workflows.
    
    Centralizes:
    - State definitions and constants
    - Allowed state transitions
    - KOT to POS Order state mapping
    """
    
    # Workflow states
    STATES = {
        "QUEUED": "Queued",
        "IN_PROGRESS": "In Progress",
        "READY": "Ready",
        "SERVED": "Served",
        "CANCELLED": "Cancelled"
    }
    
    # Allowed forward transitions for KOT Items
    ALLOWED_ITEM_TRANSITIONS = {
        STATES["QUEUED"]: {STATES["IN_PROGRESS"], STATES["CANCELLED"]},
        STATES["IN_PROGRESS"]: {STATES["READY"], STATES["CANCELLED"]},
        STATES["READY"]: {STATES["SERVED"], STATES["CANCELLED"]},
        STATES["SERVED"]: set(),
        STATES["CANCELLED"]: set(),
    }
    
    # Allowed forward transitions for KOT Tickets
    ALLOWED_TICKET_TRANSITIONS = {
        STATES["QUEUED"]: {
            STATES["IN_PROGRESS"],
            STATES["READY"],
            STATES["SERVED"],
            STATES["CANCELLED"],
        },
        STATES["IN_PROGRESS"]: {
            STATES["READY"],
            STATES["SERVED"],
            STATES["CANCELLED"],
            STATES["QUEUED"],
        },
        STATES["READY"]: {
            STATES["SERVED"],
            STATES["CANCELLED"],
            STATES["IN_PROGRESS"],
        },
        STATES["SERVED"]: set(),
        STATES["CANCELLED"]: set(),
    }
    
    @classmethod
    def validate_item_transition(cls, current_state: str, new_state: str) -> bool:
        """
        Validate if state transition is allowed for KOT Item.
        
        Args:
            current_state: Current workflow state
            new_state: Target workflow state
            
        Returns:
            True if transition is allowed
            
        Raises:
            frappe.ValidationError: If transition is not allowed
        """
        if new_state == current_state:
            return True
            
        allowed = cls.ALLOWED_ITEM_TRANSITIONS.get(current_state, set())
        if new_state not in allowed:
            frappe.throw(
                _("Invalid KOT Item state transition from {0} to {1}").format(
                    current_state, new_state
                )
            )
        return True
    
    @classmethod
    def validate_ticket_transition(cls, current_state: str, new_state: str) -> bool:
        """
        Validate if state transition is allowed for KOT Ticket.
        
        Args:
            current_state: Current workflow state
            new_state: Target workflow state
            
        Returns:
            True if transition is allowed
            
        Raises:
            frappe.ValidationError: If transition is not allowed
        """
        if new_state == current_state:
            return True
            
        allowed = cls.ALLOWED_TICKET_TRANSITIONS.get(current_state, set())
        if new_state not in allowed:
            frappe.throw(
                _("Cannot change KOT Ticket state from {0} to {1}").format(
                    current_state, new_state
                )
            )
        return True
    
    @classmethod
    def is_valid_state(cls, state: str) -> bool:
        """Check if a state is valid."""
        return state in cls.STATES.values()
    
    @classmethod
    def get_pos_order_state_from_kots(cls, kot_states: List[str]) -> Optional[str]:
        """
        Determine POS Order state based on KOT Ticket states.
        
        Rules:
        - If all KOTs are Cancelled: POS Order = Cancelled
        - If all KOTs are Served: POS Order = Served
        - If any KOT is Ready and none are Queued/In Progress: POS Order = Ready
        - If any KOT is In Progress: POS Order = In Progress
        - Otherwise: No change
        
        Args:
            kot_states: List of KOT Ticket workflow states
            
        Returns:
            New POS Order state or None if no change needed
        """
        if not kot_states:
            return None
        
        unique_states = set(kot_states)
        
        # If all KOTs are cancelled, mark order as cancelled
        if len(unique_states) == 1 and cls.STATES["CANCELLED"] in unique_states:
            return "Cancelled"
        
        # If all KOTs are served, mark order as served
        if len(unique_states) == 1 and cls.STATES["SERVED"] in unique_states:
            return "Served"
        
        # If any KOT is ready and none are queued/in progress, mark order as ready
        if (cls.STATES["READY"] in unique_states and 
            not any(s in unique_states for s in [cls.STATES["QUEUED"], cls.STATES["IN_PROGRESS"]])):
            return "Ready"
        
        # If any KOT is in progress, mark order as in progress
        if cls.STATES["IN_PROGRESS"] in unique_states:
            return "In Progress"
        
        # If all are queued, keep as Draft
        if len(unique_states) == 1 and cls.STATES["QUEUED"] in unique_states:
            return "Draft"
        
        return None
    
    @classmethod
    def should_update_pos_order_state(cls, current_pos_state: str, new_pos_state: Optional[str]) -> bool:
        """
        Check if POS Order state should be updated.
        
        Args:
            current_pos_state: Current POS Order state
            new_pos_state: Proposed new POS Order state
            
        Returns:
            True if state should be updated
        """
        return new_pos_state is not None and current_pos_state != new_pos_state
