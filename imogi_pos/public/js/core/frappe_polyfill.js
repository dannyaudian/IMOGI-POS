/**
 * IMOGI POS - Frappe Polyfill
 *
 * Provides minimal Frappe-compatible functions for standalone pages
 * that don't load Frappe's full JavaScript bundle.
 *
 * This allows reusing modules that depend on Frappe APIs without
 * requiring the full Frappe stack.
 */

(function() {
    'use strict';

    // If Frappe Desk is already loaded, don't override core APIs.
    // Only patch missing helpers (like frappe.ready) then exit.
    // Check multiple indicators to ensure we're in Desk context:
    // 1. frappe.provide exists (core Frappe function)
    // 2. frappe.app exists (Frappe Desk app object)
    // 3. frappe.session.user is already set by Frappe
    const isFrappeDeskLoaded = (
        typeof window.frappe !== 'undefined' && 
        typeof window.frappe.provide === 'function' &&
        (typeof window.frappe.app !== 'undefined' || 
         (window.frappe.session && window.frappe.session.user && window.frappe.boot && window.frappe.boot.user))
    );
    
    if (isFrappeDeskLoaded) {
        console.log('Frappe Desk detected - using native APIs, only patching missing helpers');
        
        // Minimal frappe.ready for Desk contexts that don't define it
        if (typeof window.frappe.ready !== 'function') {
            window.frappe.ready = function(fn) {
                if (typeof fn !== 'function') return;
                if (document.readyState === 'complete' || document.readyState === 'interactive') {
                    setTimeout(fn, 0);
                } else {
                    document.addEventListener('DOMContentLoaded', fn);
                }
            };
        }

        // Ensure translation helper exists as no-op if missing
        if (typeof window.__ === 'undefined') {
            window.__ = function(txt) {
                return txt;
            };
        }
        
        // Mark session as ready immediately in Desk context
        if (!window.frappe.session._ready) {
            window.frappe.session._ready = true;
            window.frappe.session._readyCallbacks = [];
            window.frappe.session.ready = function(fn) { if (fn) fn(); };
            window.frappe.session._markReady = function() {};
        }

        return;
    }

    // Initialize frappe namespace for standalone pages
    window.frappe = window.frappe || {};

    // =========================================================================
    // ERROR DISPLAY SYSTEM - Visible error notifications for users
    // =========================================================================
    
    /**
     * Create and show an error toast/banner
     * @param {string} message - Error message
     * @param {string} type - 'error', 'warning', 'info', 'success'
     * @param {number} duration - Auto-hide duration in ms (0 = no auto-hide)
     */
    function showToast(message, type = 'error', duration = 8000) {
        // Create toast container if it doesn't exist
        let container = document.getElementById('imogi-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'imogi-toast-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 400px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }

        // Color schemes for different types
        const colors = {
            error: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', icon: '❌' },
            warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', icon: '⚠️' },
            info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', icon: 'ℹ️' },
            success: { bg: '#dcfce7', border: '#22c55e', text: '#166534', icon: '✓' }
        };
        const color = colors[type] || colors.error;

        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'imogi-toast';
        toast.style.cssText = `
            background: ${color.bg};
            border: 1px solid ${color.border};
            border-left: 4px solid ${color.border};
            color: ${color.text};
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.4;
            pointer-events: auto;
            animation: slideIn 0.3s ease-out;
            display: flex;
            align-items: flex-start;
            gap: 10px;
        `;
        
        toast.innerHTML = `
            <span style="font-size: 16px;">${color.icon}</span>
            <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 2px;">${type === 'error' ? 'Error' : type.charAt(0).toUpperCase() + type.slice(1)}</div>
                <div>${escapeHtml(message)}</div>
            </div>
            <button onclick="this.parentElement.remove()" style="
                background: none;
                border: none;
                cursor: pointer;
                font-size: 18px;
                opacity: 0.7;
                padding: 0;
                line-height: 1;
            ">&times;</button>
        `;

        // Add CSS animation if not already added
        if (!document.getElementById('imogi-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'imogi-toast-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        container.appendChild(toast);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                toast.style.animation = 'slideOut 0.3s ease-in forwards';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        return toast;
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show error banner at top of page for critical errors
     */
    function showErrorBanner(message, details = null) {
        let banner = document.getElementById('imogi-error-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'imogi-error-banner';
            banner.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: #dc2626;
                color: white;
                padding: 12px 20px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: space-between;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            `;
            document.body.insertBefore(banner, document.body.firstChild);
            // Add padding to body to prevent content from being hidden
            document.body.style.paddingTop = (banner.offsetHeight || 50) + 'px';
        }

        let html = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 18px;">⚠️</span>
                <div>
                    <strong>Error:</strong> ${escapeHtml(message)}
                    ${details ? `<br><small style="opacity: 0.8;">${escapeHtml(details)}</small>` : ''}
                </div>
            </div>
            <button onclick="document.getElementById('imogi-error-banner').remove(); document.body.style.paddingTop = '0';" 
                    style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                Dismiss
            </button>
        `;
        banner.innerHTML = html;
    }

    // Expose toast function globally for other scripts
    window.IMOGIToast = {
        show: showToast,
        error: (msg, duration) => showToast(msg, 'error', duration),
        warning: (msg, duration) => showToast(msg, 'warning', duration),
        info: (msg, duration) => showToast(msg, 'info', duration),
        success: (msg, duration) => showToast(msg, 'success', duration),
        banner: showErrorBanner
    };

    /**
     * frappe.provide - Create nested namespaces
     * @param {string} namespace - Dot-separated namespace path
     */
    window.frappe.provide = function(namespace) {
        const parts = namespace.split('.');
        let current = window;
        for (const part of parts) {
            current[part] = current[part] || {};
            current = current[part];
        }
        return current;
    };

    /**
     * frappe.call - Make API calls to Frappe backend
     * @param {Object} opts - Call options
     * @param {string} opts.method - API method path
     * @param {Object} [opts.args] - Method arguments
     * @param {boolean} [opts.async=true] - Async call
     * @param {boolean} [opts.freeze=false] - Show loading indicator
     * @param {Function} [opts.callback] - Success callback
     * @param {Function} [opts.error] - Error callback
     * @param {boolean} [opts.silent=false] - Suppress error notifications
     * @returns {Promise} Promise resolving with response
     */
    window.frappe.call = function(opts) {
        const {
            method,
            args = {},
            async = true,
            freeze = false,
            callback,
            error: errorCallback,
            silent = false
        } = opts;

        const url = `/api/method/${method}`;
        
        // Clean up null/undefined values in filters to prevent 400 errors
        if (args && args.filters && typeof args.filters === 'object') {
            const cleanFilters = {};
            Object.keys(args.filters).forEach(key => {
                const value = args.filters[key];
                if (value !== null && value !== undefined) {
                    cleanFilters[key] = value;
                }
            });
            // Only update if we have valid filters
            if (Object.keys(cleanFilters).length > 0) {
                args.filters = cleanFilters;
            } else {
                // Remove empty filters object
                delete args.filters;
            }
        }
        
        // Check if method is read-only (no args or empty args)
        const isReadOnly = !args || Object.keys(args).length === 0;
        
        // Get CSRF token from single source: window.FRAPPE_CSRF_TOKEN
        // This is set by server templates and polyfill getter below
        const csrfToken = window.FRAPPE_CSRF_TOKEN || frappe.csrf_token || '';
        
        let fetchOpts;
        
        if (isReadOnly) {
            // For read-only methods (no args), use GET to avoid CSRF issues
            console.log(`[frappe.call] Using GET for read-only method: ${method}`);
            fetchOpts = {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'include'
            };
        } else {
            // For write methods, use POST with CSRF token
            if (!csrfToken) {
                console.warn(`[frappe.call] No CSRF token found for POST to ${method}. This may cause 400/403 errors.`);
            }
            
            // Frappe v15 expects args to be sent directly as JSON body
            fetchOpts = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Frappe-CSRF-Token': csrfToken
                },
                credentials: 'include',
                body: JSON.stringify(args)
            };
        }

        // Show loading indicator if freeze is true
        let loadingEl = null;
        if (freeze) {
            loadingEl = document.createElement('div');
            loadingEl.id = 'imogi-loading-overlay';
            loadingEl.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.3);
                z-index: 99998;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            loadingEl.innerHTML = `
                <div style="background: white; padding: 20px 30px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 24px; height: 24px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                        <span>Loading...</span>
                    </div>
                </div>
            `;
            if (!document.getElementById('imogi-loading-styles')) {
                const style = document.createElement('style');
                style.id = 'imogi-loading-styles';
                style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
                document.head.appendChild(style);
            }
            document.body.appendChild(loadingEl);
        }

        const removeLoading = () => {
            if (loadingEl) loadingEl.remove();
        };

        const promise = fetch(url, fetchOpts)
            .then(async response => {
                removeLoading();
                
                if (!response.ok) {
                    // Try to parse error message from response
                    let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
                    let serverError = null;
                    
                    try {
                        const errorData = await response.json();
                        if (errorData.exc_type) {
                            serverError = errorData.exc_type;
                        }
                        if (errorData._server_messages) {
                            const msgs = JSON.parse(errorData._server_messages);
                            if (msgs.length > 0) {
                                const parsed = JSON.parse(msgs[0]);
                                errorMsg = parsed.message || errorMsg;
                            }
                        } else if (errorData.message) {
                            errorMsg = errorData.message;
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                    
                    const error = new Error(errorMsg);
                    error.status = response.status;
                    error.serverError = serverError;
                    throw error;
                }
                return response.json();
            })
            .then(data => {
                // Check for server-side errors in successful response
                if (data.exc_type || data.exception) {
                    const error = new Error(data.exception || data.exc_type || 'Server error');
                    error.serverError = data.exc_type;
                    throw error;
                }
                
                if (callback) {
                    callback(data);
                }
                return data;
            })
            .catch(err => {
                removeLoading();
                
                // Log detailed error information
                console.error('=== frappe.call ERROR ===');
                console.error('Method:', method);
                console.error('Request args:', args);
                console.error('Error:', err);
                console.error('Error status:', err.status);
                console.error('=======================');
                
                // Show visible error unless silent
                if (!silent && window.IMOGIToast) {
                    let errorMessage = err.message || 'Unknown error occurred';
                    
                    // Handle common HTTP errors with user-friendly messages
                    if (err.status === 401 || err.status === 403) {
                        errorMessage = 'Session expired or access denied. Please login again.';
                        IMOGIToast.banner('Authentication required', 'Please login to continue');
                    } else if (err.status === 400) {
                        errorMessage = `Bad request: ${err.message}`;
                        IMOGIToast.error(errorMessage);
                    } else if (err.status === 404) {
                        errorMessage = `API not found: ${method}`;
                        IMOGIToast.error(errorMessage);
                    } else if (err.status === 500) {
                        errorMessage = 'Server error. Please try again later.';
                        IMOGIToast.error(errorMessage, 10000);
                    } else if (err.status >= 500) {
                        IMOGIToast.error('Server is temporarily unavailable', 10000);
                    } else if (!navigator.onLine) {
                        IMOGIToast.warning('No internet connection. Please check your network.');
                    } else {
                        IMOGIToast.error(errorMessage);
                    }
                }
                
                if (errorCallback) {
                    errorCallback(err);
                }
                throw err;
            });

        // Wrap promise with jQuery-compatible methods for backward compatibility
        // This allows code using .then().fail().always() chains to work
        return wrapPromiseWithJQueryMethods(promise);
    };

    /**
     * Wrap a Promise with jQuery-compatible .fail(), .always(), and .done() methods
     * These methods return wrapped promises so chaining works correctly
     * @param {Promise} promise - The promise to wrap
     * @returns {Promise} Promise with jQuery-compatible methods
     */
    function wrapPromiseWithJQueryMethods(promise) {
        // Add jQuery-compatible methods directly to the promise
        // Don't override existing methods, just add the aliases
        
        // Store original then to wrap its return value
        const originalThen = promise.then.bind(promise);
        promise.then = function(...args) {
            const result = originalThen(...args);
            return wrapPromiseWithJQueryMethods(result);
        };

        // Store original catch to wrap its return value
        const originalCatch = promise.catch.bind(promise);
        promise.catch = function(...args) {
            const result = originalCatch(...args);
            return wrapPromiseWithJQueryMethods(result);
        };
        
        promise.fail = function(fn) {
            const result = this.catch(fn);
            return wrapPromiseWithJQueryMethods(result);
        };

        promise.always = function(fn) {
            // jQuery's .always() is called regardless of success/failure
            const result = originalThen(
                (value) => { fn(value); return value; },
                (error) => { fn(error); throw error; }
            );
            return wrapPromiseWithJQueryMethods(result);
        };

        promise.done = function(fn) {
            const result = originalThen(fn);
            return wrapPromiseWithJQueryMethods(result);
        };

        return promise;
    }

    /**
     * frappe.format - Format values based on fieldtype
     * @param {*} value - Value to format
     * @param {Object} df - Field definition with fieldtype
     * @returns {string} Formatted value
     */
    window.frappe.format = function(value, df = {}) {
        const fieldtype = df.fieldtype || 'Data';
        
        if (fieldtype === 'Currency' || fieldtype === 'Float') {
            const num = parseFloat(value) || 0;
            return num.toLocaleString('id-ID', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            });
        }
        
        if (fieldtype === 'Int') {
            return parseInt(value) || 0;
        }
        
        if (fieldtype === 'Date') {
            if (!value) return '';
            const d = new Date(value);
            return d.toLocaleDateString('id-ID');
        }
        
        if (fieldtype === 'Datetime') {
            if (!value) return '';
            const d = new Date(value);
            return d.toLocaleString('id-ID');
        }
        
        return value;
    };

    /**
     * frappe.msgprint - Display a message dialog
     * @param {string|Object} msg - Message text or options object
     */
    window.frappe.msgprint = function(msg) {
        let title = 'Message';
        let message = msg;
        let indicator = 'blue';

        if (typeof msg === 'object') {
            title = msg.title || title;
            message = msg.message || msg.msg || '';
            indicator = msg.indicator || indicator;
        }

        // Map indicator to toast type
        const typeMap = {
            'red': 'error',
            'orange': 'warning', 
            'yellow': 'warning',
            'green': 'success',
            'blue': 'info'
        };
        const toastType = typeMap[indicator] || 'info';

        if (window.IMOGIToast && typeof IMOGIToast.show === 'function') {
            IMOGIToast.show(message, toastType);
        } else {
            alert(message);
        }
    };

    /**
     * frappe.show_alert - Show a brief alert notification
     * @param {string|Object} msg - Message text or options {message, indicator}
     * @param {number} [seconds=5] - Duration in seconds
     */
    window.frappe.show_alert = function(msg, seconds = 5) {
        let message = msg;
        let indicator = 'blue';

        if (typeof msg === 'object') {
            message = msg.message || msg.msg || '';
            indicator = msg.indicator || indicator;
        }

        const typeMap = {
            'red': 'error',
            'orange': 'warning',
            'yellow': 'warning', 
            'green': 'success',
            'blue': 'info'
        };
        const toastType = typeMap[indicator] || 'info';

        if (window.IMOGIToast && typeof IMOGIToast.show === 'function') {
            IMOGIToast.show(message, toastType, seconds * 1000);
        } else {
            console.log(`[${indicator}] ${message}`);
        }
    };

    /**
     * frappe.throw - Throw an error with message
     * @param {string} msg - Error message
     */
    window.frappe.throw = function(msg) {
        if (window.IMOGIToast) {
            IMOGIToast.error(msg, 0); // No auto-hide for errors
        } else {
            alert('Error: ' + msg);
        }
        throw new Error(msg);
    };

    /**
     * frappe.ready - Execute callback when DOM is ready
     * @param {Function} fn - Callback function to execute
     */
    window.frappe.ready = function(fn) {
        if (typeof fn !== 'function') {
            console.warn('frappe.ready: Expected a function, got', typeof fn);
            return;
        }

        // If DOM is already ready, execute immediately
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(fn, 0);
        } else {
            // Otherwise, wait for DOMContentLoaded
            document.addEventListener('DOMContentLoaded', fn);
        }
    };

    /**
     * frappe.confirm - Show confirmation dialog
     * @param {string} msg - Confirmation message
     * @param {Function} onYes - Callback for yes
     * @param {Function} [onNo] - Callback for no
     */
    window.frappe.confirm = function(msg, onYes, onNo) {
        if (confirm(msg)) {
            if (onYes) onYes();
        } else {
            if (onNo) onNo();
        }
    };

    /**
     * frappe.new_doc - Navigate to new document form
     * @param {string} doctype - DocType name
     * @param {Object} [opts] - Default values
     */
    window.frappe.new_doc = function(doctype, opts = {}) {
        let url = `/app/${frappe.router.slug(doctype)}/new`;
        if (Object.keys(opts).length > 0) {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(opts)) {
                params.set(key, value);
            }
            url += '?' + params.toString();
        }
        window.location.href = url;
    };

    /**
     * frappe.set_route - Navigate to a route
     * @param {...string} args - Route parts
     */
    window.frappe.set_route = function(...args) {
        if (args.length === 0) return;
        
        // Handle array argument
        if (Array.isArray(args[0])) {
            args = args[0];
        }
        
        // Build URL
        let path = args.map(part => encodeURIComponent(part)).join('/');
        window.location.href = '/app/' + path;
    };

    /**
     * frappe.router - Router utilities
     */
    window.frappe.router = {
        slug: function(name) {
            return (name || '')
                .toLowerCase()
                .replace(/ /g, '-')
                .replace(/[^\w-]/g, '');
        },
        // No-op setup for Frappe desk compatibility
        setup: function() {
            // Polyfill: Does nothing in custom apps
            // Frappe desk expects this to exist
        }
    };

    /**
     * frappe.ui - UI components namespace
     */
    window.frappe.ui = window.frappe.ui || {};

    /**
     * frappe.ui.Dialog - Simple modal dialog implementation
     */
    window.frappe.ui.Dialog = class Dialog {
        constructor(opts = {}) {
            this.opts = Object.assign({
                title: 'Dialog',
                fields: [],
                primary_action_label: 'Submit',
                primary_action: null
            }, opts);
            this.values = {};
            this.modal = null;
        }

        make() {
            // Create modal container
            this.modal = document.createElement('div');
            this.modal.className = 'frappe-polyfill-modal';
            this.modal.innerHTML = `
                <div class="modal-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1050;"></div>
                <div class="modal-dialog" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:8px;padding:0;min-width:320px;max-width:90vw;z-index:1051;box-shadow:0 4px 20px rgba(0,0,0,0.2);">
                    <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
                        <h5 style="margin:0;font-size:1.1rem;font-weight:600;">${this.opts.title}</h5>
                        <button type="button" class="close-btn" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#666;">&times;</button>
                    </div>
                    <div class="modal-body" style="padding:20px;"></div>
                    <div class="modal-footer" style="padding:16px 20px;border-top:1px solid #eee;text-align:right;">
                        <button type="button" class="btn-cancel" style="padding:8px 16px;margin-right:8px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;cursor:pointer;">Cancel</button>
                        <button type="button" class="btn-primary" style="padding:8px 16px;background:#2490ef;color:#fff;border:none;border-radius:4px;cursor:pointer;">${this.opts.primary_action_label}</button>
                    </div>
                </div>
            `;

            // Add fields
            const body = this.modal.querySelector('.modal-body');
            this.opts.fields.forEach(field => {
                const wrapper = document.createElement('div');
                wrapper.style.marginBottom = '12px';
                wrapper.setAttribute('data-fieldname', field.fieldname || '');
                
                // Handle Section Break and Column Break
                if (field.fieldtype === 'Section Break') {
                    if (field.label) {
                        wrapper.innerHTML = `<hr style="margin:16px 0 8px;border:none;border-top:1px solid #ddd;"><strong style="font-size:0.9rem;color:#666;">${field.label}</strong>`;
                    }
                    body.appendChild(wrapper);
                    return;
                }
                
                if (field.fieldtype === 'Column Break') {
                    // Just a spacer in simple dialog
                    body.appendChild(wrapper);
                    return;
                }
                
                if (field.fieldtype === 'HTML') {
                    wrapper.innerHTML = typeof field.options === 'string' ? field.options : '';
                    body.appendChild(wrapper);
                    return;
                }
                
                // Create label for other field types
                const label = document.createElement('label');
                label.textContent = field.label || field.fieldname;
                label.style.display = 'block';
                label.style.marginBottom = '4px';
                label.style.fontWeight = '500';
                if (field.reqd) {
                    label.innerHTML += ' <span style="color:red;">*</span>';
                }
                wrapper.appendChild(label);

                let input;
                
                if (field.fieldtype === 'Select') {
                    input = document.createElement('select');
                    // Handle options as array or newline-separated string
                    let options = [];
                    if (Array.isArray(field.options)) {
                        options = field.options;
                    } else if (typeof field.options === 'string') {
                        options = field.options.split('\n').filter(o => o.trim());
                    }
                    options.forEach(opt => {
                        const option = document.createElement('option');
                        // Handle option as object {value, label} or string
                        if (typeof opt === 'object' && opt !== null) {
                            option.value = opt.value || opt.name || '';
                            option.textContent = opt.label || opt.value || opt.name || '';
                        } else {
                            option.value = opt;
                            option.textContent = opt;
                        }
                        input.appendChild(option);
                    });
                } else if (field.fieldtype === 'Text' || field.fieldtype === 'Small Text' || field.fieldtype === 'Long Text' || field.fieldtype === 'Code') {
                    input = document.createElement('textarea');
                    input.rows = field.fieldtype === 'Small Text' ? 2 : 4;
                } else if (field.fieldtype === 'Check') {
                    // Checkbox field
                    const checkWrapper = document.createElement('div');
                    checkWrapper.style.display = 'flex';
                    checkWrapper.style.alignItems = 'center';
                    checkWrapper.style.gap = '8px';
                    
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.style.cssText = 'width:auto;margin:0;';
                    input.checked = field.default ? true : false;
                    
                    // Move label after checkbox
                    wrapper.removeChild(label);
                    checkWrapper.appendChild(input);
                    checkWrapper.appendChild(label);
                    label.style.marginBottom = '0';
                    wrapper.appendChild(checkWrapper);
                } else if (field.fieldtype === 'Link') {
                    // Link field - simplified as text input with autocomplete placeholder
                    // Full Link field behavior requires server-side autocomplete
                    input = document.createElement('input');
                    input.type = 'text';
                    input.placeholder = `Search ${field.options || 'record'}...`;
                    input.setAttribute('data-doctype', field.options || '');
                } else if (field.fieldtype === 'Date') {
                    input = document.createElement('input');
                    input.type = 'date';
                } else if (field.fieldtype === 'Datetime') {
                    input = document.createElement('input');
                    input.type = 'datetime-local';
                } else if (field.fieldtype === 'Time') {
                    input = document.createElement('input');
                    input.type = 'time';
                } else if (field.fieldtype === 'Int') {
                    input = document.createElement('input');
                    input.type = 'number';
                    input.step = '1';
                } else if (field.fieldtype === 'Float' || field.fieldtype === 'Currency' || field.fieldtype === 'Percent') {
                    input = document.createElement('input');
                    input.type = 'number';
                    input.step = 'any';
                } else if (field.fieldtype === 'Password') {
                    input = document.createElement('input');
                    input.type = 'password';
                } else if (field.fieldtype === 'Color') {
                    input = document.createElement('input');
                    input.type = 'color';
                } else if (field.fieldtype === 'Read Only' || field.fieldtype === 'Data (Read Only)') {
                    input = document.createElement('input');
                    input.type = 'text';
                    input.readOnly = true;
                    input.style.backgroundColor = '#f5f5f5';
                } else {
                    // Default: Data field (text input)
                    input = document.createElement('input');
                    input.type = 'text';
                }
                
                // Set common attributes if input was created
                if (input && field.fieldtype !== 'Check') {
                    input.name = field.fieldname;
                    input.value = field.default !== undefined ? field.default : '';
                    input.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;';
                    if (field.reqd) {
                        input.required = true;
                    }
                    if (field.read_only) {
                        input.readOnly = true;
                        input.style.backgroundColor = '#f5f5f5';
                    }
                    wrapper.appendChild(input);
                } else if (input && field.fieldtype === 'Check') {
                    input.name = field.fieldname;
                }
                
                // Add description if provided
                if (field.description) {
                    const desc = document.createElement('small');
                    desc.textContent = field.description;
                    desc.style.cssText = 'color:#888;font-size:0.85rem;display:block;margin-top:4px;';
                    wrapper.appendChild(desc);
                }
                
                body.appendChild(wrapper);
            });

            // Bind events
            this.modal.querySelector('.close-btn').addEventListener('click', () => this.hide());
            this.modal.querySelector('.btn-cancel').addEventListener('click', () => this.hide());
            this.modal.querySelector('.modal-backdrop').addEventListener('click', () => this.hide());
            this.modal.querySelector('.btn-primary').addEventListener('click', () => {
                this.collectValues();
                if (this.opts.primary_action) {
                    this.opts.primary_action(this.values);
                }
            });

            document.body.appendChild(this.modal);
            return this;
        }

        collectValues() {
            this.values = {};
            this.modal.querySelectorAll('input, select, textarea').forEach(el => {
                if (el.name) {
                    // Handle checkbox specially
                    if (el.type === 'checkbox') {
                        this.values[el.name] = el.checked ? 1 : 0;
                    } else if (el.type === 'number') {
                        this.values[el.name] = el.value ? parseFloat(el.value) : 0;
                    } else {
                        this.values[el.name] = el.value;
                    }
                }
            });
        }

        get_values() {
            this.collectValues();
            return this.values;
        }

        set_values(vals) {
            Object.entries(vals).forEach(([key, value]) => {
                const el = this.modal.querySelector(`[name="${key}"]`);
                if (el) {
                    if (el.type === 'checkbox') {
                        el.checked = value ? true : false;
                    } else {
                        el.value = value;
                    }
                }
            });
        }

        /**
         * Get a specific field element
         * @param {string} fieldname - Field name
         * @returns {HTMLElement|null} Field wrapper element
         */
        get_field(fieldname) {
            return this.modal ? this.modal.querySelector(`[data-fieldname="${fieldname}"]`) : null;
        }

        /**
         * Set value for a specific field
         * @param {string} fieldname - Field name
         * @param {*} value - Value to set
         */
        set_value(fieldname, value) {
            const el = this.modal ? this.modal.querySelector(`[name="${fieldname}"]`) : null;
            if (el) {
                if (el.type === 'checkbox') {
                    el.checked = value ? true : false;
                } else {
                    el.value = value;
                }
            }
        }

        /**
         * Get value of a specific field
         * @param {string} fieldname - Field name
         * @returns {*} Field value
         */
        get_value(fieldname) {
            const el = this.modal ? this.modal.querySelector(`[name="${fieldname}"]`) : null;
            if (!el) return null;
            if (el.type === 'checkbox') return el.checked ? 1 : 0;
            if (el.type === 'number') return el.value ? parseFloat(el.value) : 0;
            return el.value;
        }

        show() {
            if (!this.modal) this.make();
            this.modal.style.display = 'block';
            return this;
        }

        hide() {
            if (this.modal) {
                this.modal.style.display = 'none';
                this.modal.remove();
                this.modal = null;
            }
        }
    };

    // =========================================================================
    // FRAPPE.DB - Database API Wrapper
    // Provides frappe.db.* methods as documented in Frappe v15
    // =========================================================================
    
    window.frappe.db = {
        /**
         * Get a document by doctype and name
         * @param {string} doctype - DocType name
         * @param {string} name - Document name
         * @param {Object} [filters] - Optional filters if name is not provided
         * @returns {Promise} Promise resolving with document
         */
        get_doc: function(doctype, name, filters) {
            if (name) {
                return frappe.call({
                    method: 'frappe.client.get',
                    args: { doctype, name }
                }).then(r => r.message);
            } else {
                return frappe.call({
                    method: 'frappe.client.get',
                    args: { doctype, filters: filters || {} }
                }).then(r => r.message);
            }
        },

        /**
         * Get list of documents
         * @param {string} doctype - DocType name
         * @param {Object} opts - Options: fields, filters, order_by, limit_start, limit_page_length
         * @returns {Promise} Promise resolving with list of documents
         */
        get_list: function(doctype, opts = {}) {
            return frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype,
                    fields: opts.fields || ['name'],
                    filters: opts.filters || {},
                    order_by: opts.order_by,
                    limit_start: opts.limit_start || 0,
                    limit_page_length: opts.limit_page_length || opts.limit || 20
                }
            }).then(r => r.message);
        },

        /**
         * Get field value(s) from a document
         * @param {string} doctype - DocType name
         * @param {string|Object} name - Document name or filters
         * @param {string|Array} fieldname - Field name(s) to get
         * @returns {Promise} Promise resolving with field values
         */
        get_value: function(doctype, name, fieldname) {
            const args = { doctype };
            
            if (typeof name === 'object') {
                args.filters = name;
            } else {
                args.name = name;
            }
            
            if (Array.isArray(fieldname)) {
                args.fieldname = fieldname;
            } else {
                args.fieldname = fieldname;
            }
            
            return frappe.call({
                method: 'frappe.client.get_value',
                args
            }).then(r => r);
        },

        /**
         * Get value from a Single DocType
         * @param {string} doctype - Single DocType name
         * @param {string} field - Field name
         * @returns {Promise} Promise resolving with field value
         */
        get_single_value: function(doctype, field) {
            return frappe.call({
                method: 'frappe.client.get_single_value',
                args: { doctype, field }
            }).then(r => r.message);
        },

        /**
         * Set field value(s) on a document
         * @param {string} doctype - DocType name
         * @param {string} name - Document name
         * @param {string|Object} fieldname - Field name or object of fields
         * @param {*} [value] - Field value (if fieldname is string)
         * @returns {Promise} Promise resolving with updated document
         */
        set_value: function(doctype, name, fieldname, value) {
            const args = { doctype, name };
            
            if (typeof fieldname === 'object') {
                args.fieldname = fieldname;
            } else {
                args.fieldname = { [fieldname]: value };
            }
            
            return frappe.call({
                method: 'frappe.client.set_value',
                args
            }).then(r => r);
        },

        /**
         * Insert a new document
         * @param {Object} doc - Document to insert (must include doctype)
         * @returns {Promise} Promise resolving with inserted document
         */
        insert: function(doc) {
            return frappe.call({
                method: 'frappe.client.insert',
                args: { doc }
            }).then(r => r.message);
        },

        /**
         * Count documents matching filters
         * @param {string} doctype - DocType name
         * @param {Object} [filters] - Optional filters
         * @returns {Promise} Promise resolving with count
         */
        count: function(doctype, filters) {
            return frappe.call({
                method: 'frappe.client.get_count',
                args: { doctype, filters: filters || {} }
            }).then(r => r.message);
        },

        /**
         * Check if a document exists
         * @param {string} doctype - DocType name
         * @param {string} name - Document name
         * @returns {Promise} Promise resolving with boolean
         */
        exists: function(doctype, name) {
            return frappe.call({
                method: 'frappe.client.get_value',
                args: { doctype, filters: { name }, fieldname: 'name' },
                silent: true
            }).then(r => !!(r.message && r.message.name))
              .catch(() => false);
        },

        /**
         * Delete a document
         * @param {string} doctype - DocType name
         * @param {string} name - Document name
         * @returns {Promise} Promise resolving when deleted
         */
        delete_doc: function(doctype, name) {
            return frappe.call({
                method: 'frappe.client.delete',
                args: { doctype, name }
            });
        }
    };

    // =========================================================================
    // FRAPPE.XCALL - Async API Call
    // Simplified async call that returns promise with message directly
    // =========================================================================
    
    /**
     * frappe.xcall - Async API call shorthand
     * @param {string} method - API method path
     * @param {Object} [args] - Method arguments
     * @returns {Promise} Promise resolving with response message
     */
    window.frappe.xcall = function(method, args = {}) {
        return frappe.call({
            method,
            args
        }).then(r => r.message);
    };

    // =========================================================================
    // FRAPPE.UTILS - Utility Functions
    // Common utility functions used across Frappe applications
    // =========================================================================
    
    window.frappe.utils = window.frappe.utils || {};

    /**
     * Escape HTML to prevent XSS
     * @param {string} txt - Text to escape
     * @returns {string} Escaped HTML
     */
    window.frappe.utils.escape_html = function(txt) {
        if (txt === null || txt === undefined) return '';
        const div = document.createElement('div');
        div.textContent = txt;
        return div.innerHTML;
    };

    /**
     * Get current datetime as string
     * @returns {string} Current datetime in ISO format
     */
    window.frappe.utils.get_datetime_as_string = function() {
        return new Date().toISOString().replace('T', ' ').substring(0, 19);
    };

    /**
     * Get current date as string
     * @returns {string} Current date in YYYY-MM-DD format
     */
    window.frappe.utils.get_today = function() {
        return new Date().toISOString().substring(0, 10);
    };

    /**
     * Get current time as string
     * @returns {string} Current time in HH:MM:SS format
     */
    window.frappe.utils.now_time = function() {
        return new Date().toTimeString().substring(0, 8);
    };

    /**
     * Get current datetime
     * @returns {string} Current datetime in YYYY-MM-DD HH:MM:SS format
     */
    window.frappe.utils.now_datetime = function() {
        return frappe.utils.get_datetime_as_string();
    };

    /**
     * Generate a random string
     * @param {number} [length=10] - Length of string
     * @returns {string} Random string
     */
    window.frappe.utils.get_random = function(length = 10) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    /**
     * Convert string to title case
     * @param {string} txt - Text to convert
     * @returns {string} Title-cased text
     */
    window.frappe.utils.to_title_case = function(txt) {
        if (!txt) return '';
        return txt.replace(/\w\S*/g, word => 
            word.charAt(0).toUpperCase() + word.substr(1).toLowerCase()
        );
    };

    /**
     * Check if a value is empty (null, undefined, empty string, empty array)
     * @param {*} value - Value to check
     * @returns {boolean} True if empty
     */
    window.frappe.utils.is_empty = function(value) {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string' && value.trim() === '') return true;
        if (Array.isArray(value) && value.length === 0) return true;
        if (typeof value === 'object' && Object.keys(value).length === 0) return true;
        return false;
    };

    /**
     * Deep clone an object
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     */
    window.frappe.utils.deep_clone = function(obj) {
        return JSON.parse(JSON.stringify(obj));
    };

    /**
     * Get URL parameter value
     * @param {string} param - Parameter name
     * @returns {string|null} Parameter value
     */
    window.frappe.utils.get_url_arg = function(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    };

    // =========================================================================
    // FRAPPE.GET_ROUTE / FRAPPE.REQUIRE
    // Route utilities and async asset loading
    // =========================================================================
    
    /**
     * Get the current route as an array
     * @returns {Array} Route parts
     */
    window.frappe.get_route = function() {
        const path = window.location.pathname;
        // Remove /app/ prefix if present
        const cleanPath = path.replace(/^\/app\//, '').replace(/^\//, '');
        return cleanPath.split('/').filter(p => p);
    };

    /**
     * Get route string
     * @returns {string} Current route as string
     */
    window.frappe.get_route_str = function() {
        return frappe.get_route().join('/');
    };

    /**
     * Load JS or CSS assets asynchronously
     * @param {string|Array} assets - Asset path(s) to load
     * @param {Function} [callback] - Callback when loaded
     * @returns {Promise} Promise resolving when all assets loaded
     */
    window.frappe.require = function(assets, callback) {
        const assetList = Array.isArray(assets) ? assets : [assets];
        
        const loadAsset = (src) => {
            return new Promise((resolve, reject) => {
                // Check if already loaded
                if (document.querySelector(`script[src="${src}"], link[href="${src}"]`)) {
                    resolve();
                    return;
                }
                
                if (src.endsWith('.css')) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = src;
                    link.onload = resolve;
                    link.onerror = reject;
                    document.head.appendChild(link);
                } else {
                    const script = document.createElement('script');
                    script.src = src;
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                }
            });
        };
        
        const promise = Promise.all(assetList.map(loadAsset));
        
        if (callback) {
            promise.then(callback).catch(err => {
                console.error('Failed to load assets:', err);
            });
        }
        
        return promise;
    };

    // =========================================================================
    // FRAPPE.REALTIME - Socket.io Realtime Events
    // Connects to Frappe's socket.io server for realtime updates
    // =========================================================================
    
    window.frappe.realtime = (function() {
        let socket = null;
        let isConnected = false;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        const eventHandlers = {};
        const pendingSubscriptions = [];
        
        /**
         * Initialize socket connection
         */
        function init() {
            // Check if socket.io is available
            if (typeof io === 'undefined') {
                // Try to load socket.io
                const script = document.createElement('script');
                script.src = '/socket.io/socket.io.js';
                script.onload = () => connect();
                script.onerror = () => {
                    console.warn('Socket.io not available. Realtime events will not work.');
                };
                document.head.appendChild(script);
            } else {
                connect();
            }
        }
        
        /**
         * Connect to socket server
         */
        function connect() {
            if (socket && isConnected) return;
            
            try {
                const socketUrl = window.location.origin;
                socket = io(socketUrl, {
                    path: '/socket.io',
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: maxReconnectAttempts,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000
                });
                
                socket.on('connect', () => {
                    isConnected = true;
                    reconnectAttempts = 0;
                    console.log('Realtime connected');
                    
                    // Process pending subscriptions
                    while (pendingSubscriptions.length > 0) {
                        const { event, handler } = pendingSubscriptions.shift();
                        subscribe(event, handler);
                    }
                });
                
                socket.on('disconnect', () => {
                    isConnected = false;
                    console.log('Realtime disconnected');
                });
                
                socket.on('connect_error', (error) => {
                    reconnectAttempts++;
                    console.warn('Realtime connection error:', error.message);
                    
                    if (reconnectAttempts >= maxReconnectAttempts) {
                        console.error('Max reconnection attempts reached');
                    }
                });
                
                // Handle incoming events
                socket.onAny((event, data) => {
                    // Trigger handlers for exact match
                    if (eventHandlers[event]) {
                        eventHandlers[event].forEach(fn => {
                            try {
                                fn(data);
                            } catch (e) {
                                console.error('Error in realtime handler:', e);
                            }
                        });
                    }
                    
                    // Trigger handlers for wildcard patterns
                    Object.keys(eventHandlers).forEach(pattern => {
                        if (pattern.includes('*')) {
                            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                            if (regex.test(event)) {
                                eventHandlers[pattern].forEach(fn => {
                                    try {
                                        fn(data);
                                    } catch (e) {
                                        console.error('Error in realtime handler:', e);
                                    }
                                });
                            }
                        }
                    });
                });
                
            } catch (error) {
                console.error('Failed to initialize realtime:', error);
            }
        }
        
        /**
         * Subscribe to an event
         */
        function subscribe(event, handler) {
            if (!eventHandlers[event]) {
                eventHandlers[event] = [];
            }
            eventHandlers[event].push(handler);
            
            // If connected, join the room for user-specific events
            if (socket && isConnected && frappe.session && frappe.session.user) {
                socket.emit('frappe:subscribe', event);
            }
        }
        
        /**
         * Register event handler
         * @param {string} event - Event name
         * @param {Function} handler - Event handler
         */
        function on(event, handler) {
            if (typeof handler !== 'function') {
                console.warn('Realtime handler must be a function');
                return;
            }
            
            if (!socket || !isConnected) {
                // Queue for later
                pendingSubscriptions.push({ event, handler });
                // Try to connect
                if (!socket) init();
            } else {
                subscribe(event, handler);
            }
        }
        
        /**
         * Remove event handler
         * @param {string} event - Event name
         * @param {Function} [handler] - Specific handler to remove (removes all if not specified)
         */
        function off(event, handler) {
            if (!eventHandlers[event]) return;
            
            if (handler) {
                eventHandlers[event] = eventHandlers[event].filter(fn => fn !== handler);
            } else {
                delete eventHandlers[event];
            }
            
            if (socket && isConnected) {
                socket.emit('frappe:unsubscribe', event);
            }
        }
        
        /**
         * Emit an event
         * @param {string} event - Event name
         * @param {*} data - Event data
         */
        function emit(event, data) {
            if (socket && isConnected) {
                socket.emit(event, data);
            } else {
                console.warn('Realtime not connected, cannot emit:', event);
            }
        }
        
        /**
         * Publish event to server
         * @param {string} event - Event name
         * @param {*} message - Event data
         */
        function publish(event, message) {
            if (socket && isConnected) {
                socket.emit('frappe:publish', { event, message });
            }
        }
        
        // Auto-initialize when document is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            // Delay init to allow page to set up
            setTimeout(init, 100);
        }
        
        return {
            on,
            off,
            emit,
            publish,
            init,
            get connected() { return isConnected; }
        };
    })();

    /**
     * frappe.csrf_token - CSRF token for API calls
     * Single source of truth: window.FRAPPE_CSRF_TOKEN
     * Getter automatically sets it from meta tag or cookie if not already set
     */
    Object.defineProperty(window.frappe, 'csrf_token', {
        get: function() {
            // Return cached value if already set
            if (window.FRAPPE_CSRF_TOKEN) {
                return window.FRAPPE_CSRF_TOKEN;
            }
            
            // Try to get from meta tag
            const meta = document.querySelector('meta[name="csrf_token"]');
            if (meta) {
                window.FRAPPE_CSRF_TOKEN = meta.getAttribute('content');
                return window.FRAPPE_CSRF_TOKEN;
            }
            
            // Fallback to cookie
            const match = document.cookie.match(/csrf_token=([^;]+)/);
            if (match) {
                window.FRAPPE_CSRF_TOKEN = match[1];
                return window.FRAPPE_CSRF_TOKEN;
            }
            
            return '';
        },
        set: function(value) {
            // Allow manual setting of CSRF token
            window.FRAPPE_CSRF_TOKEN = value;
        }
    });

    // =========================================================================
    // FRAPPE.SESSION & FRAPPE.BOOT
    // Session and boot data for user context
    // =========================================================================

    /**
     * frappe.session - Session info
     * Try to get session info from cookie or API
     */
    window.frappe.session = window.frappe.session || {
        user: null,
        sid: null,
        user_fullname: null,
        // Add ready state to prevent race conditions
        _ready: false,
        _readyCallbacks: []
    };

    /**
     * frappe.session.ready - Execute callback when session is fully loaded
     * Prevents race condition where user is set but roles are still loading
     */
    window.frappe.session.ready = function(callback) {
        if (typeof callback !== 'function') return;
        if (frappe.session._ready) {
            callback();
        } else {
            frappe.session._readyCallbacks.push(callback);
        }
    };

    /**
     * Mark session as ready and trigger callbacks
     */
    window.frappe.session._markReady = function() {
        frappe.session._ready = true;
        // Ensure _readyCallbacks exists
        const callbacks = frappe.session._readyCallbacks || [];
        callbacks.forEach(fn => {
            try { fn(); } catch(e) { console.error('Session ready callback error:', e); }
        });
        frappe.session._readyCallbacks = [];
    };

    /**
     * frappe.sid - Session ID shortcut (alias for frappe.session.sid)
     * Used for backward compatibility and direct access
     */
    Object.defineProperty(window.frappe, 'sid', {
        get: function() {
            return frappe.session.sid;
        },
        set: function(value) {
            frappe.session.sid = value;
        }
    });

    /**
     * frappe.boot - Boot data (user roles, defaults, etc.)
     * Will be populated from API on init
     */
    window.frappe.boot = window.frappe.boot || {
        user: {
            name: null,
            roles: [],
            defaults: {}
        },
        sysdefaults: {},
        active_domains: []
    };

    /**
     * frappe.user - User information shortcuts
     */
    window.frappe.user = window.frappe.user || {
        name: null,
        full_name: null,
        image: null,
        has_role: function(role) {
            return frappe.boot.user.roles.includes(role);
        }
    };

    /**
     * Initialize session data from cookies and optionally fetch boot data
     */
    (function initSessionData() {
        // Extract SID from cookie
        const sidMatch = document.cookie.match(/sid=([^;]+)/);
        if (sidMatch) {
            frappe.session.sid = sidMatch[1];
        }

        // Extract user_id from cookie if set
        const userMatch = document.cookie.match(/user_id=([^;]+)/);
        if (userMatch) {
            const userId = decodeURIComponent(userMatch[1]);
            frappe.session.user = userId;
            frappe.boot.user.name = userId;
            frappe.user.name = userId;
        }

        // Check if we have a logged-in user (not Guest)
        const isLoggedIn = frappe.session.user && frappe.session.user !== 'Guest';

        // Only fetch boot data if logged in AND in website context (not desk)
        // In desk context, frappe already has boot data from server
        const isDeskContext = window.location.pathname.startsWith('/app/');
        const needsBootData = isLoggedIn && !isDeskContext;

        // Fetch boot data if needed (website/public pages only)
        if (needsBootData) {
            // Use appropriate initialization based on context
            const initUserContext = function() {
                frappe.call({
                    method: 'imogi_pos.utils.auth_helpers.get_user_role_context',
                    silent: true
                }).then(r => {
                    if (r && r.message) {
                        const ctx = r.message;
                        frappe.session.user = ctx.user;
                        frappe.session.user_fullname = ctx.full_name || ctx.user;
                        frappe.boot.user.name = ctx.user;
                        frappe.boot.user.roles = ctx.roles || [];
                        frappe.boot.user.defaults = ctx.defaults || {};
                        frappe.user.name = ctx.user;
                        frappe.user.full_name = ctx.full_name;
                        
                        // Mark session as ready after roles are loaded
                        frappe.session._markReady();
                    }
                }).catch((err) => {
                    // Silently ignore if API not available
                    console.debug('IMOGI POS: Could not fetch user context:', err);
                    // Mark as ready anyway to prevent infinite waiting
                    frappe.session._markReady();
                });
            };
            
            // Call immediately or when ready based on context
            if (typeof frappe.ready === 'function') {
                // Website/public context - use frappe.ready
                frappe.ready(initUserContext);
            } else {
                // Call immediately or use DOMContentLoaded
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', initUserContext);
                } else {
                    initUserContext();
                }
            }
        } else {
            // Mark session as ready immediately if no boot data needed
            // (Guest user or Desk context where Frappe already provides boot data)
            setTimeout(() => frappe.session._markReady(), 0);
        }
    })();

    /**
     * __ - Translation function (passthrough for now)
     * @param {string} txt - Text to translate
     * @returns {string} Translated text
     */
    if (typeof window.__ === 'undefined') {
        window.__ = function(txt) {
            return txt;
        };
    }

    console.log('Frappe polyfill loaded');
})();
