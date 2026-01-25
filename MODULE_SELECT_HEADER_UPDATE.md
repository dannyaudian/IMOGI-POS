# Module Select Header Update

## Changes Made

### 1. Custom Fields Added to POS Profile

Added module enable flags to `/Users/dannyaudian/github/IMOGI-POS/imogi_pos/fixtures/custom_field.json`:

```json
{
  "fieldname": "imogi_modules_section",
  "fieldtype": "Section Break",
  "label": "Enabled Modules"
}
{
  "fieldname": "imogi_enable_cashier",
  "fieldtype": "Check",
  "label": "Enable Cashier",
  "default": 1,
  "description": "Cashier module is mandatory"
}
{
  "fieldname": "imogi_enable_waiter",
  "fieldtype": "Check",
  "label": "Enable Waiter"
}
{
  "fieldname": "imogi_enable_kiosk",
  "fieldtype": "Check",
  "label": "Enable Kiosk"
}
{
  "fieldname": "imogi_modules_column",
  "fieldtype": "Column Break"
}
{
  "fieldname": "imogi_enable_kitchen",
  "fieldtype": "Check",
  "label": "Enable Kitchen Display"
}
{
  "fieldname": "imogi_enable_customer_display",
  "fieldtype": "Check",
  "label": "Enable Customer Display"
}
```

**Location:** After `imogi_self_order_rate_limit`, before `imogi_pos_session_section`

**Layout:**
```
┌─────────────────────────────────────────┐
│ Enabled Modules                         │
├─────────────────────┬───────────────────┤
│ ☑ Enable Cashier    │ ☐ Enable Kitchen  │
│ ☐ Enable Waiter     │ ☐ Enable Customer │
│ ☐ Enable Kiosk      │     Display       │
└─────────────────────┴───────────────────┘
```

### 2. POS Profile Validation (Already Complete)

File: `imogi_pos/overrides/pos_profile.py`

**validate_module_compatibility()** method:
- ✅ Enforces Cashier module as MANDATORY
- ✅ Validates all modules are compatible
- ✅ Shows enabled modules message

**Status:** Already implemented in previous update

### 3. Module Select UI Enhancement

File: `src/apps/module-select/App.jsx`

#### Added New Features:

1. **Branch Selector in Header (Top Right)**
   - Shows current branch
   - Allows switching between available branches
   - Updates module list when branch changes

2. **POS Session Selector in Header (Top Right)**
   - Shows all POS Opening Entries for today
   - Displays user and start time for each session
   - Indicates active session
   - Allows viewing session details

#### New API Call:
```javascript
const { data: posSessionsData } = useFrappeGetCall(
  'imogi_pos.api.module_select.get_pos_sessions_today',
  { branch: selectedBranch }
)
```

#### Header Layout:
```
┌───────────────────────────────────────────────────────────────────┐
│ [LOGO] IMOGI POS    Branch: [Main ▼]  Session: [User - 09:00 ▼] │
│        Module Selection                         User Name [Logout]│
└───────────────────────────────────────────────────────────────────┘
```

### 4. Backend API Enhancement

File: `imogi_pos/api/module_select.py`

**New API Endpoint:**

```python
@frappe.whitelist()
def get_pos_sessions_today(branch=None):
    """
    Get all POS Opening Entries for today at the specified branch.
    
    Returns:
    - sessions: List of POS Opening Entries created today
    - count: Number of sessions
    - date: Today's date
    
    Filters:
    - Branch (via POS Profile)
    - Today's date (period_start_date >= today)
    - Not cancelled (docstatus != 2)
    """
```

**Query Logic:**
1. Get all POS Profiles for the branch
2. Get POS Opening Entries where:
   - `pos_profile` in branch POS Profiles
   - `period_start_date >= today`
   - `docstatus != 2` (not cancelled)
3. Order by `period_start_date desc`

**Response Format:**
```json
{
  "sessions": [
    {
      "name": "POS-OP-2026-00001",
      "pos_profile": "Main Counter",
      "user": "cashier@example.com",
      "period_start_date": "2026-01-25 09:00:00",
      "docstatus": 1,
      "status": "Open"
    }
  ],
  "count": 1,
  "date": "2026-01-25"
}
```

### 5. CSS Styling

File: `src/apps/module-select/styles.css`

**New Styles:**

```css
.header-selector {
  /* Container for Branch/Session selector */
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: rgba(255, 255, 255, 0.15);
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
}

.header-label {
  /* Label "Branch:" / "POS Session:" */
  font-size: 0.85rem;
  font-weight: 500;
}

.header-select {
  /* Dropdown select element */
  background-color: rgba(255, 255, 255, 0.25);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  min-width: 150px;
}
```

## User Experience Flow

### Branch Selection
1. User sees current branch in header
2. Click branch dropdown to see all available branches
3. Select different branch
4. Module list updates automatically
5. POS sessions update to show sessions for new branch

### POS Session Management

**Scenario 1: Single Session Today**
- Session selector shows: `John Doe - 09:00 (Active)`
- User cannot select (only 1 option)

**Scenario 2: Multiple Sessions Today**
- Session selector shows dropdown:
  ```
  John Doe - 09:00 (Active)
  Jane Smith - 10:30
  Mike Johnson - 14:00
  -- View All Sessions --
  ```
- User can click to view session details
- Shows time session was opened
- Indicates which is currently active

**Scenario 3: No Sessions Today**
- Session selector not shown
- When user clicks module requiring opening:
  - Dialog shows "POS Opening Required"
  - Button to create new session

## Business Rules

### POS Opening Entry Per Day
- **Expected:** Typically 1 POS Opening Entry per user per day
- **Reality:** Can have multiple if:
  - User closes and reopens
  - Multiple users on different devices
  - Different session scopes (User/Device/POS Profile)
  
### Session Scope Impact

**User Scope:**
- Each user has separate POS Opening Entry
- Session selector shows only current user's sessions

**Device Scope:**
- Each device/browser has separate entry
- Session selector shows all device sessions

**POS Profile Scope:**
- All users share 1 POS Opening Entry
- Session selector shows shared session

## Installation & Testing

### 1. Install Custom Fields
```bash
bench --site [site-name] migrate
bench --site [site-name] install-app imogi_pos
```

### 2. Configure POS Profile
1. Open POS Profile
2. Go to "Enabled Modules" section
3. Enable desired modules:
   - ✅ Cashier (mandatory - cannot uncheck)
   - ☐ Waiter
   - ☐ Kiosk
   - ☐ Kitchen
   - ☐ Customer Display
4. Save

### 3. Test Module Select
1. Login as user
2. Go to Module Select page
3. Check header right side:
   - Branch selector visible
   - POS Session selector visible (if sessions exist)
4. Change branch → modules update
5. Click module → opens correctly

### 4. Test POS Session Flow
1. **No Session Scenario:**
   - Click module requiring opening
   - See "POS Opening Required" dialog
   - Click "Open POS Session"
   - Redirect to POS Opening Entry form

2. **With Session Scenario:**
   - Open POS session first
   - Return to Module Select
   - See active session in header
   - Click module → navigates directly

3. **Multiple Sessions:**
   - Create 2+ POS Opening Entries today
   - Refresh Module Select
   - Session dropdown shows all sessions
   - Active session marked

## Files Modified

### Backend
1. ✅ `imogi_pos/fixtures/custom_field.json` - Added module enable fields
2. ✅ `imogi_pos/overrides/pos_profile.py` - Already has validation (no change needed)
3. ✅ `imogi_pos/api/module_select.py` - Added `get_pos_sessions_today()`

### Frontend
1. ✅ `src/apps/module-select/App.jsx` - Added header selectors
2. ✅ `src/apps/module-select/styles.css` - Added header selector styles

### Documentation
1. ✅ `POS_PROFILE_MULTI_MODULE.md` - Existing architecture doc
2. ✅ `MULTI_MODULE_CHANGES.md` - Existing change summary
3. ✅ `MODULE_SELECT_HEADER_UPDATE.md` - This document

## Visual Preview

### Before
```
┌──────────────────────────────────────────┐
│ [LOGO] IMOGI POS       User Name [Logout]│
│        Module Selection                   │
└──────────────────────────────────────────┘
```

### After
```
┌─────────────────────────────────────────────────────────────────────────┐
│ [LOGO] IMOGI POS    Branch: Main ▼  Session: John - 09:00 ▼           │
│        Module Selection                              User Name [Logout] │
└─────────────────────────────────────────────────────────────────────────┘
```

## Benefits

1. **Quick Branch Switching**
   - No need to go to settings
   - Immediate module list update
   - Better multi-branch support

2. **Session Visibility**
   - See all today's sessions at a glance
   - Know which session is active
   - Quick access to session details

3. **Better UX**
   - All controls in one place
   - Consistent header layout
   - Clear visual hierarchy

4. **Admin Friendly**
   - Easy to verify which session user is on
   - Quick troubleshooting
   - Clear session management

## Known Limitations

1. **Session Selector:**
   - Only shows sessions from today
   - Cannot create new session from selector (must use dialog)
   - Cannot close session from selector (view only)

2. **Branch Selector:**
   - Shows all branches user has access to
   - No permission check per branch
   - Relies on POS Profile availability

## Future Enhancements

1. **Session Management:**
   - Add "Close Session" button
   - Show session duration
   - Display session balance

2. **Branch Filtering:**
   - Show only branches with active POS Profiles
   - Indicate branch with open sessions
   - Add branch status indicators

3. **UI Improvements:**
   - Add tooltips to selectors
   - Show loading state during switch
   - Add confirmation for branch change

---

**Status:** ✅ Complete
**Version:** 1.0.0
**Date:** January 25, 2026
