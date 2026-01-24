/**
 * Custom override for POS Closing Entry
 * Redirects back to IMOGI POS after closing session
 */

frappe.ui.form.on('POS Closing Entry', {
    refresh: function(frm) {
        if (frm.doc.docstatus === 1) {
            // Remove default "Open POS" button if exists
            frm.page.clear_primary_action();
            
            // Add custom button to go back to POS
            frm.add_custom_button(__('Back to POS'), function() {
                // Get POS Profile to determine redirect
                if (frm.doc.pos_profile) {
                    frappe.call({
                        method: 'frappe.client.get_value',
                        args: {
                            doctype: 'POS Profile',
                            filters: { name: frm.doc.pos_profile },
                            fieldname: ['imogi_mode']
                        },
                        callback: function(r) {
                            let redirect_url = '/counter/pos'; // Default
                            
                            if (r.message) {
                                const mode = r.message.imogi_mode || 'Counter';
                                
                                // Route based on operation mode
                                if (mode === 'Table') {
                                    redirect_url = '/restaurant/waiter';
                                } else if (mode === 'Counter') {
                                    redirect_url = '/counter/pos';
                                } else if (mode === 'Kiosk') {
                                    redirect_url = '/restaurant/waiter?mode=kiosk';
                                } else if (mode === 'Self-Order') {
                                    redirect_url = '/restaurant/self-order';
                                }
                            }
                            
                            window.location.href = redirect_url;
                        }
                    });
                } else {
                    window.location.href = '/counter/pos';
                }
            }).addClass('btn-primary');
        }
    },
    
    after_save: function(frm) {
        if (frm.doc.docstatus === 1) {
            // Show success message
            frappe.show_alert({
                message: __('Session closed successfully'),
                indicator: 'green'
            }, 5);
            
            // Redirect after 2 seconds
            setTimeout(function() {
                // Go back to POS
                if (frm.doc.pos_profile) {
                    frappe.call({
                        method: 'frappe.client.get_value',
                        args: {
                            doctype: 'POS Profile',
                            filters: { name: frm.doc.pos_profile },
                            fieldname: ['imogi_mode']
                        },
                        callback: function(r) {
                            let redirect_url = '/counter/pos';
                            
                            if (r.message) {
                                const mode = r.message.imogi_mode || 'Counter';
                                if (mode === 'Table') {
                                    redirect_url = '/restaurant/waiter';
                                } else if (mode === 'Counter') {
                                    redirect_url = '/counter/pos';
                                } else if (mode === 'Kiosk') {
                                    redirect_url = '/restaurant/waiter?mode=kiosk';
                                } else if (mode === 'Self-Order') {
                                    redirect_url = '/restaurant/self-order';
                                }
                            }
                            
                            window.location.href = redirect_url;
                        }
                    });
                }
            }, 2000);
        }
    }
});
