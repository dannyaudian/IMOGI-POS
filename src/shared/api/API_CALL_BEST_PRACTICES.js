/**
 * IMOGI POS - API Call Best Practices
 * 
 * This document outlines the standardized approach for making API calls
 * to ensure consistency, security, and proper error handling across the application.
 */

// ============================================================================
// RECOMMENDED APPROACH: Use frappe.call() for all API calls
// ============================================================================

/**
 * WHY frappe.call()?
 * - Single source of truth for CSRF token (window.FRAPPE_CSRF_TOKEN)
 * - Automatic error handling with user-friendly toast notifications
 * - Consistent behavior between standalone pages and Frappe Desk
 * - Smart GET/POST selection based on request type
 * - jQuery-compatible promise API for backward compatibility
 */

// Example 1: Simple API call
frappe.call({
    method: 'imogi_pos.api.billing.get_order',
    args: { order_name: 'POS-001' },
    callback: function(r) {
        if (r.message) {
            console.log('Order:', r.message);
        }
    },
    error: function(err) {
        console.error('Failed:', err);
    }
});

// Example 2: Async/await with promise
const result = await frappe.call({
    method: 'imogi_pos.api.billing.submit_order',
    args: { 
        order_name: 'POS-001',
        pos_profile: 'Main Counter' 
    },
    freeze: true // Show loading indicator
});

// Example 3: Silent call (no error toast)
frappe.call({
    method: 'imogi_pos.api.status.check',
    silent: true // Don't show error notifications
}).then(r => {
    // Handle response
}).catch(err => {
    // Custom error handling
});

// ============================================================================
// REACT COMPONENTS: Use frappe-react-sdk hooks
// ============================================================================

/**
 * WHY frappe-react-sdk?
 * - SWR-powered caching and revalidation
 * - Automatic loading states
 * - React-friendly hooks API
 * - Optimistic updates support
 */

import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk'

// Example 1: GET request with caching
function OrderList({ posProfile }) {
    const { data, error, isLoading } = useFrappeGetCall(
        'imogi_pos.api.billing.list_orders_for_cashier',
        { pos_profile: posProfile },
        `orders-${posProfile}`, // Cache key
        {
            revalidateOnFocus: false,
            refreshInterval: 30000 // Auto-refresh every 30s
        }
    );
    
    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;
    
    return <div>{/* Render orders */}</div>;
}

// Example 2: POST/mutation with callback
function SubmitButton({ orderName }) {
    const { call, loading, error } = useFrappePostCall('imogi_pos.api.billing.submit_order');
    
    const handleSubmit = async () => {
        try {
            const result = await call({ order_name: orderName });
            console.log('Submitted:', result);
        } catch (err) {
            console.error('Submit failed:', err);
        }
    };
    
    return (
        <button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Order'}
        </button>
    );
}

// ============================================================================
// ALTERNATIVE: Direct fetch() - USE ONLY WHEN NECESSARY
// ============================================================================

/**
 * WHEN to use direct fetch()?
 * - File uploads/downloads
 * - Streaming responses
 * - Custom headers/response handling
 * 
 * IMPORTANT: Always use standardized CSRF token
 */

import { callImogiAPI } from '@/shared/api/imogi-api'

// Preferred: Use helper function
const result = await callImogiAPI('imogi_pos.api.method', { arg: 'value' });

// If you must use fetch directly:
const csrfToken = window.FRAPPE_CSRF_TOKEN || 
                  (typeof frappe !== 'undefined' && frappe.csrf_token) || 
                  '';

const response = await fetch('/api/method/imogi_pos.api.method', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': csrfToken, // REQUIRED for security
    },
    credentials: 'include', // Send cookies
    body: JSON.stringify({ arg: 'value' })
});

// ============================================================================
// CSRF TOKEN MANAGEMENT
// ============================================================================

/**
 * Single Source of Truth: window.FRAPPE_CSRF_TOKEN
 * 
 * This is automatically set by:
 * 1. Server templates (via <meta name="csrf_token">)
 * 2. Frappe's built-in CSRF token management
 * 
 * NEVER hardcode CSRF tokens or use multiple sources!
 */

// ✅ CORRECT: Use single source
const token = window.FRAPPE_CSRF_TOKEN;

// ✅ CORRECT: Fallback to frappe.csrf_token (getter that sets window.FRAPPE_CSRF_TOKEN)
const token2 = frappe.csrf_token;

// ❌ WRONG: Multiple fallbacks create inconsistency
const tokenBad = frappe.csrf_token || window.csrf_token || getCookie('csrf_token');

// ============================================================================
// ERROR HANDLING PATTERNS
// ============================================================================

/**
 * frappe.call() automatically shows toast notifications for errors.
 * Use 'silent: true' to suppress them and handle manually.
 */

// Pattern 1: Let polyfill handle errors (recommended)
frappe.call({
    method: 'imogi_pos.api.method',
    args: { data: 'value' }
    // Errors automatically shown as toast
});

// Pattern 2: Custom error handling
frappe.call({
    method: 'imogi_pos.api.method',
    args: { data: 'value' },
    silent: true, // Suppress automatic toast
    error: function(err) {
        // Custom handling
        if (err.status === 403) {
            frappe.msgprint('Access denied. Please login.');
        } else {
            console.error('Error:', err);
        }
    }
});

// Pattern 3: React component error handling
function Component() {
    const { data, error } = useFrappeGetCall('method');
    
    if (error) {
        // Show error in UI
        return <div className="error">{error.message}</div>;
    }
    
    return <div>{/* Render data */}</div>;
}

// ============================================================================
// PERMISSION CHECKING
// ============================================================================

/**
 * Backend decorators handle permission checks.
 * Frontend should wait for session to be ready before making calls.
 */

// Wait for session to be fully loaded (prevents race condition)
frappe.session.ready(function() {
    // Session is ready, roles are loaded
    const userRoles = frappe.boot.user.roles;
    
    if (userRoles.includes('Cashier')) {
        // User has Cashier role, safe to call APIs
        frappe.call({
            method: 'imogi_pos.api.cashier.method',
            args: {}
        });
    }
});

// React: Use useAuth hook to wait for session
import { useAuth } from '@/shared/hooks/useAuth'

function CashierComponent() {
    const { loading, hasAccess, error } = useAuth(['Cashier']);
    
    if (loading) return <div>Loading...</div>;
    if (!hasAccess) return <div>Access denied</div>;
    
    // Safe to make API calls here
    return <div>{/* Component content */}</div>;
}

// ============================================================================
// MIGRATION GUIDE
// ============================================================================

/**
 * If you have existing code using different patterns, migrate as follows:
 */

// BEFORE: Multiple CSRF sources
fetch('/api/method/xxx', {
    headers: {
        'X-Frappe-CSRF-Token': window.csrf_token || getCookie('csrf_token')
    }
});

// AFTER: Single source
fetch('/api/method/xxx', {
    headers: {
        'X-Frappe-CSRF-Token': window.FRAPPE_CSRF_TOKEN
    }
});

// BETTER: Use frappe.call()
frappe.call({ method: 'xxx' });

// BEFORE: Direct axios/fetch in React
useEffect(() => {
    fetch('/api/method/xxx').then(r => r.json()).then(setData);
}, []);

// AFTER: Use frappe-react-sdk
const { data } = useFrappeGetCall('xxx');

// ============================================================================
// TESTING CSRF TOKEN
// ============================================================================

// Check if CSRF token is properly set (run in browser console)
console.log('CSRF Token:', window.FRAPPE_CSRF_TOKEN);
console.log('Via getter:', frappe.csrf_token); // Should match above

// If token is empty, check:
// 1. Is <meta name="csrf_token"> in page HTML?
// 2. Is Frappe properly loaded in the page?
// 3. Check browser console for errors

// ============================================================================
// SUMMARY
// ============================================================================

/**
 * DECISION TREE:
 * 
 * 1. In React component?
 *    → Yes: Use useFrappeGetCall or useFrappePostCall
 *    → No: Continue to step 2
 * 
 * 2. Need caching/auto-refresh?
 *    → Yes: Use useFrappeGetCall with cache key
 *    → No: Continue to step 3
 * 
 * 3. In standalone JavaScript or legacy code?
 *    → Use frappe.call()
 * 
 * 4. Need file upload or streaming?
 *    → Use fetch() with window.FRAPPE_CSRF_TOKEN
 * 
 * 5. NEVER:
 *    - Mix multiple CSRF token sources
 *    - Skip CSRF token on POST requests
 *    - Make API calls before frappe.session.ready()
 */

export default {
    // Export for reference only
    RECOMMENDED: 'frappe.call()',
    REACT_RECOMMENDED: 'useFrappeGetCall/useFrappePostCall',
    CSRF_SOURCE: 'window.FRAPPE_CSRF_TOKEN',
    SESSION_READY: 'frappe.session.ready(callback)'
};
