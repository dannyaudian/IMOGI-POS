# React Implementation Analysis - Kitchen, Waiter & Cashier

> **Analisis implementasi React untuk Kitchen Display, Waiter Order, dan Cashier Console berdasarkan workflow documentation**

---

## 📊 Executive Summary

| Component | Status | Completeness | Issues Found | Priority |
|-----------|--------|--------------|--------------|----------|
| **Kitchen Display** | ⚠️ Basic | 30% | Missing workflow states, no columns UI | 🔴 HIGH |
| **Waiter App** | ⚠️ Skeleton | 20% | Missing order flow, no KOT integration | 🔴 HIGH |
| **Cashier Console** | ✅ Partial | 60% | Good foundation, needs refinement | 🟡 MEDIUM |

---

## 🍳 Kitchen Display React App

### Current Implementation

**File:** `src/apps/kitchen/App.jsx`

```jsx
// Current basic implementation
const { data: kotList } = useKOTList(branch, 'Pending')
const { call: updateKOTStatus } = useUpdateKOTStatus()

// Simple grid view (not column-based)
<div className="grid grid-3">
  {kotList.map(kot => (
    <Card key={kot.name}>
      <button onClick={() => updateKOTStatus(kot.name, 'In Progress')}>
        Start
      </button>
      <button onClick={() => updateKOTStatus(kot.name, 'Completed')}>
        Complete
      </button>
    </Card>
  ))}
</div>
```

### ❌ Critical Issues

#### 1. **Missing Workflow States**

**Expected (from documentation):**
- Queued
- In Progress
- Ready
- Served
- Cancelled

**Current:**
- Only fetches "Pending" status
- Only has "Start" and "Complete" buttons
- No state columns visualization

#### 2. **No Column-Based Layout**

**Expected:**
```jsx
<div className="kot-columns">
  <Column state="queued" />
  <Column state="preparing" />
  <Column state="ready" />
</div>
```

**Current:**
```jsx
<div className="grid grid-3">
  {/* All KOTs in single grid */}
</div>
```

#### 3. **Incomplete Status Transitions**

**Expected:**
- Queued → In Progress (Start Preparing)
- In Progress → Ready (Mark Ready)
- Ready → Served (Mark Served)
- Any → Cancelled (Cancel)
- In Progress → Queued (Return to Queue)
- Ready → In Progress (Return to Kitchen)

**Current:**
- Only "Start" (to In Progress?)
- Only "Complete" (to what state?)
- Missing Ready, Served, Cancelled buttons

#### 4. **No Item Details**

**Expected:**
```jsx
<div className="kot-items">
  {kot.items.map(item => (
    <div className="kot-item">
      <span>{item.qty}x {item.item_name}</span>
      {item.notes && <div className="notes">{item.notes}</div>}
    </div>
  ))}
</div>
```

**Current:**
```jsx
<p>Items: {kot.items?.length || 0}</p>
```

#### 5. **No Realtime Updates**

**Expected:**
```javascript
useEffect(() => {
  frappe.realtime.on(`kitchen:${kitchen}`, handleKOTEvent)
  frappe.realtime.on(`station:${station}`, handleKOTEvent)
}, [kitchen, station])
```

**Current:**
- Only uses SWR auto-refresh (5 seconds)
- No socket.io realtime events

### ✅ What Needs to Be Built

#### **Component Structure**

```
kitchen/
├── App.jsx (main container)
├── components/
│   ├── KitchenHeader.jsx
│   ├── KOTColumn.jsx
│   ├── KOTCard.jsx
│   ├── KOTItem.jsx
│   ├── ActionButtons.jsx
│   └── FilterControls.jsx
├── hooks/
│   ├── useKOTRealtime.js
│   ├── useKOTState.js
│   └── useKOTActions.js
└── utils/
    ├── kotHelpers.js
    └── stateManager.js
```

#### **Required Components**

##### 1. **KOTColumn Component**

```jsx
// src/apps/kitchen/components/KOTColumn.jsx
export function KOTColumn({ state, kots, onUpdateStatus }) {
  const stateConfig = {
    queued: { title: 'Queued', icon: '⏳', color: '#fbbf24' },
    preparing: { title: 'In Progress', icon: '👨‍🍳', color: '#3b82f6' },
    ready: { title: 'Ready', icon: '✅', color: '#10b981' }
  }
  
  const config = stateConfig[state]
  
  return (
    <div className="kot-column" data-state={state}>
      <div className="column-header">
        <span className="icon">{config.icon}</span>
        <h2>{config.title}</h2>
        <span className="count">{kots.length}</span>
      </div>
      
      <div className="kot-cards">
        {kots.map(kot => (
          <KOTCard 
            key={kot.name}
            kot={kot}
            currentState={state}
            onUpdateStatus={onUpdateStatus}
          />
        ))}
      </div>
    </div>
  )
}
```

##### 2. **KOTCard Component**

```jsx
// src/apps/kitchen/components/KOTCard.jsx
export function KOTCard({ kot, currentState, onUpdateStatus }) {
  return (
    <div className="kot-card" data-kot={kot.name}>
      <div className="kot-header">
        <span className="kot-number">{kot.name}</span>
        <span className="kot-table">
          {kot.table ? `🍴 ${kot.table}` : '💵 Counter'}
        </span>
        <span className="kot-time">
          {getElapsedTime(kot.creation)}
        </span>
      </div>
      
      <div className="kot-items">
        {kot.items?.map((item, idx) => (
          <KOTItem key={idx} item={item} />
        ))}
      </div>
      
      <ActionButtons 
        kot={kot}
        currentState={currentState}
        onUpdateStatus={onUpdateStatus}
      />
    </div>
  )
}
```

##### 3. **ActionButtons Component**

```jsx
// src/apps/kitchen/components/ActionButtons.jsx
export function ActionButtons({ kot, currentState, onUpdateStatus }) {
  const getButtons = () => {
    switch (currentState) {
      case 'queued':
        return (
          <button 
            className="btn-primary"
            onClick={() => onUpdateStatus(kot.name, 'In Progress')}
          >
            Start Preparing
          </button>
        )
      
      case 'preparing':
        return (
          <>
            <button 
              className="btn-primary"
              onClick={() => onUpdateStatus(kot.name, 'Ready')}
            >
              Mark Ready
            </button>
            <button 
              className="btn-secondary"
              onClick={() => onUpdateStatus(kot.name, 'Queued')}
            >
              Return to Queue
            </button>
          </>
        )
      
      case 'ready':
        return (
          <>
            <button 
              className="btn-success"
              onClick={() => onUpdateStatus(kot.name, 'Served')}
            >
              Mark Served
            </button>
            <button 
              className="btn-secondary"
              onClick={() => onUpdateStatus(kot.name, 'In Progress')}
            >
              Return to Kitchen
            </button>
          </>
        )
      
      default:
        return null
    }
  }
  
  return (
    <div className="kot-actions">
      {getButtons()}
      <button 
        className="btn-danger btn-icon"
        onClick={() => onUpdateStatus(kot.name, 'Cancelled')}
        title="Cancel KOT"
      >
        <i className="fa fa-times"></i>
      </button>
    </div>
  )
}
```

##### 4. **Main App with Columns**

```jsx
// src/apps/kitchen/App.jsx (REFACTORED)
import { useState, useEffect } from 'react'
import { useKOTList, useUpdateKOTStatus } from '@/shared/api/imogi-api'
import { KOTColumn } from './components/KOTColumn'
import { FilterControls } from './components/FilterControls'
import { useKOTRealtime } from './hooks/useKOTRealtime'

function KitchenContent({ initialState }) {
  const { user, loading: authLoading, hasAccess } = useAuth(['Kitchen Staff'])
  
  const branch = initialState.branch
  const kitchen = initialState.kitchen
  const station = initialState.station
  
  // Fetch KOTs
  const { data: allKOTs, mutate } = useKOTList(branch, kitchen, station)
  const { call: updateStatus, loading: updating } = useUpdateKOTStatus()
  
  // Local state for columns
  const [kotsByState, setKotsByState] = useState({
    queued: [],
    preparing: [],
    ready: []
  })
  
  // Group KOTs by state
  useEffect(() => {
    if (allKOTs) {
      const grouped = {
        queued: [],
        preparing: [],
        ready: []
      }
      
      allKOTs.forEach(kot => {
        const state = normalizeState(kot.workflow_state)
        if (grouped[state]) {
          grouped[state].push(kot)
        }
      })
      
      setKotsByState(grouped)
    }
  }, [allKOTs])
  
  // Realtime updates
  useKOTRealtime(kitchen, station, (event) => {
    if (event.type === 'kot_created' || event.type === 'kot_updated') {
      mutate() // Refresh data
    } else if (event.type === 'kot_removed') {
      mutate()
    }
  })
  
  // Handle status update
  const handleUpdateStatus = async (kotName, newState) => {
    try {
      await updateStatus({ 
        kot_ticket: kotName, 
        state: newState 
      })
      
      // Optimistic update
      mutate()
      
      // Show notification
      showToast(`KOT ${kotName} updated to ${newState}`)
    } catch (error) {
      console.error('Failed to update KOT:', error)
      showError(error.message)
    }
  }
  
  return (
    <div className="kitchen-display">
      <KitchenHeader 
        kitchen={kitchen}
        station={station}
        totalKOTs={allKOTs?.length || 0}
      />
      
      <FilterControls 
        station={station}
        onStationChange={(s) => setStation(s)}
      />
      
      <div className="kot-columns-container">
        <KOTColumn 
          state="queued"
          kots={kotsByState.queued}
          onUpdateStatus={handleUpdateStatus}
        />
        
        <KOTColumn 
          state="preparing"
          kots={kotsByState.preparing}
          onUpdateStatus={handleUpdateStatus}
        />
        
        <KOTColumn 
          state="ready"
          kots={kotsByState.ready}
          onUpdateStatus={handleUpdateStatus}
        />
      </div>
    </div>
  )
}

function normalizeState(workflowState) {
  const stateMap = {
    'Queued': 'queued',
    'In Progress': 'preparing',
    'Ready': 'ready',
    'Served': null, // Don't display
    'Cancelled': null // Don't display
  }
  return stateMap[workflowState] || 'queued'
}
```

##### 5. **Realtime Hook**

```jsx
// src/apps/kitchen/hooks/useKOTRealtime.js
import { useEffect } from 'react'

export function useKOTRealtime(kitchen, station, onEvent) {
  useEffect(() => {
    if (!window.frappe?.realtime) return
    
    // Subscribe to kitchen channel
    const kitchenChannel = `kitchen:${kitchen}`
    const stationChannel = station ? `station:${station}` : null
    
    const handleEvent = (data) => {
      onEvent({
        type: data.event_type,
        kot: data.kot,
        items: data.items
      })
    }
    
    frappe.realtime.on(kitchenChannel, handleEvent)
    if (stationChannel) {
      frappe.realtime.on(stationChannel, handleEvent)
    }
    
    // Cleanup
    return () => {
      frappe.realtime.off(kitchenChannel, handleEvent)
      if (stationChannel) {
        frappe.realtime.off(stationChannel, handleEvent)
      }
    }
  }, [kitchen, station, onEvent])
}
```

---

## 👨‍🍳 Waiter React App

### Current Implementation

**File:** `src/apps/waiter/App.jsx`

```jsx
// Currently just shows tables and menu items
<Card title="Table Layout">
  {tables.map(table => (
    <div>{table.name}</div>
  ))}
</Card>

<Card title="Menu Items">
  <p>Available items: {items.length}</p>
</Card>
```

### ❌ Critical Issues

#### 1. **No Order Flow**
- Missing: Create order from table
- Missing: Add items to cart
- Missing: Send to kitchen
- Missing: Monitor kitchen status

#### 2. **No Integration with Backend**
- No API call to `open_or_create_for_table`
- No cart management
- No KOT creation

#### 3. **No Customer/Table Management**
- Can't select table
- Can't create order for table
- Can't see order status

### ✅ What Needs to Be Built

#### **Component Structure**

```
waiter/
├── App.jsx
├── components/
│   ├── TableLayout.jsx
│   ├── OrderCart.jsx
│   ├── MenuCatalog.jsx
│   ├── VariantSelector.jsx
│   ├── KitchenStatusBadge.jsx
│   └── ActionBar.jsx
├── hooks/
│   ├── useTableOrder.js
│   ├── useCart.js
│   └── useKitchenStatus.js
└── utils/
    └── orderHelpers.js
```

#### **Required Implementation**

##### 1. **Table Selection & Order Creation**

```jsx
// src/apps/waiter/components/TableLayout.jsx
export function TableLayout({ tables, onSelectTable }) {
  return (
    <div className="table-layout">
      {tables.map(table => (
        <TableCard 
          key={table.name}
          table={table}
          onClick={() => onSelectTable(table)}
        />
      ))}
    </div>
  )
}

function TableCard({ table, onClick }) {
  const statusColors = {
    'Available': '#10b981',
    'Occupied': '#fbbf24',
    'Reserved': '#3b82f6'
  }
  
  return (
    <div 
      className="table-card"
      style={{ borderColor: statusColors[table.status] }}
      onClick={onClick}
    >
      <h3>{table.name}</h3>
      <div className="status">{table.status}</div>
      {table.current_pos_order && (
        <div className="order-badge">
          Order: {table.current_pos_order}
        </div>
      )}
    </div>
  )
}
```

##### 2. **Order Cart**

```jsx
// src/apps/waiter/components/OrderCart.jsx
export function OrderCart({ 
  items, 
  onUpdateQty, 
  onRemoveItem,
  onSendToKitchen,
  kitchenStatuses 
}) {
  const total = items.reduce((sum, item) => sum + (item.qty * item.rate), 0)
  
  return (
    <div className="order-cart">
      <h2>Current Order</h2>
      
      <div className="cart-items">
        {items.map(item => (
          <CartItem 
            key={item.name}
            item={item}
            kitchenStatus={kitchenStatuses[item.name]}
            onUpdateQty={onUpdateQty}
            onRemove={onRemoveItem}
          />
        ))}
      </div>
      
      <div className="cart-footer">
        <div className="total">
          Total: Rp {formatMoney(total)}
        </div>
        
        <button 
          className="btn-primary btn-large"
          onClick={onSendToKitchen}
          disabled={items.length === 0}
        >
          Send to Kitchen
        </button>
      </div>
    </div>
  )
}

function CartItem({ item, kitchenStatus, onUpdateQty, onRemove }) {
  return (
    <div className="cart-item">
      <div className="item-info">
        <span className="name">{item.item_name}</span>
        {item.notes && <span className="notes">📝 {item.notes}</span>}
        {kitchenStatus && (
          <KitchenStatusBadge status={kitchenStatus} />
        )}
      </div>
      
      <div className="item-controls">
        <div className="qty-control">
          <button onClick={() => onUpdateQty(item, -1)}>-</button>
          <span>{item.qty}</span>
          <button onClick={() => onUpdateQty(item, 1)}>+</button>
        </div>
        
        <span className="amount">
          Rp {formatMoney(item.qty * item.rate)}
        </span>
        
        <button 
          className="btn-danger btn-icon"
          onClick={() => onRemove(item)}
        >
          <i className="fa fa-trash"></i>
        </button>
      </div>
    </div>
  )
}
```

##### 3. **Main Waiter App**

```jsx
// src/apps/waiter/App.jsx (REFACTORED)
import { useState, useEffect } from 'react'
import { useTableOrder } from './hooks/useTableOrder'
import { useCart } from './hooks/useCart'
import { TableLayout } from './components/TableLayout'
import { OrderCart } from './components/OrderCart'
import { MenuCatalog } from './components/MenuCatalog'

function WaiterContent({ initialState }) {
  const { user, loading: authLoading, hasAccess } = useAuth(['Waiter'])
  
  const branch = initialState.branch
  const posProfile = initialState.pos_profile
  
  // Tables and items
  const { data: tables } = useTables(branch)
  const { data: menuItems } = useItems(branch, posProfile)
  
  // Current order state
  const [selectedTable, setSelectedTable] = useState(null)
  const [currentOrder, setCurrentOrder] = useState(null)
  
  // Cart management
  const {
    cart,
    addItem,
    updateQty,
    removeItem,
    clearCart
  } = useCart()
  
  // Kitchen status tracking
  const [kitchenStatuses, setKitchenStatuses] = useState({})
  
  // Handle table selection
  const handleSelectTable = async (table) => {
    setSelectedTable(table)
    
    // Load or create order for table
    try {
      const order = await frappe.call({
        method: 'imogi_pos.api.orders.open_or_create_for_table',
        args: {
          table: table.name,
          floor: table.floor,
          pos_profile: posProfile
        }
      })
      
      setCurrentOrder(order.message)
      
      // Load existing items to cart
      if (order.message.items) {
        clearCart()
        order.message.items.forEach(item => {
          addItem(item)
        })
      }
    } catch (error) {
      console.error('Failed to load order:', error)
    }
  }
  
  // Handle send to kitchen
  const handleSendToKitchen = async () => {
    if (!currentOrder) return
    
    try {
      // First save order with items
      await frappe.call({
        method: 'imogi_pos.api.orders.update_order',
        args: {
          order_name: currentOrder.name,
          items: cart
        }
      })
      
      // Create KOT
      const result = await frappe.call({
        method: 'imogi_pos.api.kot.create_kot_from_order',
        args: {
          pos_order: currentOrder.name,
          send_to_kitchen: true
        }
      })
      
      if (result.message.success) {
        frappe.show_alert({
          message: 'Order sent to kitchen successfully',
          indicator: 'green'
        })
        
        // Mark items as sent
        cart.forEach(item => {
          item.sent_to_kitchen = true
        })
      }
    } catch (error) {
      console.error('Failed to send to kitchen:', error)
      frappe.show_alert({
        message: error.message,
        indicator: 'red'
      })
    }
  }
  
  // Monitor kitchen status
  useEffect(() => {
    if (!currentOrder) return
    
    const channel = `pos_order:${currentOrder.name}`
    
    const handleKOTUpdate = (data) => {
      if (data.event_type === 'kot_updated') {
        // Update kitchen statuses
        const statuses = {}
        data.kot.items.forEach(item => {
          statuses[item.pos_order_item] = item.workflow_state
        })
        setKitchenStatuses(prev => ({ ...prev, ...statuses }))
      }
    }
    
    frappe.realtime.on(channel, handleKOTUpdate)
    
    return () => {
      frappe.realtime.off(channel, handleKOTUpdate)
    }
  }, [currentOrder])
  
  return (
    <div className="waiter-app">
      <WaiterHeader 
        table={selectedTable}
        orderNumber={currentOrder?.name}
      />
      
      <div className="waiter-layout">
        {!selectedTable ? (
          <TableLayout 
            tables={tables}
            onSelectTable={handleSelectTable}
          />
        ) : (
          <div className="order-workspace">
            <div className="menu-section">
              <MenuCatalog 
                items={menuItems}
                onSelectItem={addItem}
              />
            </div>
            
            <div className="cart-section">
              <OrderCart 
                items={cart}
                kitchenStatuses={kitchenStatuses}
                onUpdateQty={updateQty}
                onRemoveItem={removeItem}
                onSendToKitchen={handleSendToKitchen}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## 💰 Cashier Console React App

### Current Implementation

**File:** `src/apps/cashier-console/App.jsx`

✅ **Good Foundation:**
- Has mode detection (Counter/Table)
- Has order list sidebar
- Has variant picker integration
- Has payment view
- Has split bill view

### ⚠️ Issues to Fix

#### 1. **API Integration**

**Current:**
```javascript
const { data: orders } = useOrderHistory(branch, posProfile, orderType)
```

**Needs:**
- Filter by workflow_state: ['To Bill', 'Ready']
- Show table info for Table mode
- Show KOT status

#### 2. **Generate Invoice Flow**

**Missing:**
```javascript
const handleGenerateInvoice = async (orderName) => {
  const invoice = await frappe.call({
    method: 'imogi_pos.api.billing.generate_invoice',
    args: {
      pos_order: orderName,
      pos_profile: posProfile,
      user: user.name
    }
  })
  
  // Then show payment dialog
  setCurrentInvoice(invoice.message)
  setShowPayment(true)
}
```

#### 3. **Payment Processing**

**Current:**
- Has PaymentView component ✅
- Missing: Submit payment API call
- Missing: Change calculation
- Missing: Receipt printing

**Needs:**
```javascript
const handlePaymentSubmit = async (paymentData) => {
  const result = await frappe.call({
    method: 'imogi_pos.api.billing.submit_payment',
    args: {
      sales_invoice: currentInvoice.name,
      mode_of_payment: paymentData.method,
      amount_paid: paymentData.amount
    }
  })
  
  if (result.message.success) {
    // Print receipt
    printReceipt(currentInvoice, paymentData)
    
    // Close payment dialog
    setShowPayment(false)
    
    // Refresh order list
    mutateOrders()
  }
}
```

### ✅ Improvements Needed

#### **OrderListSidebar Component**

```jsx
// Add KOT status indicators
function OrderCard({ order }) {
  return (
    <div className="order-card">
      {/* ... existing code ... */}
      
      {/* Add KOT status */}
      {order.kot_tickets && (
        <div className="kot-status">
          {order.all_served ? (
            <span className="badge-success">✅ All Served</span>
          ) : (
            <span className="badge-warning">
              ⏳ {order.pending_items} items in kitchen
            </span>
          )}
        </div>
      )}
    </div>
  )
}
```

#### **Add Invoice Generation Button**

```jsx
// In OrderDetailPanel
<button 
  className="btn-primary"
  onClick={() => onGenerateInvoice(order.name)}
  disabled={!order.all_served}
>
  Generate Invoice
</button>
```

---

## 🔧 Required API Updates

### Kitchen API

```python
# imogi_pos/api/kot.py

@frappe.whitelist()
def get_kot_list(branch, kitchen=None, station=None, status=None):
    """Get KOT list for kitchen display"""
    
    filters = {"branch": branch}
    
    if kitchen:
        filters["kitchen"] = kitchen
    
    if station:
        filters["station"] = station
    
    if status:
        if status == "Pending":
            filters["workflow_state"] = ["in", ["Queued", "In Progress", "Ready"]]
        else:
            filters["workflow_state"] = status
    
    kots = frappe.get_all(
        "KOT Ticket",
        filters=filters,
        fields=["*"],
        order_by="creation asc"
    )
    
    # Enrich with items
    for kot in kots:
        kot["items"] = frappe.get_all(
            "KOT Item",
            filters={"parent": kot.name},
            fields=["*"]
        )
    
    return kots
```

### Waiter API

```python
# imogi_pos/api/orders.py

@frappe.whitelist()
def open_or_create_for_table(table, floor=None, pos_profile=None):
    """Open existing order or create new for table"""
    
    # Check for existing order
    existing = frappe.db.get_value(
        "POS Order",
        {
            "table": table,
            "workflow_state": ["not in", ["Completed", "Cancelled"]],
            "docstatus": ["<", 2]
        }
    )
    
    if existing:
        return frappe.get_doc("POS Order", existing)
    
    # Create new order
    order = frappe.get_doc({
        "doctype": "POS Order",
        "table": table,
        "floor": floor,
        "order_type": "Dine In",
        "pos_profile": pos_profile,
        "branch": frappe.db.get_value("POS Profile", pos_profile, "imogi_branch"),
        "workflow_state": "Draft",
        "customer": "Walk-in Customer"
    })
    order.insert()
    
    # Update table
    frappe.db.set_value("Restaurant Table", table, {
        "status": "Occupied",
        "current_pos_order": order.name
    })
    
    return order
```

---

## 📝 Implementation Priority

### Phase 1: Critical (1-2 weeks)

1. **Kitchen Display Column Layout** 🔴
   - Implement 3-column layout (Queued, In Progress, Ready)
   - Add proper state transition buttons
   - Show item details with notes
   
2. **Kitchen Realtime Updates** 🔴
   - Implement socket.io event handlers
   - Auto-update on KOT changes
   - Sound notifications

3. **Waiter Order Flow** 🔴
   - Table selection → Order creation
   - Cart management
   - Send to kitchen functionality

### Phase 2: Important (2-3 weeks)

4. **Waiter Kitchen Status Monitoring** 🟡
   - Show kitchen status badges on items
   - Realtime updates from kitchen
   - Visual indicators (colors, icons)

5. **Cashier Invoice Generation** 🟡
   - Complete generate invoice flow
   - Validate order ready for billing
   - Show KOT status in order list

6. **Cashier Payment Processing** 🟡
   - Submit payment API integration
   - Change calculation
   - Receipt printing

### Phase 3: Enhancement (3-4 weeks)

7. **Advanced Features** 🟢
   - Kitchen station filtering
   - Order search/filter
   - Multi-payment support
   - Split bill improvements

---

## 🎨 UI/UX Recommendations

### Kitchen Display

```css
.kot-columns-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  padding: 1rem;
}

.kot-column {
  background: #f9fafb;
  border-radius: 8px;
  padding: 1rem;
}

.kot-column[data-state="queued"] {
  border-top: 4px solid #fbbf24;
}

.kot-column[data-state="preparing"] {
  border-top: 4px solid #3b82f6;
}

.kot-column[data-state="ready"] {
  border-top: 4px solid #10b981;
}

.kot-card {
  background: white;
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  transition: transform 0.2s;
}

.kot-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.kot-card.new {
  animation: highlight 1s ease-in-out;
}

@keyframes highlight {
  0%, 100% { background: white; }
  50% { background: #fef3c7; }
}
```

### Waiter Interface

```css
.waiter-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
  height: calc(100vh - 60px);
}

.menu-section {
  overflow-y: auto;
  padding: 1rem;
}

.cart-section {
  position: sticky;
  top: 0;
  height: 100%;
  background: white;
  border-left: 1px solid #e5e7eb;
}

.cart-item {
  display: flex;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.kitchen-status-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.kitchen-status-badge.queued {
  background: #fef3c7;
  color: #92400e;
}

.kitchen-status-badge.in-progress {
  background: #dbeafe;
  color: #1e40af;
}

.kitchen-status-badge.ready {
  background: #d1fae5;
  color: #065f46;
}
```

---

## 🧪 Testing Checklist

### Kitchen Display
- [ ] KOTs appear in correct column based on state
- [ ] State transition buttons work correctly
- [ ] Realtime updates reflect immediately
- [ ] Sound plays on new KOT
- [ ] Items show with qty and notes
- [ ] Elapsed time updates
- [ ] Return to queue/kitchen works
- [ ] Cancel KOT works with confirmation

### Waiter App
- [ ] Table selection opens/creates order
- [ ] Add items to cart
- [ ] Update qty works
- [ ] Remove item works
- [ ] Send to kitchen creates KOT
- [ ] Kitchen status shows on items
- [ ] Realtime updates from kitchen
- [ ] Can add more items after sending to kitchen

### Cashier Console
- [ ] Mode detection works (Counter/Table)
- [ ] Order list filters correctly
- [ ] Generate invoice button appears
- [ ] Invoice generation works
- [ ] Payment dialog shows
- [ ] Payment submission works
- [ ] Change calculation correct
- [ ] Receipt prints
- [ ] Order removed from list after completion

---

## 📚 Related Files

**Kitchen:**
- [src/apps/kitchen/App.jsx](src/apps/kitchen/App.jsx)
- [src/shared/api/imogi-api.js](src/shared/api/imogi-api.js)
- [imogi_pos/api/kot.py](imogi_pos/api/kot.py)

**Waiter:**
- [src/apps/waiter/App.jsx](src/apps/waiter/App.jsx)
- [imogi_pos/api/orders.py](imogi_pos/api/orders.py)

**Cashier:**
- [src/apps/cashier-console/App.jsx](src/apps/cashier-console/App.jsx)
- [src/apps/cashier-console/components/](src/apps/cashier-console/components/)
- [imogi_pos/api/billing.py](imogi_pos/api/billing.py)

---

**Last Updated:** January 25, 2026  
**Status:** Analysis Complete - Ready for Implementation
