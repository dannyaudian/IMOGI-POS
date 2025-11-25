# IMOGI POS Deployment Guide

This guide provides step-by-step instructions for deploying the IMOGI POS app on an ERPNext v15 instance.

## Prerequisites

- ERPNext v15 installation
- Frappe Bench environment
- System user with appropriate permissions

## Installation Steps

### 1. Get the App

```bash
bench get-app https://github.com/imogi/imogi_pos
```

### 2. Install the App

```bash
bench --site your-site.local install-app imogi_pos
```

### 3. Build Assets

```bash
bench build
```

### 4. Migrate and Load Fixtures

Run the migration to create all necessary DocTypes and load fixtures:

```bash
bench --site your-site.local migrate
```

Fixtures will automatically be loaded after migration due to the `after_migrate` hook.

## Configuration

### 5. Set Up POS Profiles

1. Navigate to **POS Profile** in ERPNext
2. Create or modify profiles for different service modes:
   - Table Service
   - Counter/Takeaway
   - Kiosk
   - Self-Order

3. Set `imogi_pos_domain` to "Restaurant" for restaurant operations
4. Enable `allow_non_sales_items` if non-sales items should be skipped during billing

### 6. Configure Printer Interfaces

For each POS Profile or Kitchen Station, configure printer interfaces:

#### LAN Printer
- Set `imogi_printer_cashier_interface` or `imogi_printer_kitchen_interface` to "LAN"
- Enter IP address in `imogi_printer_cashier` or `imogi_printer_kitchen`
- Optionally specify port in `imogi_printer_port` (default: 9100)

#### Bluetooth Printer
- Set interface to "Bluetooth"
- Configure device name in `imogi_bt_cashier_device_name` or `imogi_bt_kitchen_device_name`
- Select vendor profile in `imogi_bt_cashier_vendor_profile` or `imogi_bt_kitchen_vendor_profile`
- For Print Bridge (optional): set `imogi_print_bridge_url` and `imogi_print_bridge_token`

#### OS Spooler Printer
- Set interface to "OS"
- No additional configuration needed (uses OS default printer)

### 7. Set Up Customer Display

1. Navigate to **Customer Display Profile**
2. Create a new profile and configure display blocks
3. Access Customer Display URL and pair with POS using the provided code
4. Test connection using "Send Test Message"

### 8. Generate Self-Order QR Codes

1. Navigate to **Restaurant Table**
2. Select tables for Self-Order capability
3. Use **Print** > **Self-Order QR Sheet** to generate QR codes
4. Place printed QR codes at tables for customer access

### 9. Assign User Roles

Assign appropriate roles to users:
- Restaurant Manager
- Cashier
- Waiter
- Kitchen Staff
- Viewer (for reports)
- Device roles (for kiosks and displays)

### 10. Test Configuration

1. Test Table Display page
2. Test Kitchen Display page
3. Verify KOT printing
4. Verify Customer Display connection
5. Test Self-Order flow with QR scanning
6. Test billing and payment flow

## Troubleshooting

### Printer Issues
- Verify network connectivity for LAN printers
- Check Bluetooth pairing status for BT printers
- Ensure correct printer driver is installed for OS spooler

### Customer Display Not Connecting
- Verify both devices are on the same network
- Check pairing code is entered correctly
- Verify WebSocket connections are not blocked by firewall

### Self-Order QR Not Working
- Verify token expiry settings
- Check that tables are properly configured
- Ensure proper network connectivity

## Updating

To update the app to the latest version:

```bash
bench update
bench --site your-site.local migrate
bench build
```