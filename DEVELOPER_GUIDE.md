# Workflow Handler - Developer Quick Reference

## Class Locations & Purposes

### 1. StateManager
**Location:** `imogi_pos/utils/state_manager.py`

**Use when:** Managing state transitions, validating state changes, mapping KOT states to POS Order states

```python
from imogi_pos.utils.state_manager import StateManager

# Access states
state = StateManager.STATES["QUEUED"]  # "Queued"

# Validate transitions
StateManager.validate_item_transition("Queued", "In Progress")  # OK
StateManager.validate_item_transition("Served", "Ready")  # Throws error

# Determine POS Order state from KOT states
new_state = StateManager.get_pos_order_state_from_kots(["In Progress", "Ready"])
# Returns: "In Progress"
```

### 2. KOTPublisher
**Location:** `imogi_pos/utils/kot_publisher.py`

**Use when:** Publishing realtime events about KOT updates

```python
from imogi_pos.utils.kot_publisher import KOTPublisher

# Publish ticket update
ticket = frappe.get_doc("KOT Ticket", "KT-001")
KOTPublisher.publish_ticket_update(
    ticket,
    event_type="kot_updated",
    changed_items=[item1, item2]
)

# Publish item update
KOTPublisher.publish_item_update(item, ticket="KT-001")

# Publish creation/cancellation
KOTPublisher.publish_ticket_created(ticket)
KOTPublisher.publish_ticket_cancelled(ticket)
```

### 3. KOTService
**Location:** `imogi_pos/kitchen/kot_service.py`

**Use when:** Complex KOT operations (create from order, state updates, bulk operations)

```python
from imogi_pos.kitchen.kot_service import KOTService

service = KOTService()

# Create KOTs from a POS Order
result = service.create_kot_from_order("POS-001", selected_items=None)

# Update KOT item state
result = service.update_kot_item_state("KI-001", "Ready")

# Update entire KOT ticket state
result = service.update_kot_ticket_state("KT-001", "Ready")

# Bulk update multiple items
result = service.bulk_update_kot_items(["KI-001", "KI-002"], "Ready")

# Cancel KOT
result = service.cancel_kot_ticket("KT-001", reason="Out of stock")
```

---

## Common Patterns

### Pattern 1: Validate and Update State
```python
from imogi_pos.utils.state_manager import StateManager

current_state = doc.workflow_state
new_state = "Ready"

# This will throw if transition is invalid
StateManager.validate_ticket_transition(current_state, new_state)

# Safe to update
doc.workflow_state = new_state
doc.save()
```

### Pattern 2: Publish Updates After State Change
```python
from imogi_pos.utils.kot_publisher import KOTPublisher

# After updating ticket
ticket = frappe.get_doc("KOT Ticket", "KT-001")
ticket.workflow_state = "In Progress"
ticket.save()

# Publish the change
KOTPublisher.publish_ticket_update(ticket)
```

### Pattern 3: Map KOT States to POS Order State
```python
from imogi_pos.utils.state_manager import StateManager

tickets = frappe.get_all("KOT Ticket", 
    filters={"pos_order": "POS-001"},
    fields=["workflow_state"]
)

kot_states = [t.workflow_state for t in tickets]
new_pos_state = StateManager.get_pos_order_state_from_kots(kot_states)

if new_pos_state:
    frappe.db.set_value("POS Order", "POS-001", 
                        "workflow_state", new_pos_state)
```

---

## State Transition Rules

### KOT Item States
```
Queued → [In Progress, Cancelled]
In Progress → [Ready, Cancelled]
Ready → [Served, Cancelled]
Served → (terminal)
Cancelled → (terminal)
```

### KOT Ticket States
```
Queued → [In Progress, Ready, Served, Cancelled]
In Progress → [Ready, Served, Cancelled, Queued]
Ready → [Served, Cancelled, In Progress]
Served → (terminal)
Cancelled → (terminal)
```

### POS Order State (From KOT states)
```
All Cancelled → Cancelled
All Served → Served
Any Ready + None Queued/In Progress → Ready
Any In Progress → In Progress
All Queued → Draft
```

---

## Event Publishing Channels

When you publish a KOT update, it goes to:

1. **Kitchen Station:** `kitchen:station:{station_name}`
   - For kitchen display at specific station

2. **Kitchen:** `kitchen:{kitchen_name}`
   - For kitchen-wide display

3. **Table Service:** `table:{table_name}`
   - For table service/waiter display

4. **Floor Display:** `table_display:floor:{floor_name}`
   - For floor management display

---

## Debugging Tips

### Check if state transition is allowed
```python
from imogi_pos.utils.state_manager import StateManager

try:
    StateManager.validate_ticket_transition("Served", "Ready")
except frappe.ValidationError as e:
    print(f"Transition not allowed: {e}")
```

### Verify state constants
```python
from imogi_pos.utils.state_manager import StateManager

print(StateManager.STATES)
# Output:
# {
#   'QUEUED': 'Queued',
#   'IN_PROGRESS': 'In Progress',
#   'READY': 'Ready',
#   'SERVED': 'Served',
#   'CANCELLED': 'Cancelled'
# }
```

### Test POS Order state mapping
```python
from imogi_pos.utils.state_manager import StateManager

states = ["In Progress", "Ready", "Queued"]
result = StateManager.get_pos_order_state_from_kots(states)
print(result)  # Output: "In Progress"
```

---

## Important Notes

⚠️ **Always use StateManager for state validation**
- Never hardcode state strings in conditions
- Always call validation before state transitions
- StateManager is the single source of truth

⚠️ **Always publish updates after changes**
- KOTPublisher handles all channels
- Don't manually publish to frappe.publish_realtime
- Use appropriate method: `publish_ticket_update()`, `publish_item_update()`, etc.

⚠️ **KOTService handles all complex workflows**
- Use service for order creation, bulk updates, cancellations
- Service automatically handles state validation and publishing
- Don't bypass service with direct document updates

---

## API Endpoints (in api/kot.py)

```python
@frappe.whitelist()
def start_preparing_kot_ticket(kot_ticket)
def mark_kot_ticket_ready(kot_ticket)
def mark_kot_ticket_served(kot_ticket)
def return_kot_ticket_to_queue(kot_ticket)
def return_kot_ticket_to_kitchen(kot_ticket)
def cancel_kot_ticket(kot_ticket)
def update_kot_status(kot_ticket, state)
def update_kot_item_state(kot_item, state)
```

All of these use `_apply_ticket_state_change()` which validates and publishes automatically.

---

## Migration Checklist

If you're updating old code to use new managers:

- [ ] Replace state dict definitions with `StateManager.STATES`
- [ ] Replace state validation logic with `StateManager.validate_*()`
- [ ] Replace publishing calls with `KOTPublisher` methods
- [ ] Remove old `_publish_*()` methods
- [ ] Remove old state mapping logic
- [ ] Update imports in your file
- [ ] Test state transitions work correctly
- [ ] Test events are published to right channels
- [ ] Verify POS Order state updates correctly
