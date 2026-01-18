/**
 * IMOGI POS - ESC/POS Direct Print Integration
 * Client-side printing untuk Network, USB, dan Bluetooth thermal printers
 * 
 * Dependencies: Print Bridge Service (print_bridge.py) harus running di kasir PC
 */

frappe.provide('imogi_pos.printing');

imogi_pos.printing = {
    // Default configuration
    config: {
        bridge_url: 'http://localhost:5555',
        printer_type: 'network',  // 'network', 'usb', 'bluetooth'
        printer_ip: '192.168.1.100',
        printer_port: 9100,
        printer_width: 32,  // Character width (32 or 48)
        device_path: '/dev/usb/lp0',  // For USB
        bluetooth_address: '',  // For Bluetooth
        bluetooth_name: '',
        auto_print: false,
        auto_cut: true
    },

    /**
     * Initialize printer configuration from POS Profile
     */
    init: function(pos_profile) {
        const me = this;
        
        if (pos_profile) {
            // Load printer config from POS Profile
            frappe.call({
                method: 'imogi_pos.api.printing.get_printer_config',
                args: { 
                    pos_profile: pos_profile,
                    job_type: 'receipt'
                },
                callback: function(r) {
                    if (r.message && Object.keys(r.message).length > 0) {
                        // Map server config to client config
                        const server_config = r.message;
                        const client_config = {
                            printer_type: server_config.printer_type || 'network',
                            printer_width: server_config.printer_width || 32,
                            printer_ip: server_config.printer_ip || '',
                            printer_port: server_config.printer_port || 9100,
                            device_path: server_config.device_path || '/dev/usb/lp0',
                            bluetooth_name: server_config.bluetooth_name || '',
                            bluetooth_profile: server_config.bluetooth_profile || 'ESC/POS',
                            bridge_url: server_config.bridge_url || 'http://localhost:5555'
                        };
                        
                        me.update_config(client_config);
                        
                        frappe.show_alert({
                            message: __('Printer configured from POS Profile'),
                            indicator: 'green'
                        });
                    }
                }
            });
        } else {
            // Load from localStorage if no POS Profile
            me.load_config();
        }
        
        // Check if bridge is running
        this.check_bridge_status();
    },

    /**
     * Update printer configuration
     */
    update_config: function(new_config) {
        Object.assign(this.config, new_config);
        
        // Save to localStorage for persistence
        localStorage.setItem('imogi_printer_config', JSON.stringify(this.config));
        
        console.log('Printer config updated:', this.config);
    },

    /**
     * Load config from localStorage
     */
    load_config: function() {
        const saved_config = localStorage.getItem('imogi_printer_config');
        if (saved_config) {
            try {
                Object.assign(this.config, JSON.parse(saved_config));
            } catch(e) {
                console.error('Error loading printer config:', e);
            }
        }
    },

    /**
     * Check if Print Bridge is running
     */
    check_bridge_status: function(show_alert = false) {
        const me = this;
        
        return fetch(`${this.config.bridge_url}/health`)
            .then(response => response.json())
            .then(data => {
                if (data.status === 'ok') {
                    if (show_alert) {
                        frappe.show_alert({
                            message: __('Print Bridge Connected'),
                            indicator: 'green'
                        });
                    }
                    return true;
                }
                return false;
            })
            .catch(error => {
                if (show_alert) {
                    frappe.msgprint({
                        title: __('Print Bridge Not Running'),
                        message: __('Please start Print Bridge service on this PC.<br>Run: <code>python print_bridge.py</code>'),
                        indicator: 'red'
                    });
                }
                console.error('Print Bridge not available:', error);
                return false;
            });
    },

    /**
     * Print POS Invoice receipt
     */
    print_receipt: function(invoice_name, callback) {
        const me = this;
        
        frappe.show_alert({
            message: __('Generating receipt...'),
            indicator: 'blue'
        });
        
        // Generate ESC/POS commands on server
        frappe.call({
            method: 'imogi_pos.api.printing.generate_receipt_escpos',
            args: {
                invoice_name: invoice_name,
                printer_width: me.config.printer_width
            },
            callback: function(r) {
                if (r.message && r.message.success) {
                    // Send to printer via bridge
                    me.send_to_printer(r.message.data, callback);
                } else {
                    frappe.msgprint({
                        title: __('Print Error'),
                        message: r.message.error || __('Failed to generate receipt'),
                        indicator: 'red'
                    });
                    if (callback) callback(false);
                }
            },
            error: function(err) {
                frappe.msgprint({
                    title: __('Print Error'),
                    message: err.message || __('Failed to generate receipt'),
                    indicator: 'red'
                });
                if (callback) callback(false);
            }
        });
    },

    /**
     * Print Kitchen Order Ticket (KOT)
     */
    print_kot: function(order_name, callback) {
        const me = this;
        
        frappe.show_alert({
            message: __('Generating KOT...'),
            indicator: 'blue'
        });
        
        // Generate KOT ESC/POS commands on server
        frappe.call({
            method: 'imogi_pos.api.printing.generate_kot_escpos',
            args: {
                order_name: order_name,
                printer_width: me.config.printer_width
            },
            callback: function(r) {
                if (r.message && r.message.success) {
                    // Send to kitchen printer
                    me.send_to_printer(r.message.data, callback);
                } else {
                    frappe.msgprint({
                        title: __('Print Error'),
                        message: r.message.error || __('Failed to generate KOT'),
                        indicator: 'red'
                    });
                    if (callback) callback(false);
                }
            }
        });
    },

    /**
     * Send data to printer via bridge
     */
    send_to_printer: function(base64_data, callback) {
        const me = this;
        const config = this.config;
        
        let endpoint = '';
        let request_data = {
            data: base64_data
        };
        
        // Determine endpoint and add printer-specific config
        switch (config.printer_type) {
            case 'network':
                endpoint = '/print/network';
                request_data.printer_ip = config.printer_ip;
                request_data.printer_port = config.printer_port;
                break;
            
            case 'usb':
                endpoint = '/print/usb';
                request_data.device_path = config.device_path;
                break;
            
            case 'bluetooth':
                endpoint = '/print/bluetooth';
                request_data.device_address = config.bluetooth_address;
                request_data.device_name = config.bluetooth_name;
                break;
            
            default:
                frappe.msgprint(__('Invalid printer type'));
                if (callback) callback(false);
                return;
        }
        
        // Send to Print Bridge
        fetch(`${config.bridge_url}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request_data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                frappe.show_alert({
                    message: __('Print Successful'),
                    indicator: 'green'
                });
                if (callback) callback(true);
            } else {
                frappe.msgprint({
                    title: __('Print Error'),
                    message: data.error || __('Failed to print'),
                    indicator: 'red'
                });
                if (callback) callback(false);
            }
        })
        .catch(error => {
            console.error('Print error:', error);
            frappe.msgprint({
                title: __('Print Bridge Error'),
                message: __('Cannot connect to Print Bridge. Make sure the service is running.'),
                indicator: 'red'
            });
            if (callback) callback(false);
        });
    },

    /**
     * Test printer
     */
    test_printer: function() {
        const me = this;
        
        frappe.show_alert({
            message: __('Sending test print...'),
            indicator: 'blue'
        });
        
        // Generate test receipt
        frappe.call({
            method: 'imogi_pos.api.printing.test_printer_escpos',
            args: {
                printer_width: me.config.printer_width
            },
            callback: function(r) {
                if (r.message && r.message.success) {
                    me.send_to_printer(r.message.data, function(success) {
                        if (success) {
                            frappe.msgprint({
                                title: __('Test Successful'),
                                message: __('Printer is working correctly!'),
                                indicator: 'green'
                            });
                        }
                    });
                } else {
                    frappe.msgprint({
                        title: __('Test Failed'),
                        message: r.message.error || __('Failed to generate test print'),
                        indicator: 'red'
                    });
                }
            }
        });
    },

    /**
     * Discover Bluetooth devices
     */
    discover_bluetooth: function(callback) {
        const me = this;
        
        frappe.show_alert({
            message: __('Discovering Bluetooth devices...'),
            indicator: 'blue'
        });
        
        fetch(`${this.config.bridge_url}/discover/bluetooth`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    if (callback) callback(data.devices);
                } else {
                    frappe.msgprint({
                        title: __('Discovery Failed'),
                        message: data.error || __('Failed to discover devices'),
                        indicator: 'red'
                    });
                }
            })
            .catch(error => {
                console.error('Bluetooth discovery error:', error);
                frappe.msgprint({
                    title: __('Discovery Error'),
                    message: __('Cannot connect to Print Bridge'),
                    indicator: 'red'
                });
            });
    },

    /**
     * Show printer configuration dialog
     */
    show_config_dialog: function() {
        const me = this;
        
        const d = new frappe.ui.Dialog({
            title: __('Printer Configuration'),
            fields: [
                {
                    fieldtype: 'Section Break',
                    label: __('Print Bridge')
                },
                {
                    fieldname: 'bridge_url',
                    fieldtype: 'Data',
                    label: __('Bridge URL'),
                    default: me.config.bridge_url,
                    description: __('Print Bridge service URL (default: http://localhost:5555)')
                },
                {
                    fieldname: 'check_bridge',
                    fieldtype: 'Button',
                    label: __('Test Connection'),
                    click: function() {
                        me.check_bridge_status(true);
                    }
                },
                {
                    fieldtype: 'Section Break',
                    label: __('Printer Settings')
                },
                {
                    fieldname: 'printer_type',
                    fieldtype: 'Select',
                    label: __('Printer Type'),
                    options: ['network', 'usb', 'bluetooth'],
                    default: me.config.printer_type,
                    onchange: function() {
                        const type = this.get_value();
                        d.fields_dict.network_settings.$wrapper.toggle(type === 'network');
                        d.fields_dict.usb_settings.$wrapper.toggle(type === 'usb');
                        d.fields_dict.bluetooth_settings.$wrapper.toggle(type === 'bluetooth');
                    }
                },
                {
                    fieldname: 'printer_width',
                    fieldtype: 'Select',
                    label: __('Printer Width'),
                    options: ['32', '48'],
                    default: String(me.config.printer_width)
                },
                {
                    fieldtype: 'Section Break',
                    label: __('Network Printer'),
                    fieldname: 'network_settings',
                    depends_on: 'eval:doc.printer_type=="network"'
                },
                {
                    fieldname: 'printer_ip',
                    fieldtype: 'Data',
                    label: __('Printer IP Address'),
                    default: me.config.printer_ip
                },
                {
                    fieldname: 'printer_port',
                    fieldtype: 'Int',
                    label: __('Printer Port'),
                    default: me.config.printer_port
                },
                {
                    fieldtype: 'Section Break',
                    label: __('USB Printer'),
                    fieldname: 'usb_settings',
                    depends_on: 'eval:doc.printer_type=="usb"'
                },
                {
                    fieldname: 'device_path',
                    fieldtype: 'Data',
                    label: __('Device Path'),
                    default: me.config.device_path,
                    description: __('e.g. /dev/usb/lp0 (Linux), /dev/cu.usbserial (Mac)')
                },
                {
                    fieldtype: 'Section Break',
                    label: __('Bluetooth Printer'),
                    fieldname: 'bluetooth_settings',
                    depends_on: 'eval:doc.printer_type=="bluetooth"'
                },
                {
                    fieldname: 'bluetooth_address',
                    fieldtype: 'Data',
                    label: __('Bluetooth MAC Address'),
                    default: me.config.bluetooth_address,
                    description: __('e.g. 00:11:22:33:44:55')
                },
                {
                    fieldname: 'bluetooth_name',
                    fieldtype: 'Data',
                    label: __('Device Name'),
                    default: me.config.bluetooth_name
                },
                {
                    fieldname: 'discover_bt',
                    fieldtype: 'Button',
                    label: __('Discover Devices'),
                    click: function() {
                        me.discover_bluetooth(function(devices) {
                            if (devices && devices.length > 0) {
                                const options = devices.map(d => ({
                                    label: `${d.name} (${d.address})`,
                                    value: d.address
                                }));
                                
                                frappe.prompt({
                                    fieldname: 'device',
                                    fieldtype: 'Select',
                                    label: __('Select Device'),
                                    options: options.map(o => o.label)
                                }, function(values) {
                                    const selected = devices.find(d => 
                                        values.device.includes(d.address)
                                    );
                                    if (selected) {
                                        d.set_value('bluetooth_address', selected.address);
                                        d.set_value('bluetooth_name', selected.name);
                                    }
                                });
                            } else {
                                frappe.msgprint(__('No Bluetooth devices found'));
                            }
                        });
                    }
                },
                {
                    fieldtype: 'Section Break',
                    label: __('Options')
                },
                {
                    fieldname: 'auto_print',
                    fieldtype: 'Check',
                    label: __('Auto Print After Submit'),
                    default: me.config.auto_print
                }
            ],
            primary_action_label: __('Save & Test'),
            primary_action: function(values) {
                // Update config
                me.update_config({
                    bridge_url: values.bridge_url,
                    printer_type: values.printer_type,
                    printer_width: parseInt(values.printer_width),
                    printer_ip: values.printer_ip,
                    printer_port: values.printer_port,
                    device_path: values.device_path,
                    bluetooth_address: values.bluetooth_address,
                    bluetooth_name: values.bluetooth_name,
                    auto_print: values.auto_print
                });
                
                // Test printer
                me.test_printer();
                
                d.hide();
            }
        });
        
        d.show();
        
        // Show/hide sections based on printer type
        d.fields_dict.network_settings.$wrapper.toggle(me.config.printer_type === 'network');
        d.fields_dict.usb_settings.$wrapper.toggle(me.config.printer_type === 'usb');
        d.fields_dict.bluetooth_settings.$wrapper.toggle(me.config.printer_type === 'bluetooth');
    }
};

// Load config on page load
$(document).ready(function() {
    imogi_pos.printing.load_config();
});

// Auto-print hook for POS Invoice
frappe.ui.form.on('POS Invoice', {
    after_save: function(frm) {
        if (frm.doc.docstatus === 1 && imogi_pos.printing.config.auto_print) {
            // Auto print if enabled
            setTimeout(function() {
                imogi_pos.printing.print_receipt(frm.doc.name);
            }, 500);
        }
    }
});

// Add print button to POS Invoice toolbar
frappe.ui.form.on('POS Invoice', {
    refresh: function(frm) {
        if (frm.doc.docstatus === 1) {
            // Add print receipt button
            frm.add_custom_button(__('Print Receipt (ESC/POS)'), function() {
                imogi_pos.printing.print_receipt(frm.doc.name);
            }, __('Print'));
            
            // Add print KOT button
            frm.add_custom_button(__('Print KOT'), function() {
                imogi_pos.printing.print_kot(frm.doc.name);
            }, __('Print'));
        }
        
        // Add printer config button
        frm.add_custom_button(__('Printer Settings'), function() {
            imogi_pos.printing.show_config_dialog();
        }, __('Tools'));
    }
});
