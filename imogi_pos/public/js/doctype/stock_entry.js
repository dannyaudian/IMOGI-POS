// Copyright (c) 2023, IMOGI and contributors
// For license information, please see license.txt

/**
 * Stock Entry Client Script
 * 
 * Auto-calculate Finished Good Quantity based on BOM raw material availability
 * when Stock Entry Type is "Manufacture" and BOM is selected.
 * 
 * This eliminates the need to manually input finished good quantity -
 * it's calculated from available stock of BOM components.
 */

frappe.ui.form.on('Stock Entry', {
    refresh: function(frm) {
        // Add custom button to calculate max producible qty from BOM
        if (frm.doc.stock_entry_type === 'Manufacture' && frm.doc.bom_no && !frm.doc.docstatus) {
            frm.add_custom_button(__('Calculate from Stock'), function() {
                calculate_fg_qty_from_stock(frm);
            }, __('Actions'));
        }
    },

    stock_entry_type: function(frm) {
        // Show hint when Manufacture is selected
        if (frm.doc.stock_entry_type === 'Manufacture') {
            frappe.show_alert({
                message: __('Select a BOM and click "Calculate from Stock" to auto-fill Finished Good Quantity based on available raw materials.'),
                indicator: 'blue'
            }, 5);
        }
    },

    bom_no: function(frm) {
        if (frm.doc.stock_entry_type === 'Manufacture' && frm.doc.bom_no) {
            // Auto-calculate when BOM is selected
            calculate_fg_qty_from_stock(frm);
        }
    },

    fg_completed_qty: function(frm) {
        // Validate that fg_completed_qty doesn't exceed max producible
        if (frm.doc.stock_entry_type === 'Manufacture' && frm.doc.bom_no && frm.doc.fg_completed_qty) {
            validate_fg_qty_against_stock(frm);
        }
    }
});

/**
 * Calculate the maximum finished good quantity that can be produced
 * based on available raw material stock from BOM components.
 */
function calculate_fg_qty_from_stock(frm) {
    if (!frm.doc.bom_no) {
        frappe.msgprint(__('Please select a BOM first.'));
        return;
    }

    frappe.call({
        method: 'imogi_pos.api.billing.get_bom_max_producible_qty',
        args: {
            bom_no: frm.doc.bom_no,
            warehouse: frm.doc.from_warehouse || frm.doc.source_warehouse || null,
            company: frm.doc.company || null
        },
        freeze: true,
        freeze_message: __('Calculating from available stock...'),
        callback: function(r) {
            if (r.message && r.message.success) {
                let max_qty = r.message.max_producible_qty || 0;
                let low_stock = r.message.low_stock_components || [];
                
                if (max_qty > 0) {
                    frm.set_value('fg_completed_qty', max_qty);
                    
                    frappe.show_alert({
                        message: __('Finished Good Quantity set to {0} based on available raw materials.', [max_qty]),
                        indicator: 'green'
                    }, 5);
                    
                    // Show low stock warning if any
                    if (low_stock.length > 0) {
                        show_low_stock_warning(low_stock);
                    }
                } else {
                    frappe.msgprint({
                        title: __('Insufficient Stock'),
                        indicator: 'red',
                        message: __('Cannot produce any finished goods. One or more raw materials have zero or insufficient stock.')
                        + '<br><br>' + format_low_stock_list(r.message.components || [])
                    });
                }
            } else {
                frappe.msgprint({
                    title: __('Error'),
                    indicator: 'red',
                    message: r.message ? r.message.error : __('Failed to calculate producible quantity.')
                });
            }
        }
    });
}

/**
 * Validate that the entered fg_completed_qty doesn't exceed what can be produced.
 */
function validate_fg_qty_against_stock(frm) {
    if (!frm.doc.bom_no || !frm.doc.fg_completed_qty) return;

    frappe.call({
        method: 'imogi_pos.api.billing.get_bom_max_producible_qty',
        args: {
            bom_no: frm.doc.bom_no,
            warehouse: frm.doc.from_warehouse || frm.doc.source_warehouse || null,
            company: frm.doc.company || null
        },
        callback: function(r) {
            if (r.message && r.message.success) {
                let max_qty = r.message.max_producible_qty || 0;
                
                if (frm.doc.fg_completed_qty > max_qty) {
                    frappe.msgprint({
                        title: __('Warning: Exceeds Available Stock'),
                        indicator: 'orange',
                        message: __('Requested quantity ({0}) exceeds maximum producible ({1}) based on available raw materials.', 
                            [frm.doc.fg_completed_qty, max_qty])
                        + '<br><br>' + __('You may proceed, but Stock Entry submission may fail due to insufficient raw materials.')
                    });
                }
            }
        }
    });
}

/**
 * Show warning about low stock components.
 */
function show_low_stock_warning(low_stock) {
    if (!low_stock || low_stock.length === 0) return;
    
    let message = '<strong>' + __('Warning: Low Stock Components') + '</strong><br><br>';
    message += '<table class="table table-bordered table-sm">';
    message += '<thead><tr><th>' + __('Item') + '</th><th>' + __('Available') + '</th><th>' + __('Warehouse') + '</th></tr></thead>';
    message += '<tbody>';
    
    low_stock.forEach(function(item) {
        message += '<tr>';
        message += '<td>' + (item.item_name || item.item_code) + '</td>';
        message += '<td>' + (item.available_qty || item.actual_qty || 0) + ' ' + (item.stock_uom || '') + '</td>';
        message += '<td>' + (item.warehouse || '-') + '</td>';
        message += '</tr>';
    });
    
    message += '</tbody></table>';
    message += '<br>' + __('Consider reordering these items to maintain production capacity.');
    
    frappe.msgprint({
        title: __('Low Stock Alert'),
        indicator: 'orange',
        message: message
    });
}

/**
 * Format component list for display.
 */
function format_low_stock_list(components) {
    if (!components || components.length === 0) return '';
    
    let html = '<table class="table table-bordered table-sm">';
    html += '<thead><tr><th>' + __('Component') + '</th><th>' + __('Required') + '</th><th>' + __('Available') + '</th></tr></thead>';
    html += '<tbody>';
    
    components.forEach(function(c) {
        let available = c.available_qty || 0;
        let required = c.required_per_unit || c.qty || 0;
        let shortage = required > available;
        
        html += '<tr' + (shortage ? ' class="text-danger"' : '') + '>';
        html += '<td>' + (c.item_name || c.item_code) + '</td>';
        html += '<td>' + required + ' ' + (c.stock_uom || '') + '</td>';
        html += '<td>' + available + ' ' + (c.stock_uom || '') + '</td>';
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    return html;
}
