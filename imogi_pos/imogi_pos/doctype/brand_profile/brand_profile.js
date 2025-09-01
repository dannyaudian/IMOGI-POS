// Copyright (c) 2023, IMOGI LABS and contributors
// For license information, please see license.txt

frappe.ui.form.on('Brand Profile', {
    refresh: function(frm) {
        // Add a preview button
        frm.add_custom_button(__('Preview'), function() {
            // Create a preview of the brand profile in a dialog
            let d = new frappe.ui.Dialog({
                title: __('Brand Preview'),
                fields: [{
                    fieldtype: 'HTML',
                    fieldname: 'preview',
                    options: `
                        <div style="padding: 20px; background-color: ${frm.doc.header_bg_color || '#ffffff'}; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                            ${frm.doc.logo ? `<img src="${frm.doc.logo}" alt="${frm.doc.brand_name}" style="max-width: 200px; max-height: 80px;">` :
                            `<div style="font-size: 24px; font-weight: bold; color: ${frm.doc.primary_color || '#4c5a67'};">${frm.doc.brand_name}</div>`}
                        </div>

                        ${frm.doc.logo_dark ? `<div style="padding: 20px; background-color: #1a1a1a; border-radius: 8px; margin-bottom: 20px; text-align: center;"><img src="${frm.doc.logo_dark}" alt="${frm.doc.brand_name}" style="max-width: 200px; max-height: 80px;"></div>` : ''}
                        
                        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                            <div style="flex: 1; padding: 15px; border-radius: 4px; background-color: ${frm.doc.primary_color || '#4c5a67'}; color: white; font-weight: bold; text-align: center;">
                                Primary Color
                            </div>
                            <div style="flex: 1; padding: 15px; border-radius: 4px; background-color: ${frm.doc.accent_color || '#2490ef'}; color: white; font-weight: bold; text-align: center;">
                                Accent Color
                            </div>
                        </div>
                        
                        <div style="padding: 15px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 15px;">
                            <div style="font-weight: bold; margin-bottom: 10px; color: ${frm.doc.primary_color || '#4c5a67'};">
                                Button Sample
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <button style="background-color: ${frm.doc.primary_color || '#4c5a67'}; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                                    Primary Button
                                </button>
                                <button style="background-color: ${frm.doc.accent_color || '#2490ef'}; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                                    Accent Button
                                </button>
                            </div>
                        </div>
                    `
                }]
            });
            d.show();
        });
    }
});