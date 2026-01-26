/**
 * Permission Manager - Client-side permission checking and UI control
 * 
 * This module handles role-based UI restrictions including:
 * - Field visibility and editability
 * - Button visibility
 * - Menu item visibility
 * - Form section visibility
 */

// Wrap everything to ensure frappe is available
(function() {
    'use strict';
    
    // Wait for frappe to be available
    if (typeof frappe === 'undefined') {
        console.warn('PermissionManager: frappe not available, skipping initialization');
        return;
    }

class PermissionManager {
    constructor() {
        this.initialized = false;
        this.permissions = null;
        this.userRoles = [];
        this.isPrivileged = false;
    }

    /**
     * Initialize permission manager
     * @returns {Promise<void>}
     */
    async init() {
        if (this.initialized) {
            return;
        }

        try {
            await this.fetchPermissions();
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize PermissionManager:', error);
            frappe.throw(__('Failed to load user permissions'));
        }
    }

    /**
     * Fetch user permissions from server
     * @returns {Promise<void>}
     */
    async fetchPermissions() {
        const response = await frappe.call({
            method: 'imogi_pos.utils.role_permissions.get_permissions_for_user',
            type: 'GET',
        });

        if (response.message) {
            this.permissions = response.message;
            this.userRoles = response.message.roles || [];
            this.isPrivileged = response.message.is_privileged || false;
        }
    }

    /**
     * Check if user has DocType permission
     * @param {string} doctype - DocType name
     * @param {string} permType - Permission type (read, write, create, delete)
     * @returns {boolean}
     */
    hasDocTypePermission(doctype, permType = 'read') {
        if (!this.initialized) {
            console.warn('PermissionManager not initialized');
            return true; // Fail open
        }

        if (this.isPrivileged) {
            return true;
        }

        const doctypePerms = this.permissions.accessible_doctypes[doctype];
        if (!doctypePerms) {
            return true; // No restrictions defined
        }

        return doctypePerms[permType] || false;
    }

    /**
     * Check if user has field permission
     * @param {string} doctype - DocType name
     * @param {string} fieldname - Field name
     * @param {string} permType - Permission type (read, write)
     * @returns {boolean}
     */
    hasFieldPermission(doctype, fieldname, permType = 'read') {
        if (!this.initialized) {
            console.warn('PermissionManager not initialized');
            return true; // Fail open
        }

        if (this.isPrivileged) {
            return true;
        }

        const doctypeFields = this.permissions.restricted_fields[doctype];
        if (!doctypeFields || !doctypeFields[fieldname]) {
            return true; // No restrictions defined
        }

        return doctypeFields[fieldname][permType] || false;
    }

    /**
     * Check if user has button permission
     * @param {string} doctype - DocType name
     * @param {string} buttonName - Button name
     * @returns {boolean}
     */
    hasButtonPermission(doctype, buttonName) {
        if (!this.initialized) {
            console.warn('PermissionManager not initialized');
            return true; // Fail open
        }

        if (this.isPrivileged) {
            return true;
        }

        const doctypeButtons = this.permissions.accessible_buttons[doctype];
        if (!doctypeButtons || doctypeButtons[buttonName] === undefined) {
            return true; // No restrictions defined
        }

        return doctypeButtons[buttonName] || false;
    }

    /**
     * Check if user has menu access
     * @param {string} menuItem - Menu item name
     * @returns {boolean}
     */
    hasMenuAccess(menuItem) {
        if (!this.initialized) {
            console.warn('PermissionManager not initialized');
            return true; // Fail open
        }

        if (this.isPrivileged) {
            return true;
        }

        return this.permissions.accessible_menus.includes(menuItem);
    }

    /**
     * Check if user has any of the specified roles
     * @param {Array<string>} roles - Role names to check
     * @returns {boolean}
     */
    hasAnyRole(roles) {
        if (!this.initialized || !this.userRoles) {
            return false;
        }

        return roles.some(role => this.userRoles.includes(role));
    }

    /**
     * Apply field restrictions to form
     * @param {Object} frm - Frappe form object
     */
    applyFieldRestrictions(frm) {
        if (!this.initialized || !frm) {
            return;
        }

        const doctype = frm.doctype;
        const restrictedFields = this.permissions.restricted_fields[doctype];

        if (!restrictedFields) {
            return;
        }

        Object.keys(restrictedFields).forEach(fieldname => {
            const field = frm.fields_dict[fieldname];
            if (!field) return;

            const perms = restrictedFields[fieldname];

            // Hide field if no read permission
            if (!perms.read) {
                frm.set_df_property(fieldname, 'hidden', 1);
                return;
            }

            // Make read-only if no write permission
            if (!perms.write) {
                frm.set_df_property(fieldname, 'read_only', 1);
            }
        });
    }

    /**
     * Apply button restrictions to form
     * @param {Object} frm - Frappe form object
     */
    applyButtonRestrictions(frm) {
        if (!this.initialized || !frm) {
            return;
        }

        const doctype = frm.doctype;
        const buttons = this.permissions.accessible_buttons[doctype];

        if (!buttons) {
            return;
        }

        // Hide restricted buttons
        Object.keys(buttons).forEach(buttonName => {
            if (!buttons[buttonName]) {
                // Try to hide button if it exists
                const $button = frm.page.btn_secondary.find(`[data-action="${buttonName}"]`);
                if ($button.length) {
                    $button.hide();
                }
            }
        });
    }

    /**
     * Apply all restrictions to form
     * @param {Object} frm - Frappe form object
     */
    applyFormRestrictions(frm) {
        if (!this.initialized) {
            console.warn('PermissionManager not initialized');
            return;
        }

        this.applyFieldRestrictions(frm);
        this.applyButtonRestrictions(frm);
    }

    /**
     * Show/hide element based on permission
     * @param {string|HTMLElement} element - Element selector or DOM element
     * @param {boolean} hasPermission - Whether user has permission
     */
    toggleElement(element, hasPermission) {
        const el = typeof element === 'string' ? document.querySelector(element) : element;
        if (!el) return;

        if (hasPermission) {
            el.style.display = '';
            el.classList.remove('hidden');
        } else {
            el.style.display = 'none';
            el.classList.add('hidden');
        }
    }

    /**
     * Make field read-only based on permission
     * @param {Object} frm - Frappe form object
     * @param {string} fieldname - Field name
     * @param {boolean} canWrite - Whether user can write
     */
    toggleFieldWritable(frm, fieldname, canWrite) {
        if (!frm || !fieldname) return;

        frm.set_df_property(fieldname, 'read_only', !canWrite);
    }

    /**
     * Show permission denied message
     * @param {string} action - Action that was denied
     */
    showPermissionDenied(action = 'perform this action') {
        frappe.msgprint({
            title: __('Access Denied'),
            message: __('You do not have permission to {0}. Please contact your system administrator.', [action]),
            indicator: 'red'
        });
    }

    /**
     * Process elements with data-permission attributes
     */
    processPermissionAttributes() {
        if (!this.initialized) {
            return;
        }

        // Process data-doctype-permission elements
        document.querySelectorAll('[data-doctype-permission]').forEach(el => {
            const [doctype, permType] = el.getAttribute('data-doctype-permission').split(':');
            const hasPermission = this.hasDocTypePermission(doctype, permType || 'read');
            this.toggleElement(el, hasPermission);
        });

        // Process data-button-permission elements
        document.querySelectorAll('[data-button-permission]').forEach(el => {
            const [doctype, buttonName] = el.getAttribute('data-button-permission').split(':');
            const hasPermission = this.hasButtonPermission(doctype, buttonName);
            this.toggleElement(el, hasPermission);
        });

        // Process data-menu-permission elements
        document.querySelectorAll('[data-menu-permission]').forEach(el => {
            const menuItem = el.getAttribute('data-menu-permission');
            const hasPermission = this.hasMenuAccess(menuItem);
            this.toggleElement(el, hasPermission);
        });

        // Process data-roles elements
        document.querySelectorAll('[data-required-roles]').forEach(el => {
            const roles = el.getAttribute('data-required-roles').split(',').map(r => r.trim());
            const hasPermission = this.hasAnyRole(roles);
            this.toggleElement(el, hasPermission);
        });
    }
}

// Create global instance
window.PermissionManager = new PermissionManager();

// Auto-initialize in Frappe desk context
if (typeof frappe !== 'undefined') {
    const initPermissions = () => {
        if (PermissionManager.init) {
            PermissionManager.init().then(() => {
                PermissionManager.processPermissionAttributes();
            }).catch(err => {
                console.error('IMOGI POS: Permission manager initialization failed:', err);
            });
        }
    };

    // Use frappe.after_ajax for Desk context (frappe.ready doesn't exist in v15)
    if (typeof frappe.after_ajax !== 'undefined') {
        frappe.after_ajax(() => {
            initPermissions();
        });
    } else {
        // Fallback: Use standard DOM ready events
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initPermissions);
        } else {
            initPermissions();
        }
    }
}

})(); // End of IIFE wrapper

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PermissionManager;
}
