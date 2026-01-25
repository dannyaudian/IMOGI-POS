# Cashier Apps - Architecture Overview

## 📱 Dual Cashier Apps

IMOGI POS memiliki **2 aplikasi cashier** yang berbeda untuk use case yang berbeda:

---

## 1️⃣ Cashier Console (`cashier-console`)

### 🎯 Use Case
**Counter/Retail Mode** - Quick service, walk-in customers

### 📍 Access
- URL: `/counter` atau `/retail`
- Mode: Counter POS / Retail POS

### ✨ Features
- **Direct Order Entry** - Cashier langsung input order
- **Catalog View** - Browse menu dan tambah items
- **Variant Picker** - Pilih variant saat order
- **Split Bill** - Split payment untuk satu order
- **Order History** - Lihat order history
- **Quick Payment** - Fast checkout untuk walk-in

### 🔄 Workflow
```
Cashier → Add Items → Payment → Invoice → Complete
```

### 💼 Best For
- ✅ Retail stores
- ✅ Quick service restaurants
- ✅ Food courts
- ✅ Counter service
- ✅ Walk-in customers

---

## 2️⃣ Cashier Payment (`cashier-payment`)

### 🎯 Use Case
**Table Service Mode** - Restaurant dengan waiter & kitchen

### 📍 Access
- URL: `/cashier-payment`
- Mode: Restaurant/Table Service

### ✨ Features
- **Pending Orders** - Orders dari waiter yang sudah siap
- **KOT Status** - Lihat status kitchen per station
- **Customer Management** - Search/create/walk-in
- **Payment Methods** - Cash/QRIS/Card
- **Change Calculator** - Auto-calculate change
- **Customer Display** - Realtime updates ke display
- **Invoice Preview** - Preview sebelum print
- **Table Clearing** - Auto-clear table setelah payment

### 🔄 Workflow
```
Waiter → Order → Kitchen → KOT Served → Cashier Payment → Invoice → Table Cleared
```

### 💼 Best For
- ✅ Full-service restaurants
- ✅ Fine dining
- ✅ Table service dengan waiter
- ✅ Multi-station kitchens
- ✅ Customer facing displays

---

## 🔀 Comparison Matrix

| Feature | Cashier Console | Cashier Payment |
|---------|----------------|-----------------|
| **Order Entry** | ✅ Direct (Cashier creates) | ❌ From Waiter only |
| **Catalog View** | ✅ Yes | ❌ No (orders already created) |
| **Variant Picker** | ✅ Yes | ❌ No |
| **KOT Integration** | ❌ No | ✅ Yes (show KOT status) |
| **Pending Orders** | ✅ Order history | ✅ Ready-to-pay orders |
| **Payment Methods** | ✅ Basic | ✅ Advanced (with change) |
| **Split Bill** | ✅ Yes | 🔄 Planned |
| **Customer Display** | ❌ No | ✅ Yes (realtime) |
| **Table Management** | ❌ No | ✅ Yes (auto-clear) |
| **Receipt Print** | ✅ Basic | ✅ Advanced preview |
| **Target Mode** | Counter/Retail | Restaurant/Table |

---

## 🏗️ Technical Architecture

### Cashier Console
```
src/apps/cashier-console/
├── App.jsx                 # Main counter POS app
├── components/
│   ├── CatalogView         # Menu browser
│   ├── OrderListSidebar    # Order history
│   ├── OrderDetailPanel    # Order items
│   ├── PaymentView         # Payment processing
│   ├── SplitBillView       # Split bill
│   └── VariantPickerModal  # Variant selection
└── App.css

Access: /counter, /retail
Build: npm run build:cashier
```

### Cashier Payment
```
src/apps/cashier-payment/
├── App.jsx                 # Table service payment
├── components/
│   ├── OrderList           # Pending orders (from waiter)
│   ├── OrderDetails        # Items + KOT status
│   ├── PaymentPanel        # Payment methods + change
│   ├── InvoicePreview      # Receipt preview
│   ├── CustomerInfo        # Customer management
│   └── CashierHeader       # Session info
├── hooks/
│   ├── usePaymentProcessor # Payment workflow
│   ├── useCashierSession   # Session state
│   └── useQRISPayment      # QRIS handling
└── cashier.css

Access: /cashier-payment
Build: npm run build:cashier-payment
```

---

## 🚀 Development

### Run Locally
```bash
# Cashier Console (Counter Mode)
npm run dev:cashier

# Cashier Payment (Table Service)
npm run dev:cashier-payment
```

### Build
```bash
# Build both
npm run build:cashier
npm run build:cashier-payment

# Or build all apps
npm run build:all
```

---

## 📋 Which One to Use?

### Use **Cashier Console** if:
- ✅ Cashier langsung terima order dari customer
- ✅ Quick service / fast food
- ✅ Retail / counter mode
- ✅ Tidak ada waiter atau kitchen terpisah
- ✅ Simple workflow

### Use **Cashier Payment** if:
- ✅ Ada waiter yang input order
- ✅ Ada kitchen dengan multiple stations
- ✅ Full restaurant service
- ✅ Perlu track KOT status
- ✅ Perlu customer display
- ✅ Table management

---

## 🔄 Can I Use Both?

**Yes!** Anda bisa gunakan kedua apps dalam satu sistem:

**Example Setup:**
- **Restaurant Area** → Cashier Payment (table service)
- **Takeaway Counter** → Cashier Console (quick orders)
- **Bar Area** → Cashier Console (counter service)

Set mode via **POS Profile** settings:
- `pos_mode = "Table"` → Redirect to Cashier Payment
- `pos_mode = "Counter"` → Redirect to Cashier Console

---

## 📚 Documentation

**Cashier Console:**
- Existing implementation (Counter POS)
- Focus: Direct order entry + quick payment

**Cashier Payment:**
- [PHASE_2_IMPLEMENTATION_PLAN.md](PHASE_2_IMPLEMENTATION_PLAN.md)
- [CASHIER_REACT_COMPLETE.md](CASHIER_REACT_COMPLETE.md)
- [CASHIER_QUICKREF.md](CASHIER_QUICKREF.md)

---

**Last Updated:** January 26, 2026
