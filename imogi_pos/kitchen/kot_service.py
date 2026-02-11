import frappe
from frappe import _
from frappe.utils import now_datetime
from typing import Dict, List, Optional, Union, Any, Tuple

from imogi_pos.utils.kitchen_routing import get_menu_category_kitchen_station
from imogi_pos.utils.state_manager import StateManager
from imogi_pos.utils.kot_publisher import KOTPublisher


class KOTService:
    """
    Service class for managing Kitchen Order Tickets (KOT)
    
    Handles:
    - Creation of KOT tickets and items
    - State transitions for tickets and items
    - Grouping of items by kitchen station
    - Validation and permissions
    """
    
    # Reference StateManager for state constants
    STATES = StateManager.STATES
    
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
            # counters is stored as JSON string, need to parse it
            counters_str = item.get("counters") or "{}"
            counters = frappe.parse_json(counters_str) if isinstance(counters_str, str) else counters_str
            if counters and counters.get("sent"):
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
        
        # Validate that we have valid stations - kitchen_station is required for KOT Ticket
        # Check if any items were grouped under None (no station)
        if None in grouped_items:
            # No station found, need to create a default or throw error
            default_station = self._ensure_default_kitchen_station(pos_order)
            if default_station:
                # Move items from None to the default station
                items_without_station = grouped_items.pop(None)
                if default_station in grouped_items:
                    grouped_items[default_station].extend(items_without_station)
                else:
                    grouped_items[default_station] = items_without_station
            else:
                frappe.throw(
                    _("No Kitchen Station found. Please create a Kitchen Station first, "
                      "or set a default kitchen station for your items."),
                    title=_("Kitchen Station Required")
                )
        
        # Create KOT tickets
        tickets = []
        all_kot_items = []
        
        for station, station_items in grouped_items.items():
            # Create KOT ticket with items (items is mandatory)
            # Counter updates are handled inside _create_kot_ticket_with_items
            kot_ticket, kot_items = self._create_kot_ticket_with_items(
                pos_order, station, station_items
            )
            
            tickets.append(kot_ticket)
            all_kot_items.extend(kot_items)
        
        # Note: POS Order state is already updated by the workflow action "Send to Kitchen"
        # We don't need to update it here - it causes the state to become "Draft" again
        # because "Sent to Kitchen" is not a valid workflow state
        
        # Send realtime notifications to kitchen displays
        if send_to_kitchen:
            for ticket in tickets:
                try:
                    KOTPublisher.publish_ticket_update(
                        ticket=ticket,
                        event_type="kot_created"
                    )
                except Exception as e:
                    frappe.log_error(
                        title="KOT Publish Failed",
                        message=f"Ticket: {ticket.name}, Error: {str(e)}"
                    )
        
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
        if not StateManager.is_valid_state(new_state):
            frappe.throw(_("Invalid KOT state: {0}").format(new_state))
        
        user = user or frappe.session.user
        item = frappe.get_doc("KOT Item", kot_item)

        # Get ticket and validate it's not cancelled
        ticket = frappe.get_doc("KOT Ticket", item.parent)
        if ticket.workflow_state == StateManager.STATES["CANCELLED"]:
            frappe.throw(_("Cannot update item state for a cancelled KOT"))

        # Validate state transition using StateManager
        old_state = item.workflow_state
        if new_state == old_state:
            return {
                "kot_item": item.name,
                "ticket": ticket.name,
                "old_state": old_state,
                "new_state": new_state,
            }

        StateManager.validate_item_transition(old_state, new_state)

        # Update item state
        item.workflow_state = new_state
        item.last_edited_by = user
        item.save()
        
        # Update corresponding POS Order Item counters
        if item.pos_order_item:
            self._update_pos_item_counter(item.pos_order_item, new_state)
        
        # Update ticket state if all items are in the same state
        self._update_ticket_state_if_needed(ticket.name)
        
        # Send realtime updates using KOTPublisher
        KOTPublisher.publish_item_update(item, ticket)
        
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
        if not StateManager.is_valid_state(new_state):
            frappe.throw(_("Invalid KOT state: {0}").format(new_state))
        
        user = user or frappe.session.user
        ticket = frappe.get_doc("KOT Ticket", kot_ticket)

        # Validate state transition using StateManager
        current_state = ticket.workflow_state
        StateManager.validate_ticket_transition(current_state, new_state)

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
        
        # Send realtime updates using KOTPublisher
        changed_items = [frappe.get_doc("KOT Item", name) for name in updated_items]
        KOTPublisher.publish_ticket_update(
            ticket,
            event_type="kot_updated",
            changed_items=changed_items,
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
            kitchen = item.get("kitchen")

            # If no station specified, try to get default from item master
            if not station or not kitchen:
                item_defaults = frappe.db.get_value(
                    "Item",
                    item.item,
                    ["default_kitchen_station", "default_kitchen"],
                    as_dict=1
                ) or {}

                default_station = (
                    item_defaults.get("default_kitchen_station")
                    if isinstance(item_defaults, dict)
                    else getattr(item_defaults, "default_kitchen_station", None)
                )
                default_kitchen = (
                    item_defaults.get("default_kitchen")
                    if isinstance(item_defaults, dict)
                    else getattr(item_defaults, "default_kitchen", None)
                )

                if not kitchen and default_kitchen:
                    kitchen = default_kitchen

                if not station and default_station:
                    station = default_station

            # Try to map station/kitchen from menu category when still missing
            if (not station or not kitchen) and getattr(item, "item", None):
                mapped_kitchen, mapped_station = get_menu_category_kitchen_station(item.item)

                if not kitchen and mapped_kitchen:
                    kitchen = mapped_kitchen

                if not station and mapped_station:
                    station = mapped_station

            # If still no station, use default kitchen's default station
            if not station and kitchen:
                kitchen_doc = frappe.get_doc("Kitchen", kitchen)
                station = getattr(kitchen_doc, "default_station", None)

            # If still no station, try to find any existing kitchen station
            if not station:
                # First try to find station from branch
                branch = getattr(self.pos_order, "branch", None) if self.pos_order else None
                if branch:
                    station = frappe.db.get_value(
                        "Kitchen Station", 
                        {"branch": branch}, 
                        "name"
                    )
                
                # If still nothing, get any active kitchen station
                if not station:
                    station = frappe.db.get_value(
                        "Kitchen Station", 
                        {"is_active": 1}, 
                        "name"
                    )
                
                # Last resort: get first kitchen station
                if not station:
                    station = frappe.db.get_value("Kitchen Station", {}, "name")
                
                # If no station exists, station will be None
                # This will be handled in create_kot_from_order

            # Ensure the item reflects any resolved routing
            if kitchen and not item.get("kitchen"):
                if isinstance(item, dict):
                    item["kitchen"] = kitchen
                else:
                    setattr(item, "kitchen", kitchen)

            if station and not item.get("kitchen_station"):
                if isinstance(item, dict):
                    item["kitchen_station"] = station
                else:
                    setattr(item, "kitchen_station", station)

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
        # Just create the doc without insert - will be handled by _create_kot_ticket_with_items
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
        
        return kot_ticket
    
    def _create_kot_ticket_with_items(
        self, 
        pos_order: Dict, 
        station: str, 
        station_items: List[Dict]
    ) -> Tuple[Dict, List[Dict]]:
        """
        Create a KOT Ticket with its items in a single transaction.
        Items must be added before insert since items field is mandatory.
        
        Args:
            pos_order: POS Order document
            station: Kitchen station for this ticket
            station_items: List of POS Order Items for this station
            
        Returns:
            Tuple of (KOT Ticket document, list of KOT Item dicts)
        """
        # Create the ticket doc (without insert)
        kot_ticket = self._create_kot_ticket(pos_order, station)
        
        # Add items to the ticket before insert
        kot_items = []
        for item in station_items:
            # Get item details
            item_details = frappe.db.get_value(
                "Item", 
                item.item, 
                ["item_name", "description"], 
                as_dict=1
            ) or {}
            
            kot_ticket.append("items", {
                "item_code": item.item,
                "item_name": item_details.get("item_name", item.item),
                "description": item_details.get("description", ""),
                "qty": item.qty,
                "notes": item.get("notes", ""),
                "pos_order_item": item.name,
                "workflow_state": self.STATES["QUEUED"]
            })
            kot_items.append(item)
        
        # Now insert the ticket with items
        kot_ticket.insert()
        
        # Update counters in POS Order Items
        for station_item in station_items:
            counters_str = station_item.get("counters") or "{}"
            counters = frappe.parse_json(counters_str) if isinstance(counters_str, str) else counters_str
            counters["sent"] = str(now_datetime())
            
            frappe.db.set_value(
                "POS Order Item", 
                station_item.name, 
                {
                    "counters": frappe.as_json(counters),
                    "last_edited_by": frappe.session.user
                }
            )
        
        return kot_ticket, kot_items
    
    def _create_kot_items(self, kot_ticket: str, items: List[Dict]) -> List[Dict]:
        """
        Create KOT Items for a ticket (legacy method, kept for compatibility)
        
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
        
        # Get KOT states
        kot_states = [ticket.workflow_state for ticket in tickets]
        
        # Use StateManager to determine new POS Order state
        new_pos_state = StateManager.get_pos_order_state_from_kots(kot_states)
        
        # Update POS Order if needed
        if StateManager.should_update_pos_order_state(
            frappe.db.get_value("POS Order", pos_order, "workflow_state"),
            new_pos_state
        ):
            frappe.db.set_value("POS Order", pos_order, "workflow_state", new_pos_state)
    
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

    def _ensure_default_kitchen_station(self, pos_order) -> Optional[str]:
        """
        Ensure a default Kitchen Station exists. If not, try to create one.
        
        Args:
            pos_order: POS Order document
            
        Returns:
            Name of the default Kitchen Station or None if cannot be created
        """
        # First try to find an existing station
        branch = pos_order.branch if pos_order else None
        
        # Try to find station from branch
        if branch:
            station = frappe.db.get_value(
                "Kitchen Station", 
                {"branch": branch}, 
                "name"
            )
            if station:
                return station
        
        # Try to find any active station
        station = frappe.db.get_value(
            "Kitchen Station", 
            {"is_active": 1}, 
            "name"
        )
        if station:
            return station
        
        # Try to find any station at all
        station = frappe.db.get_value("Kitchen Station", {}, "name")
        if station:
            return station
        
        # No station exists - try to auto-create one
        try:
            # First, ensure we have a Kitchen
            kitchen = frappe.db.get_value("Kitchen", {"is_active": 1}, "name")
            if not kitchen:
                kitchen = frappe.db.get_value("Kitchen", {}, "name")
            
            if not kitchen:
                # Create a default Kitchen first
                kitchen_doc = frappe.get_doc({
                    "doctype": "Kitchen",
                    "kitchen_name": "Main Kitchen",
                    "is_active": 1,
                    "branch": branch
                })
                kitchen_doc.insert(ignore_permissions=True)
                kitchen = kitchen_doc.name
                frappe.msgprint(
                    _("Default Kitchen 'Main Kitchen' has been created."),
                    alert=True
                )
            
            # Now create default Kitchen Station
            station_doc = frappe.get_doc({
                "doctype": "Kitchen Station",
                "station_name": "Main Station",
                "kitchen": kitchen,
                "is_active": 1,
                "branch": branch
            })
            station_doc.insert(ignore_permissions=True)
            frappe.db.commit()
            
            frappe.msgprint(
                _("Default Kitchen Station 'Main Station' has been created."),
                alert=True
            )
            
            return station_doc.name
            
        except Exception as e:
            frappe.log_error(
                title="Failed to create default Kitchen Station",
                message=f"Error: {str(e)}\n{frappe.get_traceback()}"
            )
            return None


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