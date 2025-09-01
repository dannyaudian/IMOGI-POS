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