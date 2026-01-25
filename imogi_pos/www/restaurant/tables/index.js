(function() {
    const init = function() {
        if (!CURRENT_BRANCH) {
            frappe.msgprint(__('Please select a branch'));
            return;
        }
        if (DOMAIN !== 'Restaurant') {
            frappe.msgprint(__('Page not available for this domain'));
            return;
        }
        if (imogi_pos.table_display) {
            imogi_pos.table_display.init();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
