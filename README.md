# IMOGI POS for ERPNext v15

A modular, scalable POS solution for ERPNext v15 with minimal customization (no core patching). This app provides a comprehensive restaurant POS system with plans for retail/service variants in future phases.

## Overview

IMOGI POS follows best practices for ERPNext v15 development with a focus on modularity and scalability. The app supports multiple service modes (Table/Counter/Kiosk/Self-Order) controlled through POS Profiles for multi-outlet and multi-brand operations.

### Key Features

- **No Core Patching**: Uses DocTypes, fixtures, workflows, custom fields, hooks.py, and realtime events
- **POS Profile-first**: Service behavior, printing, and branding controlled per outlet/device
- **Domain Switching**: POS Profile's `imogi_pos_domain` field controls feature sets (Restaurant/Retail/Service)
- **Template-first Catalog**: Streamlined item selection with variant support
- **Branch-aware**: All objects carry branch information with UI filtering
- **Single Billing Path**: Sales Invoice (is_pos=1) with appropriate payments
- **Flexible Payments**: Supports partial payments with configurable rounding tolerance
- **Native POS Opening**: Optional enforcement with automatic linking

### Restaurant-specific Features

- Table management with floor layout editor
- Kitchen Order Tickets (KOT) with kitchen display
- Waiter ordering system
- Customer display support
- Self-Order via QR code scanning
- Multiple printing options (LAN/Bluetooth/OS)

## Project Structure

```
imogi_pos/
├─ fixtures/               # Workspaces, print formats, workflows, etc.
├─ imogi_pos/              # Main package
│  ├─ api/                 # API endpoints
│  ├─ doctype/             # Custom DocTypes
│  ├─ public/              # JS/CSS assets
│  │  ├─ js/
│  │  └─ css/
│  ├─ www/                 # Web pages
│  │  ├─ cashier-console/
│  │  ├─ customer-display/
│  │  ├─ kiosk/
│  │  ├─ imogi-login/
│  │  └─ so/               # Self-Order
│  └─ hooks.py             # App hooks
├─ setup.py
└─ MANIFEST.in
```

## Installation

### Prerequisites

- ERPNext v15
- Frappe Bench environment

Before installing IMOGI POS, ensure ERPNext is installed on your site and that the site has been migrated (`bench --site your-site.local migrate`).

### Installation Steps

**Prerequisites**:
- Node.js >= 18.18.0 (check with `node --version`)
- npm >= 9.6.0 (check with `npm --version`)

If you're using nvm, run `nvm use` to switch to the required Node version (configured in `.nvmrc`).

1. Get the app from GitHub:

```bash
bench get-app https://github.com/yourusername/imogi_pos
```

2. Install the app to your site:

```bash
bench --site your-site.local install-app imogi_pos
```

3. Build assets:

```bash
bench build
```

4. Load fixtures:

```bash
bench --site your-site.local migrate
```

The fixtures will automatically be loaded after migration due to the `after_migrate` hook.

## Configuration

1. **Set up POS Profiles**: Create profiles for different service modes (Table/Counter/Kiosk/Self-Order). Optionally enable `allow_non_sales_items` to skip items not marked as sales items during billing.
2. **Configure Domain**: Set `imogi_pos_domain` in POS Profile to "Restaurant" (default)
3. **Set up Kitchen Stations**: For restaurant operations, configure printers and item routing
4. **Configure Tables and Floor Layout**: Use the Table Layout Editor
5. **Assign User Roles**: Assign appropriate roles (Restaurant Manager, Cashier, Waiter, Kitchen Staff)
6. **Manage Promo Codes**: Branch Manager and Area Manager roles can configure promotional codes from **IMOGI POS → Promotions → Promo Codes** on the Desk workspace.

## Item Option Fields

Historically, items supported configurable options that could be toggled per menu
category. Deployments that do not need this behaviour can now disable it
completely. In the default configuration shipped with this repository the
feature is turned off, meaning:

- `imogi_menu_channel` and the option toggles are hidden on the Item form
- option child tables (`item_size_options`, `item_spice_options`,
  `item_topping_options`, `item_variant_options`) are no longer surfaced to users
- saving an Item will always reset the related `has_*_option` flags to `0`

### Kitchen Routing Defaults

- Configure **Menu Category → default_kitchen** and **default_kitchen_station** fields to map categories to a Kitchen and Station.
- When an Item in that category is saved, the defaults are now copied into `default_kitchen` and `default_kitchen_station` automatically if those fields are left blank.
- Manually entered values on the Item still win—existing defaults are never overwritten by the automatic routing.

## Domain Switching

The app supports multiple domains through the `imogi_pos_domain` field in POS Profile:

- **Restaurant**: Enables Table/Kitchen/KOT features
- **Retail/Service**: Coming in future updates - will hide restaurant-specific features

When not set to "Restaurant", the UI will hide restaurant-specific elements and API endpoints will restrict access to restaurant functions.

## Item Options

When the option system is disabled the `get_item_options` API returns an empty
payload for every item. Downstream billing and ordering flows therefore behave
as though no configurable modifiers are available.

## Stock Updates

Inventory deduction is controlled by the POS Profile. Enable **Update Stock** on each profile for branches where sales should affect stock levels. After an order is created the system fires an `after_create_order` hook, allowing integrators to reserve or deduct stock before the Sales Invoice is generated.

### Handling stock shortages

When **Update Stock** is enabled, invoices will fail if an item's quantity exceeds the available stock and negative stock is disabled in **Stock Settings**. To resolve this, restock the item or allow negative stock before retrying the invoice.

## Documentation

### For Developers
- **[Architecture Overview](ARCHITECTURE.md)** - System architecture, module structure, and POS profile resolver
- **[React Quickstart](REACT_QUICKSTART.md)** - Quick development guide
- **[Finalization Archive](FINALIZATION_ARCHIVE.md)** - Historical fixes, audits, and refactor notes

### For Operations
- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Fresh deploy checklist and troubleshooting
- **[Testing Guide](TESTING_GUIDE.md)** - Comprehensive testing procedures
- **[Security Summary](SECURITY_SUMMARY.md)** - Security measures and best practices

### For Maintenance
- **[Finalization Archive](FINALIZATION_ARCHIVE.md)** - Cleanup audits, implementation status, and verification notes

### Legacy Documentation (Archived)
The following phase-specific docs have been consolidated into the guides above:
- Phase summaries and interim refactoring notes
- Temporary patch documentation
- Session expiry testing scenarios
- Go/No-Go checklists

For the latest information, always refer to the current documentation above.

## Printing Setup

IMOGI POS supports ESC/POS direct printing for thermal printers via a local Print Bridge service.

### Supported Printer Types

- ✅ **Network Thermal Printer** (TCP/IP)
- ✅ **USB Thermal Printer** (Direct device)
- ✅ **Bluetooth Thermal Printer** (Wireless)

### Quick Setup (5 Minutes)

#### Step 1: Install Print Bridge on Cashier PC

```bash
# Download and setup
cd ~
mkdir imogi-print-bridge
cd imogi-print-bridge

# Install dependencies
pip3 install flask flask-cors pybluez pyserial

# Run the bridge
python3 print_bridge.py
```

#### Step 2: Configure in Browser

1. Login to POS
2. Click **Tools** → **Printer Settings**
3. Choose printer type and configuration:

**Network Printer:**
- Type: Network
- IP: 192.168.1.100
- Port: 9100

**USB Printer:**
- Type: USB
- Device: /dev/usb/lp0

**Bluetooth Printer:**
- Type: Bluetooth
- Click **Discover Devices**
- Select printer from list

4. Click **Save & Test**
5. Verify test print works ✅

#### Step 3: Print!

Enable **Auto Print** in Printer Settings or manually click "Print Receipt (ESC/POS)" button.

### Printing from Code

```javascript
// Print receipt
imogi_pos.printing.print_receipt('POS-INV-00001');

// Print KOT
imogi_pos.printing.print_kot('POS-INV-00001');

// Test printer
imogi_pos.printing.test_printer();
```

### Troubleshooting

**Print Bridge not running?**
```bash
python3 print_bridge.py
```

**Permission denied on USB?**
```bash
sudo chmod 666 /dev/usb/lp0
# Or add user to lp group
sudo usermod -a -G lp $USER
```

**Test network printer connectivity:**
```bash
ping 192.168.1.100
telnet 192.168.1.100 9100
```

**Check Print Bridge health:**
```bash
curl http://localhost:5555/health
```

For detailed printing setup including auto-start configuration, multi-branch deployment, and advanced troubleshooting, refer to the printing documentation in the repository.

## Quick Start Guide (After Configuration)

Once all settings are configured, follow these steps to start using IMOGI POS:

### 1. **Start POS Opening** (Opsional)

Jika POS Profile mengaktifkan **Require Session**, kasir harus membuka sesi terlebih dahulu:

1. Login ke ERPNext sebagai kasir
2. Buka **IMOGI POS → Session → POS Opening Entry**
3. Klik **New**
4. Pilih POS Profile dan Company
5. Input **Opening Cash Amount** (saldo awal kas)
6. **Submit** untuk membuka sesi

### 2. **Akses Cashier Console**

Ada beberapa cara untuk mengakses POS:

#### Option A: Melalui Desk
1. Login ke ERPNext
2. Buka workspace **IMOGI POS**
3. Klik **Cashier Console**

#### Option B: Direct URL
```
https://your-site.local/cashier-console
```

### 3. **Pilih Mode Layanan**

Bergantung pada POS Profile yang dipilih, Anda akan melihat interface yang sesuai:

#### **Table Service Mode** (Restaurant)
1. Pilih **Table** dari floor layout
2. Sistem akan membuka order baru atau melanjutkan order existing
3. Tambahkan items dari menu
4. Klik **Send to Kitchen** untuk mengirim KOT
5. Setelah customer siap bayar, klik **Checkout**

#### **Counter/Takeaway Mode**
1. Langsung tambahkan items ke cart
2. Pilih **Dine In** atau **Takeaway**
3. Klik **Checkout** untuk proses pembayaran

#### **Kiosk Mode**
Customer melakukan self-order melalui kiosk:
```
https://your-site.local/kiosk?profile=PROFILE_NAME
```

#### **Self-Order Mode**
Customer scan QR code di meja untuk order:
1. Customer scan QR code
2. Pilih items dari menu
3. Submit order
4. Order akan muncul di Kitchen Display dan cashier dapat finalize

### 4. **Proses Pembayaran**

1. Review order summary
2. Terapkan **Discount/Promo Code** jika ada
3. Pilih **Payment Method**:
   - Cash
   - Card/Credit Card
   - Digital Payment
   - Split Payment (multiple payment methods)
4. Input **Amount Paid**
5. Sistem akan calculate **Change Amount**
6. Klik **Complete Order**

### 5. **Cetak Struk**

Setelah order selesai:
- **Auto Print** (jika diaktifkan): Struk otomatis tercetak
- **Manual Print**: Klik tombol "Print Receipt"
- **Email Receipt**: Input email customer untuk kirim via email
- **ESC/POS Print**: Untuk thermal printer (perlu Print Bridge)

### 6. **Kitchen Operations** (Restaurant Mode)

#### Kitchen Display
```
https://your-site.local/kitchen-display?station=STATION_NAME
```

Kitchen staff dapat:
1. Melihat incoming orders (KOT)
2. **Start** order ketika mulai memasak
3. **Complete** order ketika siap dihidangkan
4. Monitor SLA time untuk setiap item

#### KOT Printing
- KOT otomatis tercetak di printer kitchen (jika dikonfigurasi)
- Kitchen dapat reprint KOT jika diperlukan

### 7. **Customer Display** (Opsional)

Untuk menampilkan order ke customer:

1. Akses Customer Display di device terpisah:
```
https://your-site.local/customer-display
```
2. Input **Pairing Code** dari POS Profile
3. Display akan otomatis sync dengan cashier console
4. Customer dapat melihat items, prices, dan total secara real-time

### 8. **Waiter Operations** (Table Service)

Untuk waiter yang mengambil order dari meja:

1. Login sebagai waiter
2. Akses Cashier Console
3. Pilih table yang di-assign
4. Tambahkan items dari menu
5. Klik **Send to Kitchen**
6. Order akan muncul di Kitchen Display
7. Setelah customer siap bayar, informasikan ke kasir

### 9. **Tutup Shift/Session**

Pada akhir shift, jika menggunakan POS Opening:

1. Buka **IMOGI POS → Session → POS Closing Entry**
2. Klik **New**
3. Pilih **POS Opening Entry** yang aktif
4. Sistem akan calculate total sales, payments, dan cash
5. Input **Actual Closing Cash**
6. Review **Difference** (jika ada)
7. **Submit** untuk menutup session

### 10. **Monitoring & Reports**

Akses laporan melalui workspace **IMOGI POS**:
- **Sales Summary**: Ringkasan penjualan per periode
- **Item-wise Sales**: Penjualan per item
- **Payment Summary**: Ringkasan pembayaran per method
- **Cashier Performance**: Performa per kasir
- **Kitchen Performance**: SLA dan completion time
- **Table Turnover**: Analisis penggunaan meja

### Tips Operasional

✅ **Best Practices:**
- Selalu buka POS Opening di awal shift
- Verifikasi printer connection sebelum mulai operasi
- Backup cash drawer secara regular
- Monitor Kitchen Display untuk order delays
- Tutup session dengan reconcile cash di akhir shift

⚠️ **Troubleshooting Cepat:**
- **Printer tidak print**: Check Print Bridge status dan network connection
- **Table locked**: Refresh browser atau contact supervisor untuk unlock
- **Order stuck di kitchen**: Manual complete dari Kitchen Display
- **Payment gagal**: Verify payment method configuration
- **Stock habis**: Update stock atau enable negative stock

### Support URLs

- **Cashier Console**: `/cashier-console`
- **Kitchen Display**: `/kitchen-display?station=STATION_NAME`
- **Customer Display**: `/customer-display`
- **Self-Order**: `/so?token=TABLE_TOKEN`
- **Kiosk**: `/kiosk?profile=PROFILE_NAME`
- **Table Layout**: Akses dari Desk → IMOGI POS → Table Layout

## Nginx Reverse Proxy untuk Frappe/ERPNext

Jika browser menampilkan error MIME type (CSS/JS jadi HTML) atau `/api/method/...` mengembalikan HTML login/error, biasanya reverse proxy belum merutekan `/assets` dan `/api` dengan benar. Template Nginx siap pakai sudah disediakan di `deployment/nginx/frappe-proxy.conf`.

> **Catatan untuk pengguna Frappe Cloud:** Frappe Cloud mengelola Nginx secara terpusat, jadi Anda **tidak perlu** (dan tidak bisa) mengubah konfigurasi Nginx sendiri. Jika Anda mengalami masalah MIME type atau `/api` mengembalikan HTML, lakukan verifikasi dengan skrip di bawah dan hubungi support Frappe Cloud dengan hasilnya.

### Cara Pakai

1. Salin template ke server Nginx Anda:

   ```bash
   sudo cp deployment/nginx/frappe-proxy.conf /etc/nginx/conf.d/frappe.conf
   ```

2. Sesuaikan upstream jika perlu:
   - `frappe_backend` (default `127.0.0.1:8000`)
   - `frappe_socketio` (default `127.0.0.1:9000`)

3. Uji dan reload Nginx:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. Rebuild assets dan bersihkan cache Frappe:

   ```bash
   bench build
   bench clear-cache
   bench clear-website-cache
   ```

5. Verifikasi dengan skrip:

   ```bash
   scripts/verify_frappe_proxy.sh <domain> /assets/frappe/css/desk.min.css
   ```

   Jika sukses, CSS akan `Content-Type: text/css` dan `/api/method/ping` mengembalikan JSON.

## License

This project is licensed under the [MIT License](LICENSE).
