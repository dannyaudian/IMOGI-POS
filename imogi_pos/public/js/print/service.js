/**
 * IMOGI POS - Print Service
 * 
 * Provides a unified interface for thermal printing across different interfaces:
 * - LAN (TCP/IP) - Direct to network printers
 * - Bluetooth (Web Bluetooth API) - Direct to BT printers from browser
 * - Print Bridge - Proxy to local agent for extended printer access
 * - OS Spooler - System print dialog for thermal printers paired at OS level
 * 
 * Features:
 * - Adapter selection based on configuration
 * - Capability detection
 * - Test printing
 * - Print queue management
 * - Error handling and retries
 */

// Import adapters conditionally to avoid errors in unsupported environments
let BluetoothAdapter, BridgeAdapter, SpoolerAdapter, LANAdapter;

/**
 * Ensure adapter references are synced from the window object when running in the
 * browser. The adapter scripts are loaded after this service and expose their
 * constructors on the window once executed, so we lazily resolve them here.
 *
 * @param {boolean} [logMissing=false] - Whether to log a warning when an adapter
 *   script has not been detected yet. We only want to surface this when the
 *   adapters are actually required, not during initial page load.
 */
function resolveBrowserAdapters(logMissing = false, requiredInterfaces = null) {
    if (typeof window === 'undefined') {
        return;
    }

    const requiredSet = requiredInterfaces ? new Set(requiredInterfaces) : null;

    const mappings = [
        ['IMOGIPrintBluetoothAdapter', (Adapter) => { BluetoothAdapter = Adapter; }, 'Bluetooth adapter not detected. Include adapter_bluetooth.js', 'Bluetooth'],
        ['IMOGIPrintBridgeAdapter', (Adapter) => { BridgeAdapter = Adapter; }, 'Bridge adapter not detected. Include adapter_bridge.js', 'Bridge'],
        ['IMOGIPrintSpoolerAdapter', (Adapter) => { SpoolerAdapter = Adapter; }, 'Spooler adapter not detected. Include adapter_spool.js', 'OS'],
        ['IMOGIPrintLANAdapter', (Adapter) => { LANAdapter = Adapter; }, 'LAN adapter not detected. Include adapter_lan.js', 'LAN']
    ];

    mappings.forEach(([globalName, assign, missingMessage, interfaceType]) => {
        const AdapterClass = window[globalName];
        if (AdapterClass) {
            assign(AdapterClass);
        } else if (logMissing && (!requiredSet || requiredSet.has(interfaceType))) {
            console.warn(`IMOGI Print Service: ${missingMessage}`);
        }
    });
}

// We'll dynamically import these based on environment support
if (typeof require !== 'undefined') {
    try {
        BluetoothAdapter = require('./adapter_bluetooth.js');
    } catch (e) {
        console.warn('IMOGI Print Service: Bluetooth adapter not loaded', e);
    }

    try {
        BridgeAdapter = require('./adapter_bridge.js');
    } catch (e) {
        console.warn('IMOGI Print Service: Bridge adapter not loaded', e);
    }

    try {
        SpoolerAdapter = require('./adapter_spool.js');
    } catch (e) {
        console.warn('IMOGI Print Service: Spooler adapter not loaded', e);
    }

    try {
        LANAdapter = require('./adapter_lan.js');
    } catch (e) {
        console.warn('IMOGI Print Service: LAN adapter not loaded', e);
    }
} else {
    // In browser, adapters are exposed via <script> tags. They may load after
    // this service, so resolve them lazily once the DOM is ready.
    const syncAdapters = () => resolveBrowserAdapters(false);

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', syncAdapters, { once: true });
        } else {
            syncAdapters();
        }
    } else {
        syncAdapters();
    }
}

const IMOGIPrintService = {
    /**
     * Available printer interfaces
     */
    INTERFACES: {
        LAN: 'LAN',
        BLUETOOTH: 'Bluetooth',
        BRIDGE: 'Bridge',
        OS: 'OS'
    },

    /**
     * Print job types
     */
    JOB_TYPES: {
        KOT: 'kot',
        RECEIPT: 'receipt',
        CUSTOMER_BILL: 'customer_bill',
        QUEUE_TICKET: 'queue_ticket',
        TEST: 'test'
    },

    /**
     * Current print adapter
     */
    currentAdapter: null,

    /**
     * Print queue
     */
    printQueue: [],

    /**
     * Whether printing is currently in progress
     */
    isPrinting: false,

    /**
     * Initialize print service
     * @param {Object} options - Configuration options
     * @param {string} [options.defaultInterface='OS'] - Default interface if none is specified
     * @param {Object} [options.interfaces] - Interface-specific configurations
     * @param {Function} [options.onPrintComplete] - Callback when print job completes
     * @param {Function} [options.onPrintError] - Callback when print job fails
     * @param {number} [options.maxRetries=2] - Maximum retry attempts for failed jobs
     * @param {boolean} [options.autoDetect=true] - Auto-detect best available interface
     */
    init: function(options = {}) {
        this.options = Object.assign({
            defaultInterface: this.INTERFACES.OS,
            interfaces: {},
            onPrintComplete: null,
            onPrintError: null,
            maxRetries: 2,
            autoDetect: true
        }, options);

        resolveBrowserAdapters(false);

        // Check available capabilities
        this.capabilities = this.detectCapabilities();
        
        // Set initial adapter based on default or auto-detection
        if (this.options.autoDetect) {
            this.selectBestAdapter();
        } else {
            this.selectAdapter(this.options.defaultInterface);
        }
        
        return this;
    },

    /**
     * Detect available printing capabilities
     * @returns {Object} Object with capability flags
     */
    detectCapabilities: function() {
        const capabilities = {
            webBluetooth: false,
            fetch: false,
            print: false
        };
        
        // Check Web Bluetooth API
        if (navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function') {
            capabilities.webBluetooth = true;
        }
        
        // Check Fetch API (for Bridge and LAN)
        if (window.fetch && typeof window.fetch === 'function') {
            capabilities.fetch = true;
        }
        
        // Check window.print() availability
        if (window.print && typeof window.print === 'function') {
            capabilities.print = true;
        }
        
        return capabilities;
    },

    /**
     * Select the best available adapter based on capabilities
     * @returns {string} Selected interface
     */
    selectBestAdapter: function() {
        resolveBrowserAdapters(false);

        // Preference order: Bluetooth > LAN > Bridge > OS
        if (this.capabilities.webBluetooth && BluetoothAdapter) {
            return this.selectAdapter(this.INTERFACES.BLUETOOTH);
        } else if (this.capabilities.fetch && LANAdapter) {
            return this.selectAdapter(this.INTERFACES.LAN);
        } else if (this.capabilities.fetch && BridgeAdapter) {
            return this.selectAdapter(this.INTERFACES.BRIDGE);
        } else if (this.capabilities.print && SpoolerAdapter) {
            return this.selectAdapter(this.INTERFACES.OS);
        }
        
        // Fallback to OS spooler
        return this.selectAdapter(this.INTERFACES.OS);
    },

    /**
     * Select a specific printer adapter
     * @param {string} interfaceType - Printer interface type
     * @param {Object} [config] - Interface-specific configuration
     * @returns {string} Selected interface
     */
    selectAdapter: function(interfaceType, config = {}) {
        resolveBrowserAdapters(true, [interfaceType]);

        // Clear current adapter
        if (this.currentAdapter && typeof this.currentAdapter.disconnect === 'function') {
            this.currentAdapter.disconnect();
        }
        
        const interfaceConfig = Object.assign(
            {},
            this.options.interfaces[interfaceType] || {},
            config
        );
        
        switch (interfaceType) {
            case this.INTERFACES.BLUETOOTH:
                if (!this.capabilities.webBluetooth || !BluetoothAdapter) {
                    console.warn('Web Bluetooth not supported, falling back to OS spooler');
                    return this.selectAdapter(this.INTERFACES.OS);
                }
                this.currentAdapter = new BluetoothAdapter(interfaceConfig);
                break;
                
            case this.INTERFACES.LAN:
                if (!this.capabilities.fetch || !LANAdapter) {
                    console.warn('Fetch API not supported, falling back to OS spooler');
                    return this.selectAdapter(this.INTERFACES.OS);
                }
                this.currentAdapter = new LANAdapter(interfaceConfig);
                break;
                
            case this.INTERFACES.BRIDGE:
                if (!this.capabilities.fetch || !BridgeAdapter) {
                    console.warn('Fetch API not supported, falling back to OS spooler');
                    return this.selectAdapter(this.INTERFACES.OS);
                }
                this.currentAdapter = new BridgeAdapter(interfaceConfig);
                break;
                
            case this.INTERFACES.OS:
            default:
                if (!this.capabilities.print || !SpoolerAdapter) {
                    console.error('No printing capabilities available');
                    this.currentAdapter = null;
                    return null;
                }
                this.currentAdapter = new SpoolerAdapter(interfaceConfig);
                break;
        }
        
        // Initialize the adapter
        if (this.currentAdapter && typeof this.currentAdapter.init === 'function') {
            this.currentAdapter.init();
        }
        
        return interfaceType;
    },

    /**
     * Get printer configuration from POS Profile or other settings
     * @param {string} posProfile - POS Profile name
     * @param {string} [jobType='receipt'] - Type of print job
     * @returns {Promise<Object>} Promise resolving to printer configuration
     */
    getPrinterConfig: function(posProfile, jobType = 'receipt') {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'imogi_pos.api.printing.get_printer_config',
                args: {
                    pos_profile: posProfile,
                    job_type: jobType
                },
                callback: (response) => {
                    if (response.message) {
                        resolve(response.message);
                    } else {
                        reject(new Error('Failed to get printer configuration'));
                    }
                },
                error: (error) => {
                    reject(error || new Error('Failed to get printer configuration'));
                }
            });
        });
    },

    /**
     * Configure printer based on POS Profile
     * @param {string} posProfile - POS Profile name
     * @param {string} [jobType='receipt'] - Type of print job
     * @returns {Promise<Object>} Promise resolving when configuration is complete
     */
    configurePrinter: function(posProfile, jobType = 'receipt') {
        return this.getPrinterConfig(posProfile, jobType)
            .then(config => {
                // Select adapter based on config
                const interfaceType = config.interface || this.options.defaultInterface;
                
                // Configure the adapter
                this.selectAdapter(interfaceType, config);
                
                return config;
            });
    },

    /**
     * Test print functionality
     * @param {string} [posProfile] - POS Profile name
     * @param {string} [interfaceType] - Override interface type
     * @param {Object} [config] - Override interface configuration
     * @returns {Promise<Object>} Promise resolving when test print is complete
     */
    testPrint: function(posProfile, interfaceType, config) {
        // If no POS Profile, use current adapter with provided config
        if (!posProfile) {
            if (interfaceType) {
                this.selectAdapter(interfaceType, config);
            }
            
            if (!this.currentAdapter) {
                return Promise.reject(new Error('No printer adapter selected'));
            }
            
            return this.print({
                type: this.JOB_TYPES.TEST,
                data: 'IMOGI POS Test Print\n' +
                      'Date: ' + new Date().toLocaleString() + '\n' +
                      'Adapter: ' + interfaceType + '\n' +
                      '-----------------------------\n' +
                      'If you can read this, printing is working!\n' +
                      '-----------------------------\n\n\n\n'
            });
        }
        
        // Configure printer based on POS Profile
        return this.configurePrinter(posProfile, this.JOB_TYPES.TEST)
            .then(config => {
                // If interface type is provided, override the one from config
                if (interfaceType) {
                    this.selectAdapter(interfaceType, Object.assign({}, config, config));
                }
                
                // Get test print HTML from server
                return frappe.call({
                    method: 'imogi_pos.api.printing.get_test_print_html',
                    args: {
                        pos_profile: posProfile
                    }
                });
            })
            .then(response => {
                if (!response.message) {
                    throw new Error('Failed to get test print content');
                }
                
                // Print the test content
                return this.print({
                    type: this.JOB_TYPES.TEST,
                    data: response.message,
                    format: 'html'
                });
            });
    },

    /**
     * Print content
     * @param {Object} job - Print job
     * @param {string} job.type - Job type (kot, receipt, customer_bill, queue_ticket, test)
     * @param {string|Object} job.data - Print data (HTML string, ESC/POS commands, or document object)
     * @param {string} [job.format='html'] - Data format (html, raw, command)
     * @param {number} [job.copies=1] - Number of copies
     * @param {string} [job.doctype] - Source document type
     * @param {string} [job.docname] - Source document name
     * @param {Object} [job.options] - Additional print options
     * @returns {Promise<Object>} Promise resolving when printing is complete
     */
    print: function(job) {
        return new Promise((resolve, reject) => {
            // Ensure we have a valid adapter
            if (!this.currentAdapter) {
                reject(new Error('No printer adapter selected'));
                return;
            }
            
            // Normalize job object
            const printJob = Object.assign({
                type: this.JOB_TYPES.RECEIPT,
                format: 'html',
                copies: 1,
                retries: 0,
                options: {}
            }, job);
            
            // Add to queue
            this.printQueue.push({
                job: printJob,
                resolve,
                reject
            });
            
            // Process queue if not already printing
            if (!this.isPrinting) {
                this.processQueue();
            }
        });
    },

    /**
     * Process print queue
     */
    processQueue: function() {
        if (this.printQueue.length === 0) {
            this.isPrinting = false;
            return;
        }
        
        this.isPrinting = true;
        const { job, resolve, reject } = this.printQueue.shift();
        
        // Execute print job through adapter
        this.currentAdapter.print(job)
            .then(result => {
                // Success callback
                if (typeof this.options.onPrintComplete === 'function') {
                    this.options.onPrintComplete(job, result);
                }
                
                // Log print if it's not a test print
                if (job.type !== this.JOB_TYPES.TEST && job.doctype && job.docname) {
                    this.logPrintJob(job);
                }
                
                resolve(result);
                
                // Process next job
                setTimeout(() => this.processQueue(), 500);
            })
            .catch(error => {
                console.error('Print error:', error);
                
                // Retry logic
                if (job.retries < this.options.maxRetries) {
                    console.log(`Retrying print job (${job.retries + 1}/${this.options.maxRetries})`);
                    job.retries++;
                    
                    // Put back in queue
                    this.printQueue.unshift({ job, resolve, reject });
                    
                    // Try again after a delay
                    setTimeout(() => this.processQueue(), 2000);
                    return;
                }
                
                // Error callback
                if (typeof this.options.onPrintError === 'function') {
                    this.options.onPrintError(job, error);
                }
                
                reject(error);
                
                // Process next job
                setTimeout(() => this.processQueue(), 500);
            });
    },

    /**
     * Log print job to server for audit
     * @param {Object} job - Print job
     * @returns {Promise<Object>} Promise resolving when log is saved
     */
    logPrintJob: function(job) {
        return frappe.call({
            method: 'imogi_pos.api.printing.log_print_job',
            args: {
                doctype: job.doctype,
                docname: job.docname,
                print_type: job.type,
                printer_type: this.currentAdapter.adapterType,
                copies: job.copies,
                print_format: job.options.print_format || ''
            },
            callback: (response) => {
                if (!response.message) {
                    console.warn('Failed to log print job');
                }
            }
        });
    },

    /**
     * Print KOT (Kitchen Order Ticket)
     * @param {string} kotTicketName - KOT Ticket name
     * @param {string} [posProfile] - POS Profile name
     * @param {number} [copies=1] - Number of copies
     * @returns {Promise<Object>} Promise resolving when printing is complete
     */
    printKOT: function(kotTicketName, posProfile, copies = 1) {
        // Configure printer for KOT
        return this.configurePrinter(posProfile, this.JOB_TYPES.KOT)
            .then(() => {
                // Get KOT print HTML
                return frappe.call({
                    method: 'imogi_pos.api.printing.get_kot_html',
                    args: {
                        kot_ticket: kotTicketName,
                        pos_profile: posProfile
                    }
                });
            })
            .then(response => {
                if (!response.message) {
                    throw new Error('Failed to get KOT print content');
                }
                
                // Print the KOT
                return this.print({
                    type: this.JOB_TYPES.KOT,
                    data: response.message,
                    format: 'html',
                    copies: copies,
                    doctype: 'KOT Ticket',
                    docname: kotTicketName,
                    options: {
                        print_format: response.message.print_format || 'KOT Ticket'
                    }
                });
            });
    },

    /**
     * Print receipt
     * @param {string} salesInvoice - Sales Invoice name
     * @param {string} [posProfile] - POS Profile name
     * @param {number} [copies=1] - Number of copies
     * @returns {Promise<Object>} Promise resolving when printing is complete
     */
    printReceipt: function(salesInvoice, posProfile, copies = 1) {
        // Configure printer for receipt
        return this.configurePrinter(posProfile, this.JOB_TYPES.RECEIPT)
            .then(() => {
                // Get receipt print HTML
                return frappe.call({
                    method: 'imogi_pos.api.printing.get_receipt_html',
                    args: {
                        sales_invoice: salesInvoice,
                        pos_profile: posProfile
                    }
                });
            })
            .then(response => {
                if (!response.message) {
                    throw new Error('Failed to get receipt print content');
                }
                
                // Print the receipt
                return this.print({
                    type: this.JOB_TYPES.RECEIPT,
                    data: response.message,
                    format: 'html',
                    copies: copies,
                    doctype: 'Sales Invoice',
                    docname: salesInvoice,
                    options: {
                        print_format: response.message.print_format || 'POS Receipt'
                    }
                });
            });
    },

    /**
     * Print customer bill (pro-forma)
     * @param {string} posOrder - POS Order name
     * @param {string} [posProfile] - POS Profile name
     * @param {number} [copies=1] - Number of copies
     * @returns {Promise<Object>} Promise resolving when printing is complete
     */
    printCustomerBill: function(posOrder, posProfile, copies = 1) {
        // Configure printer for customer bill
        return this.configurePrinter(posProfile, this.JOB_TYPES.CUSTOMER_BILL)
            .then(() => {
                // Get customer bill print HTML
                return frappe.call({
                    method: 'imogi_pos.api.printing.get_customer_bill_html',
                    args: {
                        pos_order: posOrder,
                        pos_profile: posProfile
                    }
                });
            })
            .then(response => {
                if (!response.message) {
                    throw new Error('Failed to get customer bill print content');
                }
                
                // Print the customer bill
                return this.print({
                    type: this.JOB_TYPES.CUSTOMER_BILL,
                    data: response.message,
                    format: 'html',
                    copies: copies,
                    doctype: 'POS Order',
                    docname: posOrder,
                    options: {
                        print_format: response.message.print_format || 'Customer Bill'
                    }
                });
            });
    },

    /**
     * Print queue ticket
     * @param {string} salesInvoice - Sales Invoice name
     * @param {string} [posProfile] - POS Profile name
     * @param {number} [copies=1] - Number of copies
     * @returns {Promise<Object>} Promise resolving when printing is complete
     */
    printQueueTicket: function(salesInvoice, posProfile, copies = 1) {
        // Configure printer for queue ticket
        return this.configurePrinter(posProfile, this.JOB_TYPES.QUEUE_TICKET)
            .then(() => {
                // Get queue ticket print HTML
                return frappe.call({
                    method: 'imogi_pos.api.printing.get_queue_ticket_html',
                    args: {
                        sales_invoice: salesInvoice,
                        pos_profile: posProfile
                    }
                });
            })
            .then(response => {
                if (!response.message) {
                    throw new Error('Failed to get queue ticket print content');
                }
                
                // Print the queue ticket
                return this.print({
                    type: this.JOB_TYPES.QUEUE_TICKET,
                    data: response.message,
                    format: 'html',
                    copies: copies,
                    doctype: 'Sales Invoice',
                    docname: salesInvoice,
                    options: {
                        print_format: response.message.print_format || 'Queue Ticket'
                    }
                });
            });
    },

    /**
     * Check if an interface is supported
     * @param {string} interfaceType - Interface type to check
     * @returns {boolean} Whether the interface is supported
     */
    isInterfaceSupported: function(interfaceType) {
        switch (interfaceType) {
            case this.INTERFACES.BLUETOOTH:
                return this.capabilities.webBluetooth && !!BluetoothAdapter;
                
            case this.INTERFACES.LAN:
                return this.capabilities.fetch && !!LANAdapter;
                
            case this.INTERFACES.BRIDGE:
                return this.capabilities.fetch && !!BridgeAdapter;
                
            case this.INTERFACES.OS:
                return this.capabilities.print && !!SpoolerAdapter;
                
            default:
                return false;
        }
    },

    /**
     * Get current adapter type
     * @returns {string|null} Current adapter type or null if none selected
     */
    getCurrentAdapterType: function() {
        return this.currentAdapter ? this.currentAdapter.adapterType : null;
    },

    /**
     * Get detailed capabilities report
     * @returns {Object} Detailed capabilities report
     */
    getCapabilitiesReport: function() {
        const report = {
            browser: {
                userAgent: navigator.userAgent,
                vendor: navigator.vendor,
                platform: navigator.platform
            },
            capabilities: this.capabilities,
            supportedInterfaces: {
                [this.INTERFACES.BLUETOOTH]: this.isInterfaceSupported(this.INTERFACES.BLUETOOTH),
                [this.INTERFACES.LAN]: this.isInterfaceSupported(this.INTERFACES.LAN),
                [this.INTERFACES.BRIDGE]: this.isInterfaceSupported(this.INTERFACES.BRIDGE),
                [this.INTERFACES.OS]: this.isInterfaceSupported(this.INTERFACES.OS)
            },
            currentAdapter: this.getCurrentAdapterType(),
            https: window.location.protocol === 'https:',
            printDialogSupported: this.capabilities.print
        };
        
        // Add adapter-specific information if available
        if (this.currentAdapter && typeof this.currentAdapter.getCapabilities === 'function') {
            report.adapterCapabilities = this.currentAdapter.getCapabilities();
        }
        
        return report;
    }
};

// Export for module usage and expose on window for legacy callers
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IMOGIPrintService;
}

if (typeof window !== 'undefined') {
    window.IMOGIPrintService = IMOGIPrintService;
    // Provide camelCase alias used by legacy bundles (e.g. ImogiPrintService)
    window.ImogiPrintService = IMOGIPrintService;
}
