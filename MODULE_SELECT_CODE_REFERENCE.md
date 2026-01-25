# Module Select - Code Reference

## Directory Structure

```
project-root/
├── src/
│   └── apps/
│       └── module-select/                    ✨ NEW
│           ├── App.jsx                       (Main component)
│           ├── main.jsx                      (Entry point)
│           ├── styles.css                    (All styling)
│           └── components/
│               ├── BranchSelector.jsx
│               ├── POSInfoCard.jsx
│               ├── ModuleCard.jsx
│               └── index.js
│
├── imogi_pos/
│   ├── api/
│   │   ├── __init__.py
│   │   └── module_select.py                  ✨ NEW (4 endpoints)
│   │
│   ├── www/
│   │   └── shared/
│   │       └── module-select/                ✨ NEW
│   │           └── index.py                  (Context builder)
│   │
│   ├── hooks.py                              (Modified: +1 route)
│   └── ...
│
├── imogi_pos/www/shared/login/index.js      (Modified: fallback redirect)
│
└── MODULE_SELECT_*.md                        ✨ NEW (Documentation)
    ├── COMPLETE.md       (Full architecture)
    ├── QUICKSTART.md     (Quick reference)
    ├── BUILD.md          (Build config)
    └── SUMMARY.md        (This summary)
```

## Component Hierarchy

```
App (main component)
├── Header
│   ├── Logo
│   ├── Title
│   └── User Info (name, logout)
│
├── Main Content (flex container)
│   ├── Sidebar (300px)
│   │   ├── BranchSelector
│   │   │   └── Dropdown
│   │   ├── POSInfoCard
│   │   │   ├── Status Badge
│   │   │   ├── Details (profile, balance, time)
│   │   │   └── Link
│   │   └── User Card
│   │       ├── Avatar
│   │       ├── Name
│   │       └── Email
│   │
│   └── Content (flex: 1)
│       ├── Header (title, subtitle)
│       └── Modules Grid
│           └── ModuleCard (x N)
│               ├── Icon
│               ├── Name
│               ├── Description
│               └── Badges
│
└── Footer
    └── Copyright
```

## App.jsx - Key Logic

```jsx
function App() {
  // State
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // API Calls
  const { data: moduleData, isLoading: modulesLoading } 
    = useFrappeGetCall('imogi_pos.api.public.get_available_modules')
  
  const { data: branchData, isLoading: branchLoading } 
    = useFrappeGetCall('imogi_pos.api.public.get_user_branch_info')
  
  const { data: posData, isLoading: posLoading } 
    = useFrappeGetCall('imogi_pos.api.public.get_active_pos_opening')

  // Effects
  useEffect(() => {
    if (!modulesLoading && moduleData) {
      setModules(moduleData.modules || [])
      setLoading(false)
    }
  }, [moduleData, modulesLoading])

  useEffect(() => {
    if (branchData && !selectedBranch) {
      setSelectedBranch(branchData.current_branch)
    }
  }, [branchData])

  // Handlers
  const handleModuleClick = (module) => {
    localStorage.setItem('imogi_selected_branch', selectedBranch)
    localStorage.setItem('imogi_selected_module', module.type)
    window.location.href = module.url
  }

  // Render
  return (
    <div className="module-select-container">
      <header>...</header>
      <main>
        <aside>{/* Sidebar */}</aside>
        <section>{/* Content */}</section>
      </main>
      <footer>...</footer>
    </div>
  )
}
```

## BranchSelector.jsx

```jsx
function BranchSelector({ currentBranch, branches, onBranchChange }) {
  const handleChange = (e) => {
    const branch = e.target.value
    onBranchChange(branch)
    localStorage.setItem('imogi_selected_branch', branch)
    frappe.call({
      method: 'imogi_pos.api.public.set_user_branch',
      args: { branch },
      callback: () => window.location.reload()
    })
  }

  return (
    <div className="branch-selector">
      <select value={currentBranch || ''} onChange={handleChange}>
        <option value="">Select Branch...</option>
        {branches.map(b => (
          <option key={b.name} value={b.name}>{b.name}</option>
        ))}
      </select>
      <p>Current: <strong>{currentBranch}</strong></p>
    </div>
  )
}
```

## POSInfoCard.jsx

```jsx
function POSInfoCard({ posData, isLoading }) {
  if (isLoading) return <div>Loading POS info...</div>
  
  if (!posData?.pos_opening_entry) {
    return (
      <div className="pos-info-card no-opening">
        <span className="status-badge inactive">No Active POS</span>
        <p>No POS session opened yet</p>
      </div>
    )
  }

  return (
    <div className="pos-info-card active">
      <span className="status-badge active">Active</span>
      <div className="pos-detail">
        <label>Profile</label>
        <p>{posData.pos_profile_name}</p>
      </div>
      <div className="pos-detail">
        <label>Opening Balance</label>
        <p>Rp {Number(posData.opening_balance).toLocaleString('id-ID')}</p>
      </div>
      <div className="pos-detail">
        <label>Opened At</label>
        <p>{new Date(posData.timestamp).toLocaleString('id-ID')}</p>
      </div>
      <a href={`/app/pos-opening-entry/${posData.pos_opening_entry}`}>
        View Details →
      </a>
    </div>
  )
}
```

## ModuleCard.jsx

```jsx
function ModuleCard({ module, onClick }) {
  const iconMap = {
    'cashier': 'fa-cash-register',
    'waiter': 'fa-server',
    'kiosk': 'fa-tablet',
    // ... more mappings
  }

  const colorMap = {
    'cashier': 'color-cashier',    // #3498db
    'waiter': 'color-waiter',      // #e74c3c
    // ... more mappings
  }

  return (
    <div 
      className={`module-card ${colorMap[module.type]}`}
      onClick={onClick}
    >
      <div className="module-icon">
        <i className={`fa-solid ${iconMap[module.type]}`}></i>
      </div>
      <h3>{module.name}</h3>
      <p>{module.description}</p>
      {module.requires_session && (
        <div className="module-badge">Requires POS Session</div>
      )}
      <i className="module-arrow fa-solid fa-arrow-right"></i>
    </div>
  )
}
```

## module_select.py - API Endpoints

### Endpoint 1: get_available_modules()
```python
@frappe.whitelist()
def get_available_modules(branch=None):
    """Get list of available modules for user"""
    user = frappe.session.user
    user_roles = frappe.get_roles(user)
    
    modules_config = {
        'cashier': {
            'name': 'Cashier Console',
            'requires_roles': ['Cashier', 'Branch Manager', 'System Manager'],
            # ... more config
        },
        # ... more modules
    }
    
    # Filter by user roles
    available = []
    for type, config in modules_config.items():
        if any(r in user_roles for r in config['requires_roles']):
            available.append({...})
    
    return {'modules': available, 'user': user, 'roles': user_roles}
```

### Endpoint 2: get_user_branch_info()
```python
@frappe.whitelist()
def get_user_branch_info():
    """Get user's branch settings"""
    user = frappe.session.user
    
    current_branch = frappe.db.get_value(
        'User', user, 'imogi_default_branch'
    ) or frappe.db.get_value('Company', filters={}, fieldname='name')
    
    available_branches = frappe.get_list(
        'Company', 
        fields=['name', 'company_name'],
        limit_page_length=0
    )
    
    return {
        'current_branch': current_branch,
        'available_branches': available_branches
    }
```

### Endpoint 3: get_active_pos_opening()
```python
@frappe.whitelist()
def get_active_pos_opening(branch=None):
    """Get active POS opening entry"""
    # Get most recent submitted POS Opening Entry
    pos_opening = frappe.db.get_list(
        'POS Opening Entry',
        filters={'docstatus': 1, 'company': branch},
        fields=['name', 'pos_profile', 'opening_balance', 'creation'],
        order_by='creation desc',
        limit_page_length=1
    )
    
    if pos_opening:
        entry = pos_opening[0]
        return {
            'pos_opening_entry': entry.get('name'),
            'pos_profile_name': entry.get('pos_profile'),
            'opening_balance': entry.get('opening_balance'),
            'timestamp': entry.get('creation')
        }
    
    return {...}  # All None values
```

### Endpoint 4: set_user_branch()
```python
@frappe.whitelist()
def set_user_branch(branch):
    """Update user's default branch"""
    user = frappe.session.user
    
    frappe.db.set_value('User', user, 'imogi_default_branch', branch)
    frappe.db.commit()
    
    return {'success': True}
```

## index.py - Page Context

```python
import frappe
from frappe import _
from imogi_pos.utils.branding import get_brand_context
from imogi_pos.utils.react_helpers import add_react_context
from imogi_pos.utils.error_pages import set_setup_error

def get_context(context):
    """Context builder for Module Select page"""
    try:
        user = frappe.session.user
        
        if not user or user == 'Guest':
            frappe.local.response['type'] = 'redirect'
            frappe.local.response['location'] = '/imogi-login?next=/module-select'
            return
        
        branding = get_brand_context()
        
        # Fetch initial data
        try:
            modules_data = frappe.call(
                'imogi_pos.api.module_select.get_available_modules',
                async_execution=False
            )
            branch_data = frappe.call(
                'imogi_pos.api.module_select.get_user_branch_info',
                async_execution=False
            )
        except:
            modules_data = {'message': {'modules': []}}
            branch_data = {'message': {...}}
        
        context.setup_error = False
        context.branding = branding
        context.title = _("Select Module")
        
        # Pass to React
        add_react_context(context, 'module-select', {
            'branding': branding,
            'user': user,
            'modules': modules_data.get('message', {}).get('modules', []),
            'branch': branch_data.get('message', {}).get('current_branch'),
            'available_branches': branch_data.get('message', {}).get('available_branches', [])
        })
        
        return context
    
    except Exception as e:
        frappe.log_error(f"Error: {str(e)}")
        set_setup_error(context, "generic", str(e), page_name=_("Select Module"))
        context.title = _("Select Module")
        return context
```

## CSS - Key Classes

```css
/* Layout */
.module-select-container { display: flex; flex-direction: column; }
.module-select-header { background: gradient; padding: var(--spacing-lg); }
.module-select-main { display: flex; gap: var(--spacing-lg); }
.module-select-sidebar { width: 300px; flex-direction: column; }
.module-select-content { flex: 1; }

/* Sidebar */
.sidebar-section { background: white; padding: var(--spacing-lg); border-radius: var(--radius-md); }
.branch-selector { display: flex; flex-direction: column; gap: var(--spacing-md); }
.branch-dropdown { width: 100%; padding: var(--spacing-md); border: 2px solid; }
.pos-info-card { border: 2px solid; border-radius: var(--radius-sm); padding: var(--spacing-md); }
.pos-info-card.active { border-color: var(--success-color); }
.user-card { display: flex; gap: var(--spacing-md); }
.user-avatar { width: 48px; height: 48px; border-radius: 50%; }

/* Modules */
.modules-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--spacing-lg); }
.module-card { flex: 1; padding: var(--spacing-lg); border: 2px solid; border-radius: var(--radius-md); cursor: pointer; }
.module-icon { width: 60px; height: 60px; border-radius: var(--radius-md); }
.module-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }

/* Responsive */
@media (max-width: 1024px) {
  .module-select-main { flex-direction: column; }
  .module-select-sidebar { width: 100%; flex-direction: row; }
}
@media (max-width: 768px) {
  .modules-grid { grid-template-columns: 1fr; }
}
```

## hooks.py - Changes

```python
website_route_rules = [
    # ... existing routes ...
    
    # NEW: Module Select
    {"from_route": "/module-select", "to_route": "/shared/module-select"},
    
    # ... other routes ...
]
```

## login/index.js - Changes

```javascript
// Before
const fallbackRedirect = '/cashier-console'

// After
const fallbackRedirect = '/module-select'  // ✅ Changed
```

## Data Flow in Sequence

```
1. User visits /module-select
   ↓
2. www/shared/module-select/index.py (get_context)
   ↓
3. Call 3 APIs in parallel:
   - imogi_pos.api.module_select.get_available_modules()
   - imogi_pos.api.module_select.get_user_branch_info()
   - imogi_pos.api.module_select.get_active_pos_opening()
   ↓
4. React App mounts with initial props
   ↓
5. useFrappeGetCall hooks trigger
   ↓
6. Components render:
   - Header
   - Sidebar (Branch, POS, User)
   - Content (Module cards)
   ↓
7. User interactions:
   a) Change branch → set_user_branch() → reload
   b) Click module → store localStorage → navigate
   c) Logout → /api/method/frappe.auth.logout
```

This is the complete code structure for Module Select!
