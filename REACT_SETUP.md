# React Setup untuk IMOGI POS

React berhasil diinstall! Setup ini mengintegrasikan React dengan Frappe/ERPNext pada domain yang sama.

## Struktur Project

```
IMOGI-POS/
├── package.json              # Node.js dependencies
├── vite.config.js           # Vite build configuration
├── src/
│   └── apps/
│       └── counter-pos/
│           ├── main.jsx     # React entry point
│           ├── App.jsx      # Main App component
│           └── index.css    # Styling
└── imogi_pos/
    └── public/
        └── react/           # Build output (git-ignored)
```

## Dependencies Installed

- ✅ React 18.3.1
- ✅ React DOM 18.3.1
- ✅ frappe-react-sdk 1.14.0 (hooks untuk Frappe API)
- ✅ Vite 5.4.11 (modern bundler)
- ✅ @vitejs/plugin-react 4.3.4

## Development Workflow

### 1. Build React App
```bash
npm run build
```
Output akan masuk ke `imogi_pos/public/react/counter-pos/`

### 2. Development Mode (dengan hot reload)
```bash
npm run dev
```
Buka http://localhost:3000 untuk development

### 3. Integrasi dengan Frappe

Setelah build, buat Frappe page untuk load React app:

**File: `imogi_pos/www/counter/pos-react/index.py`**
```python
import frappe

def get_context(context):
    context.title = "Cashier Console (React)"
    # Add user context, CSRF token, dll
```

**File: `imogi_pos/www/counter/pos-react/index.html`**
```html
{% extends "templates/web.html" %}
{% block page_content %}
  <div id="root"></div>
  <script src="/assets/imogi_pos/react/counter-pos/static/js/main.[hash].js"></script>
{% endblock %}
```

## Next Steps

1. **Test React build**: `npm run build` untuk verify output
2. **Create Frappe integration**: Setup www/ folder untuk serve React
3. **Build UI components**: Mulai buat POS interface dengan React
4. **Integrate API**: Gunakan frappe-react-sdk untuk call IMOGI POS API

## Notes

- Session cookies otomatis shared (same domain)
- CSRF token harus dipass ke React dari server
- Build output di-gitignore, hanya source code yang di-commit
