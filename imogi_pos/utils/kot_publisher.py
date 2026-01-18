# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

"""
KOT realtime event publisher.

This module centralizes all realtime publishing logic for KOT related events
to ensure consistent and reliable notifications across kitchen displays,
table displays, and other realtime clients.
"""

import frappe
from frappe import _
from typing import Dict, List, Optional, Union, Any


class KOTPublisher:
    """
    Manages realtime publishing of KOT events to various channels.
    
    Centralizes:
    - Kitchen updates (kitchen, station)
    - Table updates (table service channel)
    - Floor display updates (floor/section)
    - Event normalization and payload construction
    """
    
    @staticmethod
    def publish_ticket_update(
        ticket,
        event_type: str = "kot_updated",
        changed_items: Optional[List[Any]] = None,
        kitchen: Optional[str] = None,
        station: Optional[str] = None,
    ) -> None:
        """
        Publish a KOT Ticket update to all relevant channels.
        
        Args:
            ticket: KOT Ticket document or dict
            event_type: Type of event (kot_updated, kot_created, etc.)
            changed_items: List of KOT Item documents that changed
            kitchen: Kitchen name (optional, uses ticket's kitchen if not provided)
            station: Kitchen station name (optional, uses ticket's station if not provided)
        """
        ticket_doc = ticket if hasattr(ticket, 'name') else frappe.get_doc("KOT Ticket", ticket)
        
        # Publish to kitchen station channel
        KOTPublisher._publish_to_kitchen_station(
            ticket_doc, 
            event_type, 
            changed_items,
            station
        )
        
        # Publish to kitchen channel
        if ticket_doc.kitchen or kitchen:
            KOTPublisher._publish_to_kitchen(
                ticket_doc, 
                event_type,
                kitchen
            )
        
        # Publish to table service channel
        if ticket_doc.table:
            KOTPublisher._publish_to_table(
                ticket_doc,
                event_type
            )
    
    @staticmethod
    def _publish_to_kitchen_station(
        ticket,
        event_type: str,
        changed_items: Optional[List[Any]] = None,
        station: Optional[str] = None,
    ) -> None:
        """Publish update to a specific kitchen station."""
        station_name = station or ticket.kitchen_station
        if not station_name:
            return
        
        payload = {
            "action": "kot_updated",
            "event_type": event_type,
            "ticket": ticket.name,
            "state": ticket.workflow_state,
            "kitchen_station": station_name,
            "branch": ticket.branch,
            "timestamp": frappe.utils.now(),
        }
        
        # Add changed items info if provided
        if changed_items:
            payload["changed_items"] = [
                {
                    "name": item.name,
                    "item_code": item.item,
                    "state": item.workflow_state,
                }
                for item in changed_items
            ]
        
        frappe.publish_realtime(
            f"kitchen:station:{station_name}",
            payload,
            doctype="KOT Ticket",
            docname=ticket.name,
        )
    
    @staticmethod
    def _publish_to_kitchen(
        ticket,
        event_type: str,
        kitchen: Optional[str] = None,
    ) -> None:
        """Publish update to a kitchen."""
        kitchen_name = kitchen or ticket.kitchen
        if not kitchen_name:
            return
        
        payload = {
            "action": "kot_updated",
            "event_type": event_type,
            "ticket": ticket.name,
            "state": ticket.workflow_state,
            "kitchen": kitchen_name,
            "station": ticket.kitchen_station,
            "branch": ticket.branch,
            "timestamp": frappe.utils.now(),
        }
        
        frappe.publish_realtime(
            f"kitchen:{kitchen_name}",
            payload,
            doctype="KOT Ticket",
            docname=ticket.name,
        )
    
    @staticmethod
    def _publish_to_table(
        ticket,
        event_type: str,
    ) -> None:
        """Publish update to table service channel."""
        if not ticket.table:
            return
        
        payload = {
            "action": "kot_updated",
            "event_type": event_type,
            "ticket": ticket.name,
            "state": ticket.workflow_state,
            "table": ticket.table,
            "timestamp": frappe.utils.now(),
        }
        
        frappe.publish_realtime(
            f"table:{ticket.table}",
            payload,
            doctype="KOT Ticket",
            docname=ticket.name,
        )
        
        # Also publish to floor/section display if available
        if ticket.floor:
            KOTPublisher._publish_to_floor(ticket)
    
    @staticmethod
    def _publish_to_floor(ticket) -> None:
        """Publish update to floor/section display."""
        if not ticket.floor or not ticket.table:
            return
        
        payload = {
            "action": "table_updated",
            "event_type": "kot_updated",
            "table": ticket.table,
            "floor": ticket.floor,
            "has_kot_updates": True,
            "ticket": ticket.name,
            "timestamp": frappe.utils.now(),
        }
        
        frappe.publish_realtime(
            f"table_display:floor:{ticket.floor}",
            payload,
        )
    
    @staticmethod
    def publish_item_update(
        item,
        ticket: Optional[Union[str, Any]] = None,
    ) -> None:
        """
        Publish a KOT Item update.
        
        Args:
            item: KOT Item document
            ticket: KOT Ticket document or name (optional, will be fetched if not provided)
        """
        item_doc = item if hasattr(item, 'name') else frappe.get_doc("KOT Item", item)
        
        # Get ticket if not provided
        if not ticket:
            ticket_doc = frappe.get_doc("KOT Ticket", item_doc.parent)
        elif isinstance(ticket, str):
            ticket_doc = frappe.get_doc("KOT Ticket", ticket)
        else:
            ticket_doc = ticket
        
        payload = {
            "action": "item_updated",
            "event_type": "kot_item_updated",
            "ticket": ticket_doc.name,
            "item": item_doc.name,
            "item_code": item_doc.item,
            "state": item_doc.workflow_state,
            "kitchen_station": ticket_doc.kitchen_station,
            "timestamp": frappe.utils.now(),
        }
        
        # Publish to kitchen station
        if ticket_doc.kitchen_station:
            frappe.publish_realtime(
                f"kitchen:station:{ticket_doc.kitchen_station}",
                payload,
                doctype="KOT Item",
                docname=item_doc.name,
            )
        
        # Publish to kitchen
        if ticket_doc.kitchen:
            frappe.publish_realtime(
                f"kitchen:{ticket_doc.kitchen}",
                payload,
                doctype="KOT Item",
                docname=item_doc.name,
            )
    
    @staticmethod
    def publish_ticket_created(
        ticket,
        kitchen: Optional[str] = None,
        station: Optional[str] = None,
    ) -> None:
        """
        Publish a ticket creation event.
        
        Args:
            ticket: KOT Ticket document or name
            kitchen: Kitchen name (optional)
            station: Kitchen station name (optional)
        """
        ticket_doc = ticket if hasattr(ticket, 'name') else frappe.get_doc("KOT Ticket", ticket)
        
        KOTPublisher.publish_ticket_update(
            ticket_doc,
            event_type="kot_created",
            kitchen=kitchen,
            station=station,
        )
    
    @staticmethod
    def publish_ticket_cancelled(ticket) -> None:
        """Publish a ticket cancellation event."""
        ticket_doc = ticket if hasattr(ticket, 'name') else frappe.get_doc("KOT Ticket", ticket)
        
        KOTPublisher.publish_ticket_update(
            ticket_doc,
            event_type="kot_cancelled",
        )
