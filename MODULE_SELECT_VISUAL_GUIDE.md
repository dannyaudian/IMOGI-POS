# Module Select - Visual Design Guide (Updated)

## Tampilan Berdasarkan Status Session

### 1. TANPA POS Opening (Kasir Locked, Lainnya Available)

```
┌──────────────────────────────────────────────────────────────────┐
│ 🏪 IMOGI POS    Branch: Main ▼  Session: - ▼   John [Logout]    │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ 💰 🔒          │  │ 👨‍🍳             │  │ 📱             │
│ Cashier        │  │ Waiter          │  │ Kiosk          │
│ POS cashier... │  │ Table service.. │  │ Self-service.. │
│ ⚠️ NEEDS       │  │ ✅ ALWAYS      │  │ ✅ ALWAYS     │
│    OPENING     │  │    AVAILABLE   │  │    AVAILABLE  │
│          🔒    │  │           →    │  │           →   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
   LOCKED             CLICKABLE           CLICKABLE
   Grayed out         Full color          Full color
```

### 2. DENGAN POS Opening (Semua Available)

```
┌──────────────────────────────────────────────────────────────────┐
│ 🏪 IMOGI POS    Branch: Main ▼  Session: John-09:00 ▼  [Logout] │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ 💰             │  │ 👨‍🍳             │  │ 📱             │
│ Cashier        │  │ Waiter          │  │ Kiosk          │
│ POS cashier... │  │ Table service.. │  │ Self-service.. │
│ ✅ SESSION     │  │ ✅ ALWAYS      │  │ ✅ ALWAYS     │
│    ACTIVE      │  │    AVAILABLE   │  │    AVAILABLE  │
│           →    │  │           →    │  │           →   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
   CLICKABLE          CLICKABLE           CLICKABLE
   Full color         Full color          Full color
```

---

## Badge States (3 Types)

### ✅ SESSION ACTIVE (Green)
- **When:** Cashier module + POS Opening exists
- **Color:** Green `#27ae60`
- **Meaning:** Ready to use
- **Clickable:** YES

### ⚠️ NEEDS POS OPENING (Orange)
- **When:** Cashier module + NO POS Opening
- **Color:** Orange `#f39c12`
- **Meaning:** Must open session first
- **Clickable:** NO (locked)

### ✅ ALWAYS AVAILABLE (Blue)
- **When:** Kiosk/Kitchen/Waiter/Self Order
- **Color:** Blue `#3498db`
- **Meaning:** No session required
- **Clickable:** YES

---

## Multi-Device Scenario

### Setup: 1 Restaurant dengan 3 Counter + 2 Kiosk + 1 Kitchen

#### Counter 1 (Device ID: counter-1, User: kasir.a)
**Login → Module Select tampil:**
```
💰 Cashier → ⚠️ NEEDS POS OPENING (locked)
👨‍🍳 Waiter → ✅ ALWAYS AVAILABLE
📱 Kiosk → ✅ ALWAYS AVAILABLE  
🔥 Kitchen → ✅ ALWAYS AVAILABLE
```
**Action:** Click Cashier → Dialog "Please Open POS Session"
**After Opening:** Cashier → ✅ SESSION ACTIVE

---

#### Counter 2 (Device ID: counter-2, User: kasir.b)
**Login → Module Select tampil:**
```
💰 Cashier → ⚠️ NEEDS POS OPENING (locked)
👨‍🍳 Waiter → ✅ ALWAYS AVAILABLE
```
**Each counter has separate POS Opening Entry!**

---

#### Kiosk 1 (Device ID: kiosk-1, No specific user)
**Module Select tampil:**
```
📱 Kiosk → ✅ ALWAYS AVAILABLE
```
**No Cashier module** (Kiosk user tidak punya role Cashier)
**No POS Opening needed** (Kiosk doesn't require session)

**Order Flow:**
1. Customer pilih menu
2. Submit order
3. Payment options:
   - Cash → Print queue number → Bayar di counter
   - QRIS/Card → Payment gateway

---

#### Kitchen Display (Device ID: kitchen-1)
**Module Select tampil:**
```
🔥 Kitchen → ✅ ALWAYS AVAILABLE
```
**Kitchen receives orders from:**
- Counter 1 (kasir.a) ✅
- Counter 2 (kasir.b) ✅
- Counter 3 (kasir.c) ✅
- Kiosk 1 ✅
- Kiosk 2 ✅
- Self Order (QR) ✅

**Kitchen API filters by BRANCH only**, not device or session!

---

## Module Requirements Reference

| Module | Requires Opening | Requires Role | Always Available |
|--------|-----------------|---------------|------------------|
| 💰 Cashier | ✅ YES | Cashier | ❌ Need session |
| 👨‍🍳 Waiter | ❌ NO | Waiter | ✅ Always |
| 📱 Kiosk | ❌ NO | Kiosk/Guest | ✅ Always |
| 🛒 Self Order | ❌ NO | Guest | ✅ Always |
| 🔥 Kitchen | ❌ NO | Kitchen Staff | ✅ Always |
| 📺 Customer Display | ❌ NO | Guest | ✅ Always |

---

## Visual Cues Summary

### Module LOCKED (Need Opening)
- Icon: **Lock overlay** 🔒 on module icon
- Card: **Grayed out**, opacity 0.6
- Badge: **⚠️ NEEDS POS OPENING** (orange)
- Arrow: **Lock icon** 🔒 instead of arrow
- Hover: **No effect**
- Cursor: **not-allowed**
- Click: **Shows dialog**

### Module ACTIVE (With Opening)
- Icon: **Normal** (no overlay)
- Card: **Full color**
- Badge: **✅ SESSION ACTIVE** (green)
- Arrow: **→** (arrow icon)
- Hover: **Lift + shadow**
- Cursor: **pointer**
- Click: **Navigate to module**

### Module ALWAYS AVAILABLE (No Opening Needed)
- Icon: **Normal** (no overlay)
- Card: **Full color**
- Badge: **✅ ALWAYS AVAILABLE** (blue)
- Arrow: **→** (arrow icon)
- Hover: **Lift + shadow**
- Cursor: **pointer**
- Click: **Navigate to module**

---

## Implementation Details

### Component Props
```jsx
<ModuleCard
  module={module}
  onClick={handleModuleClick}
  posOpeningStatus={{
    hasOpening: true/false,
    posOpeningEntry: "POS-OP-2026-00001",
    user: "kasir.a@imogi.com",
    openingBalance: 500000
  }}
/>
```

### CSS Classes Applied
```jsx
// Module locked (need opening but no session)
<div className="module-card module-locked color-cashier">

// Module active (with session or always available)
<div className="module-card color-cashier">
