/**
 * IMOGI POS - OS Spooler Printer Adapter
 * 
 * Provides printing through the operating system's print spooler using window.print().
 * This is the fallback method when direct printer access is unavailable.
 * 
 * Features:
 * - Works in any browser
 * - Supports all OS-paired printers
 * - Print preview (browser dependent)
 * - Thermal printer compatibility with proper styling
 */

class SpoolerPrinterAdapter {
    /**
     * Create OS Spooler printer adapter
     * @param {Object} config - Adapter configuration
     * @param {boolean} [config.hideDialog=false] - Try to hide print dialog (if supported)
     * @param {boolean} [config.thermalMode=true] - Apply thermal printer optimizations
     * @param {string} [config.pageSize='80mm'] - Page size (58mm, 80mm, A4)
     * @param {boolean} [config.removeAfterPrint=true] - Remove print frame after printing
     * @param {Function} [config.beforePrint] - Callback before print dialog shows
     * @param {Function} [config.afterPrint] - Callback after print dialog closes
     * @param {Function} [config.onError] - Callback when error occurs
     */
    constructor(config = {}) {
        this.config = Object.assign({
            hideDialog: false,
            thermalMode: true,
            pageSize: '80mm',
            removeAfterPrint: true,
            beforePrint: null,
            afterPrint: null,
            onError: null
        }, config);
        
        this.printFrame = null;
        this.printing = false;
        this.adapterType = 'OS';
        this.printQueue = [];
        
        // Styles for different page sizes
        this.pageStyles = {
            '58mm': {
                width: '58mm',
                maxWidth: '58mm',
                fontSize: '10px',
                lineHeight: '1.1'
            },
            '80mm': {
                width: '80mm',
                maxWidth: '80mm',
                fontSize: '12px',
                lineHeight: '1.2'
            },
            'A4': {
                width: '210mm',
                maxWidth: '210mm',
                fontSize: '14px',
                lineHeight: '1.3'
            }
        };
        
        // Bind event handlers
        this.handleAfterPrint = this.handleAfterPrint.bind(this);
        
        // Add print event listeners
        if (window.matchMedia) {
            const mediaQueryList = window.matchMedia('print');
            if (mediaQueryList.addEventListener) {
                mediaQueryList.addEventListener('change', this.handleAfterPrint);
            } else {
                // Fallback for older browsers
                window.addEventListener('afterprint', this.handleAfterPrint);
            }
        }
    }
    
    /**
     * Initialize adapter
     * @returns {SpoolerPrinterAdapter} This adapter instance
     */
    init() {
        // OS Spooler is always available in browsers
        return this;
    }
    
    /**
     * Connect to printer (no-op for OS Spooler)
     * @returns {Promise<Object>} Promise resolving immediately
     */
    connect() {
        return Promise.resolve({ success: true, adapter: 'OS Spooler' });
    }
    
    /**
     * Disconnect from printer (no-op for OS Spooler)
     * @returns {Promise<void>} Promise resolving immediately
     */
    disconnect() {
        // Clean up any print frames
        this.cleanupPrintFrame();
        return Promise.resolve();
    }
    
    /**
     * Print content
     * @param {Object} job - Print job
     * @param {string} job.type - Job type (kot, receipt, customer_bill, queue_ticket, test)
     * @param {string|Object} job.data - Print data (HTML or text)
     * @param {string} [job.format='html'] - Data format (html, raw, command)
     * @param {number} [job.copies=1] - Number of copies
     * @returns {Promise<Object>} Promise resolving when printing is complete
     */
    print(job) {
        return new Promise((resolve, reject) => {
            // If already printing, queue this job
            if (this.printing) {
                this.printQueue.push({ job, resolve, reject });
                return;
            }
            
            this.printing = true;
            
            // Prepare content based on format
            let content;
            if (job.format === 'html') {
                content = job.data;
            } else if (job.format === 'raw' || job.format === 'command') {
                // Format plain text with pre for fixed-width
                content = `<pre>${this.escapeHtml(job.data)}</pre>`;
            } else {
                content = String(job.data);
            }
            
            try {
                // Create print frame
                this.createPrintFrame(content, job.type);
                
                // Call before print callback
                if (typeof this.config.beforePrint === 'function') {
                    this.config.beforePrint(job);
                }
                
                // Handle copies - for browser print we can only suggest copies in the dialog
                // Most browsers will show this in the print dialog
                const printOptions = { 
                    copies: job.copies || 1
                };
                
                // Attempt to print with silent option if hideDialog is true
                // This only works in Chrome with --kiosk-printing flag or in certain enterprise environments
                if (this.config.hideDialog && this.printFrame.contentWindow.print) {
                    this.printFrame.contentWindow.print(printOptions);
                } else {
                    // Standard browser print
                    this.printFrame.contentWindow.print();
                }
                
                // Resolve immediately since we can't reliably detect when OS print completes
                // The afterprint event will clean up resources
                resolve({ success: true, adapter: 'OS Spooler' });
            } catch (error) {
                this.printing = false;
                this.cleanupPrintFrame();
                this.triggerError(`Print error: ${error.message}`);
                reject(error);
                
                // Process next job in queue if any
                this.processNextJob();
            }
        });
    }
    
    /**
     * Create a hidden iframe for printing
     * @param {string} content - HTML content to print
     * @param {string} jobType - Type of print job
     */
    createPrintFrame(content, jobType) {
        // Clean up any existing print frame
        this.cleanupPrintFrame();
        
        // Create a new iframe
        this.printFrame = document.createElement('iframe');
        this.printFrame.id = 'imogi-print-frame';
        this.printFrame.name = 'imogi-print-frame';
        this.printFrame.style.position = 'fixed';
        this.printFrame.style.top = '-9999px';
        this.printFrame.style.left = '-9999px';
        this.printFrame.style.width = '0';
        this.printFrame.style.height = '0';
        this.printFrame.style.border = 'none';
        document.body.appendChild(this.printFrame);
        
        // Get page style based on page size and job type
        const pageStyle = this.getPageStyle(jobType);
        
        // Write content to iframe
        const frameDoc = this.printFrame.contentWindow.document;
        frameDoc.open();
        frameDoc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>IMOGI POS Print</title>
                <style>
                    ${pageStyle}
                    
                    /* Fix for Firefox to ensure content is centered */
                    @-moz-document url-prefix() {
                        body { margin: 0 auto; }
                    }
                    
                    /* Hide page elements for thermal printer */
                    @page {
                        margin: ${this.config.thermalMode ? '0mm' : '5mm'};
                        size: ${this.getPageSize()};
                    }
                    
                    /* For thermal receipt, hide header/footer */
                    @media print {
                        html, body {
                            -webkit-print-color-adjust: exact;
                            color-adjust: exact;
                        }
                        
                        ${this.config.thermalMode ? `
                        /* Hide browser headers and footers for thermal mode */
                        body {
                            margin: 0;
                            padding: 0;
                            -webkit-print-color-adjust: exact;
                            color-adjust: exact;
                        }
                        ` : ''}
                    }
                </style>
            </head>
            <body class="imogi-print-${jobType}">
                ${content}
            </body>
            </html>
        `);
        frameDoc.close();
    }
    
    /**
     * Get page style based on configuration
     * @param {string} jobType - Type of print job
     * @returns {string} CSS style
     */
    getPageStyle(jobType) {
        // Get base style for page size
        const pageSize = this.config.pageSize;
        const style = this.pageStyles[pageSize] || this.pageStyles['80mm'];
        
        // Base styles
        let css = `
            body {
                width: ${style.width};
                max-width: ${style.maxWidth};
                font-family: Arial, sans-serif;
                font-size: ${style.fontSize};
                line-height: ${style.lineHeight};
                margin: 0 auto;
                padding: ${this.config.thermalMode ? '0' : '5mm'};
                background-color: white;
                color: black;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            
            /* Common styles */
            h1, h2, h3 { text-align: center; margin: 5px 0; }
            h1 { font-size: 1.2em; }
            h2 { font-size: 1.1em; }
            h3 { font-size: 1em; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 2px 4px; }
            hr { border: none; border-top: 1px dashed #000; margin: 5px 0; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .text-bold { font-weight: bold; }
            pre { white-space: pre-wrap; font-family: monospace; margin: 0; }
        `;
        
        // Add job-specific styles
        switch (jobType) {
            case 'kot':
                css += `
                    body { font-weight: bold; }
                    .item-note { font-style: italic; }
                    .station { background-color: #f0f0f0; padding: 2px; }
                `;
                break;
                
            case 'receipt':
                css += `
                    .receipt-header { text-align: center; margin-bottom: 10px; }
                    .receipt-total { font-weight: bold; }
                    .receipt-footer { text-align: center; font-size: 0.9em; margin-top: 10px; }
                `;
                break;
                
            case 'customer_bill':
                css += `
                    .bill-header { text-align: center; margin-bottom: 10px; }
                    .bill-table { width: 100%; }
                    .bill-table th { border-bottom: 1px solid #000; }
                    .bill-table td { padding: 3px 0; }
                    .bill-total { font-weight: bold; border-top: 1px solid #000; }
                `;
                break;
                
            case 'queue_ticket':
                css += `
                    body { text-align: center; font-weight: bold; }
                    .queue-number { font-size: 2em; margin: 10px 0; }
                `;
                break;
                
            case 'test':
                css += `
                    .test-header { text-align: center; font-weight: bold; }
                    .test-content { margin: 10px 0; }
                    .test-footer { text-align: center; font-style: italic; }
                `;
                break;
        }
        
        return css;
    }
    
    /**
     * Get page size configuration
     * @returns {string} CSS page size
     */
    getPageSize() {
        switch (this.config.pageSize) {
            case '58mm':
                return '58mm 100%';
            case '80mm':
                return '80mm 100%';
            case 'A4':
                return 'A4 portrait';
            default:
                return '80mm 100%';
        }
    }
    
    /**
     * Handle after print event
     */
    handleAfterPrint() {
        // After print callback
        if (typeof this.config.afterPrint === 'function') {
            this.config.afterPrint();
        }
        
        // Clean up resources
        if (this.config.removeAfterPrint) {
            this.cleanupPrintFrame();
        }
        
        // Mark printing as complete
        this.printing = false;
        
        // Process next job in queue if any
        this.processNextJob();
    }
    
    /**
     * Process next job in print queue
     */
    processNextJob() {
        if (this.printQueue.length > 0) {
            const { job, resolve, reject } = this.printQueue.shift();
            
            // Process next job after a short delay
            setTimeout(() => {
                this.print(job).then(resolve).catch(reject);
            }, 500);
        }
    }
    
    /**
     * Clean up print frame
     */
    cleanupPrintFrame() {
        if (this.printFrame && this.printFrame.parentNode) {
            this.printFrame.parentNode.removeChild(this.printFrame);
            this.printFrame = null;
        }
    }
    
    /**
     * Escape HTML special characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }
    
    /**
     * Trigger error callback
     * @param {string} message - Error message
     */
    triggerError(message) {
        if (typeof this.config.onError === 'function') {
            this.config.onError(new Error(message));
        }
    }
    
    /**
     * Get capabilities of this adapter
     * @returns {Object} Capabilities
     */
    getCapabilities() {
        return {
            pageSizes: Object.keys(this.pageStyles),
            currentPageSize: this.config.pageSize,
            thermalMode: this.config.thermalMode,
            printDialogAvailable: typeof window.print === 'function',
            silentPrintSupported: false // This requires enterprise policies or Chrome flags
        };
    }
}

// Export for module usage
if (typeof module !== 'undefined') {
    module.exports = SpoolerPrinterAdapter;
} else {
    window.IMOGIPrintSpoolerAdapter = SpoolerPrinterAdapter;
}