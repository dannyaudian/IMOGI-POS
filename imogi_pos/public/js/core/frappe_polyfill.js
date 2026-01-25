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

    // Skip if Frappe is already loaded
    if (typeof window.frappe !== 'undefined' && typeof window.frappe.provide === 'function') {
        return;
    }

    // Initialize frappe namespace
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
     * frappe.ready - Execute callback when DOM is ready
     * @param {Function} callback - Function to execute
     */
    window.frappe.ready = function(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback);
        } else {
            callback();
        }
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
        
        const fetchOpts = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Frappe-CSRF-Token': frappe.csrf_token || ''
            },
            credentials: 'include',
            body: JSON.stringify(args)
        };

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
                console.error('frappe.call error:', method, err);
                
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

        return promise;
    };

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
                
                if (field.fieldtype === 'HTML') {
                    wrapper.innerHTML = field.options || '';
                } else {
                    const label = document.createElement('label');
                    label.textContent = field.label || field.fieldname;
                    label.style.display = 'block';
                    label.style.marginBottom = '4px';
                    label.style.fontWeight = '500';
                    wrapper.appendChild(label);

                    let input;
                    if (field.fieldtype === 'Select') {
                        input = document.createElement('select');
                        (field.options || '').split('\n').forEach(opt => {
                            const option = document.createElement('option');
                            option.value = opt;
                            option.textContent = opt;
                            input.appendChild(option);
                        });
                    } else if (field.fieldtype === 'Text') {
                        input = document.createElement('textarea');
                        input.rows = 3;
                    } else {
                        input = document.createElement('input');
                        input.type = field.fieldtype === 'Int' || field.fieldtype === 'Float' || field.fieldtype === 'Currency' ? 'number' : 'text';
                    }
                    input.name = field.fieldname;
                    input.value = field.default || '';
                    input.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;';
                    wrapper.appendChild(input);
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
                    this.values[el.name] = el.value;
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
                if (el) el.value = value;
            });
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

    /**
     * frappe.show_alert - Show a toast notification
     * @param {Object|string} opts - Alert options or message
     */
    window.frappe.show_alert = function(opts) {
        let message = opts;
        let indicator = 'blue';
        
        if (typeof opts === 'object') {
            message = opts.message || '';
            indicator = opts.indicator || 'blue';
        }
        
        // Create toast element
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: #fff;
            font-size: 14px;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease;
        `;
        
        const colors = {
            green: '#28a745',
            red: '#dc3545',
            blue: '#2490ef',
            orange: '#fd7e14',
            yellow: '#ffc107'
        };
        toast.style.backgroundColor = colors[indicator] || colors.blue;
        toast.textContent = message;
        
        // Add animation styles if not exists
        if (!document.getElementById('frappe-polyfill-styles')) {
            const style = document.createElement('style');
            style.id = 'frappe-polyfill-styles';
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
        
        document.body.appendChild(toast);
        
        // Remove after delay
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    /**
     * frappe.realtime - Realtime events stub
     * This is a no-op stub since real realtime requires socket.io
     */
    window.frappe.realtime = {
        on: function() {},
        off: function() {},
        emit: function() {}
    };

    /**
     * frappe.csrf_token - CSRF token for API calls
     * Try to get it from cookie or meta tag
     */
    Object.defineProperty(window.frappe, 'csrf_token', {
        get: function() {
            // Try meta tag first
            const meta = document.querySelector('meta[name="csrf_token"]');
            if (meta) {
                return meta.getAttribute('content');
            }
            // Try cookie
            const match = document.cookie.match(/csrf_token=([^;]+)/);
            return match ? match[1] : '';
        }
    });

    /**
     * frappe.session - Session info stub
     * Try to get session info from cookie
     */
    window.frappe.session = window.frappe.session || {
        user: null,
        sid: null
    };

    // Try to extract session info from cookies
    const sidMatch = document.cookie.match(/sid=([^;]+)/);
    if (sidMatch) {
        window.frappe.session.sid = sidMatch[1];
    }

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
