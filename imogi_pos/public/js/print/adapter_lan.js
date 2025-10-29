/**
 * IMOGI POS - LAN Printer Adapter
 *
 * Enables direct printing to network printers through the Frappe backend.
 * The adapter forwards print jobs to the server where they are converted to
 * printer-friendly bytes and dispatched over TCP/IP using the configured
 * printer host and port.
 */

class LANPrinterAdapter {
  /**
   * Create LAN printer adapter
   * @param {Object} config - Adapter configuration from backend
   * @param {Object} [config.adapter_config] - Printer connection details
   * @param {string} [config.adapter_config.host] - Printer host / IP
   * @param {number} [config.adapter_config.port=9100] - Printer port
   * @param {number} [config.adapter_config.paper_width_mm] - Paper width hint
   * @param {Function} [config.onConnect] - Callback when connected
   * @param {Function} [config.onDisconnect] - Callback when disconnected
   * @param {Function} [config.onError] - Callback when error occurs
   */
  constructor(config = {}) {
    this.profileConfig = Object.assign({}, config);
    this.callbacks = {
      onConnect: config.onConnect,
      onDisconnect: config.onDisconnect,
      onError: config.onError
    };

    const adapterConfig = Object.assign(
      {
        host: null,
        port: 9100,
        timeout: 5000,
        paper_width_mm: config.paper_width_mm || 80
      },
      config.adapter_config || {}
    );

    if (!adapterConfig.paper_width_mm && config.paper_width_mm) {
      adapterConfig.paper_width_mm = config.paper_width_mm;
    }

    this.config = adapterConfig;
    this.adapterType = 'LAN';
    this.connected = false;
  }

  /**
   * Initialise adapter (no-op besides basic validation)
   * @returns {LANPrinterAdapter} Adapter instance
   */
  init() {
    if (!this.config.host) {
      console.warn('IMOGI LAN adapter: printer host is not configured');
    }

    return this;
  }

  /**
   * "Connect" to LAN printer. We simply ensure configuration exists and
   * return a resolved promise because the actual socket connection happens on
   * the server during printing.
   *
   * @returns {Promise<Object>} Promise resolving to connection info
   */
  connect() {
    if (!this.config.host) {
      const error = new Error('LAN printer host/IP is not configured');
      this.triggerError(error.message);
      return Promise.reject(error);
    }

    this.connected = true;

    if (typeof this.callbacks.onConnect === 'function') {
      this.callbacks.onConnect({
        host: this.config.host,
        port: this.config.port
      });
    }

    return Promise.resolve({
      host: this.config.host,
      port: this.config.port
    });
  }

  /**
   * Disconnect from printer (no-op, provided for interface parity)
   * @returns {Promise<void>} Promise resolving immediately
   */
  disconnect() {
    this.connected = false;

    if (typeof this.callbacks.onDisconnect === 'function') {
      this.callbacks.onDisconnect();
    }

    return Promise.resolve();
  }

  /**
   * Dispatch a print job through the backend.
   * @param {Object} job - Print job data from IMOGIPrintService
   * @returns {Promise<Object>} Promise resolving when the print job completes
   */
  print(job) {
    if (!job) {
      return Promise.reject(new Error('Invalid print job'));
    }

    if (typeof frappe === 'undefined' || !frappe.call) {
      const error = new Error('frappe.call is not available for LAN printing');
      this.triggerError(error.message);
      return Promise.reject(error);
    }

    const adapterConfig = Object.assign({}, this.config);

    // Allow job options to override paper width hint when provided
    if (job.options && job.options.paper_width_mm && !adapterConfig.paper_width_mm) {
      adapterConfig.paper_width_mm = job.options.paper_width_mm;
    }

    const payload = {
      interface: 'LAN',
      adapter_config: adapterConfig,
      job: {
        type: job.type,
        format: job.format || 'html',
        copies: job.copies || 1,
        data: job.data,
        options: job.options || {}
      }
    };

    return frappe
      .call({
        method: 'imogi_pos.api.printing.submit_print_job',
        args: payload,
        freeze: false
      })
      .then((response) => {
        const message = response && response.message ? response.message : response;
        if (message && message.success) {
          return message;
        }

        const errorMessage = (message && message.error) || 'LAN print failed';
        throw new Error(errorMessage);
      })
      .catch((error) => {
        const err = error instanceof Error ? error : new Error(this.parseServerError(error));
        this.triggerError(err.message);
        throw err;
      });
  }

  /**
   * Extract human readable error from Frappe response
   * @param {any} errorResponse - Error from frappe.call
   * @returns {string} Parsed error message
   */
  parseServerError(errorResponse) {
    if (!errorResponse) {
      return 'Unknown printing error';
    }

    if (errorResponse._server_messages) {
      try {
        const messages = JSON.parse(errorResponse._server_messages);
        if (messages && messages.length) {
          const messageText = messages
            .map((m) => {
              if (typeof frappe !== 'undefined' && frappe.utils && frappe.utils.strip_html) {
                return frappe.utils.strip_html(m);
              }
              return m;
            })
            .join('\n');
          if (typeof frappe !== 'undefined' && frappe.utils && frappe.utils.strip_html) {
            return frappe.utils.strip_html(messageText);
          }
          return messageText;
        }
      } catch (e) {
        // Ignore JSON parse errors and fall through
      }
    }

    if (errorResponse.message) {
      return errorResponse.message;
    }

    if (typeof errorResponse === 'string') {
      return errorResponse;
    }

    return 'Failed to communicate with printer server';
  }

  /**
   * Trigger configured error callback if available
   * @param {string} message - Error message
   */
  triggerError(message) {
    console.error('IMOGI LAN adapter:', message);
    if (typeof this.callbacks.onError === 'function') {
      this.callbacks.onError(message);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LANPrinterAdapter;
}

if (typeof window !== 'undefined') {
  window.IMOGIPrintLANAdapter = LANPrinterAdapter;
}
