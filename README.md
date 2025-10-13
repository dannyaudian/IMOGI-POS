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
- **Native POS Session**: Optional enforcement with automatic linking

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
6. **Manage Promo Codes**: Restaurant Manager and POS Manager roles can configure promotional codes from **IMOGI POS → Promotions → Promo Codes** on the Desk workspace.

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

- Configure **Restaurant Settings → Menu Category Routes** to map categories to a Kitchen and Station.
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

For detailed documentation, refer to the [User Guide](link-to-docs) and [Developer Reference](link-to-dev-docs).

## License

This project is licensed under the [MIT License](LICENSE).
