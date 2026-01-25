# Module Select - Build Configuration

## Vite Config Addition

Add this to `vite.config.js` in the `input` section of `build.rollupOptions`:

```javascript
// vite.config.js - Add to your build inputs

input: {
  // ... existing entries ...
  
  // Module Select
  'module-select': path.resolve(__dirname, 'src/apps/module-select/main.jsx'),
  
  // ... other entries ...
}
```

## Complete Example

In `vite.config.js`, your config should look something like:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'imogi_pos/public/react/module-select',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Existing apps
        'cashier-console': path.resolve(__dirname, 'src/apps/cashier-console/main.jsx'),
        'waiter': path.resolve(__dirname, 'src/apps/waiter/main.jsx'),
        'kitchen': path.resolve(__dirname, 'src/apps/kitchen/main.jsx'),
        'kiosk': path.resolve(__dirname, 'src/apps/kiosk/main.jsx'),
        'self-order': path.resolve(__dirname, 'src/apps/self-order/main.jsx'),
        'customer-display': path.resolve(__dirname, 'src/apps/customer-display/main.jsx'),
        'table-display': path.resolve(__dirname, 'src/apps/table-display/main.jsx'),
        'table-layout-editor': path.resolve(__dirname, 'src/apps/table-layout-editor/main.jsx'),
        'device-select': path.resolve(__dirname, 'src/apps/device-select/main.jsx'),
        'service-select': path.resolve(__dirname, 'src/apps/service-select/main.jsx'),
        'opening-balance': path.resolve(__dirname, 'src/apps/opening-balance/main.jsx'),
        'login': path.resolve(__dirname, 'src/apps/login/main.jsx'),
        
        // NEW - Module Select
        'module-select': path.resolve(__dirname, 'src/apps/module-select/main.jsx'),
      },
      output: {
        entryFileNames: 'static/js/[name].[hash].js',
        chunkFileNames: 'static/js/[name].[hash].js',
        assetFileNames: 'static/[ext]/[name].[hash].[ext]',
      },
    },
  },
})
```

## Build Commands

### Option 1: Build Only Module Select
If you only have module-select, use:
```bash
npm run build
```

### Option 2: Multi-App Build
If building multiple apps with a monorepo setup:

Create separate config files or use environment variables:

```bash
# Build all apps
npm run build:all

# Build specific app
npm run build:module-select
```

### Option 3: Watch Mode (Development)
```bash
# Watch for changes
npm run dev

# Or if using vite directly
npx vite --host
```

## Build Output

After building, you should see:

```
imogi_pos/public/react/module-select/
├── .vite/
│   └── manifest.json          # Vite manifest
└── static/
    ├── js/
    │   └── module-select.[hash].js
    │   └── main.[hash].js
    └── css/
        └── main.[hash].css
```

## npm Package Script

Add to your `package.json`:

```json
{
  "scripts": {
    "build": "vite build",
    "build:module-select": "vite build --outDir imogi_pos/public/react/module-select",
    "watch": "vite",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "frappe-react-sdk": "latest"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.3.0"
  }
}
```

## Frappe Integration

The build output is automatically picked up by Frappe's `add_react_context()` helper.

In `imogi_pos/www/shared/module-select/index.py`:

```python
from imogi_pos.utils.react_helpers import add_react_context

def get_context(context):
    # ... setup code ...
    
    # This automatically loads from manifest.json
    add_react_context(context, 'module-select', {
        'branding': branding,
        'user': user,
        # ... initial props ...
    })
    
    return context
```

## Development Workflow

1. **Edit files**:
   ```bash
   # Make changes to src/apps/module-select/**
   vim src/apps/module-select/App.jsx
   ```

2. **Watch for changes** (if using dev mode):
   ```bash
   npm run watch
   ```

3. **Build for production**:
   ```bash
   npm run build
   ```

4. **Test in browser**:
   ```
   http://localhost:8000/module-select
   ```

## Deployment

### Step 1: Build
```bash
npm run build
```

### Step 2: Git Commit
```bash
git add imogi_pos/public/react/module-select/
git commit -m "Build: module-select app"
```

### Step 3: Deploy
```bash
# Standard Frappe deployment
bench deploy

# Or just Migrate if only JS changes
bench migrate
```

## Troubleshooting

### Issue: Module not loading
```
Error: Cannot find manifest.json
```
**Solution**: Run `npm run build` first

### Issue: Old version still showing
```
Cache issue
```
**Solution**: 
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+Shift+R)
- Run `npm run build` again

### Issue: Styles not applied
```
CSS not loading
```
**Solution**: Check that `.vite/manifest.json` has css entries

### Issue: "Can't resolve 'frappe-react-sdk'"
```
Module not found error
```
**Solution**: 
```bash
npm install frappe-react-sdk
```

## Performance Optimization

### Bundle Size
```bash
# Check bundle size
npm run build -- --analyze

# Expected size: ~50-80KB (gzipped)
```

### Code Splitting
Vite automatically splits chunks. Main entries will be:
- `main.[hash].js` - React + shared code
- `module-select.[hash].js` - App specific code

### Caching
- Hash in filename ensures browser caching works
- Change detection for rebuilds is automatic

## Related Documentation

- [Vite Docs](https://vitejs.dev/)
- [React + Vite](https://vitejs.dev/guide/ssr.html#setting-up-the-dev-server)
- [Frappe React Integration](https://github.com/frappe/frappe-react-sdk)
