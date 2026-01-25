/**
 * IMOGI POS - Workspace Shortcuts Handler
 * 
 * This script handles workspace shortcuts for www pages in Frappe v15+.
 * Frappe's default behavior adds /app prefix to URL shortcuts, which breaks
 * navigation to www pages. This script intercepts those clicks and redirects
 * to the correct URL.
 * 
 * Uses capture phase to intercept clicks BEFORE Frappe's router processes them.
 * 
 * @version 2.0 - Added capture phase handler
 */

frappe.provide('imogi_pos');

imogi_pos.workspace_shortcuts = {
    // Map of www page URLs that should NOT have /app prefix
    www_pages: [
        '/restaurant/tables',
        '/restaurant/kitchen', 
        '/restaurant/waiter',
        '/restaurant/self-order',
        '/counter/pos',
        '/devices/displays',
        '/customer_display_editor',
        '/table_layout_editor',
        '/imogi-login',
        '/shared/login',
        '/shared/module-select'
    ],
    
    // Map shortcut labels to URLs for quick reference
    shortcut_urls: {
        'Open POS': '/shared/module-select',
        'Cashier Console': '/counter/pos',
        'Kitchen Display': '/restaurant/kitchen',
        'Table Display': '/restaurant/tables',
        'Customer Display': '/devices/displays',
        'Customer Display Editor': '/customer_display_editor',
        'Table Layout Editor': '/table_layout_editor',
        'Waiter Order': '/restaurant/waiter',
        'Kiosk': '/restaurant/waiter?mode=kiosk'
    },
    
    initialized: false,
    
    init: function() {
        if (this.initialized) return;
        this.initialized = true;
        
        console.log('IMOGI POS: Initializing workspace shortcuts handler');
        
        // Use capture phase to intercept clicks BEFORE Frappe processes them
        this.setup_capture_phase_handler();
        // Also setup override for frappe.set_route as fallback
        this.override_frappe_router();
        // Intercept getpage errors
        this.intercept_getpage_errors();
    },
    
    setup_capture_phase_handler: function() {
        const self = this;
        
        // Capture phase handler - intercepts BEFORE bubbling phase
        const captureHandler = function(e) {
            // Find the shortcut widget box if we clicked on child element
            let target = e.target;
            let shortcutBox = null;
            
            // Traverse up to find shortcut-widget-box
            while (target && target.parentElement) {
                if (target.classList && target.classList.contains('shortcut-widget-box')) {
                    shortcutBox = target;
                    break;
                }
                target = target.parentElement;
            }
            
            if (!shortcutBox) return;
            
            // Get the shortcut text and link-to attribute
            const shortcutText = (shortcutBox.innerText || shortcutBox.textContent || '').trim();
            let linkTo = shortcutBox.getAttribute('data-link-to') || 
                        shortcutBox.querySelector('[data-link-to]')?.getAttribute('data-link-to');
            
            console.debug('IMOGI POS: Shortcut clicked:', {
                text: shortcutText,
                linkTo: linkTo,
                element: shortcutBox
            });
            
            // Check if we have a direct link-to attribute
            if (linkTo && self.is_www_page(linkTo)) {
                console.log('IMOGI POS: Intercepting shortcut click (link-to) to:', linkTo);
                
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                window.location.href = linkTo;
                return false;
            }
            
            // Check if the shortcut text maps to a known URL
            const shortcutUrl = self.shortcut_urls[shortcutText];
            
            if (shortcutUrl || self.is_www_page_text(shortcutText)) {
                const urlToNavigate = shortcutUrl || self.extract_url_from_text(shortcutText);
                
                if (urlToNavigate) {
                    console.log('IMOGI POS: Intercepting shortcut click (text mapping) to:', {
                        text: shortcutText,
                        url: urlToNavigate
                    });
                    
                    // Prevent Frappe's router from handling this
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    // Navigate directly to www page
                    window.location.href = urlToNavigate;
                    return false;
                }
            }
        };
        
        // Attach at CAPTURE phase (third parameter = true)
        document.addEventListener('click', captureHandler, true);
        console.log('IMOGI POS: Capture phase handler attached');
    },
    
    is_www_page_text: function(text) {
        // Check if shortcut text maps to a www page
        return Object.keys(this.shortcut_urls).some(key => key.trim() === text);
    },
    
    extract_url_from_text: function(text) {
        // Fallback: try to find URL from shortcut_urls mapping
        return this.shortcut_urls[text.trim()] || null;
    },
    
    setup_shortcut_handler: function() {
        const self = this;
        
        // Fallback: Use event delegation with multiple selectors for Frappe v15
        $(document).on('click', [
            '.shortcut-widget-box',
            '.workspace-shortcut',
            '.shortcut',
            '[data-doctype="Workspace Shortcut"]',
            '.widget-shortcuts .widget-body a',
            '.shortcuts-widget .shortcut-widget-box'
        ].join(', '), function(e) {
            const $target = $(this);
            
            // Try to get the URL from various attributes and locations
            let href = $target.attr('href') 
                || $target.data('route') 
                || $target.data('link-to')
                || $target.data('label')
                || $target.find('a').attr('href')
                || $target.closest('[data-link-to]').data('link-to')
                || $target.closest('[data-route]').data('route')
                || $target.attr('data-route')
                || $target.attr('data-link-to');
            
            // Also check for onclick handler data
            if (!href && $target.closest('.shortcut-widget-box').length) {
                const $shortcut = $target.closest('.shortcut-widget-box');
                href = $shortcut.find('a').attr('href');
            }
            
            if (!href) {
                // Log unhandled shortcut for debugging
                console.debug('IMOGI POS: No href found for shortcut element:', $target);
                return;
            }
            
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
                
                // Handle null/undefined/empty routes - redirect to /app
                if (!args || args.length === 0 || !args[0] || args[0] === '' || args[0] === 'null' || args[0] === 'undefined') {
                    console.warn('IMOGI POS: Invalid route detected, redirecting to /app:', args);
                    window.location.href = '/app';
                    return Promise.resolve();
                }
                
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
                
                console.debug('IMOGI POS: set_route called with:', { original: args, processed: route });
                
                // Check if route matches a www page
                if (self.is_www_page(route)) {
                    console.log('IMOGI POS: Redirecting set_route to www page:', route);
                    window.location.href = route;
                    return Promise.resolve();
                }
                
                // Prevent routing to non-existent pages
                try {
                    return original_set_route.apply(this, arguments);
                } catch (e) {
                    console.error('IMOGI POS: Route error, redirecting to /app:', e);
                    window.location.href = '/app';
                    return Promise.resolve();
                }
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
                
                console.debug('IMOGI POS: push_state called with:', { original: route, processed: clean_route });
                
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
    
    intercept_getpage_errors: function() {
        // Override frappe.call to intercept getpage 404 errors
        if (window.frappe && frappe.call && !frappe.call._imogi_error_handler) {
            const original_call = frappe.call;
            
            frappe.call = function(opts) {
                const original_error = opts.error;
                
                opts.error = function(r) {
                    // Check if this is a getpage 404 error
                    if (opts.method === 'frappe.desk.desk_page.getpage' && r && r.status === 404) {
                        console.log('IMOGI POS: Intercepted getpage 404 error, redirecting to /app');
                        // Redirect to desk instead of showing error
                        window.location.href = '/app';
                        return;
                    }
                    
                    // Call original error handler if exists
                    if (original_error) {
                        return original_error(r);
                    }
                };
                
                return original_call.call(this, opts);
            };
            
            frappe.call._imogi_error_handler = true;
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
