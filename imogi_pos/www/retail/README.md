# Retail Domain - Future Implementation

This directory contains placeholder structure for the **Retail** business domain.

## Planned Features

### `/retail/pos/`
- Quick checkout interface for retail stores
- Barcode scanning support
- Batch item entry
- Loyalty program integration
- Gift card/voucher management

### `/retail/inventory/`
- Real-time stock monitoring
- Low stock alerts
- Stock adjustment interface
- Inventory transfer between branches
- Supplier management

### `/retail/checkout/`
- Multi-payment split
- Customer loyalty lookup
- Receipt customization
- Return/exchange processing
- Store credit management

## Configuration

Retail domain will be activated via POS Profile setting:
```
imogi_pos_domain = "Retail"
```

## Implementation Status

⏳ **Planned for Q2 2026**

Current implementation focuses on Restaurant domain. This structure is prepared for future scalability.

## Related Components

- **DocTypes**: To be created in `imogi_pos/imogi_pos/doctype/`
- **API Endpoints**: To be added in `imogi_pos/api/retail.py`
- **Fixtures**: Configuration presets in `imogi_pos/fixtures/`

## Notes for Future Developers

- Follow authentication patterns established in Restaurant domain
- Reuse shared components from `/www/shared/`
- Integrate with existing POS Order/Invoice flow
- Consider retail-specific DocTypes: Product Catalog, Retail Settings, Loyalty Program
