/**
 * IMOGI POS - Print Bridge Adapter
 * 
 * Provides connectivity to IMOGI Print Bridge - a local agent for extended printer access.
 * Enables printing to Bluetooth, Serial, and network printers through a local service
 * without the restrictions of Web Bluetooth API.
 * 
 * Features:
 * - HTTPS to HTTP bridge (for environments where Web Bluetooth isn't available)
 * - Retry logic with exponential backoff
 * - Authentication via token
 * - Support for multiple printer types
 */

class BridgePrinterAdapter {
    /**
     * Create Print Bridge adapter
     * @param {Object} config - Adapter configuration
     * @param {string} config.bridgeUrl - URL of Print Bridge service
     * @param {string} [config.token] - Authentication token
     * @param {string} [config.deviceName] - Target printer name
     * @param {string} [config.deviceType='bluetooth'] - Device type (bluetooth, serial, network)
     * @param {string} [config.vendorProfile='ESC/POS'] - Printer command language
     * @param {number} [config.timeout=10000] - Request timeout in milliseconds
     * @param {number} [config.maxRetries=3] - Maximum retry attempts
     * @param {Function} [config.onConnect] - Callback when connected
     * @param {Function} [config.onDisconnect] - Callback when disconnected
     * @param {Function} [config.onError] - Callback when error occurs
     */
    constructor(config = {}) {
        this.config = Object.assign({
            bridgeUrl: 'http://localhost:9100',
            token: '',
            deviceName: '',
            deviceType: 'bluetooth',
            vendorProfile: 'ESC/POS',
            timeout: 10000,
            maxRetries: 3,
            onConnect: null,
            onDisconnect: null,
            onError: null
        }, config);
        
        this.connected = false;
        this.connectionInfo = null;
        this.adapterType = 'Bridge';
        this.retryCount = 0;
        this.retryDelay = 1000; // Start with 1 second
    }
    
    /**
     * Initialize adapter and check bridge availability
     * @returns {Promise<Object>} Promise resolving when initialized
     */
    init() {
        return this.checkBridgeAvailability()
            .then(info => {
                this.connectionInfo = info;
                return this;
            })
            .catch(error => {
                this.triggerError(`Failed to connect to Print Bridge: ${error.message}`);
                // Still return the adapter even if bridge is unavailable
                return this;
            });
    }
    
    /**
     * Check if Print Bridge is available
     * @returns {Promise<Object>} Promise resolving to bridge info
     */
    checkBridgeAvailability() {
        return this.sendRequest('/status', 'GET')
            .then(response => {
                if (response.status === 'ok') {
                    this.connected = true;
                    
                    // Call connect callback
                    if (typeof this.config.onConnect === 'function') {
                        this.config.onConnect(response);
                    }
                    
                    return response;
                } else {
                    throw new Error('Bridge is not available');
                }
            });
    }
    
    /**
     * Connect to printer via bridge
     * @returns {Promise<Object>} Promise resolving when connected
     */
    connect() {
        if (this.connected) {
            return Promise.resolve(this.connectionInfo);
        }
        
        return this.checkBridgeAvailability();
    }
    
    /**
     * Disconnect from bridge
     * @returns {Promise<void>} Promise resolving when disconnected
     */
    disconnect() {
        this.connected = false;
        this.connectionInfo = null;
        
        if (typeof this.config.onDisconnect === 'function') {
            this.config.onDisconnect();
        }
        
        return Promise.resolve();
    }
    
    /**
     * Print content via bridge
     * @param {Object} job - Print job
     * @param {string} job.type - Job type
     * @param {string|Object} job.data - Print data (HTML or text)
     * @param {string} [job.format='html'] - Data format (html, raw, command)
     * @returns {Promise<Object>} Promise resolving when printing is complete
     */
    print(job) {
        return new Promise((resolve, reject) => {
            // Ensure connection
            if (!this.connected) {
                return this.connect()
                    .then(() => this.print(job))
                    .then(resolve)
                    .catch(reject);
            }
            
            // Prepare print data
            let printData;
            let contentType;
            
            if (job.format === 'command' || job.format === 'raw') {
                // Send raw data to bridge
                printData = typeof job.data === 'string' ? job.data : job.data.toString();
                contentType = 'text/plain';
            } else {
                // Send HTML to bridge for rendering
                printData = job.data;
                contentType = 'text/html';
            }
            
            // Prepare request data
            const requestData = {
                printer: this.config.deviceName,
                type: this.config.deviceType,
                profile: this.config.vendorProfile,
                content: printData,
                contentType: contentType,
                options: {
                    copies: job.copies || 1,
                    jobType: job.type || 'receipt'
                }
            };
            
            // Send print request to bridge
            this.sendRequest('/print', 'POST', requestData)
                .then(response => {
                    if (response.status === 'ok') {
                        this.retryCount = 0; // Reset retry counter on success
                        resolve({ success: true, jobId: response.jobId });
                    } else {
                        throw new Error(response.message || 'Print failed');
                    }
                })
                .catch(error => {
                    this.triggerError(`Print error: ${error.message}`);
                    reject(error);
                });
        });
    }
    
    /**
     * Send request to bridge with retry logic
     * @param {string} endpoint - API endpoint
     * @param {string} method - HTTP method
     * @param {Object} [data] - Request data
     * @returns {Promise<Object>} Promise resolving to response
     */
    sendRequest(endpoint, method, data = null) {
        const url = `${this.config.bridgeUrl}${endpoint}`;
        
        // Request options
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: this.config.timeout
        };
        
        // Add authentication token if provided
        if (this.config.token) {
            options.headers['Authorization'] = `Bearer ${this.config.token}`;
        }
        
        // Add body for POST requests
        if (method === 'POST' && data) {
            options.body = JSON.stringify(data);
        }
        
        // Define timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Request timeout'));
            }, this.config.timeout);
        });
        
        // Send request with timeout
        return Promise.race([
            fetch(url, options),
            timeoutPromise
        ])
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .catch(error => {
            // Retry logic with exponential backoff
            if (this.retryCount < this.config.maxRetries) {
                this.retryCount++;
                const delay = this.retryDelay * Math.pow(2, this.retryCount - 1); // Exponential backoff
                
                console.warn(`Bridge request failed, retrying in ${delay}ms (${this.retryCount}/${this.config.maxRetries}): ${error.message}`);
                
                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve(this.sendRequest(endpoint, method, data));
                    }, delay);
                });
            }
            
            // Max retries exceeded
            this.connected = false;
            throw error;
        });
    }
    
    /**
     * Get printer list from bridge
     * @returns {Promise<Array>} Promise resolving to printer list
     */
    getPrinterList() {
        return this.sendRequest('/printers', 'GET')
            .then(response => {
                if (response.status === 'ok' && Array.isArray(response.printers)) {
                    return response.printers;
                } else {
                    throw new Error('Failed to get printer list');
                }
            });
    }
    
    /**
     * Test connection to printer
     * @param {string} [printerName] - Optional printer name to test
     * @returns {Promise<Object>} Promise resolving to test results
     */
    testPrinter(printerName) {
        const printer = printerName || this.config.deviceName;
        
        if (!printer) {
            return Promise.reject(new Error('No printer specified for test'));
        }
        
        return this.sendRequest('/test', 'POST', {
            printer: printer,
            type: this.config.deviceType
        });
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
            bridgeUrl: this.config.bridgeUrl,
            connected: this.connected,
            connectionInfo: this.connectionInfo,
            deviceTypes: ['bluetooth', 'serial', 'network'],
            currentType: this.config.deviceType,
            vendorProfile: this.config.vendorProfile
        };
    }
}

// Export for module usage
if (typeof module !== 'undefined') {
    module.exports = BridgePrinterAdapter;
} else {
    window.IMOGIPrintBridgeAdapter = BridgePrinterAdapter;
}