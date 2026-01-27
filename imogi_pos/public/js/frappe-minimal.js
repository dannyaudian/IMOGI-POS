/**
 * Minimal Frappe Shim for React Standalone Apps
 * 
 * Provides only essential frappe APIs needed by React apps without
 * overriding Frappe Desk's native functionality.
 * 
 * This should ONLY be loaded in standalone React apps, NOT in Frappe Desk.
 */

(function() {
    'use strict';

    // Only initialize if frappe doesn't exist (standalone React app context)
    if (typeof window.frappe !== 'undefined') {
        console.log('Frappe already exists, skipping minimal shim');
        return;
    }

    // Initialize minimal frappe object
    window.frappe = {
        // Session info (will be populated by template)
        session: {
            user: 'Guest',
            user_fullname: 'Guest',
            csrf_token: ''
        },

        // Boot data (will be populated by template)
        boot: {
            sysdefaults: {},
            user: {
                roles: []
            }
        },

        // Defaults helper
        defaults: {
            get_user_default: function(key) {
                return localStorage.getItem(`frappe_default_${key}`);
            },
            set_user_default: function(key, value) {
                localStorage.setItem(`frappe_default_${key}`, value);
            }
        },

        // Datetime helpers
        datetime: {
            get_datetime_as_string: function(date) {
                const d = date ? new Date(date) : new Date();
                return d.toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            },
            get_date_as_string: function(date) {
                const d = date ? new Date(date) : new Date();
                return d.toISOString().split('T')[0];
            }
        },

        // Format helpers
        format: function(value, options = {}) {
            if (value === null || value === undefined) return '';
            
            const fieldtype = options.fieldtype || 'Data';
            
            if (fieldtype === 'Currency') {
                const num = parseFloat(value) || 0;
                return new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }).format(num);
            }
            
            if (fieldtype === 'Float' || fieldtype === 'Percent') {
                return parseFloat(value).toFixed(2);
            }
            
            return String(value);
        },

        // Alert/toast helper
        show_alert: function(options) {
            const message = typeof options === 'string' ? options : options.message;
            const indicator = options.indicator || 'blue';
            
            // Simple toast implementation
            const toast = document.createElement('div');
            toast.className = `frappe-alert frappe-alert-${indicator}`;
            toast.textContent = message;
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                background: ${indicator === 'green' ? '#28a745' : indicator === 'red' ? '#dc3545' : '#007bff'};
                color: white;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                z-index: 10000;
                animation: slideIn 0.3s ease-out;
            `;
            
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        },

        // API call helper
        call: async function(options) {
            const { method, args = {}, callback, error: errorCallback } = options;
            
            if (!method) {
                throw new Error('Method is required for frappe.call');
            }

            const csrfToken = window.FRAPPE_CSRF_TOKEN || this.session.csrf_token || '';
            
            try {
                const response = await fetch(`/api/method/${method}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Frappe-CSRF-Token': csrfToken
                    },
                    credentials: 'include',
                    body: JSON.stringify(args)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                
                if (callback) {
                    callback(data);
                }
                
                return data;
            } catch (err) {
                console.error('frappe.call error:', err);
                
                if (errorCallback) {
                    errorCallback(err);
                } else {
                    this.show_alert({
                        message: err.message || 'Request failed',
                        indicator: 'red'
                    });
                }
                
                throw err;
            }
        },

        // Realtime placeholder (for apps that check for it)
        realtime: {
            on: function() {
                // Noop - realtime not supported in minimal shim
                console.warn('frappe.realtime not fully supported in minimal shim');
            },
            off: function() {}
        },

        // CSRF token getter
        get csrf_token() {
            return window.FRAPPE_CSRF_TOKEN || this.session.csrf_token || '';
        },

        set csrf_token(value) {
            window.FRAPPE_CSRF_TOKEN = value;
            this.session.csrf_token = value;
        }
    };

    // Add CSS for alerts
    if (!document.getElementById('frappe-minimal-styles')) {
        const style = document.createElement('style');
        style.id = 'frappe-minimal-styles';
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    console.log('Frappe minimal shim loaded');
})();
