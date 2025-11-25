# IMOGI POS Implementation Checklist

This document serves as a guide for deploying and verifying the IMOGI POS system on ERPNext v15. Follow these steps to ensure a complete and functional setup.

## Deployment Steps

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/dannyaudian/imogi_pos.git

# Navigate to your bench directory
cd frappe-bench

# Install the app
bench get-app ./imogi_pos

# Install the app on your site
bench --site your-site.local install-app imogi_pos

# Run migrations
bench --site your-site.local migrate

# Build assets
bench build

# Restart the server
bench restart

## Manual QA

### Kitchen Display item fallback

1. Open the Kitchen Display in the browser and ensure it loads KOT tickets.
2. Add or update a ticket so that at least one item lacks an `item_name` but retains an item code (or leave both empty to trigger the placeholder).
3. Confirm the item appears in the list with either the item code or the "Unnamed Item" fallback instead of a blank name in both the card view and detail modal.
4. Use the search bar to look for the fallback label (item code or "Unnamed Item") and verify the KOT remains visible in the filtered results.
