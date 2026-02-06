/**
 * Custom override for POS Opening Entry
 * Redirects to IMOGI POS instead of native ERPNext POS
 */

frappe.ui.form.on('POS Opening Entry', {
    onload: function(frm) {
        // Override default POS Opening Entry behavior
        if (frm.doc.docstatus === 1 && frm.doc.pos_opening_entry) {
            // If already submitted, check for custom redirect
            check_custom_redirect(frm);
        }
    },
    
    refresh: function(frm) {
        if (frm.doc.docstatus === 1) {
            // Remove "Open POS" button if it exists (native ERPNext button)
            frm.page.clear_primary_action();
            
            // Add custom "Open POS" button
            frm.add_custom_button(__('Open POS'), function() {
                open_imogi_pos(frm);
            }).addClass('btn-primary');
        }
    },
    
    after_save: function(frm) {
        if (frm.doc.docstatus === 1) {
            // Dispatch event for React apps to refresh opening data
            window.dispatchEvent(new CustomEvent('posSessionOpened', {
                detail: {
                    pos_opening_entry: frm.doc.name,
                    pos_profile: frm.doc.pos_profile,
                    user: frm.doc.user
                }
            }))
            
            // After submit, redirect to IMOGI POS
            setTimeout(function() {
                open_imogi_pos(frm);
            }, 1000);
        }
    }
});

function open_imogi_pos(frm) {
    if (!frm.doc.pos_profile) {
        frappe.msgprint({
            title: __('POS Profile Required'),
            message: __('Please select a POS Profile'),
            indicator: 'red'
        });
        return;
    }
    
    // Always route to Module Select - it handles all module routing
    const redirect_url = '/app/imogi-module-select';
    
    frappe.show_alert({
        message: __('Opening Module Select...'),
        indicator: 'green'
    });
    
    // Redirect to Module Select
    setTimeout(function() {
        window.location.href = redirect_url;
    }, 500);
}

function check_custom_redirect(frm) {
    // Check if there's a pending redirect from backend
    frappe.call({
        method: 'frappe.cache.hget',
        args: {
            key: 'pos_opening_redirect_' + frm.doc.name,
            field: 'redirect_url'
        },
        callback: function(r) {
            if (r.message) {
                window.location.href = r.message;
            }
        }
    });
}
