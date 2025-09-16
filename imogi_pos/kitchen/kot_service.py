import frappe
from frappe import _
from frappe.utils import now_datetime
from typing import Dict, List, Optional, Union, Any, Tuple


class KOTService:
    """
    Service class for managing Kitchen Order Tickets (KOT)
    
    Handles:
    - Creation of KOT tickets and items
    - State transitions for tickets and items
    - Grouping of items by kitchen station
    - Validation and permissions
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
    ALLOWED_TRANSITIONS = {
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
        },
        STATES["READY"]: {STATES["SERVED"], STATES["CANCELLED"]},
        STATES["SERVED"]: set(),
        STATES["CANCELLED"]: set(),
    }
    
    def __init__(self, pos_order=None):
        """
        Initialize the KOT service
        
        Args:
            pos_order: Optional POS Order document or name to associate with this service
        """
        self.pos_order = None
        if pos_order:
            if isinstance(pos_order, str):
                self.pos_order = frappe.get_doc("POS Order", pos_order)
            else:
                self.pos_order = pos_order
    
    def create_kot_from_order(
        self, 
        pos_order: Union[str, Dict, Any], 
        selected_items: Optional[List[str]] = None,
        send_to_kitchen: bool = True
    ) -> Dict[str, Any]:
        """
        Create KOT ticket(s) from a POS Order
        
        Args:
            pos_order: POS Order document or name
            selected_items: Optional list of POS Order Item names to include
                            (if None, all items that are not yet sent to kitchen will be included)
            send_to_kitchen: Whether to automatically publish to realtime channels
            
        Returns:
            Dict with created tickets and items info
        """
        # Get POS Order if name is provided
        if isinstance(pos_order, str):
            pos_order = frappe.get_doc("POS Order", pos_order)
        
        # Check domain
        self._validate_restaurant_domain(pos_order.pos_profile)
        
        # Validate order state
        if pos_order.workflow_state in ["Cancelled", "Returned", "Closed"]:
            frappe.throw(_("Cannot create KOT from a cancelled, returned, or closed order"))
        
        # Get items to include
        items_to_process = []
        for item in pos_order.items:
            # Skip if specific items were selected and this isn't one of them
            if selected_items and item.name not in selected_items:
                continue
                
            # Skip if item has already been sent to kitchen (has counter values)
            if item.get("counters") and item.counters.get("sent"):
                continue
                
            # Skip if item is a template (variants must be selected)
            item_has_variants = frappe.db.get_value("Item", item.item, "has_variants")
            if item_has_variants:
                frappe.throw(_(f"Item '{item.item}' is a template. Please select a variant before sending to kitchen."))
                
            items_to_process.append(item)
        
        if not items_to_process:
            frappe.throw(_("No items to send to kitchen"))
        
        # Group items by kitchen station
        grouped_items = self._group_items_by_station(items_to_process)
        
        # Create KOT tickets
        tickets = []
        all_kot_items = []
        
        for station, station_items in grouped_items.items():
            kot_ticket = self._create_kot_ticket(pos_order, station)
            kot_items = self._create_kot_items(kot_ticket.name, station_items)
            
            kot_ticket.append_items(kot_items)
            kot_ticket.save()
            
            tickets.append(kot_ticket)
            all_kot_items.extend(kot_items)
            
            # Update counters in POS Order Items
            for station_item in station_items:
                counters = frappe.parse_json(station_item.get("counters") or "{}")
                counters["sent"] = now_datetime()
                
                frappe.db.set_value(
                    "POS Order Item", 
                    station_item.name, 
                    {
                        "counters": frappe.as_json(counters),
                        "last_edited_by": frappe.session.user
                    }
                )
        
        # Update POS Order state if not already sent to kitchen
        current_state = pos_order.workflow_state
        if current_state == "Draft":
            frappe.db.set_value("POS Order", pos_order.name, "workflow_state", "Sent to Kitchen")
        
        # Send realtime notifications to kitchen displays
        if send_to_kitchen:
            self._publish_kot_updates(tickets, event_type="kot_created")
        
        return {
            "tickets": [t.name for t in tickets],
            "kot_items": [i.name for i in all_kot_items],
            "pos_order": pos_order.name
        }
    
    def update_kot_item_state(
        self, 
        kot_item: str, 
        new_state: str, 
        user: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update the state of a KOT Item
        
        Args:
            kot_item: KOT Item name
            new_state: New state to set
            user: User making the change (defaults to current user)
            
        Returns:
            Dict with updated item and related info
        """
        if new_state not in self.STATES.values():
            frappe.throw(_("Invalid KOT state: {0}").format(new_state))
        
        user = user or frappe.session.user
        item = frappe.get_doc("KOT Item", kot_item)

        # Get ticket and validate it's not cancelled
        ticket = frappe.get_doc("KOT Ticket", item.parent)
        if ticket.workflow_state == self.STATES["CANCELLED"]:
            frappe.throw(_("Cannot update item state for a cancelled KOT"))

        # Validate state transition
        old_state = item.workflow_state
        if new_state == old_state:
            return {
                "kot_item": item.name,
                "ticket": ticket.name,
                "old_state": old_state,
                "new_state": new_state,
            }

        allowed = self.ALLOWED_ITEM_TRANSITIONS.get(old_state, set())
        if new_state not in allowed:
            frappe.throw(
                _(f"Invalid state transition from {old_state} to {new_state}")
            )

        # Update item state
        item.workflow_state = new_state
        item.last_edited_by = user
        item.save()
        
        # Update corresponding POS Order Item counters
        if item.pos_order_item:
            self._update_pos_item_counter(item.pos_order_item, new_state)
        
        # Update ticket state if all items are in the same state
        self._update_ticket_state_if_needed(ticket.name)
        
        # Send realtime updates
        self._publish_kot_item_update(item)
        
        return {
            "kot_item": item.name,
            "ticket": ticket.name,
            "old_state": old_state,
            "new_state": new_state
        }
    
    def update_kot_ticket_state(
        self, 
        kot_ticket: str, 
        new_state: str, 
        user: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update the state of a KOT Ticket and all its items
        
        Args:
            kot_ticket: KOT Ticket name
            new_state: New state to set
            user: User making the change (defaults to current user)
            
        Returns:
            Dict with updated ticket and items info
        """
        if new_state not in self.STATES.values():
            frappe.throw(_("Invalid KOT state: {0}").format(new_state))
        
        user = user or frappe.session.user
        ticket = frappe.get_doc("KOT Ticket", kot_ticket)

        # Validate state transition
        current_state = ticket.workflow_state
        allowed_states = self.ALLOWED_TRANSITIONS.get(current_state, set())
        if new_state not in allowed_states:
            frappe.throw(
                _("Cannot change ticket state from {0} to {1}").format(
                    current_state, new_state
                )
            )

        # Update ticket state
        old_state = current_state
        ticket.workflow_state = new_state
        ticket.last_edited_by = user
        ticket.save()
        
        # Update all items to match
        updated_items = []
        for item in ticket.items:
            if item.workflow_state != new_state:
                item.workflow_state = new_state
                item.last_edited_by = user
                item.save()
                
                # Update corresponding POS Order Item counters
                if item.pos_order_item:
                    self._update_pos_item_counter(item.pos_order_item, new_state)
                
                updated_items.append(item.name)
        
        # Check if we need to update POS Order state
        self._update_pos_order_state_if_needed(ticket.pos_order)
        
        # Send realtime updates
        changed_map = {ticket.name: updated_items} if updated_items else None
        self._publish_kot_updates(
            [ticket],
            event_type="kot_updated",
            changed_item_names=changed_map,
        )
        
        return {
            "ticket": ticket.name,
            "old_state": old_state,
            "new_state": new_state,
            "updated_items": updated_items
        }
    
    def bulk_update_kot_items(
        self, 
        kot_items: List[str], 
        new_state: str, 
        user: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update multiple KOT Items to the same state
        
        Args:
            kot_items: List of KOT Item names
            new_state: New state to set
            user: User making the change (defaults to current user)
            
        Returns:
            Dict with updated items info
        """
        if new_state not in self.STATES.values():
            frappe.throw(_("Invalid KOT state: {0}").format(new_state))
        
        user = user or frappe.session.user
        updated_items = []
        failed_items = []
        affected_tickets = set()

        for kot_item in kot_items:
            try:
                result = self.update_kot_item_state(kot_item, new_state, user)
                updated_items.append(kot_item)
                affected_tickets.add(result["ticket"])
            except Exception as e:
                failed_items.append({"item": kot_item, "error": str(e)})

        return {
            "updated_items": updated_items,
            "failed_items": failed_items,
            "affected_tickets": list(affected_tickets),
            "new_state": new_state,
        }
    
    def cancel_kot_ticket(
        self, 
        kot_ticket: str, 
        reason: Optional[str] = None, 
        user: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Cancel a KOT Ticket and all its items
        
        Args:
            kot_ticket: KOT Ticket name
            reason: Optional reason for cancellation
            user: User making the change (defaults to current user)
            
        Returns:
            Dict with cancelled ticket info
        """
        return self.update_kot_ticket_state(
            kot_ticket, 
            self.STATES["CANCELLED"], 
            user
        )
    
    def reprint_kot_ticket(
        self, 
        kot_ticket: str, 
        printer_info: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Log a reprint of a KOT Ticket
        
        Args:
            kot_ticket: KOT Ticket name
            printer_info: Optional printer information
            
        Returns:
            Dict with reprint info
        """
        ticket = frappe.get_doc("KOT Ticket", kot_ticket)
        
        # Log the reprint
        reprint_log = frappe.get_doc({
            "doctype": "KOT Reprint Log",
            "kot_ticket": kot_ticket,
            "user": frappe.session.user,
            "timestamp": now_datetime(),
            "printer": printer_info.get("printer") if printer_info else None,
            "copies": printer_info.get("copies", 1) if printer_info else 1
        })
        reprint_log.insert()
        
        return {
            "ticket": kot_ticket,
            "reprint_log": reprint_log.name,
            "timestamp": reprint_log.timestamp
        }
    
    def _group_items_by_station(self, items: List[Dict]) -> Dict[str, List[Dict]]:
        """
        Group POS Order Items by kitchen station
        
        Args:
            items: List of POS Order Item documents/dicts
            
        Returns:
            Dict mapping station names to lists of items
        """
        grouped = {}
        
        for item in items:
            # Get the kitchen station for this item
            station = item.get("kitchen_station")
            
            # If no station specified, try to get default from item master
            if not station:
                item_defaults = frappe.db.get_value(
                    "Item", 
                    item.item, 
                    ["default_kitchen_station", "default_kitchen"],
                    as_dict=1
                )
                
                station = item_defaults.get("default_kitchen_station")
                
                # If still no station, use default kitchen's default station
                if not station and item_defaults.get("default_kitchen"):
                    kitchen = frappe.get_doc("Kitchen", item_defaults.get("default_kitchen"))
                    station = kitchen.default_station
            
            # If still no station, use a fallback
            if not station:
                # Get the default station from Restaurant Settings
                station = frappe.db.get_single_value(
                    "Restaurant Settings", 
                    "default_kitchen_station"
                )
                
                # If still nothing, create a "Main" group
                if not station:
                    station = "Main"
            
            # Add item to the appropriate group
            if station not in grouped:
                grouped[station] = []
                
            grouped[station].append(item)
        
        return grouped
    
    def _create_kot_ticket(self, pos_order: Dict, station: str) -> Dict:
        """
        Create a new KOT Ticket
        
        Args:
            pos_order: POS Order document
            station: Kitchen station for this ticket
            
        Returns:
            Created KOT Ticket document
        """
        kot_ticket = frappe.get_doc({
            "doctype": "KOT Ticket",
            "pos_order": pos_order.name,
            "kitchen_station": station,
            "order_type": pos_order.order_type,
            "branch": pos_order.branch,
            "table": pos_order.get("table"),
            "floor": frappe.db.get_value("Restaurant Table", pos_order.get("table"), "floor") if pos_order.get("table") else None,
            "customer": pos_order.get("customer"),
            "workflow_state": self.STATES["QUEUED"],
            "created_by": frappe.session.user,
            "creation_time": now_datetime()
        })
        
        kot_ticket.insert()
        return kot_ticket
    
    def _create_kot_items(self, kot_ticket: str, items: List[Dict]) -> List[Dict]:
        """
        Create KOT Items for a ticket
        
        Args:
            kot_ticket: KOT Ticket name
            items: List of POS Order Items
            
        Returns:
            List of created KOT Item documents
        """
        kot_items = []
        
        for item in items:
            # Get item details
            item_details = frappe.db.get_value(
                "Item", 
                item.item, 
                ["item_name", "description"], 
                as_dict=1
            )
            
            kot_item = frappe.get_doc({
                "doctype": "KOT Item",
                "parent": kot_ticket,
                "parenttype": "KOT Ticket",
                "parentfield": "items",
                "item_code": item.item,
                "item_name": item_details.get("item_name"),
                "description": item_details.get("description"),
                "qty": item.qty,
                "notes": item.get("notes", ""),
                "pos_order_item": item.name,
                "workflow_state": self.STATES["QUEUED"]
            })
            
            kot_items.append(kot_item)
        
        return kot_items
    
    def _update_pos_item_counter(self, pos_order_item: str, state: str) -> None:
        """
        Update counters in the original POS Order Item
        
        Args:
            pos_order_item: POS Order Item name
            state: New KOT state to record
        """
        item = frappe.get_doc("POS Order Item", pos_order_item)
        counters = frappe.parse_json(item.get("counters") or "{}")
        
        # Map KOT states to counter fields
        state_to_counter = {
            self.STATES["QUEUED"]: "sent",
            self.STATES["IN_PROGRESS"]: "preparing",
            self.STATES["READY"]: "ready",
            self.STATES["SERVED"]: "served",
            self.STATES["CANCELLED"]: "cancelled"
        }
        
        # Update the appropriate counter
        if state in state_to_counter:
            counters[state_to_counter[state]] = now_datetime()
        
        frappe.db.set_value(
            "POS Order Item", 
            pos_order_item, 
            {
                "counters": frappe.as_json(counters),
                "last_edited_by": frappe.session.user
            }
        )
    
    def _update_ticket_state_if_needed(self, kot_ticket: str) -> None:
        """
        Check if all items in a ticket are in the same state and update ticket state if needed
        
        Args:
            kot_ticket: KOT Ticket name
        """
        ticket = frappe.get_doc("KOT Ticket", kot_ticket)
        
        # Skip if no items
        if not ticket.items:
            return
        
        # Check if all items have the same state
        states = set(item.workflow_state for item in ticket.items)
        
        if len(states) == 1:
            # All items have the same state, update ticket
            new_state = list(states)[0]
            if ticket.workflow_state != new_state:
                frappe.db.set_value(
                    "KOT Ticket", 
                    kot_ticket, 
                    {
                        "workflow_state": new_state,
                        "last_edited_by": frappe.session.user
                    }
                )
                
                # Check if we need to update the POS Order state
                self._update_pos_order_state_if_needed(ticket.pos_order)
    
    def _update_pos_order_state_if_needed(self, pos_order: str) -> None:
        """
        Check all KOT tickets for a POS Order and update the order state if needed
        
        Args:
            pos_order: POS Order name
        """
        # Get all KOT tickets for this order
        tickets = frappe.get_all(
            "KOT Ticket", 
            filters={"pos_order": pos_order}, 
            fields=["name", "workflow_state"]
        )
        
        if not tickets:
            return
        
        # Get all unique states
        states = set(ticket.workflow_state for ticket in tickets)
        
        # Map KOT states to POS Order states
        kot_to_pos_state = {
            self.STATES["IN_PROGRESS"]: "In Progress",
            self.STATES["READY"]: "Ready",
            self.STATES["SERVED"]: "Served"
        }
        
        # Determine the right POS Order state based on KOT states
        new_pos_state = None
        
        # If all KOTs are cancelled, mark order as cancelled
        if len(states) == 1 and list(states)[0] == self.STATES["CANCELLED"]:
            new_pos_state = "Cancelled"
        
        # If all KOTs are served, mark order as served
        elif len(states) == 1 and list(states)[0] == self.STATES["SERVED"]:
            new_pos_state = "Served"
        
        # If any KOT is ready and none are queued/in progress, mark order as ready
        elif self.STATES["READY"] in states and not any(s in states for s in [self.STATES["QUEUED"], self.STATES["IN_PROGRESS"]]):
            new_pos_state = "Ready"
        
        # If any KOT is in progress, mark order as in progress
        elif self.STATES["IN_PROGRESS"] in states:
            new_pos_state = "In Progress"
        
        # Update POS Order if needed
        if new_pos_state:
            current_state = frappe.db.get_value("POS Order", pos_order, "workflow_state")
            if current_state != new_pos_state:
                frappe.db.set_value("POS Order", pos_order, "workflow_state", new_pos_state)
    
    def _publish_kot_updates(
        self,
        tickets: List[Dict],
        event_type: str = "kot_updated",
        changed_item_names: Optional[Dict[str, List[str]]] = None,
    ) -> None:
        """
        Publish realtime updates for KOT tickets

        Args:
            tickets: List of KOT Ticket documents
            event_type: Type of update that occurred
            changed_item_names: Mapping of ticket names to lists of updated KOT Item names
        """
        from imogi_pos.api.kot import publish_kitchen_update

        changed_item_names = changed_item_names or {}

        for ticket in tickets:
            ticket_doc = ticket
            if not hasattr(ticket_doc, "as_dict"):
                ticket_doc = frappe.get_doc("KOT Ticket", ticket)

            changed_items = []
            item_names = changed_item_names.get(ticket_doc.name, [])
            for item_name in item_names:
                try:
                    changed_items.append(frappe.get_doc("KOT Item", item_name))
                except Exception:
                    continue

            publish_kitchen_update(
                ticket_doc,
                event_type=event_type,
                changed_items=changed_items,
            )

            if ticket_doc.table:
                payload = {
                    "action": "kot_updated",
                    "event_type": event_type,
                    "ticket": ticket_doc.name,
                    "state": ticket_doc.workflow_state,
                }
                frappe.publish_realtime(
                    f"table:{ticket_doc.table}",
                    payload,
                )

                if ticket_doc.floor:
                    frappe.publish_realtime(
                        f"table_display:floor:{ticket_doc.floor}",
                        {
                            "action": "table_updated",
                            "table": ticket_doc.table,
                            "has_kot_updates": True,
                        },
                    )
    
    def _publish_kot_item_update(self, item: Dict) -> None:
        """
        Publish realtime update for a single KOT Item

        Args:
            item: KOT Item document
        """
        ticket = frappe.get_doc("KOT Ticket", item.parent)

        from imogi_pos.api.kot import publish_kitchen_update

        publish_kitchen_update(
            ticket,
            event_type="kot_item_updated",
            changed_items=[item],
        )

        if ticket.table:
            frappe.publish_realtime(
                f"table:{ticket.table}",
                {
                    "action": "kot_item_updated",
                    "event_type": "kot_item_updated",
                    "ticket": ticket.name,
                    "item": item.name,
                    "state": item.workflow_state,
                },
            )
    
    def _validate_restaurant_domain(self, pos_profile: str) -> None:
        """
        Validate that the POS Profile has the Restaurant domain enabled
        
        Args:
            pos_profile: POS Profile name
            
        Raises:
            frappe.ValidationError: If domain is not Restaurant
        """
        domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain")
        if domain != "Restaurant":
            frappe.throw(_("KOT features are only available for Restaurant domain"))


# Module-level functions as convenience wrappers around the service class

def create_kot_from_order(pos_order, selected_items=None, send_to_kitchen=True):
    """Module-level wrapper for KOTService.create_kot_from_order"""
    service = KOTService()
    return service.create_kot_from_order(pos_order, selected_items, send_to_kitchen)

def update_kot_item_state(kot_item, new_state, user=None):
    """Module-level wrapper for KOTService.update_kot_item_state"""
    service = KOTService()
    return service.update_kot_item_state(kot_item, new_state, user)

def update_kot_ticket_state(kot_ticket, new_state, user=None):
    """Module-level wrapper for KOTService.update_kot_ticket_state"""
    service = KOTService()
    return service.update_kot_ticket_state(kot_ticket, new_state, user)

def bulk_update_kot_items(kot_items, new_state, user=None):
    """Module-level wrapper for KOTService.bulk_update_kot_items"""
    service = KOTService()
    return service.bulk_update_kot_items(kot_items, new_state, user)

def cancel_kot_ticket(kot_ticket, reason=None, user=None):
    """Module-level wrapper for KOTService.cancel_kot_ticket"""
    service = KOTService()
    return service.cancel_kot_ticket(kot_ticket, reason, user)

def reprint_kot_ticket(kot_ticket, printer_info=None):
    """Module-level wrapper for KOTService.reprint_kot_ticket"""
    service = KOTService()
    return service.reprint_kot_ticket(kot_ticket, printer_info)