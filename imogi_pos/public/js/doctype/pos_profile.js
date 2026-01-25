/**
 * Custom override for POS Profile
 * Prevent "Open POS" button from redirecting to native ERPNext POS
 */

frappe.ui.form.on('POS Profile', {
    refresh: function(frm) {
        if (frm.doc.name) {
            // Remove native "Open POS" button if exists
            frm.page.clear_primary_action();
            
            // Determine redirect URL and button label based on mode
            const mode = frm.doc.imogi_mode || 'Counter';
            let button_label = __('Open POS');
            let redirect_url = '/counter/pos';
            
            // Route based on operation mode
            if (mode === 'Table') {
                button_label = __('Open Waiter Order');
                redirect_url = '/restaurant/waiter';
            } else if (mode === 'Counter') {
                button_label = __('Open Cashier Console');
                redirect_url = '/counter/pos';
            } else if (mode === 'Kiosk') {
                button_label = __('Open Kiosk');
                redirect_url = '/restaurant/waiter?mode=kiosk';
            } else if (mode === 'Self-Order') {
                button_label = __('Open Self Order');
                redirect_url = '/restaurant/self-order';
            }
            
            // Add custom button
            frm.add_custom_button(button_label, function() {
                // Check if POS Session is required
                const require_session = frm.doc.imogi_require_pos_session;
                
                if (!require_session) {
                    // Session not required, go directly to POS
                    window.location.href = redirect_url;
                    return;
                }
                
                // Check if there's an active POS Opening Entry first
                frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'POS Opening Entry',
                        filters: {
                            pos_profile: frm.doc.name,
                            user: frappe.session.user,
                            docstatus: 1,
                            status: 'Open'
                        },
                        limit: 1
                    },
                    callback: function(r) {
                        if (r.message && r.message.length > 0) {
                            // Has active session, go to POS
                            window.location.href = redirect_url;
                        } else {
                            // No active session, prompt to create one
                            frappe.msgprint({
                                title: __('No Active Session'),
                                message: __('Please open a POS Opening Entry first before accessing the POS.'),
                                indicator: 'orange',
                                primary_action: {
                                    label: __('Create Opening Entry'),
                                    action: function() {
                                        frappe.new_doc('POS Opening Entry', {
                                            pos_profile: frm.doc.name
                                        });
                                    }
                                }
                            });
                        }
                    },
                    error: function() {
                        // Error or session feature not available, just proceed
                        window.location.href = redirect_url;
                    }
                });
            }, __('POS')).addClass('btn-primary');
        }
    },
    
    before_save: function(frm) {
        // Validate Session Scope field
        if (frm.doc.imogi_require_pos_session && frm.doc.imogi_pos_session_scope) {
            const valid_values = ['User', 'Device', 'POS Profile'];
            if (!valid_values.includes(frm.doc.imogi_pos_session_scope)) {
                frappe.validated = false;
                frappe.msgprint({
                    title: __('Invalid Session Scope'),
                    message: __('Session Scope must be one of: User, Device, or POS Profile'),
                    indicator: 'red'
                });
                // Reset to default value
                frm.set_value('imogi_pos_session_scope', 'User');
            }
        }
        
        // Set default if session is required but scope is not set
        if (frm.doc.imogi_require_pos_session && !frm.doc.imogi_pos_session_scope) {
            frm.set_value('imogi_pos_session_scope', 'User');
        }
    },
    
    imogi_require_pos_session: function(frm) {
        // Set default session scope when enabling session requirement
        if (frm.doc.imogi_require_pos_session && !frm.doc.imogi_pos_session_scope) {
            frm.set_value('imogi_pos_session_scope', 'User');
        }
    }
});
