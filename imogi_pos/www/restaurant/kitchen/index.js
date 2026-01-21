frappe.ready(function() {
    if (imogi_pos.kitchen_display) {
        if (!CURRENT_BRANCH) {
            frappe.show_alert({
                message: __('No branch selected. The Kitchen Display will determine the appropriate branch automatically.'),
                indicator: 'orange',
            });
        }

        if (DOMAIN !== 'Restaurant') {
            frappe.show_alert({
                message: __('Page not available for this domain'),
                indicator: 'red',
            });
        }

        imogi_pos.kitchen_display.init();
    }
});
