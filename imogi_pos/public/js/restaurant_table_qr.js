    frappe.ui.form.on('Restaurant Table', {
        refresh: function(frm) {
            if (frm.doc.qr_slug) {
                // Generate and display QR code
                const qrContainer = document.getElementById('qr-code-container');
                qrContainer.innerHTML = '';
                
                // Create a button to refresh QR code
                const refreshBtn = document.createElement('button');
                refreshBtn.className = 'btn btn-sm btn-default';
                refreshBtn.innerHTML = 'Refresh QR Code';
                refreshBtn.onclick = function() {
                    frappe.call({
                        method: 'imogi_pos.utils.qr.refresh_table_qr_token',
                        args: {
                            table_name: frm.doc.name
                        },
                        callback: function(r) {
                            if (r.message) {
                                frm.reload_doc();
                            }
                        }
                    });
                };
                qrContainer.appendChild(refreshBtn);
                
                // Add a print button
                const printBtn = document.createElement('button');
                printBtn.className = 'btn btn-sm btn-primary ml-2';
                printBtn.innerHTML = 'Print QR Sheet';
                printBtn.onclick = function() {
                    frappe.model.with_doc('POS Profile', function() {
                        var profiles = frappe.get_list('POS Profile', {filters: {imogi_pos_domain: 'Restaurant'}});
                        if (profiles && profiles.length > 0) {
                            var pos_profile = profiles[0].name;
                            var format = frappe.get_value('POS Profile', pos_profile, 'imogi_self_order_qr_sheet_format');
                            
                            if (format) {
                                frappe.set_route('print', 'Restaurant Table', frm.doc.name, format);
                            } else {
                                frappe.msgprint('No QR Sheet print format defined in POS Profile');
                            }
                        } else {
                            frappe.msgprint('No Restaurant POS Profile found');
                        }
                    });
                };
                qrContainer.appendChild(printBtn);
                
                // Add spacing
                qrContainer.appendChild(document.createElement('hr'));
                
                // Display QR code
                const qrImg = document.createElement('div');
                qrImg.id = 'qr-code';
                qrContainer.appendChild(qrImg);
                
                const qrUrl = window.location.origin + '/so/' + frm.doc.qr_slug;
                const qrText = document.createElement('p');
                qrText.className = 'text-muted small';
                qrText.innerHTML = 'URL: ' + qrUrl;
                qrContainer.appendChild(qrText);
                
                // Generate QR code using a library (using a placeholder here)
                // In actual implementation, you would use a QR code library
                qrImg.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(qrUrl) + '" alt="QR Code" />';
            } else {
                // Show a message to generate QR
                const qrContainer = document.getElementById('qr-code-container');
                qrContainer.innerHTML = '<p>No QR slug assigned. Generate one using the button below.</p>';
                
                const genBtn = document.createElement('button');
                genBtn.className = 'btn btn-sm btn-primary';
                genBtn.innerHTML = 'Generate QR Code';
                genBtn.onclick = function() {
                    frappe.call({
                        method: 'imogi_pos.utils.qr.refresh_table_qr_token',
                        args: {
                            table_name: frm.doc.name
                        },
                        callback: function(r) {
                            if (r.message) {
                                frm.reload_doc();
                            }
                        }
                    });
                };
                qrContainer.appendChild(genBtn);
            }
        }
    });

