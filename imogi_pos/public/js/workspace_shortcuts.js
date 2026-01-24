/**
 * IMOGI POS - Workspace Shortcuts Handler
 * 
 * This script handles workspace shortcuts for www pages in Frappe v15+.
 * Frappe's default behavior adds /app prefix to URL shortcuts, which breaks
 * navigation to www pages. This script intercepts those clicks and redirects
 * to the correct URL.
 */

frappe.provide('imogi_pos');

imogi_pos.workspace_shortcuts = {
    // Map of www page URLs that should NOT have /app prefix
    www_pages: [
        '/restaurant/tables',
        '/restaurant/kitchen', 
        '/restaurant/waiter',
        '/counter/pos',
        '/devices/displays',
        '/customer_display_editor',
        '/table_layout_editor',
        '/opening-balance',
        '/imogi-login',
        '/shared/login',
        '/shared/device-select',
        '/shared/service-select',
        '/restaurant/self-order'
    ],
    
    initialized: false,
    
    init: function() {
        if (this.initialized) return;
        this.initialized = true;
        
        console.log('IMOGI POS: Initializing workspace shortcuts handler');
        
        // Override the workspace shortcut click handler
        this.setup_shortcut_handler();
        this.override_frappe_router();
    },
    
    setup_shortcut_handler: function() {
        const self = this;
        
        // Use event delegation with multiple selectors for Frappe v15
        $(document).on('click', [
            '.shortcut-widget-box',
            '.workspace-shortcut',
            '.shortcut',
            '[data-doctype="Workspace Shortcut"]',
            '.widget-shortcuts .widget-body a',
            '.shortcuts-widget .shortcut-widget-box'
        ].join(', '), function(e) {
            const $target = $(this);
            
            // Try to get the URL from various attributes
            let href = $target.attr('href') 
                || $target.data('route') 
                || $target.data('link-to')
                || $target.find('a').attr('href')
                || $target.closest('[data-link-to]').data('link-to');
            
            if (!href) return;
            
            // Clean up the href
            let clean_href = href.toString().replace(/^\/app/, '');
            
            if (self.is_www_page(clean_href)) {
                console.log('IMOGI POS: Intercepting shortcut click to:', clean_href);
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // Navigate to www page (without /app prefix)
                window.location.href = clean_href;
                return false;
            }
        });
    },
    
    override_frappe_router: function() {
        const self = this;
        
        // Override frappe.set_route to intercept www page routes
        if (frappe.set_route && !frappe.set_route._imogi_patched) {
            const original_set_route = frappe.set_route;
            
            frappe.set_route = function() {
                const args = Array.from(arguments);
                let route = args.join('/');
                
                // Handle array argument
                if (args.length === 1 && Array.isArray(args[0])) {
                    route = args[0].join('/');
                }
                
                // Remove leading /app if present
                route = route.replace(/^\/app\//, '/').replace(/^app\//, '/');
                if (!route.startsWith('/')) {
                    route = '/' + route;
                }
                
                // Check if route matches a www page
                if (self.is_www_page(route)) {
                    console.log('IMOGI POS: Redirecting set_route to www page:', route);
                    window.location.href = route;
                    return Promise.resolve();
                }
                
                return original_set_route.apply(this, arguments);
            };
            
            frappe.set_route._imogi_patched = true;
        }
        
        // Also patch frappe.router.push_state for v15
        if (frappe.router && frappe.router.push_state && !frappe.router.push_state._imogi_patched) {
            const original_push_state = frappe.router.push_state;
            
            frappe.router.push_state = function(route) {
                let clean_route = route.replace(/^\/app/, '');
                if (!clean_route.startsWith('/')) {
                    clean_route = '/' + clean_route;
                }
                
                if (self.is_www_page(clean_route)) {
                    console.log('IMOGI POS: Redirecting push_state to www page:', clean_route);
                    window.location.href = clean_route;
                    return;
                }
                
                return original_push_state.apply(this, arguments);
            };
            
            frappe.router.push_state._imogi_patched = true;
        }
    },
    
    is_www_page: function(url) {
        if (!url) return false;
        
        // Remove query params for matching
        const path = url.split('?')[0];
        
        return this.www_pages.some(function(www_url) {
            return path === www_url || path.startsWith(www_url + '/');
        });
    }
};

// Initialize when DOM is ready
$(document).ready(function() {
    imogi_pos.workspace_shortcuts.init();
});

// Also initialize when Frappe is ready (for SPA navigation)
$(document).on('app_ready', function() {
    imogi_pos.workspace_shortcuts.init();
});

// Re-initialize after page change in case of dynamic content
if (frappe.router) {
    $(document).on('page-change', function() {
        // Re-attach handlers after page change
        imogi_pos.workspace_shortcuts.setup_shortcut_handler();
    });
}

// Initialize when DOM is ready
$(document).ready(function() {
    imogi_pos.workspace_shortcuts.init();
});
