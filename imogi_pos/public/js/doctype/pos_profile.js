/**
 * Custom override for POS Profile
 * Prevent "Open POS" button from redirecting to native ERPNext POS
 */

frappe.ui.form.on('POS Profile', {
    refresh: function(frm) {
        if (frm.doc.name) {
            // Remove native "Open POS" button if exists
            frm.page.clear_primary_action();
            
            // All modes now route to Module Select
            const button_label = __('Open Module Select');
            const redirect_url = '/app/imogi-module-select';
            
            // Add custom button
            frm.add_custom_button(button_label, function() {
                // Always route to Module Select - it will handle POS Opening check
                window.location.href = redirect_url;
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
