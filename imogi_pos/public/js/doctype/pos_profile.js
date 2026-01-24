/**
 * Custom override for POS Profile
 * Prevent "Open POS" button from redirecting to native ERPNext POS
 */

frappe.ui.form.on('POS Profile', {
    refresh: function(frm) {
        if (frm.doc.name) {
            // Remove native "Open POS" button if exists
            frm.page.clear_primary_action();
            
            // Add custom button based on domain
            const domain = frm.doc.imogi_pos_domain;
            let button_label = __('Open POS');
            let redirect_url = '/counter/pos';
            
            if (domain === 'Restaurant') {
                button_label = __('Open Restaurant POS');
                redirect_url = '/restaurant/waiter';
            } else if (domain === 'Counter') {
                button_label = __('Open Counter POS');
                redirect_url = '/counter/pos';
            }
            
            // Add custom button
            frm.add_custom_button(button_label, function() {
                // Check if there's an active session first
                frappe.call({
                    method: 'imogi_pos.api.billing.get_active_pos_session',
                    callback: function(r) {
                        if (r.message) {
                            // Has active session, go to POS
                            window.location.href = redirect_url;
                        } else {
                            // No active session, prompt to create one
                            frappe.msgprint({
                                title: __('No Active Session'),
                                message: __('Please open a POS Session first via POS Opening Entry'),
                                indicator: 'orange',
                                primary_action: {
                                    label: __('Create Session'),
                                    action: function() {
                                        frappe.new_doc('POS Opening Entry', {
                                            pos_profile: frm.doc.name
                                        });
                                    }
                                }
                            });
                        }
                    }
                });
            }, __('POS')).addClass('btn-primary');
        }
    }
});
