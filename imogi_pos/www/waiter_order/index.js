frappe.ready(function() {
    if (!CURRENT_BRANCH) {
        frappe.msgprint(__('Please select a branch'));
        return;
    }
    if (DOMAIN !== 'Restaurant') {
        frappe.msgprint(__('Page not available for this domain'));
        return;
    }
    if (imogi_pos.waiter_order) {
        imogi_pos.waiter_order.init();
    }
});
