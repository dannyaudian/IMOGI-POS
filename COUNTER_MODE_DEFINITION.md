# Counter Mode Definition - Cashier Console React

## ✅ **Mode Counter Sudah Didefinisikan Secara Eksplisit**

### 📋 **Mode Configuration Object**

```javascript
// Di OrderListSidebar.jsx
const MODE_CONFIG = {
  'Counter': {
    label: 'Counter Mode',
    icon: 'fa-cash-register',
    color: '#ff9800'
  },
  'Table': {
    label: 'Table/Waiter Mode',
    icon: 'fa-utensils',
    color: '#2196f3'
  }
}
```

### 🎯 **Mode Validation & Default**

```javascript
// Di App.jsx
const validModes = ['Counter', 'Table']
const posMode = validModes.includes(initialState.pos_mode) 
  ? initialState.pos_mode 
  : 'Counter' // Default ke Counter jika tidak valid

// Mapping mode ke order type
const MODE_TO_ORDER_TYPE = {
  'Counter': 'Counter',
  'Table': 'Dine In'
}
const orderType = MODE_TO_ORDER_TYPE[posMode]
```

## 🎨 **Visual Indicators untuk Mode Counter**

### 1. **Mode Indicator Header**
- **Counter Mode**: Orange gradient (`#ff9800` → `#f57c00`)
- **Table Mode**: Blue gradient (`#2196f3` → `#1976d2`)

```css
/* Counter Mode */
.cashier-console[data-pos-mode="Counter"] .mode-indicator {
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
}

/* Table Mode */
.cashier-console[data-pos-mode="Table"] .mode-indicator {
  background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
}
```

### 2. **Order Card Badges**

**Counter Orders:**
- Badge: 🏪 "Counter"
- Background: `#fff3e0` (light orange)
- Text: `#f57c00` (dark orange)

**Table Orders:**
- Badge: 🍴 "Table [number]"
- Background: `#e3f2fd` (light blue)
- Text: `#1976d2` (dark blue)

```jsx
// Counter order badge
{!order.table_name && currentMode === 'Counter' && (
  <span className="order-card-badge badge-counter">
    <i className="fa fa-cash-register"></i>
    Counter
  </span>
)}

// Table order badge
{order.table_name && (
  <span className="order-card-badge badge-table">
    <i className="fa fa-utensils"></i>
    {order.table_name}
  </span>
)}
```

### 3. **Order Detail Header**

**Counter Mode:**
```jsx
{isCounterMode && (
  <span className="order-meta-item">
    <i className="fa fa-cash-register"></i>
    Counter Order
  </span>
)}
```

**Table Mode:**
```jsx
{isTableMode && order.table_name && (
  <span className="order-meta-item">
    <i className="fa fa-utensils"></i>
    Table: {order.table_name}
  </span>
)}
```

## 🔍 **Mode Detection Flow**

```
1. initialState.pos_mode dari server
   ↓
2. Validasi: apakah 'Counter' atau 'Table'?
   ↓
3. Jika tidak valid → default: 'Counter'
   ↓
4. Set posMode = 'Counter' atau 'Table'
   ↓
5. Map ke orderType:
   - Counter → 'Counter'
   - Table → 'Dine In'
   ↓
6. Fetch orders dengan orderType filter
   ↓
7. Display dengan visual indicator sesuai mode
```

## 📊 **Mode Counter Characteristics**

| Aspek | Counter Mode | Table Mode |
|-------|--------------|------------|
| **Icon** | 💵 `fa-cash-register` | 🍴 `fa-utensils` |
| **Color** | Orange (#ff9800) | Blue (#2196f3) |
| **Order Type** | 'Counter' | 'Dine In' |
| **Table Field** | ❌ Hidden | ✅ Displayed |
| **Badge** | "Counter" | "Table [X]" |
| **Label** | "Counter Mode" | "Table/Waiter Mode" |
| **Use Case** | Walk-in, Take Away | Dine In, Table Service |

## ✅ **Validation Rules**

1. **Mode Input Validation:**
   ```javascript
   validModes.includes(initialState.pos_mode)
   ```

2. **Fallback Safety:**
   - Jika `pos_mode` undefined → 'Counter'
   - Jika `pos_mode` invalid → 'Counter'
   - Jika `pos_mode` null → 'Counter'

3. **Config Fallback:**
   ```javascript
   const modeConfig = MODE_CONFIG[currentMode] || MODE_CONFIG['Counter']
   ```

## 🎯 **Counter Mode Features**

### ✅ Sudah Ada:
- Explicit mode configuration object
- Validation dengan fallback ke Counter
- Orange visual theme untuk Counter
- Counter badge di order cards
- "Counter Order" label di detail
- Icon cash register (`fa-cash-register`)
- Order type mapping ke 'Counter'

### 🎨 UI Elements:
1. **Sidebar Header**: Orange gradient indicator
2. **Order Cards**: Orange "Counter" badge
3. **Order Details**: "Counter Order" meta info
4. **Data Attribute**: `data-pos-mode="Counter"`

## 💡 **Example Usage**

### Setting Counter Mode:
```javascript
// Di POS Profile atau initialState
{
  pos_mode: 'Counter',
  branch: 'Main Branch',
  pos_profile: 'Counter POS'
}
```

### Result:
- Mode indicator: 🏪 **Counter Mode** (orange)
- Orders filtered: type = 'Counter'
- Order cards: Orange "Counter" badge
- No table selection required

---

**Kesimpulan:** Mode Counter **SUDAH FULLY DEFINED** dengan:
- ✅ Explicit configuration object
- ✅ Validation & fallback
- ✅ Visual theming (orange)
- ✅ Proper order type mapping
- ✅ UI indicators di semua komponen
