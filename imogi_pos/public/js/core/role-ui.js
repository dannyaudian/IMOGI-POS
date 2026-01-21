"""
Role-based UI utilities for client-side rendering.

This module provides JavaScript helpers for showing/hiding UI elements
based on user roles and permissions.

Usage:
    // In any page
    frappe.ready(() => {
        RoleUI.init();
        
        // Show element only for managers
        RoleUI.showIfRoles('#admin-panel', ['Restaurant Manager', 'System Manager']);
        
        // Hide element for guests
        RoleUI.hideIfGuest('.logged-in-only');
        
        // Get current user context
        const context = RoleUI.getUserContext();
        if (context.is_manager) {
            // Show admin features
        }
    });
*/

class RoleUI {
    constructor() {
        this.userContext = null;
        this.initialized = false;
    }

    /**
     * Initialize RoleUI system.
     * Fetches current user context and caches it.
     */
    async init() {
        if (this.initialized) return;

        try {
            this.userContext = await this.fetchUserContext();
            this.initialized = true;
            this.processAutoHide();
        } catch (error) {
            console.error('RoleUI init failed:', error);
        }
    }

    /**
     * Fetch user context from server.
     * @returns {Promise<Object>} User context with roles and permissions
     */
    async fetchUserContext() {
        // Check if already in frappe context
        if (window.frappe && frappe.session) {
            const isGuest = frappe.session.user === 'Guest';
            const roles = isGuest ? [] : frappe.boot.user.roles || [];

            return {
                user: frappe.session.user,
                roles: roles,
                is_guest: isGuest,
                is_admin: roles.includes('System Manager'),
                is_manager: roles.includes('Restaurant Manager') || roles.includes('System Manager'),
                is_cashier: roles.includes('Cashier'),
                is_waiter: roles.includes('Waiter'),
                is_kitchen_staff: roles.includes('Kitchen Staff')
            };
        }

        // Fetch from API if frappe context not available
        const response = await fetch('/api/method/imogi_pos.utils.auth_helpers.get_user_role_context', {
            credentials: 'include'
        });
        const data = await response.json();
        return data.message;
    }

    /**
     * Get cached user context.
     * @returns {Object} User context
     */
    getUserContext() {
        return this.userContext || { is_guest: true, roles: [] };
    }

    /**
     * Check if user has any of the specified roles.
     * @param {Array<string>} roles - Role names to check
     * @returns {boolean}
     */
    hasAnyRole(roles) {
        if (!this.userContext || this.userContext.is_guest) return false;
        return roles.some(role => this.userContext.roles.includes(role));
    }

    /**
     * Check if user is authenticated (not guest).
     * @returns {boolean}
     */
    isAuthenticated() {
        return this.userContext && !this.userContext.is_guest;
    }

    /**
     * Show element only if user has specified roles.
     * @param {string|HTMLElement} element - CSS selector or DOM element
     * @param {Array<string>} roles - Required roles
     */
    showIfRoles(element, roles) {
        const el = typeof element === 'string' ? document.querySelector(element) : element;
        if (!el) return;

        if (this.hasAnyRole(roles)) {
            el.style.display = '';
            el.classList.remove('role-hidden');
        } else {
            el.style.display = 'none';
            el.classList.add('role-hidden');
        }
    }

    /**
     * Hide element if user is guest.
     * @param {string|HTMLElement} element - CSS selector or DOM element
     */
    hideIfGuest(element) {
        const el = typeof element === 'string' ? document.querySelector(element) : element;
        if (!el) return;

        if (this.userContext && this.userContext.is_guest) {
            el.style.display = 'none';
            el.classList.add('guest-hidden');
        } else {
            el.style.display = '';
            el.classList.remove('guest-hidden');
        }
    }

    /**
     * Show element only if user is authenticated.
     * @param {string|HTMLElement} element - CSS selector or DOM element
     */
    showIfAuthenticated(element) {
        const el = typeof element === 'string' ? document.querySelector(element) : element;
        if (!el) return;

        if (this.isAuthenticated()) {
            el.style.display = '';
            el.classList.remove('auth-hidden');
        } else {
            el.style.display = 'none';
            el.classList.add('auth-hidden');
        }
    }

    /**
     * Toggle admin mode visibility.
     * Shows admin controls for managers, hides for others.
     */
    toggleAdminMode() {
        const adminElements = document.querySelectorAll('.admin-only, [data-role="admin"]');
        const isManager = this.userContext && this.userContext.is_manager;

        adminElements.forEach(el => {
            if (isManager) {
                el.style.display = '';
                el.classList.add('admin-mode-active');
            } else {
                el.style.display = 'none';
                el.classList.remove('admin-mode-active');
            }
        });
    }

    /**
     * Process elements with data-roles attribute.
     * Automatically hides/shows based on data-roles value.
     */
    processAutoHide() {
        // Process data-roles elements
        document.querySelectorAll('[data-roles]').forEach(el => {
            const requiredRoles = el.getAttribute('data-roles').split(',').map(r => r.trim());
            this.showIfRoles(el, requiredRoles);
        });

        // Process data-auth elements
        document.querySelectorAll('[data-auth="required"]').forEach(el => {
            this.showIfAuthenticated(el);
        });

        // Process admin-only elements
        this.toggleAdminMode();
    }

    /**
     * Create floating admin toggle button.
     * @returns {HTMLElement} Admin toggle button
     */
    createAdminToggle() {
        if (!this.userContext || !this.userContext.is_manager) {
            return null;
        }

        const button = document.createElement('button');
        button.id = 'admin-mode-toggle';
        button.className = 'btn btn-sm btn-secondary admin-toggle-btn';
        button.innerHTML = '<i class="fa fa-cog"></i> Admin';
        button.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; border-radius: 50px; padding: 10px 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';

        let adminMode = false;
        button.addEventListener('click', () => {
            adminMode = !adminMode;
            document.body.classList.toggle('admin-mode', adminMode);
            button.innerHTML = adminMode 
                ? '<i class="fa fa-eye"></i> View Mode' 
                : '<i class="fa fa-cog"></i> Admin';
            
            // Toggle admin panels
            document.querySelectorAll('.admin-panel').forEach(panel => {
                panel.style.display = adminMode ? '' : 'none';
            });
        });

        document.body.appendChild(button);
        return button;
    }

    /**
     * Redirect user based on role.
     * @param {string} defaultPath - Default path if no role-based route
     */
    async redirectByRole(defaultPath = '/app') {
        if (!this.initialized) {
            await this.init();
        }

        const context = this.getUserContext();

        if (context.is_guest) {
            window.location.href = '/imogi-login';
            return;
        }

        // Role-based routing priority
        if (context.is_manager) {
            window.location.href = defaultPath;
        } else if (context.roles.includes('Kiosk Manager')) {
            window.location.href = '/kiosk';
        } else if (context.is_cashier) {
            window.location.href = '/counter/pos';
        } else if (context.is_waiter) {
            window.location.href = '/restaurant/waiter';
        } else if (context.is_kitchen_staff) {
            window.location.href = '/restaurant/kitchen';
        } else {
            window.location.href = defaultPath;
        }
    }

    /**
     * Check permission and redirect if unauthorized.
     * @param {Array<string>} requiredRoles - Required roles
     * @param {string} redirectTo - URL to redirect to if unauthorized
     */
    async requireRoles(requiredRoles, redirectTo = '/imogi-login') {
        if (!this.initialized) {
            await this.init();
        }

        if (!this.hasAnyRole(requiredRoles)) {
            frappe.msgprint({
                title: __('Access Denied'),
                message: __('You do not have permission to access this page.'),
                indicator: 'red'
            });
            setTimeout(() => {
                window.location.href = redirectTo;
            }, 2000);
        }
    }
}

// Create global instance
window.RoleUI = new RoleUI();

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RoleUI.init());
} else {
    RoleUI.init();
}
