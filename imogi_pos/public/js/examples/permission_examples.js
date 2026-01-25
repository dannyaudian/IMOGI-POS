/**
 * Example Client Scripts for Permission-Based UI Control
 * 
 * These examples show how to use PermissionManager in form scripts
 * to control field, button, and section visibility based on user roles.
 */

// ============================================================================
// Example 1: POS Order Form
// ============================================================================

frappe.ui.form.on('POS Order', {
    async onload(frm) {
        // Initialize permission manager
        await PermissionManager.init();
        
        // Apply field restrictions
        PermissionManager.applyFieldRestrictions(frm);
        
        // Custom button visibility based on permissions
        if (PermissionManager.hasButtonPermission('POS Order', 'cancel_order')) {
            frm.add_custom_button(__('Cancel Order'), () => {
                // Cancel order logic
            }, __('Actions'));
        }
        
        if (PermissionManager.hasButtonPermission('POS Order', 'split_order')) {
            frm.add_custom_button(__('Split Order'), () => {
                // Split order logic
            }, __('Actions'));
        }
        
        // Hide discount section if user can't modify discounts
        if (!PermissionManager.hasFieldPermission('POS Order', 'discount_amount', 'write')) {
            frm.set_df_property('discount_section', 'hidden', 1);
        }
    },
    
    refresh(frm) {
        // Remove standard buttons based on permissions
        if (!PermissionManager.hasButtonPermission('POS Order', 'refund_order')) {
            frm.page.remove_inner_button(__('Create Return'), __('Create'));
        }
        
        // Conditionally show workflow buttons
        if (frm.doc.workflow_state === 'Draft' && 
            !PermissionManager.hasDocTypePermission('POS Order', 'write')) {
            frm.disable_save();
        }
    }
});


// ============================================================================
// Example 2: Sales Invoice Form
// ============================================================================

frappe.ui.form.on('Sales Invoice', {
    async onload(frm) {
        await PermissionManager.init();
        
        // Apply all form restrictions
        PermissionManager.applyFormRestrictions(frm);
        
        // Hide payment section if user doesn't have payment entry permission
        if (!PermissionManager.hasButtonPermission('Sales Invoice', 'payment_entry')) {
            frm.set_df_property('payment_schedule_section', 'hidden', 1);
        }
    },
    
    refresh(frm) {
        // Restrict discount modification to Branch Manager and above
        if (!PermissionManager.hasFieldPermission('Sales Invoice', 'additional_discount_percentage', 'write')) {
            frm.set_df_property('additional_discount_percentage', 'read_only', 1);
            frm.set_df_property('discount_amount', 'read_only', 1);
        }
        
        // Hide cancel button if user doesn't have permission
        if (!PermissionManager.hasButtonPermission('Sales Invoice', 'cancel')) {
            frm.page.clear_primary_action();
        }
    }
});


// ============================================================================
// Example 3: KOT Ticket Form
// ============================================================================

frappe.ui.form.on('KOT Ticket', {
    async onload(frm) {
        await PermissionManager.init();
        
        // Kitchen Staff can only update item status, not ticket details
        if (PermissionManager.hasAnyRole(['Kitchen Staff']) && 
            !PermissionManager.hasAnyRole(['System Manager', 'Area Manager', 'Branch Manager'])) {
            
            // Make most fields read-only for Kitchen Staff
            frm.set_df_property('kitchen', 'read_only', 1);
            frm.set_df_property('station', 'read_only', 1);
            frm.set_df_property('pos_order', 'read_only', 1);
        }
    },
    
    refresh(frm) {
        // Clear page buttons
        frm.page.clear_inner_toolbar();
        
        // Add status change buttons based on permissions
        if (PermissionManager.hasButtonPermission('KOT Ticket', 'mark_ready')) {
            frm.add_custom_button(__('Mark Ready'), () => {
                frappe.call({
                    method: 'imogi_pos.api.kot.mark_kot_ticket_ready',
                    args: { kot_ticket: frm.doc.name },
                    callback: (r) => {
                        frm.reload_doc();
                    }
                });
            });
        }
        
        if (PermissionManager.hasButtonPermission('KOT Ticket', 'mark_served')) {
            frm.add_custom_button(__('Mark Served'), () => {
                frappe.call({
                    method: 'imogi_pos.api.kot.mark_kot_ticket_served',
                    args: { kot_ticket: frm.doc.name },
                    callback: (r) => {
                        frm.reload_doc();
                    }
                });
            });
        }
        
        // Only Branch Manager and above can cancel
        if (PermissionManager.hasButtonPermission('KOT Ticket', 'cancel_kot')) {
            frm.add_custom_button(__('Cancel'), () => {
                frappe.confirm(
                    __('Are you sure you want to cancel this KOT?'),
                    () => {
                        frappe.call({
                            method: 'imogi_pos.api.kot.cancel_kot_ticket',
                            args: { kot_ticket: frm.doc.name },
                            callback: (r) => {
                                frm.reload_doc();
                            }
                        });
                    }
                );
            }, __('Actions'));
        }
    }
});


// ============================================================================
// Example 4: Restaurant Table Form
// ============================================================================

frappe.ui.form.on('Restaurant Table', {
    async refresh(frm) {
        await PermissionManager.init();
        
        // Only Branch Manager and Waiter can change table status
        if (!PermissionManager.hasAnyRole(['Branch Manager', 'Area Manager', 'Waiter', 'System Manager'])) {
            frm.disable_save();
            frappe.msgprint(__('You do not have permission to modify tables'));
            return;
        }
        
        // Add custom buttons based on permissions
        if (frm.doc.status === 'Available' && 
            PermissionManager.hasButtonPermission('Restaurant Table', 'reserve_table')) {
            
            frm.add_custom_button(__('Reserve'), () => {
                // Reserve table logic
            });
        }
        
        if (frm.doc.status === 'Occupied' && 
            PermissionManager.hasButtonPermission('Restaurant Table', 'clear_table')) {
            
            frm.add_custom_button(__('Clear Table'), () => {
                // Clear table logic
            });
        }
    }
});


// ============================================================================
// Example 5: Global Page Script with Permission Attributes
// ============================================================================

frappe.ready(async () => {
    // Initialize permission manager
    await PermissionManager.init();
    
    // Process all permission attributes in the page
    PermissionManager.processPermissionAttributes();
    
    // Example: Show/hide sections dynamically
    const $adminSection = $('.admin-only-section');
    if (!PermissionManager.hasAnyRole(['System Manager', 'Area Manager', 'Branch Manager'])) {
        $adminSection.hide();
    }
    
    // Example: Disable buttons without permission
    $('[data-action="delete-all"]').each(function() {
        if (!PermissionManager.hasDocTypePermission('POS Order', 'delete')) {
            $(this).prop('disabled', true).addClass('btn-disabled');
        }
    });
});


// ============================================================================
// Example 6: List View Customization
// ============================================================================

frappe.listview_settings['POS Order'] = {
    onload(listview) {
        PermissionManager.init().then(() => {
            // Hide bulk actions if user doesn't have delete permission
            if (!PermissionManager.hasDocTypePermission('POS Order', 'delete')) {
                listview.page.clear_actions_menu();
            }
            
            // Add custom bulk action only for managers
            if (PermissionManager.hasAnyRole(['Branch Manager', 'Area Manager', 'System Manager'])) {
                listview.page.add_actions_menu_item(__('Bulk Cancel'), () => {
                    // Bulk cancel logic
                }, false);
            }
        });
    },
    
    get_indicator(doc) {
        // Color coding based on workflow state
        const status_colors = {
            'Draft': 'gray',
            'Ready': 'orange',
            'Served': 'green',
            'Closed': 'blue',
            'Cancelled': 'red'
        };
        return [__(doc.workflow_state), status_colors[doc.workflow_state], 'workflow_state,=,' + doc.workflow_state];
    }
};


// ============================================================================
// Example 7: Report Customization
// ============================================================================

// In report JS file
frappe.query_reports["POS Sales Report"] = {
    onload(report) {
        PermissionManager.init().then(() => {
            // Only show financial columns to authorized roles
            if (!PermissionManager.hasAnyRole(['System Manager', 'Area Manager', 'Branch Manager', 'Finance Controller', 'Accounts User'])) {
                // Hide profit margin column
                report.page.fields_dict['show_profit_margin'].toggle(false);
            }
        });
    }
};


// ============================================================================
// Example 8: Custom Page with Permission Checks
// ============================================================================

// In custom page's JS file
frappe.pages['kitchen-display'].on_page_load = async function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('Kitchen Display'),
        single_column: true
    });
    
    // Initialize permissions
    await PermissionManager.init();
    
    // Check if user has access to kitchen display
    if (!PermissionManager.hasMenuAccess('Kitchen Display')) {
        frappe.msgprint({
            title: __('Access Denied'),
            message: __('You do not have permission to access Kitchen Display'),
            indicator: 'red'
        });
        frappe.set_route('');
        return;
    }
    
    // Render page content
    renderKitchenDisplay(page);
};
