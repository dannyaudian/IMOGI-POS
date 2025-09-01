/**
 * IMOGI POS - Bluetooth Printer Adapter
 * 
 * Provides Web Bluetooth API support for direct printing to Bluetooth thermal printers.
 * Supports multiple vendor profiles (ESC/POS, CPCL, ZPL) with vendor-agnostic interface.
 * 
 * Requirements:
 * - HTTPS (Web Bluetooth API security requirement)
 * - Chrome/Edge/Android browsers
 * - User gesture required for initial connection
 */

class BluetoothPrinterAdapter {
    /**
     * Create Bluetooth printer adapter
     * @param {Object} config - Adapter configuration
     * @param {string} [config.deviceName] - Preferred device name to connect to
     * @param {string} [config.macAddress] - MAC address of printer (optional filter)
     * @param {string} [config.vendorProfile='ESC/POS'] - Printer command language (ESC/POS, CPCL, ZPL)
     * @param {number} [config.maxRetries=2] - Maximum connection retry attempts
     * @param {boolean} [config.autoReconnect=true] - Auto reconnect on disconnect
     * @param {Function} [config.onConnect] - Callback when connected
     * @param {Function} [config.onDisconnect] - Callback when disconnected
     * @param {Function} [config.onError] - Callback when error occurs
     */
    constructor(config = {}) {
        this.config = Object.assign({
            deviceName: null,
            macAddress: null,
            vendorProfile: 'ESC/POS',
            maxRetries: 2,
            autoReconnect: true,
            onConnect: null,
            onDisconnect: null,
            onError: null
        }, config);
        
        this.device = null;
        this.characteristic = null;
        this.connected = false;
        this.connecting = false;
        this.connectionAttempts = 0;
        this.adapterType = 'Bluetooth';
        
        // Define service and characteristic UUIDs for different printer types
        this.services = {
            // Generic printer service
            printer: '000018f0-0000-1000-8000-00805f9b34fb',
            // ESC/POS
            escpos: '000018f0-0000-1000-8000-00805f9b34fb',
            // CPCL
            cpcl: '38eb4a80-c570-11e3-9507-0002a5d5c51b',
            // ZPL
            zpl: '38eb4a80-c570-11e3-9507-0002a5d5c51b',
            // Serial Port Profile
            spp: '00001101-0000-1000-8000-00805f9b34fb'
        };
        
        // Characteristics for different printer types
        this.characteristics = {
            // Generic write characteristic
            write: '00002af1-0000-1000-8000-00805f9b34fb',
            // ESC/POS
            escpos: '00002af1-0000-1000-8000-00805f9b34fb',
            // CPCL
            cpcl: '38eb4a81-c570-11e3-9507-0002a5d5c51b',
            // ZPL
            zpl: '38eb4a81-c570-11e3-9507-0002a5d5c51b',
            // Serial Port Profile
            spp: '00001101-0000-1000-8000-00805f9b34fb'
        };
        
        // Command generators for different printer languages
        this.commandGenerators = {
            'ESC/POS': this.generateESCPOSCommands.bind(this),
            'CPCL': this.generateCPCLCommands.bind(this),
            'ZPL': this.generateZPLCommands.bind(this)
        };
        
        // Bind event handlers
        this.handleDisconnection = this.handleDisconnection.bind(this);
    }
    
    /**
     * Initialize adapter
     * @returns {BluetoothPrinterAdapter} This adapter instance
     */
    init() {
        // Check Web Bluetooth API support
        if (!navigator.bluetooth) {
            console.error('Web Bluetooth API is not supported in this browser');
            this.triggerError('Web Bluetooth API is not supported in this browser');
            return this;
        }
        
        // Check HTTPS requirement
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            console.error('Web Bluetooth API requires HTTPS');
            this.triggerError('Web Bluetooth API requires HTTPS');
            return this;
        }
        
        return this;
    }
    
    /**
     * Connect to Bluetooth printer
     * @param {boolean} [userInitiated=false] - Whether connection was initiated by user gesture
     * @returns {Promise<Object>} Promise resolving to connected device
     */
    connect(userInitiated = false) {
        // Already connected
        if (this.connected) {
            return Promise.resolve(this.device);
        }
        
        // Already attempting connection
        if (this.connecting) {
            return Promise.reject(new Error('Connection attempt already in progress'));
        }
        
        this.connecting = true;
        this.connectionAttempts++;
        
        // Options for device request
        const options = {
            filters: [],
            optionalServices: [
                this.services.printer,
                this.services.escpos,
                this.services.cpcl,
                this.services.zpl,
                this.services.spp
            ]
        };
        
        // Add name filter if provided
        if (this.config.deviceName) {
            options.filters.push({ name: this.config.deviceName });
        }
        
        // Add MAC address filter if provided (only works on some platforms)
        if (this.config.macAddress) {
            const formattedMac = this.config.macAddress.replace(/:/g, '').toLowerCase();
            options.filters.push({ services: [formattedMac] });
        }
        
        // If no filters specified, accept any printer
        if (options.filters.length === 0) {
            options.acceptAllDevices = true;
        }
        
        // Request device
        return navigator.bluetooth.requestDevice(options)
            .then(device => {
                this.device = device;
                this.device.addEventListener('gattserverdisconnected', this.handleDisconnection);
                
                // Connect to GATT server
                return this.device.gatt.connect();
            })
            .then(server => {
                // Find appropriate service based on vendor profile
                const serviceUUID = this.getServiceUUID();
                return server.getPrimaryService(serviceUUID);
            })
            .then(service => {
                // Get characteristic for writing
                const characteristicUUID = this.getCharacteristicUUID();
                return service.getCharacteristic(characteristicUUID);
            })
            .then(characteristic => {
                this.characteristic = characteristic;
                this.connected = true;
                this.connecting = false;
                this.connectionAttempts = 0;
                
                // Call connection callback
                if (typeof this.config.onConnect === 'function') {
                    this.config.onConnect(this.device);
                }
                
                return this.device;
            })
            .catch(error => {
                this.connecting = false;
                
                // Try again if under max attempts and auto-reconnect is enabled
                if (this.connectionAttempts < this.config.maxRetries && this.config.autoReconnect && !userInitiated) {
                    console.warn(`Bluetooth connection failed, retrying (${this.connectionAttempts}/${this.config.maxRetries})`);
                    return new Promise(resolve => {
                        setTimeout(() => {
                            resolve(this.connect());
                        }, 1000);
                    });
                }
                
                this.triggerError(`Failed to connect: ${error.message}`);
                throw error;
            });
    }
    
    /**
     * Disconnect from printer
     * @returns {Promise<void>} Promise resolving when disconnected
     */
    disconnect() {
        if (!this.device || !this.connected) {
            return Promise.resolve();
        }
        
        this.device.removeEventListener('gattserverdisconnected', this.handleDisconnection);
        
        if (this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        
        this.connected = false;
        this.device = null;
        this.characteristic = null;
        
        if (typeof this.config.onDisconnect === 'function') {
            this.config.onDisconnect();
        }
        
        return Promise.resolve();
    }
    
    /**
     * Print content
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
                return this.connect(true)
                    .then(() => this.print(job))
                    .then(resolve)
                    .catch(reject);
            }
            
            // Convert data to appropriate format
            let commands;
            
            if (job.format === 'command') {
                // Already in command format
                commands = job.data;
            } else if (job.format === 'raw') {
                // Raw text, convert to commands
                commands = this.textToCommands(job.data);
            } else {
                // HTML, render and convert to commands
                commands = this.htmlToCommands(job.data);
            }
            
            // Send commands to printer
            this.sendCommands(commands)
                .then(() => resolve({ success: true, device: this.device.name }))
                .catch(error => {
                    this.triggerError(`Print error: ${error.message}`);
                    reject(error);
                });
        });
    }
    
    /**
     * Send commands to printer
     * @param {Uint8Array|Array} commands - Command buffer or array of command buffers
     * @returns {Promise<void>} Promise resolving when commands are sent
     */
    sendCommands(commands) {
        if (!this.connected || !this.characteristic) {
            return Promise.reject(new Error('Not connected to printer'));
        }
        
        // If multiple command buffers, send sequentially
        if (Array.isArray(commands) && !(commands instanceof Uint8Array)) {
            return commands.reduce((chain, cmd) => {
                return chain.then(() => this.sendSingleCommand(cmd));
            }, Promise.resolve());
        }
        
        // Single command buffer
        return this.sendSingleCommand(commands);
    }
    
    /**
     * Send a single command to printer
     * @param {Uint8Array} command - Command buffer
     * @returns {Promise<void>} Promise resolving when command is sent
     */
    sendSingleCommand(command) {
        // Ensure command is Uint8Array
        if (!(command instanceof Uint8Array)) {
            if (typeof command === 'string') {
                command = new TextEncoder().encode(command);
            } else {
                command = new Uint8Array(command);
            }
        }
        
        // Send with write without response if available, otherwise use write value
        if (this.characteristic.properties.writeWithoutResponse) {
            return this.characteristic.writeValueWithoutResponse(command);
        } else {
            return this.characteristic.writeValue(command);
        }
    }
    
    /**
     * Handle disconnection event
     * @param {Event} event - Disconnection event
     */
    handleDisconnection(event) {
        this.connected = false;
        
        // Call disconnect callback
        if (typeof this.config.onDisconnect === 'function') {
            this.config.onDisconnect();
        }
        
        // Auto reconnect if enabled
        if (this.config.autoReconnect) {
            console.log('Bluetooth printer disconnected, attempting to reconnect...');
            
            // Delay reconnect to avoid rapid reconnect attempts
            setTimeout(() => {
                this.connect().catch(error => {
                    console.error('Failed to reconnect:', error);
                });
            }, 2000);
        }
    }
    
    /**
     * Convert HTML to printer commands
     * @param {string} html - HTML content
     * @returns {Uint8Array} Command buffer
     */
    htmlToCommands(html) {
        // Simplified for demo, would normally use a proper HTML renderer
        // Extract text content from HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const text = tempDiv.textContent || tempDiv.innerText || '';
        
        // Convert text to commands based on vendor profile
        return this.textToCommands(text);
    }
    
    /**
     * Convert text to printer commands
     * @param {string} text - Text content
     * @returns {Uint8Array} Command buffer
     */
    textToCommands(text) {
        // Get command generator for vendor profile
        const generator = this.commandGenerators[this.config.vendorProfile] || this.generateESCPOSCommands;
        
        // Generate commands
        return generator(text);
    }
    
    /**
     * Generate ESC/POS commands
     * @param {string} text - Text content
     * @returns {Uint8Array} Command buffer
     */
    generateESCPOSCommands(text) {
        // Initialize commands with ESC @ (initialize printer)
        const init = [0x1B, 0x40];
        
        // Convert text to bytes
        const textBytes = new TextEncoder().encode(text);
        
        // Add line feeds and cut command
        const feed = [0x0A, 0x0A, 0x0A, 0x0A];
        const cut = [0x1D, 0x56, 0x41, 0x03]; // GS V A 3 (partial cut)
        
        // Combine all commands
        const commands = new Uint8Array(init.length + textBytes.length + feed.length + cut.length);
        commands.set(init, 0);
        commands.set(textBytes, init.length);
        commands.set(feed, init.length + textBytes.length);
        commands.set(cut, init.length + textBytes.length + feed.length);
        
        return commands;
    }
    
    /**
     * Generate CPCL commands
     * @param {string} text - Text content
     * @returns {Uint8Array} Command buffer
     */
    generateCPCLCommands(text) {
        // Very simplified CPCL command generation
        const lines = text.split('\n');
        let cpcl = '! 0 200 200 400 1\r\n'; // Header
        
        // Add text lines
        lines.forEach((line, index) => {
            if (line.trim()) {
                cpcl += `TEXT 0 0 10 ${50 + index * 30} ${line}\r\n`;
            }
        });
        
        // Add form feed and end
        cpcl += 'FORM\r\nPRINT\r\n';
        
        return new TextEncoder().encode(cpcl);
    }
    
    /**
     * Generate ZPL commands
     * @param {string} text - Text content
     * @returns {Uint8Array} Command buffer
     */
    generateZPLCommands(text) {
        // Very simplified ZPL command generation
        const lines = text.split('\n');
        let zpl = '^XA'; // Start format
        
        // Add text lines
        lines.forEach((line, index) => {
            if (line.trim()) {
                zpl += `^FO20,${50 + index * 30}^A0N,30,30^FD${line}^FS`;
            }
        });
        
        // End format
        zpl += '^XZ';
        
        return new TextEncoder().encode(zpl);
    }
    
    /**
     * Get appropriate service UUID based on vendor profile
     * @returns {string} Service UUID
     */
    getServiceUUID() {
        const profile = this.config.vendorProfile.toUpperCase();
        
        switch (profile) {
            case 'ESC/POS':
                return this.services.escpos;
            case 'CPCL':
                return this.services.cpcl;
            case 'ZPL':
                return this.services.zpl;
            default:
                return this.services.printer;
        }
    }
    
    /**
     * Get appropriate characteristic UUID based on vendor profile
     * @returns {string} Characteristic UUID
     */
    getCharacteristicUUID() {
        const profile = this.config.vendorProfile.toUpperCase();
        
        switch (profile) {
            case 'ESC/POS':
                return this.characteristics.escpos;
            case 'CPCL':
                return this.characteristics.cpcl;
            case 'ZPL':
                return this.characteristics.zpl;
            default:
                return this.characteristics.write;
        }
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
            vendorProfiles: Object.keys(this.commandGenerators),
            currentProfile: this.config.vendorProfile,
            connectedDevice: this.device ? {
                name: this.device.name,
                id: this.device.id
            } : null,
            connected: this.connected,
            https: window.location.protocol === 'https:',
            webBluetoothSupported: !!navigator.bluetooth
        };
    }
}

// Export for module usage
if (typeof module !== 'undefined') {
    module.exports = BluetoothPrinterAdapter;
} else {
    window.IMOGIPrintBluetoothAdapter = BluetoothPrinterAdapter;
}