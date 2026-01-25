# Kitchen UI - Workflow, State Management & Cancellation Guide

> **Panduan lengkap untuk memahami rule handling, flow, state management, dan cancellation workflow pada Kitchen UI**

---

## 📋 Table of Contents

1. [Workflow States Overview](#workflow-states-overview)
2. [State Transition Rules](#state-transition-rules)
3. [Kitchen UI Flow](#kitchen-ui-flow)
4. [Waiter Workflow & Kitchen Integration](#waiter-workflow--kitchen-integration)
5. [Waiter-Cashier Handoff Flow](#waiter-cashier-handoff-flow)
6. [Cancellation Workflow](#cancellation-workflow)
7. [State Synchronization](#state-synchronization)
8. [UI Components & Interaction](#ui-components--interaction)
9. [Backend Services](#backend-services)
10. [Error Handling](#error-handling)

---

## 🔄 Workflow States Overview

### KOT (Kitchen Order Ticket) States

Sistem menggunakan **5 workflow states** yang dikelola secara terpusat oleh `StateManager`:

```python
# imogi_pos/utils/state_manager.py
STATES = {
    "QUEUED": "Queued",          # ⏳ Order baru masuk, menunggu
    "IN_PROGRESS": "In Progress", # 👨‍🍳 Sedang diproses di kitchen
    "READY": "Ready",             # ✅ Siap disajikan
    "SERVED": "Served",           # 🍽️ Sudah disajikan ke customer
    "CANCELLED": "Cancelled"      # ❌ Dibatalkan
}
```

### Visual State Flow

```
┌──────────┐
│  Queued  │ ← Order baru dari waiter
└────┬─────┘
     │
     ↓
┌──────────────┐
│ In Progress  │ ← Kitchen staff mulai masak
└──────┬───────┘
       │
       ↓
┌──────────┐
│  Ready   │ ← Makanan siap
└────┬─────┘
     │
     ↓
┌──────────┐
│  Served  │ ← Diantar ke customer
└──────────┘

     ❌ Cancelled ← Bisa dari state manapun (dengan permission)
```

---

## 🎯 State Transition Rules

### 1. **KOT Item Transitions**

Aturan transisi untuk **individual item** dalam KOT:

```python
# imogi_pos/utils/state_manager.py
ALLOWED_ITEM_TRANSITIONS = {
    "Queued": {
        "In Progress",  # ✅ Start preparing
        "Cancelled"     # ❌ Cancel item
    },
    "In Progress": {
        "Ready",        # ✅ Mark as ready
        "Cancelled"     # ❌ Cancel item
    },
    "Ready": {
        "Served",       # ✅ Serve to customer
        "Cancelled"     # ❌ Cancel item
    },
    "Served": set(),    # 🔒 Final state - tidak bisa diubah
    "Cancelled": set()  # 🔒 Final state - tidak bisa diubah
}
```

**Validasi:**
```python
# Contoh - tidak bisa langsung dari Queued ke Ready
"Queued" → "Ready"  # ❌ DITOLAK
"Queued" → "In Progress" → "Ready"  # ✅ VALID
```

### 2. **KOT Ticket Transitions**

Aturan transisi untuk **keseluruhan ticket**:

```python
ALLOWED_TICKET_TRANSITIONS = {
    "Queued": {
        "In Progress",
        "Ready",
        "Served",
        "Cancelled"
    },
    "In Progress": {
        "Ready",
        "Served",
        "Cancelled",
        "Queued"        # ⬅️ Bisa kembali ke queue
    },
    "Ready": {
        "Served",
        "Cancelled",
        "In Progress"   # ⬅️ Bisa kembali ke kitchen
    },
    "Served": set(),    # 🔒 Final state
    "Cancelled": set()  # 🔒 Final state
}
```

**Fitur Khusus:**
- **Return to Queue:** Dari `In Progress` bisa kembali ke `Queued` (misalnya ada masalah)
- **Return to Kitchen:** Dari `Ready` bisa kembali ke `In Progress` (misalnya ada revisi)

### 3. **State Normalization**

Kitchen UI menormalkan berbagai input status ke canonical values:

```javascript
// imogi_pos/public/js/kitchen_display.js
normalizeWorkflowState(status) {
    const normalized = String(status).trim().toLowerCase()
    
    switch (normalized) {
        case 'queued':
        case 'queue':
        case 'waiting':
        case 'pending':
        case 'new':
            return 'Queued'
            
        case 'in progress':
        case 'preparing':
        case 'processing':
        case 'in preparation':
            return 'In Progress'
            
        case 'ready':
        case 'completed':
        case 'done':
            return 'Ready'
            
        case 'served':
        case 'serve':
            return 'Served'
            
        case 'cancelled':
        case 'canceled':
        case 'void':
            return 'Cancelled'
            
        default:
            return 'Queued'
    }
}
```

---

## 🏪 Kitchen UI Flow

### Entry Point Flow

```
1. Waiter membuat order di table
   └─→ POS Order (workflow_state: "Draft")

2. Waiter click [Send to Kitchen]
   └─→ Order.workflow_state: "Draft" → "Submitted"
   └─→ KOT Ticket dibuat (workflow_state: "Queued")
   └─→ Realtime event: 'kot_created'

3. Kitchen Display menerima realtime event
   └─→ KOT muncul di UI section "Queued"
   └─→ Sound notification: 'new_kot'
   └─→ Visual highlight
```

### Kitchen Staff Interaction Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Kitchen Display UI                    │
├──────────────┬──────────────┬──────────────┬────────────┤
│   QUEUED     │ IN PROGRESS  │    READY     │  (SERVED)  │
├──────────────┼──────────────┼──────────────┼────────────┤
│              │              │              │            │
│  ┌────────┐  │  ┌────────┐  │  ┌────────┐  │            │
│  │ KOT-01 │  │  │ KOT-02 │  │  │ KOT-03 │  │            │
│  │ Table:T1│  │  │ Table:T2│  │  │ Table:T3│  │            │
│  │ Items: 3│  │  │ Items: 2│  │  │ Items: 1│  │            │
│  │ [Start] │  │  │ [Ready] │  │  │ [Serve] │  │            │
│  └────────┘  │  └────────┘  │  └────────┘  │            │
│              │              │              │            │
└──────────────┴──────────────┴──────────────┴────────────┘

User Actions:
1. Click [Start] → KOT moves to "IN PROGRESS"
2. Click [Ready] → KOT moves to "READY"
3. Click [Serve] → KOT disappears (state: "SERVED")
```

### Detailed Action Flow

#### 1. **Start Preparing (Queued → In Progress)**

```javascript
// User clicks [Start Preparing] button
handleActionButtonClick(event) {
    const action = 'start'
    const kotName = 'KOT-00001'
    
    // Call API
    this.updateKotWorkflowState(kotName, 'In Progress')
}

// Backend call
frappe.call({
    method: 'imogi_pos.api.kot.update_kot_status',
    args: {
        kot_ticket: 'KOT-00001',
        state: 'In Progress'
    },
    callback: (response) => {
        // Update local state
        this.updateKotStatus(kotName, 'In Progress')
        
        // UI updates automatically via state observation
    }
})
```

**Backend Processing:**
```python
# imogi_pos/api/kot.py
@frappe.whitelist()
def update_kot_status(kot_ticket, state):
    # 1. Validate state transition
    StateManager.validate_ticket_transition(current_state, state)
    
    # 2. Update ticket & all items
    ticket.workflow_state = state
    for item in ticket.items:
        item.workflow_state = state
    
    # 3. Update POS Order state if needed
    _update_pos_order_state_if_needed(ticket.pos_order)
    
    # 4. Publish realtime update
    KOTPublisher.publish_ticket_update(ticket, event_type="kot_updated")
    
    return {"success": True, "new_state": state}
```

#### 2. **Mark Ready (In Progress → Ready)**

```javascript
// User clicks [Mark Ready] button
this.updateKotWorkflowState(kotName, 'Ready')

// KOT moves from "preparing" column to "ready" column
updateKotStatus(kotName, 'Ready') {
    // Find KOT in current state
    let kot = this.state.kots.preparing.find(k => k.name === kotName)
    
    // Update status
    kot.workflow_state = 'Ready'
    
    // Sync all items to match ticket state
    this.syncKotItemsWithStatus(kot, 'Ready')
    
    // Move to new column
    this.state.kots.preparing = this.state.kots.preparing.filter(k => k.name !== kotName)
    this.state.kots.ready.push(kot)
    
    // Re-render UI
    this.renderUI()
}
```

**Item Synchronization:**
```javascript
syncKotItemsWithStatus(kot, workflowState) {
    kot.items.forEach(item => {
        const currentStatus = item.workflow_state
        let nextStatus = null
        
        switch (workflowState) {
            case 'Ready':
                if (!['Ready', 'Served', 'Cancelled'].includes(currentStatus)) {
                    nextStatus = 'Ready'
                }
                break
            // ... other cases
        }
        
        if (nextStatus && nextStatus !== currentStatus) {
            item.status = nextStatus
            item.workflow_state = nextStatus
            updated = true
        }
    })
    
    return updated
}
```

#### 3. **Mark Served (Ready → Served)**

```javascript
// User clicks [Mark Served] button
this.updateKotWorkflowState(kotName, 'Served')

// KOT removed from display (final state)
updateKotStatus(kotName, 'Served') {
    // "Served" is a final state - remove from display
    this.removeKotFromState(kotName)
    
    // Show toast notification
    this.showToast(`KOT ${kotName} marked as served`)
}
```

---👨‍🍳 Waiter Workflow & Kitchen Integration

### Complete Waiter Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   WAITER ORDER LIFECYCLE                         │
└─────────────────────────────────────────────────────────────────┘

1. Table Selection
   └─→ Via Table Display or Direct URL

2. Create/Load Order
   └─→ POS Order (state: Draft)
   └─→ Table marked as "Occupied"

3. Add Items
   └─→ Select items from menu
   └─→ Choose variants
   └─→ Add notes/instructions

4. Send to Kitchen ⭐ CRITICAL POINT
   └─→ Creates KOT Ticket(s)
   └─→ Order state: Draft → Submitted → To Bill
   └─→ Kitchen receives order

5. Kitchen Processes
   └─→ Queued → In Progress → Ready → Served
   └─→ Waiter can monitor status

6. Customer Ready to Pay
   └─→ Handoff to Cashier
   └─→ Cashier processes payment

7. Order Complete
   └─→ Table freed
   └─→ Order closed
```

### 1. **Table Selection & Order Creation**

#### Via Table Display (Recommended)

```javascript
// Waiter workflow starts here
// URL: /app/table-display

// User clicks table
handleTableClick(table) {
    // Check table status
    if (table.status === 'Available' || table.status === 'Occupied') {
        // Redirect to waiter order page
        window.location.href = `/waiter_order?table=${table.name}&floor=${table.floor}&pos_profile=${table.pos_profile}`
    }
}
```

**Backend API:**

```python
# imogi_pos/api/orders.py
@frappe.whitelist()
def open_or_create_for_table(table, floor=None, pos_profile=None):
    """Open existing order or create new one for table"""
    
    # 1. Check if table has active order
    existing_order = frappe.db.get_value(
        "POS Order",
        {
            "table": table,
            "workflow_state": ["not in", ["Completed", "Cancelled"]],
            "docstatus": ["<", 2]
        }
    )
    
    if existing_order:
        # Return existing order
        return frappe.get_doc("POS Order", existing_order)
    
    # 2. Create new order
    order = frappe.get_doc({
        "doctype": "POS Order",
        "table": table,
        "floor": floor,
        "order_type": "Dine In",
        "pos_profile": pos_profile,
        "branch": frappe.db.get_value("POS Profile", pos_profile, "imogi_branch"),
        "workflow_state": "Draft",
        "user": frappe.session.user
    })
    order.insert()
    
    # 3. Update table status
    frappe.db.set_value("Restaurant Table", table, {
        "status": "Occupied",
        "current_pos_order": order.name
    })
    
    return order
```

### 2. **Add Items to Order**

```javascript
// Waiter interface - Add item with variants
addItemToOrder(item) {
    // 1. Check if item has variants
    if (item.has_variants) {
        this.showVariantDialog(item)
    } else {
        this.addToCart(item)
    }
}

showVariantDialog(item) {
    // Show variant selection modal
    // User selects variant attributes
    // Then call addToCart with selected variant
}

addToCart(item, variant = null, notes = '') {
    const cartItem = {
        item: variant || item.name,
        item_name: item.item_name,
        qty: 1,
        rate: item.rate,
        notes: notes,
        // Kitchen routing info
        default_kitchen: item.default_kitchen,
        default_kitchen_station: item.default_kitchen_station
    }
    
    this.cart.push(cartItem)
    this.updateCartDisplay()
}
```

### 3. **Send to Kitchen** ⭐ CRITICAL

**UI Button:**

```javascript
// Waiter interface
sendToKitchen() {
    if (!this.cart.length) {
        frappe.msgprint('No items to send to kitchen')
        return
    }
    
    // Save order first
    this.saveOrder().then(() => {
        // Create KOT
        frappe.call({
            method: 'imogi_pos.api.kot.create_kot_from_order',
            args: {
                pos_order: this.orderName,
                send_to_kitchen: true
            },
            callback: (response) => {
                if (response.message.success) {
                    frappe.msgprint('Order sent to kitchen successfully')
                    
                    // Update UI
                    this.updateOrderStatus()
                    this.disableSentItems()
                }
            }
        })
    })
}
```

**Backend Processing:**

```python
# imogi_pos/api/kot.py
@frappe.whitelist()
def create_kot_from_order(pos_order, send_to_kitchen=True):
    """Create KOT tickets from POS Order"""
    
    service = KOTService()
    result = service.create_kot_from_order(
        pos_order=pos_order,
        send_to_kitchen=send_to_kitchen
    )
    
    # Update POS Order workflow state
    order = frappe.get_doc("POS Order", pos_order)
    if order.workflow_state == "Draft":
        order.workflow_state = "Submitted"
        order.save()
    
    return result
```

**KOT Service Implementation:**

```python
# imogi_pos/kitchen/kot_service.py
def create_kot_from_order(self, pos_order, selected_items=None, send_to_kitchen=True):
    """Create KOT from order items"""
    
    # 1. Get order
    if isinstance(pos_order, str):
        pos_order = frappe.get_doc("POS Order", pos_order)
    
    # 2. Get items to process
    items_to_process = []
    for item in pos_order.items:
        # Skip already sent items
        if item.get("counters") and item.counters.get("sent"):
            continue
        items_to_process.append(item)
    
    # 3. Group by kitchen station
    grouped_items = self._group_items_by_station(items_to_process)
    
    # 4. Create KOT ticket per station
    tickets = []
    for station, station_items in grouped_items.items():
        # Create ticket
        ticket = self._create_kot_ticket(pos_order, station)
        
        # Create items
        kot_items = self._create_kot_items(ticket.name, station_items)
        
        # Update POS Order item counters
        for kot_item, pos_item in zip(kot_items, station_items):
            self._update_pos_item_counter(pos_item.name, "Queued")
        
        tickets.append(ticket)
        
        # 5. Publish to kitchen display
        if send_to_kitchen:
            KOTPublisher.publish_ticket_update(
                ticket,
                event_type="kot_created"
            )
    
    return {
        "success": True,
        "tickets": [t.name for t in tickets],
        "message": f"Created {len(tickets)} KOT ticket(s)"
    }
```

**Item Grouping by Station:**

```python
def _group_items_by_station(self, items):
    """Group items by kitchen station"""
    
    grouped = {}
    
    for item in items:
        # Get kitchen routing
        kitchen, station = self._get_item_kitchen_station(item)
        
        # Group key
        key = f"{kitchen}::{station}"
        
        if key not in grouped:
            grouped[key] = {
                "kitchen": kitchen,
                "station": station,
                "items": []
            }
        
        grouped[key]["items"].append(item)
    
    return grouped

def _get_item_kitchen_station(self, item):
    """Get kitchen and station for an item"""
    
    # Priority 1: Item default settings
    if item.get("default_kitchen"):
        return item.default_kitchen, item.get("default_kitchen_station")
    
    # Priority 2: Menu category routing
    category = frappe.db.get_value("Item", item.item, "item_group")
    routing = get_menu_category_kitchen_station(category)
    
    if routing:
        return routing["kitchen"], routing["station"]
    
    # Priority 3: Default from POS Profile
    pos_profile = frappe.db.get_value("POS Order", item.parent, "pos_profile")
    default_kitchen = frappe.db.get_value(
        "POS Profile", pos_profile, "default_kitchen"
    )
    
    return default_kitchen, None
```

### 4. **Kitchen Display Updates**

```javascript
// Kitchen Display receives realtime event
// imogi_pos/public/js/kitchen_display.js

// Subscribe to kitchen channel
frappe.realtime.on('kitchen:Main Kitchen', (data) => {
    if (data.event_type === 'kot_created') {
        // New KOT from waiter
        const kot = data.kot
        
        // Add to queued section
        this.state.kots.queued.push(kot)
        
        // Play notification sound
        this.playSound('new_kot')
        
        // Visual highlight
        this.highlightNewKot(kot.name)
        
        // Re-render UI
        this.renderUI()
    }
})
```

**KOT Display Structure:**

```javascript
renderKotCard(kot) {
    return `
        <div class="kot-card" data-kot="${kot.name}">
            <div class="kot-header">
                <span class="kot-number">${kot.name}</span>
                <span class="kot-table">Table: ${kot.table || 'Counter'}</span>
                <span class="kot-time">${this.getElapsedTime(kot.creation)}</span>
            </div>
            
            <div class="kot-items">
                ${kot.items.map(item => `
                    <div class="kot-item">
                        <span class="qty">${item.qty}x</span>
                        <span class="name">${item.item_name}</span>
                        ${item.notes ? `
                            <div class="notes">📝 ${item.notes}</div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
            
            <div class="kot-actions">
                <button class="btn-primary" 
                        onclick="kitchenDisplay.startPreparing('${kot.name}')">
                    Start Preparing
                </button>
            </div>
        </div>
    `
}
```

### 5. **Monitor Kitchen Status (Waiter Side)**

```javascript
// Waiter can see kitchen status in their interface
updateKitchenStatus() {
    // Subscribe to order-specific updates
    frappe.realtime.on(`pos_order:${this.orderName}`, (data) => {
        if (data.event_type === 'kot_updated') {
            this.updateItemStatuses(data.kot)
        }
    })
}

updateItemStatuses(kot) {
    // Update item badges in waiter UI
    kot.items.forEach(kotItem => {
        const cartItem = this.cart.find(i => i.name === kotItem.pos_order_item)
        if (cartItem) {
            cartItem.kitchen_status = kotItem.workflow_state
            this.updateItemBadge(cartItem)
        }
    })
}

updateItemBadge(item) {
    const badge = document.querySelector(`[data-item="${item.name}"] .status-badge`)
    
    if (badge) {
        badge.className = `status-badge ${this.getStatusClass(item.kitchen_status)}`
        badge.textContent = this.getStatusLabel(item.kitchen_status)
    }
}

getStatusClass(status) {
    const classes = {
        'Queued': 'badge-warning',
        'In Progress': 'badge-info',
        'Ready': 'badge-success',
        'Served': 'badge-primary'
    }
    return classes[status] || 'badge-secondary'
}
```

**Waiter UI Display:**

```html
<!-- Cart item with kitchen status -->
<div class="cart-item" data-item="ITEM-001">
    <div class="item-details">
        <span class="qty">2x</span>
        <span class="name">Nasi Goreng</span>
        <span class="status-badge badge-info">In Progress</span>
    </div>
    <div class="item-notes">Extra pedas</div>
</div>
```

### 6. **Add More Items After KOT**

```javascript
// Waiter can add more items even after sending to kitchen
addMoreItems() {
    // Add new items to cart
    this.addItemToOrder(newItem)
    
    // Send new items to kitchen
    frappe.call({
        method: 'imogi_pos.api.kot.create_kot_from_order',
        args: {
            pos_order: this.orderName,
            selected_items: this.getNewItemsOnly(),  // Only new items
            send_to_kitchen: true
        },
        callback: (response) => {
            frappe.msgprint('Additional items sent to kitchen')
        }
    })
}

getNewItemsOnly() {
    // Return only items that haven't been sent to kitchen
    return this.cart
        .filter(item => !item.sent_to_kitchen)
        .map(item => item.name)
}
```

**Backend Handling:**

```python
# Only create KOT for items not yet sent
def create_kot_from_order(self, pos_order, selected_items=None):
    items_to_process = []
    
    for item in pos_order.items:
        # If specific items selected, check
        if selected_items and item.name not in selected_items:
            continue
        
        # Skip if already sent (has counter.sent > 0)
        if item.get("counters") and item.counters.get("sent"):
            continue
        
        items_to_process.append(item)
    
    # Create KOT for new items only
    # ...
```

### 7. **Waiter Permission & Capabilities**

```python
# imogi_pos/utils/role_permissions.py

# Waiter can do:
WAITER_PERMISSIONS = {
    "POS Order": {
        "read": True,
        "create": True,
        "write": True,  # Own orders only
        "cancel": False  # Requires manager approval
    },
    "KOT Ticket": {
        "read": True,
        "create": True,
        "write": False,  # Cannot modify KOT
        "cancel": False  # Cannot cancel KOT
    },
    "Restaurant Table": {
        "read": True,
        "write": False  # Cannot manually change table status
    },
    "Sales Invoice": {
        "read": False,    # Cannot see invoices
        "create": False,  # Cannot create invoices
        "write": False
    }
}

# Waiter cannot do:
WAITER_RESTRICTIONS = [
    "generate_invoice",      # Only cashier
    "process_payment",       # Only cashier
    "modify_rates",          # Only manager
    "apply_discounts",       # Only manager/cashier
    "close_pos_session",     # Only cashier
    "cancel_completed_order" # Only manager
]
```

---

## 💰 Waiter-Cashier Handoff Flow

### Complete Handoff Workflow

```
┌───────────────────────────────────────────────────────────────┐
│              WAITER → KITCHEN → CASHIER FLOW                   │
└───────────────────────────────────────────────────────────────┘

WAITER PHASE:
1. Take order from table
2. Send to kitchen
3. Monitor preparation
4. Serve food to customer
   └─→ Mark items as "Served" (optional)

KITCHEN PHASE:
5. Receive KOT (Queued)
6. Start preparing (In Progress)
7. Complete preparation (Ready)
8. Hand to waiter (Served)

HANDOFF TO CASHIER:
9. Customer requests bill
10. Waiter marks order as "Ready to Bill"
    └─→ OR verbally informs cashier

CASHIER PHASE:
11. Cashier opens Cashier Console
12. Sees order in "To Bill" list
13. Selects order
14. Reviews items & total
15. Generates invoice
16. Processes payment
17. Prints receipt
18. Order marked "Completed"

POST-COMPLETION:
19. Table status updated to "Available"
20. Waiter can use table for next customer
```

### 1. **Waiter Marks Order Ready for Billing**

#### Option A: Automatic (Based on Kitchen Status)

```python
# Automatic transition when all KOTs are served
def _update_pos_order_state_if_needed(self, pos_order):
    """Update POS Order based on KOT states"""
    
    # Get all KOTs
    tickets = frappe.get_all(
        "KOT Ticket",
        filters={"pos_order": pos_order},
        fields=["workflow_state"]
    )
    
    kot_states = [t.workflow_state for t in tickets]
    
    # If all KOTs are Served → Order is "To Bill"
    if all(state == "Served" for state in kot_states):
        frappe.db.set_value("POS Order", pos_order, "workflow_state", "To Bill")
        
        # Notify cashier
        publish_realtime(
            "cashier_console",
            {
                "event_type": "new_order_ready",
                "order": pos_order,
                "table": frappe.db.get_value("POS Order", pos_order, "table")
            }
        )
```

#### Option B: Manual (Waiter Button)

```javascript
// Waiter interface - Manual mark ready
markReadyForBilling() {
    frappe.confirm(
        'Mark this order as ready for billing?',
        () => {
            frappe.call({
                method: 'imogi_pos.api.orders.mark_ready_for_billing',
                args: { pos_order: this.orderName },
                callback: (response) => {
                    if (response.message.success) {
                        frappe.msgprint('Order marked ready for billing')
                        this.updateOrderStatus()
                    }
                }
            })
        }
    )
}
```

**Backend API:**

```python
@frappe.whitelist()
@require_permission("POS Order", "write")
def mark_ready_for_billing(pos_order):
    """Mark order ready for cashier"""
    
    order = frappe.get_doc("POS Order", pos_order)
    
    # Validate state
    if order.workflow_state not in ["Draft", "Submitted"]:
        frappe.throw(_("Order is already {0}").format(order.workflow_state))
    
    # Update state
    order.workflow_state = "To Bill"
    order.save()
    
    # Notify cashier console
    publish_realtime(
        f"branch:{order.branch}",
        {
            "event_type": "order_ready_for_billing",
            "order": order.as_dict(),
            "table": order.table
        }
    )
    
    return {"success": True, "workflow_state": "To Bill"}
```

### 2. **Cashier Console - Order List**

```python
# imogi_pos/api/billing.py
@frappe.whitelist()
@require_permission("POS Order", "read")
def list_orders_for_cashier(
    pos_profile=None, 
    branch=None, 
    workflow_state=None, 
    floor=None, 
    order_type=None
):
    """List orders ready for billing in cashier console"""
    
    # Build filters
    filters = {
        "branch": branch,
        "workflow_state": ["in", ["To Bill", "Ready"]]
    }
    
    if floor:
        filters["floor"] = floor
    
    if order_type:
        filters["order_type"] = order_type
    
    # Get orders
    orders = frappe.get_all(
        "POS Order",
        filters=filters,
        fields=[
            "name",
            "table",
            "floor",
            "order_type",
            "workflow_state",
            "grand_total",
            "creation",
            "modified"
        ],
        order_by="creation asc"
    )
    
    # Enrich with additional data
    for order in orders:
        # Get item count
        order["item_count"] = frappe.db.count(
            "POS Order Item",
            {"parent": order.name}
        )
        
        # Get table name if exists
        if order.table:
            order["table_name"] = frappe.db.get_value(
                "Restaurant Table",
                order.table,
                "table_name"
            )
        
        # Get KOT status summary
        kot_states = frappe.get_all(
            "KOT Ticket",
            filters={"pos_order": order.name},
            fields=["workflow_state"]
        )
        
        order["all_served"] = all(
            k.workflow_state == "Served" for k in kot_states
        )
    
    return orders
```

### 3. **Cashier Console UI**

```javascript
// Cashier Console - Display orders
renderOrdersList(orders) {
    const html = orders.map(order => `
        <div class="order-card ${order.all_served ? 'ready' : 'pending'}" 
             data-order="${order.name}"
             onclick="selectOrder('${order.name}')">
            
            <!-- Order Header -->
            <div class="order-header">
                <span class="order-number">${order.name}</span>
                ${order.table ? `
                    <span class="table-badge">
                        🍴 ${order.table_name || order.table}
                    </span>
                ` : `
                    <span class="counter-badge">💵 Counter</span>
                `}
            </div>
            
            <!-- Order Details -->
            <div class="order-details">
                <div class="detail-row">
                    <span>Items:</span>
                    <strong>${order.item_count}</strong>
                </div>
                <div class="detail-row">
                    <span>Total:</span>
                    <strong>Rp ${formatMoney(order.grand_total)}</strong>
                </div>
                <div class="detail-row">
                    <span>Time:</span>
                    <span>${getElapsedTime(order.creation)}</span>
                </div>
            </div>
            
            <!-- Kitchen Status -->
            <div class="kitchen-status">
                ${order.all_served ? `
                    <span class="badge-success">✅ All Served</span>
                ` : `
                    <span class="badge-warning">⏳ In Kitchen</span>
                `}
            </div>
            
            <!-- Actions -->
            <div class="order-actions">
                <button class="btn-primary" 
                        onclick="generateInvoice('${order.name}')">
                    Generate Invoice
                </button>
            </div>
        </div>
    `).join('')
    
    document.getElementById('orders-list').innerHTML = html
}
```

### 4. **Generate Invoice from Order**

```javascript
// Cashier action
generateInvoice(orderName) {
    // Confirm action
    frappe.confirm(
        'Generate invoice for this order?',
        () => {
            frappe.call({
                method: 'imogi_pos.api.billing.generate_invoice',
                args: {
                    pos_order: orderName,
                    pos_profile: this.posProfile,
                    user: frappe.session.user
                },
                callback: (response) => {
                    if (response.message) {
                        const invoice = response.message
                        
                        // Show payment dialog
                        this.showPaymentDialog(invoice)
                        
                        // Remove from order list
                        this.removeOrderFromList(orderName)
                    }
                },
                error: (error) => {
                    frappe.msgprint({
                        title: 'Error',
                        message: error.message,
                        indicator: 'red'
                    })
                }
            })
        }
    )
}
```

**Backend Invoice Generation:**

```python
# imogi_pos/api/billing.py
@frappe.whitelist()
@require_permission("Sales Invoice", "create")
def generate_invoice(pos_order, pos_profile, user=None):
    """Generate Sales Invoice from POS Order"""
    
    # 1. Get POS Order
    order = frappe.get_doc("POS Order", pos_order)
    
    # 2. Validate state
    if order.workflow_state not in ["To Bill", "Ready"]:
        frappe.throw(
            _("Cannot generate invoice for order in {0} state").format(
                order.workflow_state
            )
        )
    
    # 3. Check if invoice already exists
    existing_invoice = frappe.db.get_value(
        "Sales Invoice",
        {"pos_order": pos_order, "docstatus": ["<", 2]}
    )
    
    if existing_invoice:
        return frappe.get_doc("Sales Invoice", existing_invoice)
    
    # 4. Create Sales Invoice
    invoice = frappe.get_doc({
        "doctype": "Sales Invoice",
        "customer": order.customer or "Walk-in Customer",
        "pos_order": pos_order,
        "pos_profile": pos_profile,
        "branch": order.branch,
        "is_pos": 1,
        "due_date": today(),
        "posting_date": today(),
        "posting_time": now_datetime().strftime("%H:%M:%S")
    })
    
    # 5. Copy items from POS Order
    for item in order.items:
        invoice.append("items", {
            "item_code": item.item,
            "item_name": item.item_name,
            "qty": item.qty,
            "rate": item.rate,
            "amount": item.amount,
            "warehouse": item.warehouse,
            "uom": item.uom
        })
    
    # 6. Copy taxes
    for tax in order.taxes:
        invoice.append("taxes", tax.as_dict())
    
    # 7. Calculate totals
    invoice.run_method("calculate_taxes_and_totals")
    
    # 8. Insert invoice
    invoice.insert()
    
    # 9. Update POS Order
    order.workflow_state = "Billed"
    order.sales_invoice = invoice.name
    order.save()
    
    return invoice
```

### 5. **Process Payment**

```javascript
// Payment dialog
showPaymentDialog(invoice) {
    this.currentInvoice = invoice
    
    // Show payment modal
    const modal = this.paymentModal
    modal.find('.invoice-number').text(invoice.name)
    modal.find('.invoice-total').text(formatMoney(invoice.grand_total))
    
    // Reset payment inputs
    this.paymentAmount = 0
    this.paymentMethod = 'Cash'
    
    modal.modal('show')
}

processPayment() {
    const invoice = this.currentInvoice
    const amount = this.paymentAmount
    const method = this.paymentMethod
    
    // Validate amount
    if (amount < invoice.grand_total) {
        frappe.msgprint('Payment amount is less than total')
        return
    }
    
    // Submit payment
    frappe.call({
        method: 'imogi_pos.api.billing.submit_payment',
        args: {
            sales_invoice: invoice.name,
            mode_of_payment: method,
            amount_paid: amount
        },
        callback: (response) => {
            if (response.message.success) {
                // Calculate change
                const change = amount - invoice.grand_total
                
                // Show receipt
                this.printReceipt(invoice, amount, change)
                
                // Close payment modal
                this.paymentModal.modal('hide')
                
                // Refresh order list
                this.refreshOrderList()
            }
        }
    })
}
```

**Backend Payment Processing:**

```python
@frappe.whitelist()
@require_permission("Sales Invoice", "write")
def submit_payment(sales_invoice, mode_of_payment, amount_paid):
    """Submit payment for invoice"""
    
    # 1. Get invoice
    invoice = frappe.get_doc("Sales Invoice", sales_invoice)
    
    # 2. Add payment entry
    invoice.append("payments", {
        "mode_of_payment": mode_of_payment,
        "amount": amount_paid
    })
    
    # 3. Set paid amount
    invoice.paid_amount = amount_paid
    invoice.change_amount = amount_paid - invoice.grand_total
    
    # 4. Submit invoice
    invoice.submit()
    
    # 5. Update POS Order
    pos_order = invoice.pos_order
    if pos_order:
        frappe.db.set_value("POS Order", pos_order, {
            "workflow_state": "Completed",
            "payment_status": "Paid"
        })
        
        # 6. Free table
        table = frappe.db.get_value("POS Order", pos_order, "table")
        if table:
            frappe.db.set_value("Restaurant Table", table, {
                "status": "Available",
                "current_pos_order": None
            })
    
    return {
        "success": True,
        "invoice": invoice.name,
        "change": invoice.change_amount
    }
```

### 6. **Order State Timeline**

```
COMPLETE LIFECYCLE WITH ROLES:

1. Draft (Waiter)
   └─→ Waiter creates order
   └─→ Adds items
   
2. Submitted (Waiter)
   └─→ Waiter clicks "Send to Kitchen"
   └─→ KOT created
   
3. Kitchen Processing (Kitchen Staff)
   └─→ Queued → In Progress → Ready → Served
   
4. To Bill (Automatic/Waiter)
   └─→ All items served
   └─→ OR waiter marks ready
   
5. Billed (Cashier)
   └─→ Cashier generates invoice
   
6. Completed (Cashier)
   └─→ Payment processed
   └─→ Table freed
   └─→ Receipt printed
```

### 7. **Realtime Synchronization**

```javascript
// Subscribe to updates across all roles

// Waiter - Monitors kitchen status
frappe.realtime.on(`pos_order:${orderName}`, (data) => {
    if (data.event_type === 'kot_updated') {
        // Update item statuses in waiter UI
        updateKitchenStatus(data.kot)
    }
    
    if (data.event_type === 'order_billed') {
        // Cashier has generated invoice
        showBilledNotification()
    }
})

// Kitchen - Receives new orders
frappe.realtime.on(`kitchen:${kitchenName}`, (data) => {
    if (data.event_type === 'kot_created') {
        // New order from waiter
        addKotToQueue(data.kot)
        playNotificationSound()
    }
})

// Cashier - New orders ready for billing
frappe.realtime.on(`branch:${branchName}`, (data) => {
    if (data.event_type === 'order_ready_for_billing') {
        // Order ready from waiter/kitchen
        addToOrderList(data.order)
        playNotificationSound()
    }
})
```

### 8. **Error Handling & Validation**

```python
# Validation before handoff
def validate_order_for_billing(pos_order):
    """Validate order is ready for billing"""
    
    order = frappe.get_doc("POS Order", pos_order)
    errors = []
    
    # Check has items
    if not order.items:
        errors.append("Order has no items")
    
    # Check KOT status
    kots = frappe.get_all(
        "KOT Ticket",
        filters={"pos_order": pos_order},
        fields=["workflow_state"]
    )
    
    if kots:
        # Check all served or cancelled
        active_kots = [k for k in kots if k.workflow_state not in ["Served", "Cancelled"]]
        if active_kots:
            errors.append(f"{len(active_kots)} items still in kitchen")
    
    # Check customer
    if not order.customer:
        # Auto-assign walk-in
        order.customer = "Walk-in Customer"
        order.save()
    
    if errors:
        frappe.throw("<br>".join(errors))
    
    return True
```

### 9. **Cashier Console Mode Detection**

```javascript
// Auto-detect mode based on POS Profile
function detectCashierMode(posProfile) {
    frappe.call({
        method: 'frappe.client.get_value',
        args: {
            doctype: 'POS Profile',
            filters: { name: posProfile },
            fieldname: ['imogi_pos_domain', 'imogi_pos_mode']
        },
        callback: (response) => {
            const domain = response.message.imogi_pos_domain
            const mode = response.message.imogi_pos_mode
            
            if (domain === 'Restaurant' && mode === 'Table') {
                // Table/Waiter mode
                setCashierMode('Table')
                loadTableOrders()
            } else {
                // Counter mode
                setCashierMode('Counter')
                loadCounterOrders()
            }
        }
    })
}

function setCashierMode(mode) {
    // Update UI
    const modeIndicator = document.querySelector('.mode-indicator')
    modeIndicator.setAttribute('data-pos-mode', mode)
    
    if (mode === 'Table') {
        modeIndicator.innerHTML = '🍴 Table/Waiter Mode'
        
        // Show table filter
        document.querySelector('.table-filter').style.display = 'block'
        
        // Filter for Dine In orders only
        orderTypeFilter = 'Dine In'
    } else {
        modeIndicator.innerHTML = '💵 Counter Mode'
        
        // Hide table filter
        document.querySelector('.table-filter').style.display = 'none'
        
        // Filter for Counter orders only
        orderTypeFilter = 'Counter'
    }
}
```

---

## 

## ❌ Cancellation Workflow

### 1. **Cancel KOT Ticket**

#### Permission Requirements

```python
# imogi_pos/utils/role_permissions.py
BUTTON_RESTRICTIONS = {
    "KOT Ticket": {
        "cancel_kot_ticket": [
            "System Manager",
            "Administrator", 
            "Area Manager",
            "Branch Manager",
            "Kitchen Manager"
        ]
    }
}
```

#### API Flow

```python
# imogi_pos/api/kot.py
@frappe.whitelist()
@require_permission("KOT Ticket", "write")
def cancel_kot_ticket(kot_ticket):
    """Cancel a KOT Ticket and all its items"""
    
    # 1. Validate permission
    ticket = frappe.get_doc("KOT Ticket", kot_ticket)
    
    # 2. Check if already in final state
    if ticket.workflow_state in ["Served", "Cancelled"]:
        frappe.throw(_("Cannot cancel a {0} KOT").format(ticket.workflow_state))
    
    # 3. Use KOTService to cancel
    service = KOTService()
    result = service.cancel_kot_ticket(kot_ticket)
    
    # 4. Update POS Order if all KOTs cancelled
    _update_pos_order_state_if_needed(ticket.pos_order)
    
    # 5. Publish realtime update
    KOTPublisher.publish_ticket_update(
        ticket,
        event_type="kot_cancelled",
        changed_items=ticket.items
    )
    
    return result
```

#### Service Implementation

```python
# imogi_pos/kitchen/kot_service.py
def cancel_kot_ticket(self, kot_ticket, reason=None, user=None):
    """Cancel a KOT Ticket and all its items"""
    
    # Delegate to update_kot_ticket_state
    return self.update_kot_ticket_state(
        kot_ticket, 
        self.STATES["CANCELLED"], 
        user
    )

def update_kot_ticket_state(self, kot_ticket, new_state, user=None):
    """Update KOT Ticket state"""
    
    # 1. Validate state transition
    StateManager.validate_ticket_transition(current_state, new_state)
    
    # 2. Update ticket
    ticket.workflow_state = new_state
    ticket.last_edited_by = user
    ticket.save()
    
    # 3. Update ALL items to match
    for item in ticket.items:
        item.workflow_state = new_state
        item.last_edited_by = user
        item.save()
        
        # Update POS Order Item counters
        self._update_pos_item_counter(item.pos_order_item, new_state)
    
    # 4. Update POS Order state
    self._update_pos_order_state_if_needed(ticket.pos_order)
    
    # 5. Publish realtime update
    KOTPublisher.publish_ticket_update(ticket, event_type="kot_updated")
    
    return {"ticket": ticket.name, "new_state": new_state}
```

### 2. **Cancel Individual Item**

```python
# imogi_pos/kitchen/kot_service.py
def update_kot_item_state(self, kot_item, new_state, user=None):
    """Update the state of a KOT Item"""
    
    # 1. Validate state
    if not StateManager.is_valid_state(new_state):
        frappe.throw(_("Invalid KOT state: {0}").format(new_state))
    
    # 2. Get item and ticket
    item = frappe.get_doc("KOT Item", kot_item)
    ticket = frappe.get_doc("KOT Ticket", item.parent)
    
    # 3. Check if ticket is cancelled
    if ticket.workflow_state == StateManager.STATES["CANCELLED"]:
        frappe.throw(_("Cannot update item state for a cancelled KOT"))
    
    # 4. Validate item transition
    StateManager.validate_item_transition(item.workflow_state, new_state)
    
    # 5. Update item
    item.workflow_state = new_state
    item.last_edited_by = user
    item.save()
    
    # 6. Update POS Order Item counter
    self._update_pos_item_counter(item.pos_order_item, new_state)
    
    # 7. Update ticket state if all items match
    self._update_ticket_state_if_needed(ticket.name)
    
    # 8. Publish realtime update
    KOTPublisher.publish_item_update(item, ticket)
    
    return {"item": item.name, "ticket": ticket.name, "new_state": new_state}
```

### 3. **Cascading Effects**

```
Cancellation of KOT → Impact Chain:

1. KOT Ticket State
   └─→ workflow_state = "Cancelled"

2. All KOT Items
   └─→ workflow_state = "Cancelled"

3. POS Order Items
   └─→ counter.cancelled = qty
   └─→ counter.sent = counter.sent - qty

4. POS Order State (if all KOTs cancelled)
   └─→ workflow_state = "Cancelled"

5. Restaurant Table (if order cancelled)
   └─→ status = "Available"
   └─→ current_pos_order = NULL

6. Realtime Notifications
   └─→ Kitchen Display: Remove KOT
   └─→ Waiter Interface: Update order status
   └─→ Table Display: Update table status
```

### 4. **Cancellation UI Flow**

```javascript
// Kitchen Display - Cancel button handler
handleCancelKot(kotName) {
    // Show confirmation dialog
    frappe.confirm(
        __('Are you sure you want to cancel this KOT?'),
        () => {
            // Call cancel API
            frappe.call({
                method: 'imogi_pos.api.kot.cancel_kot_ticket',
                args: { kot_ticket: kotName },
                callback: (response) => {
                    if (response.message.success) {
                        // Remove from UI
                        this.removeKotFromState(kotName)
                        this.showToast('KOT cancelled successfully')
                    }
                }
            })
        }
    )
}

// Realtime event handler
handleKotEvent(data) {
    if (data.event_type === 'kot_cancelled') {
        // Remove KOT from display
        this.removeKotFromState(data.kot.name)
        
        // Show notification
        this.showToast(`KOT ${data.kot.name} was cancelled`)
    }
}
```

---

## 🔄 State Synchronization

### 1. **KOT Ticket ↔ KOT Items**

**Rule:** Semua items harus follow parent ticket state

```python
# imogi_pos/kitchen/kot_service.py
def _update_ticket_state_if_needed(self, kot_ticket):
    """Check if all items have same state and update ticket"""
    
    ticket = frappe.get_doc("KOT Ticket", kot_ticket)
    
    # Get unique states from all items
    states = set(item.workflow_state for item in ticket.items)
    
    # If all items have the same state
    if len(states) == 1:
        new_state = list(states)[0]
        
        # Update ticket if different
        if ticket.workflow_state != new_state:
            frappe.db.set_value(
                "KOT Ticket", 
                kot_ticket, 
                {
                    "workflow_state": new_state,
                    "last_edited_by": frappe.session.user
                }
            )
```

### 2. **KOT Tickets → POS Order**

**Rules untuk update POS Order state:**

```python
# imogi_pos/utils/state_manager.py
@classmethod
def get_pos_order_state_from_kots(cls, kot_states):
    """Determine POS Order state based on KOT states"""
    
    unique_states = set(kot_states)
    
    # All KOTs cancelled → POS Order = "Cancelled"
    if len(unique_states) == 1 and "Cancelled" in unique_states:
        return "Cancelled"
    
    # All KOTs served → POS Order = "Served"
    if len(unique_states) == 1 and "Served" in unique_states:
        return "Served"
    
    # Any KOT ready & none queued/in progress → POS Order = "Ready"
    if "Ready" in unique_states and not any(
        s in unique_states for s in ["Queued", "In Progress"]
    ):
        return "Ready"
    
    # Any KOT in progress → POS Order = "In Progress"
    if "In Progress" in unique_states:
        return "In Progress"
    
    # All queued → POS Order = "Draft"
    if len(unique_states) == 1 and "Queued" in unique_states:
        return "Draft"
    
    return None  # No change needed
```

**Implementation:**

```python
def _update_pos_order_state_if_needed(self, pos_order):
    """Update POS Order state based on KOT states"""
    
    # Get all KOT tickets for this order
    tickets = frappe.get_all(
        "KOT Ticket", 
        filters={"pos_order": pos_order}, 
        fields=["workflow_state"]
    )
    
    # Get KOT states
    kot_states = [t.workflow_state for t in tickets]
    
    # Determine new POS Order state
    new_pos_state = StateManager.get_pos_order_state_from_kots(kot_states)
    
    # Update if needed
    if new_pos_state and StateManager.should_update_pos_order_state(
        current_pos_state, new_pos_state
    ):
        frappe.db.set_value("POS Order", pos_order, "workflow_state", new_pos_state)
```

### 3. **Realtime Event Propagation**

```python
# imogi_pos/utils/kot_publisher.py
class KOTPublisher:
    """Centralized realtime event publisher for KOT updates"""
    
    @staticmethod
    def publish_ticket_update(ticket, event_type="kot_updated", changed_items=None):
        """Publish KOT ticket update to all relevant channels"""
        
        # Build payload
        payload = {
            "kot": ticket.as_dict(),
            "event_type": event_type,
            "timestamp": now_datetime().isoformat()
        }
        
        if changed_items:
            payload["items"] = [item.as_dict() for item in changed_items]
        
        # Publish to multiple channels
        channels = [
            f"kitchen:{ticket.kitchen}",           # Kitchen-specific
            f"station:{ticket.station}",           # Station-specific
            f"table:{ticket.table}",               # Table-specific
            f"pos_order:{ticket.pos_order}",       # Order-specific
        ]
        
        for channel in channels:
            publish_realtime(channel, payload)
```

---

## 🎨 UI Components & Interaction

### 1. **Kitchen Display Structure**

```html
<!-- imogi_pos/public/js/kitchen_display.js -->
<div class="kitchen-display">
    <!-- Header -->
    <div class="kitchen-header">
        <h1>Kitchen Display System</h1>
        <div class="filter-controls">
            <select id="station-filter">
                <option value="">All Stations</option>
                <option value="Hot Station">Hot Station</option>
                <option value="Cold Station">Cold Station</option>
            </select>
        </div>
    </div>
    
    <!-- KOT Columns -->
    <div class="kot-columns">
        <!-- Queued Column -->
        <div class="kot-column" data-state="queued">
            <h2>Queued (⏳)</h2>
            <div class="kot-cards">
                <!-- KOT Cards -->
            </div>
        </div>
        
        <!-- In Progress Column -->
        <div class="kot-column" data-state="preparing">
            <h2>In Progress (👨‍🍳)</h2>
            <div class="kot-cards">
                <!-- KOT Cards -->
            </div>
        </div>
        
        <!-- Ready Column -->
        <div class="kot-column" data-state="ready">
            <h2>Ready (✅)</h2>
            <div class="kot-cards">
                <!-- KOT Cards -->
            </div>
        </div>
    </div>
</div>
```

### 2. **KOT Card Component**

```javascript
renderKotCard(kot) {
    return `
        <div class="kot-card" data-kot="${kot.name}">
            <!-- Header -->
            <div class="kot-header">
                <span class="kot-number">${kot.name}</span>
                <span class="kot-time">${this.formatTime(kot.creation)}</span>
            </div>
            
            <!-- Table Info -->
            <div class="kot-table">
                <strong>Table:</strong> ${kot.table || 'Counter'}
            </div>
            
            <!-- Items -->
            <div class="kot-items">
                ${kot.items.map(item => `
                    <div class="kot-item">
                        <span class="qty">${item.qty}x</span>
                        <span class="name">${item.item_name}</span>
                        ${item.notes ? `<span class="notes">${item.notes}</span>` : ''}
                    </div>
                `).join('')}
            </div>
            
            <!-- Actions -->
            <div class="kot-actions">
                ${this.renderActionButtons(kot)}
            </div>
        </div>
    `
}

renderActionButtons(kot) {
    const state = kot.workflow_state
    
    if (state === 'Queued') {
        return `
            <button class="kot-action-btn primary" 
                    data-action="start" 
                    data-kot="${kot.name}">
                Start Preparing
            </button>
        `
    }
    
    if (state === 'In Progress') {
        return `
            <button class="kot-action-btn primary" 
                    data-action="ready" 
                    data-kot="${kot.name}">
                Mark Ready
            </button>
        `
    }
    
    if (state === 'Ready') {
        return `
            <button class="kot-action-btn primary" 
                    data-action="serve" 
                    data-kot="${kot.name}">
                Mark Served
            </button>
        `
    }
    
    return ''
}
```

### 3. **Realtime Event Handling**

```javascript
subscribeToRealtimeEvents() {
    // Subscribe to kitchen channel
    frappe.realtime.on(`kitchen:${this.kitchen}`, (data) => {
        this.handleKotEvent(data)
    })
    
    // Subscribe to station channel
    frappe.realtime.on(`station:${this.station}`, (data) => {
        this.handleKotEvent(data)
    })
}

handleKotEvent(data) {
    const eventType = data.event_type
    const kot = data.kot
    
    switch (eventType) {
        case 'kot_created':
        case 'new_kot':
            this.updateKotInState(kot)
            this.playSound('new_kot')
            break
            
        case 'kot_updated':
        case 'update_kot_status':
            if (['Served', 'Cancelled'].includes(kot.workflow_state)) {
                this.removeKotFromState(kot.name)
            } else {
                this.updateKotInState(kot)
            }
            break
            
        case 'kot_item_updated':
            this.updateKotItemStatus(kot.name, data.item)
            break
            
        case 'kot_cancelled':
        case 'delete_kot':
            this.removeKotFromState(kot.name)
            break
    }
}
```

---

## 🔧 Backend Services

### 1. **KOTService - Main Service Layer**

```python
# imogi_pos/kitchen/kot_service.py
class KOTService:
    """
    Main service for KOT operations
    
    Responsibilities:
    - Create KOT tickets from orders
    - Update KOT states
    - Validate transitions
    - Publish realtime events
    """
    
    def create_kot_from_order(self, pos_order, selected_items=None):
        """Create KOT tickets from POS Order"""
        
        # 1. Validate order
        # 2. Group items by kitchen station
        # 3. Create KOT tickets per station
        # 4. Create KOT items
        # 5. Update POS Order items
        # 6. Publish realtime events
        
    def update_kot_ticket_state(self, kot_ticket, new_state, user=None):
        """Update KOT ticket and all items"""
        
        # 1. Validate transition
        # 2. Update ticket
        # 3. Update all items
        # 4. Update POS Order state
        # 5. Publish realtime events
        
    def update_kot_item_state(self, kot_item, new_state, user=None):
        """Update individual KOT item"""
        
        # 1. Validate transition
        # 2. Update item
        # 3. Update ticket state if needed
        # 4. Update POS Order state
        # 5. Publish realtime events
```

### 2. **StateManager - State Validation**

```python
# imogi_pos/utils/state_manager.py
class StateManager:
    """
    Centralized state management
    
    Provides:
    - State definitions
    - Transition validation
    - State mapping (KOT → POS Order)
    """
    
    @classmethod
    def validate_ticket_transition(cls, current_state, new_state):
        """Validate KOT Ticket state transition"""
        
        allowed = cls.ALLOWED_TICKET_TRANSITIONS.get(current_state, set())
        if new_state not in allowed:
            frappe.throw(_("Cannot change state from {0} to {1}"))
        return True
    
    @classmethod
    def get_pos_order_state_from_kots(cls, kot_states):
        """Determine POS Order state from KOT states"""
        # Logic explained in State Synchronization section
```

### 3. **KOTPublisher - Realtime Events**

```python
# imogi_pos/utils/kot_publisher.py
class KOTPublisher:
    """
    Centralized realtime event publisher
    
    Handles:
    - Multi-channel publishing
    - Payload normalization
    - Event type routing
    """
    
    @staticmethod
    def publish_ticket_update(ticket, event_type, changed_items=None):
        """Publish ticket update to all channels"""
        
        # Build payload
        # Publish to multiple channels:
        # - kitchen:{kitchen}
        # - station:{station}
        # - table:{table}
        # - pos_order:{order}
```

---

## ⚠️ Error Handling

### 1. **Validation Errors**

```python
# Invalid state transition
try:
    StateManager.validate_ticket_transition("Served", "In Progress")
except frappe.ValidationError as e:
    # Error: Cannot change state from Served to In Progress
    frappe.log_error(e)
    frappe.throw(_("Invalid state transition"))
```

### 2. **Permission Errors**

```python
# Unauthorized cancellation
@frappe.whitelist()
@require_permission("KOT Ticket", "write")
def cancel_kot_ticket(kot_ticket):
    # Automatically checks permission
    # Throws frappe.PermissionError if denied
```

### 3. **UI Error Handling**

```javascript
updateKotWorkflowState(kotName, state) {
    return new Promise((resolve, reject) => {
        frappe.call({
            method: 'imogi_pos.api.kot.update_kot_status',
            args: { kot_ticket: kotName, state: state },
            callback: (response) => {
                if (response.message) {
                    this.showToast(`KOT ${kotName} updated to ${state}`)
                    resolve(response.message)
                }
            },
            error: (error) => {
                // Handle errors
                this.showErrorToast(`Failed to update KOT: ${error.message}`)
                reject(error)
            }
        })
    })
}
```

### 4. **Offline Fallback**

```javascript
updateKotWorkflowState(kotName, state) {
    // Check if server is available
    const canCallServer = window.frappe && typeof window.frappe.call === 'function'
    
    if (!canCallServer) {
        // Offline mode - update local state only
        console.warn('Server unavailable. Updating local state only.')
        this.updateKotStatus(kotName, state)
        this.showToast(`KOT ${kotName} updated (offline mode)`)
        return Promise.resolve({ success: true, offline: true })
    }
    
    // Normal server call
    return this.callServerUpdate(kotName, state)
}
```

---

## 📊 State Diagram Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    KOT Lifecycle Flow                        │
└─────────────────────────────────────────────────────────────┘

Order Created → KOT Created (Queued)
                     │
                     │ [Start Preparing]
                     ↓
                In Progress ←─────┐
                     │             │ [Return to Kitchen]
                     │             │
                     │ [Mark Ready]│
                     ↓             │
                   Ready ──────────┘
                     │
                     │ [Mark Served]
                     ↓
                  Served (Final)
                  
                     ❌ [Cancel] - From any state (with permission)
                     ↓
                 Cancelled (Final)

┌─────────────────────────────────────────────────────────────┐
│         Synchronization: KOT → POS Order State              │
└─────────────────────────────────────────────────────────────┘

All KOTs: Queued      → POS Order: Draft
Any KOT: In Progress  → POS Order: In Progress
All KOTs: Ready       → POS Order: Ready
All KOTs: Served      → POS Order: Served
All KOTs: Cancelled   → POS Order: Cancelled
```

---

## 🎯 Key Takeaways

1. **Centralized State Management** - Semua state logic di `StateManager`
2. **Strict Transition Rules** - Tidak bisa skip states (e.g., Queued → Ready)
3. **Automatic Synchronization** - KOT Items → KOT Ticket → POS Order
4. **Realtime Updates** - Multi-channel publishing untuk UI responsiveness
5. **Permission-based Actions** - Cancel, modify hanya untuk authorized roles
6. **Graceful Degradation** - Offline fallback untuk UI operations
7. **Comprehensive Validation** - Server-side validation untuk semua state changes

---

## 📚 Related Files

- [imogi_pos/utils/state_manager.py](imogi_pos/utils/state_manager.py) - State definitions & validation
- [imogi_pos/kitchen/kot_service.py](imogi_pos/kitchen/kot_service.py) - Main KOT service layer
- [imogi_pos/api/kot.py](imogi_pos/api/kot.py) - API endpoints
- [imogi_pos/public/js/kitchen_display.js](imogi_pos/public/js/kitchen_display.js) - Kitchen UI
- [src/apps/kitchen/App.jsx](src/apps/kitchen/App.jsx) - React Kitchen App
- [imogi_pos/utils/kot_publisher.py](imogi_pos/utils/kot_publisher.py) - Realtime events

---

## 📄 ERPNext v15 Native Integration - POS Order & Invoice

### POS Order DocType (Native ERPNext)

IMOGI POS menggunakan **POS Order** sebagai intermediate document sebelum generate Sales Invoice.

```python
# POS Order Structure (ERPNext v15 Native)
{
    "doctype": "POS Order",
    "name": "POS-ORD-00001",
    
    # Core Fields
    "customer": "Walk-in Customer",
    "pos_profile": "Restaurant Counter",
    "company": "Your Company",
    
    # IMOGI Custom Fields
    "imogi_branch": "Main Branch",
    "imogi_pos_order": "POS-ORD-00001",  # Self reference for tracking
    "order_type": "Dine In",  # Counter/Dine In/Take Away/Self-Order
    "workflow_state": "Draft",  # Draft/Submitted/To Bill/Billed/Completed
    
    # Restaurant Fields
    "table": "T1",
    "floor": "Main Floor",
    "guests": 2,
    
    # Customer Info (Optional)
    "customer_full_name": "John Doe",
    "customer_phone": "08123456789",
    "customer_gender": "Male",
    "customer_age": "25-35",
    
    # Items (Child Table)
    "items": [
        {
            "item": "ITEM-001",
            "item_name": "Nasi Goreng",
            "qty": 2,
            "rate": 25000,
            "amount": 50000,
            "warehouse": "Main Warehouse",
            "notes": "Extra pedas",  # Item-specific notes
            
            # Kitchen tracking
            "default_kitchen": "Main Kitchen",
            "default_kitchen_station": "Hot Station",
            
            # Counter tracking (for KOT)
            "counters": {
                "sent": 2,      # Qty sent to kitchen
                "ready": 0,     # Qty ready
                "served": 0,    # Qty served
                "cancelled": 0  # Qty cancelled
            }
        }
    ],
    
    # Totals
    "total": 50000,
    "grand_total": 50000,
    "outstanding_amount": 50000,
    
    # Audit Fields
    "user": "waiter@example.com",
    "creation": "2026-01-25 10:30:00",
    "modified": "2026-01-25 10:35:00"
}
```

### Sales Invoice DocType (Native ERPNext v15)

```python
# Sales Invoice Structure (is_pos=1)
{
    "doctype": "Sales Invoice",
    "name": "SINV-00001",
    
    # POS Flag
    "is_pos": 1,
    
    # Core Fields
    "customer": "Walk-in Customer",
    "pos_profile": "Restaurant Counter",
    "company": "Your Company",
    "posting_date": "2026-01-25",
    "posting_time": "10:35:00",
    
    # IMOGI Links
    "imogi_branch": "Main Branch",
    "imogi_pos_order": "POS-ORD-00001",  # Link to POS Order
    "imogi_pos_session": "POS-OPEN-00001",  # Link to session if enabled
    
    # Order Type
    "order_type": "Dine In",
    
    # Items (Child Table - copied from POS Order)
    "items": [
        {
            "item_code": "ITEM-001",
            "item_name": "Nasi Goreng",
            "qty": 2,
            "rate": 25000,
            "amount": 50000,
            "warehouse": "Main Warehouse",
            "description": "Nasi Goreng\nExtra pedas"  # Includes notes
        }
    ],
    
    # Payments (Child Table)
    "payments": [
        {
            "mode_of_payment": "Cash",
            "amount": 60000,
            "base_amount": 60000
        }
    ],
    
    # Totals
    "total": 50000,
    "grand_total": 50000,
    "paid_amount": 60000,
    "change_amount": 10000,
    "outstanding_amount": 0,
    
    # Stock Update
    "update_stock": 1,  # Update stock on submit
    
    # Status
    "docstatus": 1,  # 0=Draft, 1=Submitted, 2=Cancelled
    "status": "Paid"
}
```

### Generate Invoice API

**Endpoint:** `imogi_pos.api.billing.generate_invoice`

```python
@frappe.whitelist()
@require_permission("Sales Invoice", "create")
def generate_invoice(
    pos_order: str,
    mode_of_payment: str,
    amount: float,
    customer_info: dict = None
):
    """
    Creates Sales Invoice from POS Order
    
    Args:
        pos_order: POS Order name (required)
        mode_of_payment: Payment method (Cash/Card/QRIS/etc)
        amount: Payment amount
        customer_info: Optional customer metadata
        
    Returns:
        dict: Sales Invoice document
        
    Process:
        1. Validate POS Order exists and accessible
        2. Validate POS Session (if required)
        3. Check for template items (must be variants)
        4. Build invoice items from order items
        5. Create Sales Invoice (is_pos=1)
        6. Add payment entry
        7. Calculate totals & taxes
        8. Check stock availability (if update_stock=1)
        9. Submit invoice
        10. Link invoice back to POS Order
        11. Publish stock updates via realtime
    """
    
    # 1. Get POS Order
    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)
    
    # 2. Validate POS Session
    pos_session = validate_pos_session(order_doc.pos_profile)
    
    # 3. Validate no template items
    for item in order_doc.items:
        is_template = frappe.db.get_value("Item", item.item, "has_variants")
        if is_template:
            frappe.throw(_("Cannot invoice template item: {0}").format(item.item))
    
    # 4. Build invoice items
    profile_doc = frappe.get_doc("POS Profile", order_doc.pos_profile)
    mode = profile_doc.get("imogi_mode", "Counter")
    invoice_items = build_invoice_items(order_doc, mode)
    
    # 5. Create Sales Invoice
    invoice_data = {
        "doctype": "Sales Invoice",
        "is_pos": 1,
        "pos_profile": order_doc.pos_profile,
        "customer": order_doc.customer,
        "imogi_branch": order_doc.branch,
        "items": invoice_items,
        "imogi_pos_order": pos_order,
        "order_type": order_doc.order_type,
        "update_stock": profile_doc.get("update_stock", 1)
    }
    
    if pos_session:
        invoice_data["imogi_pos_session"] = pos_session
    
    # Copy customer info if provided
    if customer_info:
        invoice_data.update(customer_info)
    
    # Copy table info for restaurant
    if order_doc.table:
        invoice_data["table"] = order_doc.table
        invoice_data["floor"] = order_doc.floor
    
    invoice_doc = frappe.get_doc(invoice_data)
    
    # 6. Add payment
    invoice_doc.append("payments", {
        "mode_of_payment": mode_of_payment,
        "amount": amount,
        "base_amount": amount
    })
    
    # 7. Calculate totals
    invoice_doc.set_missing_values()
    invoice_doc.calculate_taxes_and_totals()
    
    # Calculate change
    change = amount - invoice_doc.grand_total
    if change >= 0:
        invoice_doc.change_amount = change
        invoice_doc.paid_amount = amount
    else:
        frappe.throw(_("Payment amount is less than total"))
    
    # 8. Stock validation (if update_stock=1)
    if invoice_doc.update_stock:
        for item in invoice_doc.items:
            warehouse = item.warehouse or profile_doc.warehouse
            available = frappe.db.get_value(
                "Bin",
                {"item_code": item.item_code, "warehouse": warehouse},
                "actual_qty"
            ) or 0
            
            if item.qty > available:
                allow_negative = frappe.db.get_single_value(
                    "Stock Settings", "allow_negative_stock"
                )
                if not allow_negative:
                    frappe.throw(
                        _("Insufficient stock for {0}").format(item.item_code)
                    )
    
    # 9. Submit invoice
    invoice_doc.insert(ignore_permissions=True)
    invoice_doc.submit()
    
    # 10. Link back to POS Order
    frappe.db.set_value("POS Order", pos_order, {
        "sales_invoice": invoice_doc.name,
        "workflow_state": "Billed"
    })
    
    # 11. Publish stock updates
    notify_stock_update(invoice_doc, profile_doc)
    
    return invoice_doc.as_dict()
```

### Payment Processing Flow

#### 1. **Cash Payment**

```javascript
// Frontend - Cash payment
const handleCashPayment = async (amount) => {
    const invoice = await frappe.call({
        method: 'imogi_pos.api.billing.generate_invoice',
        args: {
            pos_order: orderName,
            mode_of_payment: 'Cash',
            amount: amount
        }
    })
    
    // Calculate change
    const change = amount - invoice.message.grand_total
    
    // Show receipt with change
    printReceipt(invoice.message, amount, change)
}
```

**Backend Processing:**

```python
# Sales Invoice with cash payment
{
    "payments": [
        {
            "mode_of_payment": "Cash",
            "amount": 60000,
            "account": "Cash - Company"  # Auto from Mode of Payment
        }
    ],
    "paid_amount": 60000,
    "change_amount": 10000,  # 60000 - 50000
    "outstanding_amount": 0,
    "status": "Paid"
}
```

#### 2. **QRIS/E-Wallet Payment**

**Request Payment QR:**

```python
@frappe.whitelist()
def request_payment(sales_invoice):
    """
    Create Payment Request with QRIS integration
    
    Process:
        1. Get Sales Invoice
        2. Check payment gateway enabled in POS Profile
        3. Create Payment Request
        4. Generate QRIS via Xendit Integration
        5. Push to Customer Display (if enabled)
        6. Return QR data for UI display
    """
    
    # 1. Get invoice
    invoice_doc = frappe.get_doc("Sales Invoice", sales_invoice)
    
    # 2. Check gateway
    pos_profile = frappe.db.get_value(
        "POS Profile",
        invoice_doc.pos_profile,
        ["imogi_enable_payment_gateway", 
         "imogi_payment_gateway_account",
         "imogi_payment_timeout_seconds"],
        as_dict=True
    )
    
    if not pos_profile.imogi_enable_payment_gateway:
        frappe.throw(_("Payment gateway not enabled"))
    
    # 3. Create Payment Request
    payment_request = frappe.get_doc({
        "doctype": "Payment Request",
        "payment_gateway_account": pos_profile.imogi_payment_gateway_account,
        "reference_doctype": "Sales Invoice",
        "reference_name": sales_invoice,
        "grand_total": invoice_doc.grand_total,
        "currency": invoice_doc.currency,
        "status": "Initiated"
    })
    payment_request.insert(ignore_permissions=True)
    payment_request.submit()
    
    # 4. Generate QRIS (Xendit Integration)
    qr_data = frappe.call(
        'xendit_integration_imogi.api.qris.generate_dynamic_qr',
        amount=invoice_doc.grand_total,
        invoice=sales_invoice,
        branch=invoice_doc.imogi_branch,
        description=f"Payment for {sales_invoice}"
    )
    
    # 5. Push to Customer Display
    if invoice_doc.get("imogi_customer_display"):
        publish_realtime(
            f"customer_display:device:{invoice_doc.imogi_customer_display}",
            {
                "type": "payment_qr",
                "qr_image": qr_data.qr_image,
                "amount": invoice_doc.grand_total,
                "sales_invoice": sales_invoice
            }
        )
    
    # 6. Return QR data
    return {
        "qr_image": qr_data.qr_image,
        "qr_string": qr_data.qr_string,
        "amount": invoice_doc.grand_total,
        "expiry": qr_data.expires_at,
        "payment_request": payment_request.name,
        "xendit_id": qr_data.xendit_id
    }
```

**Payment Callback (Webhook):**

```python
# Xendit webhook handler
# xendit_integration_imogi/api/webhooks.py

@frappe.whitelist(allow_guest=True)
def qris_callback():
    """
    Handle QRIS payment callback from Xendit
    
    Process:
        1. Verify webhook signature
        2. Get Payment Request
        3. Update Payment Request status
        4. Create Payment Entry
        5. Reconcile Sales Invoice
        6. Update POS Order status
        7. Notify realtime channels
    """
    
    # 1. Verify signature
    payload = frappe.request.get_json()
    verify_webhook_signature(payload)
    
    # 2. Get Payment Request
    xendit_id = payload.get("id")
    pr = frappe.db.get_value(
        "Payment Request",
        {"xendit_qr_id": xendit_id}
    )
    
    # 3. Update status
    pr_doc = frappe.get_doc("Payment Request", pr)
    pr_doc.status = "Paid"
    pr_doc.save()
    
    # 4. Create Payment Entry
    payment_entry = frappe.get_doc({
        "doctype": "Payment Entry",
        "payment_type": "Receive",
        "party_type": "Customer",
        "party": pr_doc.customer,
        "paid_amount": pr_doc.grand_total,
        "received_amount": pr_doc.grand_total,
        "reference_no": xendit_id,
        "reference_date": now_datetime(),
        "references": [{
            "reference_doctype": "Sales Invoice",
            "reference_name": pr_doc.reference_name,
            "allocated_amount": pr_doc.grand_total
        }]
    })
    payment_entry.insert(ignore_permissions=True)
    payment_entry.submit()
    
    # 5. Update Sales Invoice
    invoice = frappe.get_doc("Sales Invoice", pr_doc.reference_name)
    invoice.outstanding_amount = 0
    invoice.status = "Paid"
    invoice.save()
    
    # 6. Update POS Order
    if invoice.imogi_pos_order:
        frappe.db.set_value(
            "POS Order",
            invoice.imogi_pos_order,
            "workflow_state",
            "Completed"
        )
    
    # 7. Notify
    publish_realtime(f"payment:pr:{pr}", {
        "status": "paid",
        "payment_entry": payment_entry.name
    })
    
    return {"status": "success"}
```

#### 3. **Multi-Payment Support**

```python
# Split payment (Cash + Card)
{
    "payments": [
        {
            "mode_of_payment": "Cash",
            "amount": 30000
        },
        {
            "mode_of_payment": "Credit Card",
            "amount": 20000
        }
    ],
    "paid_amount": 50000,
    "change_amount": 0,
    "outstanding_amount": 0
}
```

### Stock Integration

**Update Stock on Submit:**

```python
# When Sales Invoice is submitted with update_stock=1
# ERPNext automatically creates Stock Ledger Entries

# Stock Ledger Entry (auto-created)
{
    "doctype": "Stock Ledger Entry",
    "item_code": "ITEM-001",
    "warehouse": "Main Warehouse",
    "actual_qty": -2,  # Negative for sales
    "voucher_type": "Sales Invoice",
    "voucher_no": "SINV-00001",
    "posting_date": "2026-01-25",
    "posting_time": "10:35:00"
}

# Bin Updated (Stock Balance)
{
    "item_code": "ITEM-001",
    "warehouse": "Main Warehouse",
    "actual_qty": 48,  # 50 - 2
    "reserved_qty": 0,
    "ordered_qty": 0
}
```

**Realtime Stock Updates:**

```python
def notify_stock_update(invoice_doc, profile_doc):
    """Publish stock updates to frontend"""
    
    warehouse = profile_doc.warehouse
    
    for item in invoice_doc.items:
        actual_qty = frappe.db.get_value(
            "Bin",
            {"item_code": item.item_code, "warehouse": warehouse},
            "actual_qty"
        ) or 0
        
        # Publish to realtime channel
        frappe.publish_realtime(
            "stock_update",
            {
                "item_code": item.item_code,
                "warehouse": warehouse,
                "actual_qty": actual_qty,
                "low_stock": actual_qty < LOW_STOCK_THRESHOLD
            }
        )
```

### POS Session Integration

**POS Opening Entry:**

```python
# Native ERPNext POS Opening Entry
{
    "doctype": "POS Opening Entry",
    "name": "POS-OPEN-00001",
    "pos_profile": "Restaurant Counter",
    "user": "cashier@example.com",
    "period_start_date": "2026-01-25 08:00:00",
    "status": "Open",
    
    # Opening Balance
    "balance_details": [
        {
            "mode_of_payment": "Cash",
            "opening_amount": 100000
        }
    ]
}
```

**Link to Sales Invoice:**

```python
# When invoice is created
{
    "imogi_pos_session": "POS-OPEN-00001"  # Links to opening entry
}
```

**POS Closing Entry:**

```python
# Native ERPNext POS Closing Entry
{
    "doctype": "POS Closing Entry",
    "name": "POS-CLOSE-00001",
    "pos_opening_entry": "POS-OPEN-00001",
    "period_end_date": "2026-01-25 20:00:00",
    "status": "Submitted",
    
    # Payments collected
    "payment_reconciliation": [
        {
            "mode_of_payment": "Cash",
            "opening_amount": 100000,
            "expected_amount": 500000,  # From invoices
            "closing_amount": 600000,   # Actual counted
            "difference": 0
        }
    ],
    
    # Sales summary
    "pos_transactions": [
        {
            "pos_invoice": "SINV-00001",
            "grand_total": 50000,
            "customer": "Walk-in Customer"
        }
        // ... more invoices
    ]
}
```

### Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│              Complete Order-to-Payment Flow                      │
└─────────────────────────────────────────────────────────────────┘

1. CREATE ORDER (Waiter/Cashier)
   └─→ POS Order created (Draft)
   └─→ Items added to order.items
   └─→ Table occupied (if restaurant)

2. SEND TO KITCHEN (Waiter only)
   └─→ KOT Ticket created
   └─→ Order state: Draft → Submitted
   └─→ Items marked as "sent" in counters

3. KITCHEN PROCESSES
   └─→ KOT: Queued → In Progress → Ready → Served
   └─→ Order state auto-updates based on KOT states

4. READY FOR BILLING
   └─→ Order state: Submitted → To Bill
   └─→ Appears in Cashier Console

5. GENERATE INVOICE (Cashier)
   └─→ Sales Invoice created (is_pos=1)
   └─→ Items copied from POS Order
   └─→ Stock reserved (if update_stock=1)
   └─→ Order state: To Bill → Billed

6. PAYMENT PROCESSING
   A. Cash:
      └─→ Payment added to invoice.payments
      └─→ Change calculated
      └─→ Invoice submitted
      └─→ Stock deducted
   
   B. QRIS:
      └─→ Payment Request created
      └─→ QRIS generated via Xendit
      └─→ QR displayed to customer
      └─→ Webhook receives payment
      └─→ Payment Entry created
      └─→ Invoice reconciled

7. ORDER COMPLETED
   └─→ Order state: Billed → Completed
   └─→ Table freed (if restaurant)
   └─→ Receipt printed
   └─→ Stock updated
   └─→ Session tracking updated

8. SESSION CLOSING (End of day)
   └─→ POS Closing Entry created
   └─→ Cash counted & reconciled
   └─→ Reports generated
```

### API Endpoints Reference

```python
# POS Order Management
imogi_pos.api.orders.create_order()
imogi_pos.api.orders.update_order()
imogi_pos.api.orders.open_or_create_for_table()
imogi_pos.api.orders.cancel_order()

# Invoice Generation
imogi_pos.api.billing.generate_invoice(
    pos_order, mode_of_payment, amount, customer_info
)

# Payment
imogi_pos.api.billing.request_payment(sales_invoice)
imogi_pos.api.billing.submit_payment(
    sales_invoice, mode_of_payment, amount_paid
)

# Order Listing
imogi_pos.api.billing.list_orders_for_cashier(
    pos_profile, branch, workflow_state, floor, order_type
)

# KOT
imogi_pos.api.kot.create_kot_from_order(pos_order, send_to_kitchen)
imogi_pos.api.kot.update_kot_status(kot_ticket, state)

# Stock
imogi_pos.api.billing.notify_stock_update(invoice_doc, profile_doc)

# Session
imogi_pos.api.pos_session.open_session(pos_profile, opening_amount)
imogi_pos.api.pos_session.close_session(pos_opening_entry)
```

---

**Last Updated:** January 25, 2026
**Version:** 1.0
