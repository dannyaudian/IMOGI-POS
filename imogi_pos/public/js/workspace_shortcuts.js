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
        '/imogi-login'
    ],
    
    init: function() {
        // Override the workspace shortcut click handler
        this.setup_shortcut_handler();
    },
    
    setup_shortcut_handler: function() {
        const self = this;
        
        // Use event delegation to catch all shortcut clicks
        $(document).on('click', '.workspace-shortcut, .shortcut-widget-box', function(e) {
            const $target = $(this);
            const href = $target.attr('href') || $target.data('route') || $target.find('a').attr('href');
            
            if (!href) return;
            
            // Check if this is a www page URL
            const clean_href = href.replace(/^\/app/, '');
            
            if (self.is_www_page(clean_href)) {
                e.preventDefault();
                e.stopPropagation();
                
                // Navigate to www page (without /app prefix)
                window.location.href = clean_href;
                return false;
            }
        });
        
        // Also intercept frappe.set_route for www pages
        const original_set_route = frappe.set_route;
        frappe.set_route = function() {
            const args = Array.from(arguments);
            const route = args.join('/');
            
            // Check if route matches a www page
            if (self.is_www_page('/' + route) || self.is_www_page(route)) {
                const clean_route = route.startsWith('/') ? route : '/' + route;
                window.location.href = clean_route;
                return;
            }
            
            return original_set_route.apply(this, arguments);
        };
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
