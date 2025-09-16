/**
 * IMOGI POS - Kitchen Display
 * 
 * Main module for the Kitchen Display System (KDS)
 * Handles:
 * - KOT item display across queued/in-progress/ready columns
 * - KOT status management
 * - SLA monitoring
 * - KOT printing and reprinting
 * - Kitchen stations filtering
 */

frappe.provide('imogi_pos.kitchen_display');

imogi_pos.kitchen_display = {
    // Settings and state
    settings: {
        branch: null,
        kitchen: null,
        station: null,
        refreshInterval: 30000, // 30 seconds
        slaThresholds: {
            warning: 5 * 60, // 5 minutes
            critical: 10 * 60 // 10 minutes
        },
        sound: {
            enabled: true,
            newKot: true,
            slaWarning: true,
            slaCritical: true
        }
    },
    state: {
        kots: {
            queued: [],
            preparing: [],
            ready: []
        },
        filteredKots: {
            queued: [],
            preparing: [],
            ready: []
        },
        kitchens: [],
        stations: [],
        refreshTimer: null,
        searchTerm: '',
        viewMode: 'full', // full, compact
        filterByItem: null,
        sortMode: 'time', // time, priority, table
        selectedKot: null,
        audioContext: null
    },
    
    /**
     * Initialize the Kitchen Display
     * @param {Object} options - Configuration options
     */
    init: function(options = {}) {
        this.options = Object.assign({
            container: '#kitchen-display',
            kitchenSelector: '#kitchen-selector',
            stationSelector: '#station-selector',
            branchSelector: '#branch-selector',
            refreshInterval: 30000 // 30 seconds
        }, options);
        
        this.container = document.querySelector(this.options.container);
        if (!this.container) {
            console.error('Kitchen Display container not found');
            return;
        }
        
        // Initialize components
        this.initializeNavigation();
        this.initializeAudio();
        this.loadSettings()
            .then(() => {
                this.renderUI();
                this.bindEvents();
                this.loadKitchens()
                    .then(() => {
                        this.loadKotTickets();
                        this.setupRefreshInterval();
                        this.setupRealTimeUpdates();
                    });
            })
            .catch(err => {
                console.error('Failed to initialize Kitchen Display:', err);
                this.showError('Failed to initialize Kitchen Display. Please refresh the page.');
            });
    },
    
    /**
     * Initialize navigation with IMOGINav
     */
    initializeNavigation: function() {
        if (window.IMOGINav) {
            IMOGINav.init({
                container: '#imogi-header',
                showBack: true,
                showBranch: true,
                showLogo: true,
                backUrl: '/app',
                onBranchChange: (branch) => {
                    this.settings.branch = branch;
                    this.loadKitchens().then(() => this.loadKotTickets());
                }
            });
        }
    },
    
    /**
     * Initialize audio context for sounds
     */
    initializeAudio: function() {
        try {
            // Initialize audio context
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.state.audioContext = new AudioContext();
        } catch (e) {
            console.warn('Web Audio API not supported in this browser');
        }
    },
    
    /**
     * Load settings from localStorage or defaults
     * @returns {Promise} Promise resolving when settings are loaded
     */
    loadSettings: function() {
        return new Promise((resolve) => {
            // Try to load from localStorage
            const savedSettings = localStorage.getItem('imogi_kitchen_display_settings');
            if (savedSettings) {
                try {
                    const parsedSettings = JSON.parse(savedSettings);
                    this.settings = Object.assign({}, this.settings, parsedSettings);
                } catch (e) {
                    console.warn('Failed to parse saved settings');
                }
            }
            
            // Always update the refresh interval from options
            this.settings.refreshInterval = this.options.refreshInterval;
            
            resolve();
        });
    },
    
    /**
     * Save settings to localStorage
     */
    saveSettings: function() {
        localStorage.setItem('imogi_kitchen_display_settings', JSON.stringify({
            kitchen: this.settings.kitchen,
            station: this.settings.station,
            viewMode: this.state.viewMode,
            sortMode: this.state.sortMode,
            sound: this.settings.sound
        }));
    },
    
    /**
     * Load kitchens and stations
     * @returns {Promise} Promise resolving when kitchens are loaded
     */
    loadKitchens: function() {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'imogi_pos.api.kot.get_kitchens_and_stations',
                args: {
                    branch: this.settings.branch
                },
                callback: (response) => {
                    if (response.message) {
                        this.state.kitchens = response.message.kitchens || [];
                        this.state.stations = response.message.stations || [];
                        
                        // Populate kitchen selector
                        this.populateKitchenSelector();
                        
                        resolve();
                    } else {
                        reject(new Error('Failed to load kitchens'));
                    }
                },
                error: reject
            });
        });
    },
    
    /**
     * Populate kitchen selector dropdown
     */
    populateKitchenSelector: function() {
        const kitchenSelector = document.querySelector(this.options.kitchenSelector);
        const stationSelector = document.querySelector(this.options.stationSelector);
        
        if (!kitchenSelector || !stationSelector) return;
        
        // Clear existing options
        kitchenSelector.innerHTML = '<option value="">All Kitchens</option>';
        stationSelector.innerHTML = '<option value="">All Stations</option>';
        
        // Add kitchen options
        this.state.kitchens.forEach(kitchen => {
            const option = document.createElement('option');
            option.value = kitchen.name;
            option.textContent = kitchen.kitchen_name;
            kitchenSelector.appendChild(option);
        });
        
        // Add station options
        this.state.stations.forEach(station => {
            const option = document.createElement('option');
            option.value = station.name;
            option.textContent = station.station_name;
            stationSelector.appendChild(option);
        });
        
        // Set selected values from settings
        if (this.settings.kitchen) {
            kitchenSelector.value = this.settings.kitchen;
        }
        
        if (this.settings.station) {
            stationSelector.value = this.settings.station;
        }
        
        // Bind change events
        kitchenSelector.addEventListener('change', () => {
            this.settings.kitchen = kitchenSelector.value;
            this.saveSettings();
            this.loadKotTickets();
        });
        
        stationSelector.addEventListener('change', () => {
            this.settings.station = stationSelector.value;
            this.saveSettings();
            this.loadKotTickets();
        });
    },
    
    /**
     * Set up refresh interval
     */
    setupRefreshInterval: function() {
        // Clear any existing timer
        if (this.state.refreshTimer) {
            clearInterval(this.state.refreshTimer);
        }
        
        // Set up new refresh timer
        this.state.refreshTimer = setInterval(() => {
            this.loadKotTickets();
        }, this.settings.refreshInterval);
    },
    
    /**
     * Set up realtime updates
     */
    setupRealTimeUpdates: function() {
        // Listen for updates on all kitchens
        frappe.realtime.on('kitchen:all', (data) => {
            if (data && data.action) {
                this.handleKitchenUpdate(data);
            }
        });
        
        // Listen for updates on specific kitchen
        if (this.settings.kitchen) {
            frappe.realtime.on(`kitchen:${this.settings.kitchen}`, (data) => {
                if (data && data.action) {
                    this.handleKitchenUpdate(data);
                }
            });
        }
        
        // Listen for updates on specific station
        if (this.settings.station) {
            frappe.realtime.on(`kitchen:station:${this.settings.station}`, (data) => {
                if (data && data.action) {
                    this.handleKitchenUpdate(data);
                }
            });
        }
    },
    
    /**
     * Handle kitchen updates from realtime
     * @param {Object} data - Update data
     */
    handleKitchenUpdate: function(data) {
        switch (data.action) {
            case 'new_kot':
                if (data.kot) {
                    this.updateKotInState(data.kot);
                    this.playSound('new_kot');
                }
                break;
            
            case 'update_kot':
                if (data.kot) {
                    this.updateKotInState(data.kot);
                }
                break;
            
            case 'update_kot_status':
                if (data.kot_name && data.status) {
                    this.updateKotStatus(data.kot_name, data.status);
                }
                break;
            
            case 'update_item_status':
                if (data.kot_name && data.item_idx !== undefined && data.status) {
                    this.updateKotItemStatus(data.kot_name, data.item_idx, data.status);
                }
                break;
            
            case 'delete_kot':
                if (data.kot_name) {
                    this.removeKotFromState(data.kot_name);
                }
                break;
        }
    },
    
    /**
     * Load KOT tickets from server
     */
    loadKotTickets: function() {
        frappe.call({
            method: 'imogi_pos.api.kot.get_kots_for_kitchen',
            args: {
                kitchen: this.settings.kitchen,
                station: this.settings.station,
                branch: this.settings.branch
            },
            callback: (response) => {
                if (response.message) {
                    // Group KOTs by status
                    const kots = {
                        queued: [],
                        preparing: [],
                        ready: []
                    };
                    
                    // Process each KOT
                    response.message.forEach(kot => {
                        switch (kot.workflow_state) {
                            case 'Queued':
                                kots.queued.push(kot);
                                break;
                            case 'In Progress':
                                kots.preparing.push(kot);
                                break;
                            case 'Ready':
                                kots.ready.push(kot);
                                break;
                        }
                    });
                    
                    // Update state
                    this.state.kots = kots;
                    
                    // Apply filters and sorting
                    this.filterAndSortKots();
                    
                    // Update UI
                    this.renderKotColumns();
                    
                    // Check SLA status
                    this.checkSlaBreach();
                } else {
                    console.error('Failed to load KOT tickets');
                }
            },
            error: (err) => {
                console.error('Error loading KOT tickets:', err);
            }
        });
    },
    
    /**
     * Apply filters and sorting to KOTs
     */
    filterAndSortKots: function() {
        const filteredKots = {
            queued: [...this.state.kots.queued],
            preparing: [...this.state.kots.preparing],
            ready: [...this.state.kots.ready]
        };
        
        // Apply search filter if set
        if (this.state.searchTerm) {
            const searchTerm = this.state.searchTerm.toLowerCase();
            
            Object.keys(filteredKots).forEach(status => {
                filteredKots[status] = filteredKots[status].filter(kot => {
                    // Search in KOT name
                    if (kot.name.toLowerCase().includes(searchTerm)) return true;
                    
                    // Search in table name
                    if (kot.table_name && kot.table_name.toLowerCase().includes(searchTerm)) return true;
                    
                    // Search in order name
                    if (kot.pos_order && kot.pos_order.toLowerCase().includes(searchTerm)) return true;
                    
                    // Search in items
                    if (kot.items && kot.items.some(item => 
                        item.item_name.toLowerCase().includes(searchTerm) ||
                        (item.notes && item.notes.toLowerCase().includes(searchTerm))
                    )) return true;
                    
                    return false;
                });
            });
        }
        
        // Apply item filter if set
        if (this.state.filterByItem) {
            Object.keys(filteredKots).forEach(status => {
                filteredKots[status] = filteredKots[status].filter(kot => {
                    return kot.items && kot.items.some(item => item.item === this.state.filterByItem);
                });
            });
        }
        
        // Apply sorting
        Object.keys(filteredKots).forEach(status => {
            switch (this.state.sortMode) {
                case 'time':
                    // Sort by creation time (oldest first)
                    filteredKots[status].sort((a, b) => new Date(a.creation) - new Date(b.creation));
                    break;
                
                case 'priority':
                    // Sort by priority (highest first), then by creation time
                    filteredKots[status].sort((a, b) => {
                        const aPriority = a.priority || 0;
                        const bPriority = b.priority || 0;
                        if (bPriority !== aPriority) {
                            return bPriority - aPriority;
                        }
                        return new Date(a.creation) - new Date(b.creation);
                    });
                    break;
                
                case 'table':
                    // Sort by table name
                    filteredKots[status].sort((a, b) => {
                        if (!a.table_name && !b.table_name) return 0;
                        if (!a.table_name) return 1;
                        if (!b.table_name) return -1;
                        return a.table_name.localeCompare(b.table_name);
                    });
                    break;
            }
        });
        
        // Update filtered state
        this.state.filteredKots = filteredKots;
    },
    
    /**
     * Check for SLA breaches and play sounds if needed
     */
    checkSlaBreach: function() {
        const now = new Date();
        
        // Check queued and preparing KOTs for SLA breach
        ['queued', 'preparing'].forEach(status => {
            this.state.filteredKots[status].forEach(kot => {
                const kotDate = new Date(kot.creation);
                const elapsedSeconds = Math.floor((now - kotDate) / 1000);
                
                // Check against thresholds
                if (elapsedSeconds > this.settings.slaThresholds.critical) {
                    this.playSound('sla_critical');
                } else if (elapsedSeconds > this.settings.slaThresholds.warning) {
                    this.playSound('sla_warning');
                }
            });
        });
    },
    
    /**
     * Update a KOT in the state
     * @param {Object} kot - Updated KOT data
     */
    updateKotInState: function(kot) {
        // First remove the KOT from all status lists if it exists
        this.removeKotFromState(kot.name);
        
        // Then add to the appropriate list based on current status
        switch (kot.workflow_state) {
            case 'Queued':
                this.state.kots.queued.push(kot);
                break;
            case 'In Progress':
                this.state.kots.preparing.push(kot);
                break;
            case 'Ready':
                this.state.kots.ready.push(kot);
                break;
        }
        
        // Re-apply filters and sorting
        this.filterAndSortKots();
        
        // Update UI
        this.renderKotColumns();
    },
    
    /**
     * Remove a KOT from the state
     * @param {string} kotName - KOT name to remove
     */
    removeKotFromState: function(kotName) {
        // Remove from all status lists
        Object.keys(this.state.kots).forEach(status => {
            this.state.kots[status] = this.state.kots[status].filter(kot => kot.name !== kotName);
        });
        
        // Re-apply filters and sorting
        this.filterAndSortKots();
        
        // Update UI
        this.renderKotColumns();
    },
    
    /**
     * Update KOT status
     * @param {string} kotName - KOT name
     * @param {string} status - New status
     */
    updateKotStatus: function(kotName, status) {
        // Find the KOT in any of the lists
        let kot = null;
        let currentStatus = null;
        
        Object.keys(this.state.kots).forEach(statusKey => {
            const foundKot = this.state.kots[statusKey].find(k => k.name === kotName);
            if (foundKot) {
                kot = foundKot;
                currentStatus = statusKey;
            }
        });
        
        if (!kot) return;
        
        // Map status string to state key
        const statusMap = {
            'Queued': 'queued',
            'In Progress': 'preparing',
            'Ready': 'ready',
            'Served': null, // Remove from KDS when served
            'Cancelled': null // Remove from KDS when cancelled
        };
        
        const newStatusKey = statusMap[status];
        
        // If status is Served or Cancelled, remove from state
        if (newStatusKey === null) {
            this.removeKotFromState(kotName);
            return;
        }
        
        // If status has changed, move the KOT
        if (newStatusKey !== currentStatus) {
            // Remove from current status list
            this.state.kots[currentStatus] = this.state.kots[currentStatus].filter(k => k.name !== kotName);
            
            // Update the KOT status
            kot.workflow_state = status;
            
            // Add to new status list
            this.state.kots[newStatusKey].push(kot);
            
            // Re-apply filters and sorting
            this.filterAndSortKots();
            
            // Update UI
            this.renderKotColumns();
        }
    },
    
    /**
     * Update KOT item status
     * @param {string} kotName - KOT name
     * @param {number} itemIdx - Item index
     * @param {string} status - New status
     */
    updateKotItemStatus: function(kotName, itemIdx, status) {
        // Find the KOT in any of the lists
        let kot = null;
        let statusKey = null;
        
        Object.keys(this.state.kots).forEach(key => {
            const foundKot = this.state.kots[key].find(k => k.name === kotName);
            if (foundKot) {
                kot = foundKot;
                statusKey = key;
            }
        });
        
        if (!kot || !kot.items || !kot.items[itemIdx]) return;
        
        // Update the item status
        kot.items[itemIdx].status = status;
        
        // Re-render the KOT card
        const kotCard = this.container.querySelector(`.kot-card[data-kot="${kotName}"]`);
        if (kotCard) {
            this.renderKotCard(kotCard, kot);
        }
    },
    
    /**
     * Render the main UI
     */
    renderUI: function() {
        this.container.innerHTML = `
            <div class="kitchen-display-layout ${this.state.viewMode === 'compact' ? 'compact-view' : ''}">
                <div class="kitchen-controls">
                    <div class="search-container">
                        <input type="text" id="kot-search" placeholder="Search orders..." class="search-input">
                        <button id="search-btn" class="search-button">
                            <i class="fa fa-search"></i>
                        </button>
                    </div>
                    <div class="view-controls">
                        <button id="refresh-btn" class="control-button" title="Refresh">
                            <i class="fa fa-sync"></i>
                        </button>
                        <button id="view-mode-btn" class="control-button" title="${this.state.viewMode === 'compact' ? 'Switch to Full View' : 'Switch to Compact View'}">
                            <i class="fa ${this.state.viewMode === 'compact' ? 'fa-expand' : 'fa-compress'}"></i>
                        </button>
                        <button id="sort-mode-btn" class="control-button" title="Sort: ${this.state.sortMode}">
                            <i class="fa fa-sort"></i>
                        </button>
                        <button id="sound-toggle-btn" class="control-button ${this.settings.sound.enabled ? 'active' : ''}" title="${this.settings.sound.enabled ? 'Mute Sounds' : 'Enable Sounds'}">
                            <i class="fa ${this.settings.sound.enabled ? 'fa-volume-up' : 'fa-volume-mute'}"></i>
                        </button>
                        <button id="settings-btn" class="control-button" title="Settings">
                            <i class="fa fa-cog"></i>
                        </button>
                    </div>
                </div>
                
                <div class="kitchen-columns">
                    <div class="kitchen-column queued-column">
                        <div class="column-header">
                            <h3>Queued</h3>
                            <div class="column-count" id="queued-count">0</div>
                        </div>
                        <div class="column-content" id="queued-container"></div>
                    </div>
                    
                    <div class="kitchen-column preparing-column">
                        <div class="column-header">
                            <h3>In Progress</h3>
                            <div class="column-count" id="preparing-count">0</div>
                        </div>
                        <div class="column-content" id="preparing-container"></div>
                    </div>
                    
                    <div class="kitchen-column ready-column">
                        <div class="column-header">
                            <h3>Ready</h3>
                            <div class="column-count" id="ready-count">0</div>
                        </div>
                        <div class="column-content" id="ready-container"></div>
                    </div>
                </div>
            </div>
            
            <div id="modal-container" class="modal-container"></div>
            <div id="toast-container" class="toast-container"></div>
        `;
        
        // Bind events
        this.bindEvents();
    },
    
    /**
     * Bind event listeners
     */
    bindEvents: function() {
        // Search input
        const searchInput = this.container.querySelector('#kot-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.state.searchTerm = searchInput.value;
                this.filterAndSortKots();
                this.renderKotColumns();
            });
        }
        
        // Search button
        const searchBtn = this.container.querySelector('#search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.filterAndSortKots();
                this.renderKotColumns();
            });
        }
        
        // Refresh button
        const refreshBtn = this.container.querySelector('#refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadKotTickets();
            });
        }
        
        // View mode button
        const viewModeBtn = this.container.querySelector('#view-mode-btn');
        if (viewModeBtn) {
            viewModeBtn.addEventListener('click', () => {
                this.toggleViewMode();
            });
        }
        
        // Sort mode button
        const sortModeBtn = this.container.querySelector('#sort-mode-btn');
        if (sortModeBtn) {
            sortModeBtn.addEventListener('click', () => {
                this.toggleSortMode();
            });
        }
        
        // Sound toggle button
        const soundToggleBtn = this.container.querySelector('#sound-toggle-btn');
        if (soundToggleBtn) {
            soundToggleBtn.addEventListener('click', () => {
                this.toggleSound();
            });
        }
        
        // Settings button
        const settingsBtn = this.container.querySelector('#settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.showSettings();
            });
        }
    },
    
    /**
     * Toggle view mode between full and compact
     */
    toggleViewMode: function() {
        this.state.viewMode = this.state.viewMode === 'full' ? 'compact' : 'full';
        this.saveSettings();
        
        // Update container class
        this.container.querySelector('.kitchen-display-layout').classList.toggle('compact-view', this.state.viewMode === 'compact');
        
        // Update button icon
        const viewModeBtn = this.container.querySelector('#view-mode-btn');
        if (viewModeBtn) {
            viewModeBtn.innerHTML = `<i class="fa ${this.state.viewMode === 'compact' ? 'fa-expand' : 'fa-compress'}"></i>`;
            viewModeBtn.title = this.state.viewMode === 'compact' ? 'Switch to Full View' : 'Switch to Compact View';
        }
        
        // Re-render columns to apply new view mode
        this.renderKotColumns();
    },
    
    /**
     * Toggle sort mode between time, priority, and table
     */
    toggleSortMode: function() {
        // Cycle through sort modes
        const sortModes = ['time', 'priority', 'table'];
        const currentIndex = sortModes.indexOf(this.state.sortMode);
        const nextIndex = (currentIndex + 1) % sortModes.length;
        this.state.sortMode = sortModes[nextIndex];
        this.saveSettings();
        
        // Update button title
        const sortModeBtn = this.container.querySelector('#sort-mode-btn');
        if (sortModeBtn) {
            sortModeBtn.title = `Sort: ${this.state.sortMode}`;
        }
        
        // Re-apply filters and sorting
        this.filterAndSortKots();
        this.renderKotColumns();
    },
    
    /**
     * Toggle sound on/off
     */
    toggleSound: function() {
        this.settings.sound.enabled = !this.settings.sound.enabled;
        this.saveSettings();
        
        // Update button
        const soundToggleBtn = this.container.querySelector('#sound-toggle-btn');
        if (soundToggleBtn) {
            soundToggleBtn.classList.toggle('active', this.settings.sound.enabled);
            soundToggleBtn.innerHTML = `<i class="fa ${this.settings.sound.enabled ? 'fa-volume-up' : 'fa-volume-mute'}"></i>`;
            soundToggleBtn.title = this.settings.sound.enabled ? 'Mute Sounds' : 'Enable Sounds';
        }
    },
    
    /**
     * Show settings modal
     */
    showSettings: function() {
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Kitchen Display Settings</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="settings-section">
                            <h4>Sound Settings</h4>
                            <div class="setting-row">
                                <label class="switch">
                                    <input type="checkbox" id="sound-enabled" ${this.settings.sound.enabled ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                                <span class="setting-label">Enable Sounds</span>
                            </div>
                            <div class="setting-row ${this.settings.sound.enabled ? '' : 'disabled'}">
                                <label class="switch">
                                    <input type="checkbox" id="sound-new-kot" ${this.settings.sound.newKot ? 'checked' : ''} ${this.settings.sound.enabled ? '' : 'disabled'}>
                                    <span class="slider round"></span>
                                </label>
                                <span class="setting-label">New KOT Alert</span>
                                <button class="test-sound-btn" data-sound="new_kot" ${this.settings.sound.enabled ? '' : 'disabled'}>Test</button>
                            </div>
                            <div class="setting-row ${this.settings.sound.enabled ? '' : 'disabled'}">
                                <label class="switch">
                                    <input type="checkbox" id="sound-sla-warning" ${this.settings.sound.slaWarning ? 'checked' : ''} ${this.settings.sound.enabled ? '' : 'disabled'}>
                                    <span class="slider round"></span>
                                </label>
                                <span class="setting-label">SLA Warning Alert</span>
                                <button class="test-sound-btn" data-sound="sla_warning" ${this.settings.sound.enabled ? '' : 'disabled'}>Test</button>
                            </div>
                            <div class="setting-row ${this.settings.sound.enabled ? '' : 'disabled'}">
                                <label class="switch">
                                    <input type="checkbox" id="sound-sla-critical" ${this.settings.sound.slaCritical ? 'checked' : ''} ${this.settings.sound.enabled ? '' : 'disabled'}>
                                    <span class="slider round"></span>
                                </label>
                                <span class="setting-label">SLA Critical Alert</span>
                                <button class="test-sound-btn" data-sound="sla_critical" ${this.settings.sound.enabled ? '' : 'disabled'}>Test</button>
                            </div>
                        </div>
                        
                        <div class="settings-section">
                            <h4>SLA Thresholds</h4>
                            <div class="setting-row">
                                <label for="sla-warning">Warning Threshold (minutes)</label>
                                <input type="number" id="sla-warning" class="setting-input" min="1" max="60" value="${Math.floor(this.settings.slaThresholds.warning / 60)}">
                            </div>
                            <div class="setting-row">
                                <label for="sla-critical">Critical Threshold (minutes)</label>
                                <input type="number" id="sla-critical" class="setting-input" min="1" max="60" value="${Math.floor(this.settings.slaThresholds.critical / 60)}">
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="save-settings-btn" class="modal-button primary">Save Settings</button>
                        <button id="cancel-settings-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        // Show modal
        modalContainer.classList.add('active');
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
            });
        }
        
        // Bind cancel button
        const cancelBtn = modalContainer.querySelector('#cancel-settings-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
            });
        }
        
        // Bind sound enabled checkbox
        const soundEnabledCheckbox = modalContainer.querySelector('#sound-enabled');
        if (soundEnabledCheckbox) {
            soundEnabledCheckbox.addEventListener('change', () => {
                const enabled = soundEnabledCheckbox.checked;
                
                // Update dependent inputs
                modalContainer.querySelectorAll('#sound-new-kot, #sound-sla-warning, #sound-sla-critical').forEach(checkbox => {
                    checkbox.disabled = !enabled;
                });
                
                modalContainer.querySelectorAll('.test-sound-btn').forEach(button => {
                    button.disabled = !enabled;
                });
                
                modalContainer.querySelectorAll('.setting-row').forEach(row => {
                    if (row.classList.contains('disabled') && enabled) {
                        row.classList.remove('disabled');
                    } else if (!row.classList.contains('disabled') && !enabled) {
                        row.classList.add('disabled');
                    }
                });
            });
        }
        
        // Bind test sound buttons
        modalContainer.querySelectorAll('.test-sound-btn').forEach(button => {
            button.addEventListener('click', () => {
                const sound = button.dataset.sound;
                this.playSound(sound);
            });
        });
        
        // Bind save button
        const saveBtn = modalContainer.querySelector('#save-settings-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                // Get values from form
                const soundEnabled = modalContainer.querySelector('#sound-enabled').checked;
                const soundNewKot = modalContainer.querySelector('#sound-new-kot').checked;
                const soundSlaWarning = modalContainer.querySelector('#sound-sla-warning').checked;
                const soundSlaCritical = modalContainer.querySelector('#sound-sla-critical').checked;
                
                const slaWarningMinutes = parseInt(modalContainer.querySelector('#sla-warning').value) || 5;
                const slaCriticalMinutes = parseInt(modalContainer.querySelector('#sla-critical').value) || 10;
                
                // Update settings
                this.settings.sound = {
                    enabled: soundEnabled,
                    newKot: soundNewKot,
                    slaWarning: soundSlaWarning,
                    slaCritical: soundSlaCritical
                };
                
                this.settings.slaThresholds = {
                    warning: slaWarningMinutes * 60,
                    critical: slaCriticalMinutes * 60
                };
                
                // Save settings
                this.saveSettings();
                
                // Update UI
                this.toggleSound();
                
                // Close modal
                modalContainer.classList.remove('active');
            });
        }
    },
    
    /**
     * Render KOT columns
     */
    renderKotColumns: function() {
        const queuedContainer = this.container.querySelector('#queued-container');
        const preparingContainer = this.container.querySelector('#preparing-container');
        const readyContainer = this.container.querySelector('#ready-container');
        
        if (!queuedContainer || !preparingContainer || !readyContainer) return;
        
        // Update counts
        this.container.querySelector('#queued-count').textContent = this.state.filteredKots.queued.length;
        this.container.querySelector('#preparing-count').textContent = this.state.filteredKots.preparing.length;
        this.container.querySelector('#ready-count').textContent = this.state.filteredKots.ready.length;
        
        // Render each column
        this.renderKotColumn(queuedContainer, this.state.filteredKots.queued, 'Queued');
        this.renderKotColumn(preparingContainer, this.state.filteredKots.preparing, 'In Progress');
        this.renderKotColumn(readyContainer, this.state.filteredKots.ready, 'Ready');

        this.collapseEmptyColumns();
    },

    collapseEmptyColumns: function() {
        ['queued', 'preparing', 'ready'].forEach(status => {
            const column = this.container.querySelector(`.${status}-column`);
            if (!column) return;
            column.classList.toggle('collapsed', this.state.filteredKots[status].length === 0);
        });
    },
    
    /**
     * Render a single KOT column
     * @param {HTMLElement} container - Column container
     * @param {Array} kots - KOT tickets to render
     * @param {string} status - Column status
     */
    renderKotColumn: function(container, kots, status) {
        if (kots.length === 0) {
            container.innerHTML = `
                <div class="empty-column">
                    <p>No ${status.toLowerCase()} orders</p>
                </div>
            `;
            return;
        }
        
        // Clear container
        container.innerHTML = '';
        
        // Add each KOT card
        kots.forEach(kot => {
            const kotCard = document.createElement('div');
            kotCard.className = 'kot-card';
            kotCard.dataset.kot = kot.name;
            
            // Calculate time elapsed
            const creationTime = new Date(kot.creation);
            const now = new Date();
            const elapsedSeconds = Math.floor((now - creationTime) / 1000);
            
            // Add SLA classes
            if (elapsedSeconds > this.settings.slaThresholds.critical) {
                kotCard.classList.add('sla-critical');
            } else if (elapsedSeconds > this.settings.slaThresholds.warning) {
                kotCard.classList.add('sla-warning');
            }
            
            // Render the card content
            this.renderKotCard(kotCard, kot);
            
            // Add to container
            container.appendChild(kotCard);
        });
        
        // Bind KOT card events
        this.bindKotCardEvents(container, status);
    },
    
    /**
     * Render a single KOT card
     * @param {HTMLElement} card - KOT card element
     * @param {Object} kot - KOT data
     */
    renderKotCard: function(card, kot) {
        // Calculate elapsed time
        const creationTime = new Date(kot.creation);
        const now = new Date();
        const elapsedSeconds = Math.floor((now - creationTime) / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        const elapsedHours = Math.floor(elapsedMinutes / 60);
        
        let elapsedText = '';
        if (elapsedHours > 0) {
            elapsedText = `${elapsedHours}h ${elapsedMinutes % 60}m`;
        } else {
            elapsedText = `${elapsedMinutes}m`;
        }
        
        // Build items HTML
        let itemsHtml = '';
        if (kot.items && kot.items.length > 0) {
            kot.items.forEach(item => {
                const itemStatus = item.status || 'Queued';
                const itemStatusClass = itemStatus.toLowerCase().replace(' ', '-');
                const optionsHtml = this.getItemOptionsMarkup(item);

                itemsHtml += `
                    <div class="kot-item ${itemStatusClass}" data-item-idx="${item.idx}" data-status="${itemStatus}">
                        <div class="kot-item-qty">${item.qty}x</div>
                        <div class="kot-item-details">
                            <div class="kot-item-name">
                                ${item.item_name}
                                <span class="item-status-badge">${itemStatus}</span>
                            </div>
                            ${optionsText ? `<div class="kot-item-note">${optionsText}</div>` : ""}
                            ${item.notes ? `<div class="kot-item-note">${item.notes}</div>` : ''}
                        </div>
                        ${optionsHtml}
                        ${item.notes ? `<div class="item-notes">${item.notes}</div>` : ''}
                    </div>
                `;
            });
        } else {
            itemsHtml = `<div class="empty-items">No items</div>`;
        }
        
        // Build card HTML
        card.innerHTML = `
            <div class="kot-header">
                <div class="kot-info">
                    <div class="kot-id">${kot.name}</div>
                    <div class="kot-time">
                        <i class="fa fa-clock"></i> ${elapsedText}
                    </div>
                </div>
                <div class="kot-meta">
                    ${kot.pos_order ? `<div class="kot-order">Order: ${kot.pos_order}</div>` : ''}
                    ${kot.table ? `<div class="kot-table">Table: ${kot.table}</div>` : ''}
                    ${kot.priority ? `<div class="kot-priority">Priority: ${kot.priority}</div>` : ''}
                </div>
            </div>
            
            <div class="kot-items">
                ${itemsHtml}
            </div>
            
            <div class="kot-actions">
                ${kot.workflow_state === 'Queued' ? `
                    <button class="kot-action-btn primary start-btn" data-action="start" data-kot="${kot.name}">
                        Start Preparing
                    </button>
                ` : ''}

                ${kot.workflow_state === 'In Progress' ? `
                    <button class="kot-action-btn primary ready-btn" data-action="ready" data-kot="${kot.name}">
                        Mark Ready
                    </button>
                ` : ''}

                ${['In Progress', 'Ready'].includes(kot.workflow_state) ? `
                    <button class="kot-action-btn primary serve-btn" data-action="serve" data-kot="${kot.name}">
                        Mark Served
                    </button>
                ` : ''}
                
                <button class="kot-action-btn print-btn" data-action="print" data-kot="${kot.name}">
                    <i class="fa fa-print"></i>
                </button>
                
                <button class="kot-action-btn info-btn" data-action="info" data-kot="${kot.name}">
                    <i class="fa fa-info-circle"></i>
                </button>
            </div>
        `;
        
        // Add compact view markup if needed
        if (this.state.viewMode === 'compact') {
            // Add item count badge
            const itemCount = kot.items ? kot.items.length : 0;
            const itemCountBadge = document.createElement('div');
            itemCountBadge.className = 'kot-item-count';
            itemCountBadge.textContent = itemCount;
            card.querySelector('.kot-header').appendChild(itemCountBadge);
            
            // Make items collapsible
            card.querySelector('.kot-items').classList.add('collapsed');
            
            // Add toggle button
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'kot-toggle-btn';
            toggleBtn.innerHTML = '<i class="fa fa-chevron-down"></i>';
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const itemsContainer = card.querySelector('.kot-items');
                itemsContainer.classList.toggle('collapsed');
                toggleBtn.innerHTML = itemsContainer.classList.contains('collapsed') ? 
                    '<i class="fa fa-chevron-down"></i>' : 
                    '<i class="fa fa-chevron-up"></i>';
            });
            card.querySelector('.kot-meta').appendChild(toggleBtn);
        }
    },
    
    /**
     * Bind events to KOT cards
     * @param {HTMLElement} container - Column container
     * @param {string} status - Column status
     */
    bindKotCardEvents: function(container, status) {
        // Action buttons
        container.querySelectorAll('.kot-action-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = button.dataset.action;
                const kotName = button.dataset.kot;
                
                switch (action) {
                    case 'start':
                        this.updateKotWorkflowState(kotName, 'In Progress');
                        break;
                    case 'ready':
                        this.updateKotWorkflowState(kotName, 'Ready');
                        break;
                    case 'serve':
                        this.updateKotWorkflowState(kotName, 'Served');
                        break;
                    case 'print':
                        this.printKot(kotName);
                        break;
                    case 'info':
                        this.showKotDetails(kotName);
                        break;
                }
            });
        });
        
        // Item status toggles
        container.querySelectorAll('.kot-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const kotName = item.closest('.kot-card').dataset.kot;
                const itemIdx = item.dataset.itemIdx;
                const currentStatus = item.dataset.status;
                
                // Get next status based on current status
                let nextStatus;
                switch (currentStatus) {
                    case 'Queued':
                        nextStatus = 'In Progress';
                        break;
                    case 'In Progress':
                        nextStatus = 'Ready';
                        break;
                    case 'Ready':
                        nextStatus = 'Served';
                        break;
                    default:
                        return;
                }
                
                // Update item status
                this.updateKotItemState(kotName, itemIdx, nextStatus);
            });
        });
        
        // KOT card click (show details)
        container.querySelectorAll('.kot-card').forEach(card => {
            card.addEventListener('click', () => {
                const kotName = card.dataset.kot;
                this.showKotDetails(kotName);
            });
        });
    },
    
    /**
     * Update KOT workflow state
     * @param {string} kotName - KOT name
     * @param {string} state - New workflow state
     */
    updateKotWorkflowState: function(kotName, state) {
        frappe.call({
            method: 'imogi_pos.api.kot.update_kot_status',
            args: {
                kot_ticket: kotName,
                state: state
            },
            callback: (response) => {
                if (response.message) {
                    this.showToast(`KOT ${kotName} updated to ${state}`);

                    // If locally processed, update the KOT status in state
                    this.updateKotStatus(kotName, state);
                } else {
                    this.showError(`Failed to update KOT status: ${response.message && response.message.error || 'Unknown error'}`);
                }
            },
            error: () => {
                this.showError('Failed to update KOT status');
            }
        });
    },
    
    /**
     * Update KOT item state
     * @param {string} kotName - KOT name
     * @param {string} itemIdx - Item index
     * @param {string} state - New state
     */
    updateKotItemState: function(kotName, itemIdx, state) {
        frappe.call({
            method: 'imogi_pos.api.kot.update_kot_item_state',
            args: {
                kot: kotName,
                item_idx: itemIdx,
                status: state
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    this.showToast(`Item updated to ${state}`);
                    
                    // If locally processed, update the item status in UI
                    this.updateKotItemStatus(kotName, itemIdx, state);
                } else {
                    this.showError(`Failed to update item status: ${response.message && response.message.error || 'Unknown error'}`);
                }
            },
            error: () => {
                this.showError('Failed to update item status');
            }
        });
    },
    
    /**
     * Print KOT ticket
     * @param {string} kotName - KOT name
     */
    printKot: function(kotName) {
        frappe.call({
            method: 'imogi_pos.api.printing.print_kot',
            args: {
                kot: kotName,
                kitchen: this.settings.kitchen,
                station: this.settings.station
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    this.showToast('KOT printed successfully');
                } else {
                    this.showError(`Failed to print KOT: ${response.message && response.message.error || 'Unknown error'}`);
                }
            },
            error: () => {
                this.showError('Failed to print KOT');
            }
        });
    },
    
    /**
     * Show KOT details
     * @param {string} kotName - KOT name
     */
    showKotDetails: function(kotName) {
        // Find KOT in state
        let kot = null;
        Object.keys(this.state.kots).forEach(status => {
            const foundKot = this.state.kots[status].find(k => k.name === kotName);
            if (foundKot) {
                kot = foundKot;
            }
        });
        
        if (!kot) return;
        
        // Calculate elapsed time
        const creationTime = new Date(kot.creation);
        const now = new Date();
        const elapsedSeconds = Math.floor((now - creationTime) / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        const elapsedHours = Math.floor(elapsedMinutes / 60);
        
        let elapsedText = '';
        if (elapsedHours > 0) {
            elapsedText = `${elapsedHours}h ${elapsedMinutes % 60}m`;
        } else {
            elapsedText = `${elapsedMinutes}m`;
        }
        
        // Build items HTML
        let itemsHtml = '';
        if (kot.items && kot.items.length > 0) {
            kot.items.forEach(item => {
                const itemStatus = item.status || 'Queued';
                const itemStatusClass = itemStatus.toLowerCase().replace(' ', '-');
                const optionsHtml = this.getItemOptionsMarkup(item);

                itemsHtml += `
                    <div class="kot-detail-item ${itemStatusClass}">
                        <div class="item-info">
                            <div class="item-quantity">${item.qty}x</div>
                            <div class="item-name">${item.item_name}</div>
                        </div>
                        <div class="item-status">
                            <select class="item-status-select" data-item-idx="${item.idx}">
                                <option value="Queued" ${itemStatus === 'Queued' ? 'selected' : ''}>Queued</option>
                                <option value="In Progress" ${itemStatus === 'In Progress' ? 'selected' : ''}>In Progress</option>
                                <option value="Ready" ${itemStatus === 'Ready' ? 'selected' : ''}>Ready</option>
                                <option value="Served" ${itemStatus === 'Served' ? 'selected' : ''}>Served</option>
                            </select>
                        </div>
                        ${optionsHtml}
                        ${item.notes ? `<div class="item-notes">${item.notes}</div>` : ''}
                    </div>
                `;
            });
        } else {
            itemsHtml = `<div class="empty-items">No items</div>`;
        }
        
        // Show modal
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>KOT Details: ${kot.name}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="kot-details">
                            <div class="kot-details-header">
                                <div class="kot-info-row">
                                    <div class="info-label">Order:</div>
                                    <div class="info-value">${kot.pos_order || 'N/A'}</div>
                                </div>
                                <div class="kot-info-row">
                                    <div class="info-label">Table:</div>
                                    <div class="info-value">${kot.table || 'N/A'}</div>
                                </div>
                                <div class="kot-info-row">
                                    <div class="info-label">Created:</div>
                                    <div class="info-value">${this.formatDateTime(kot.creation)}</div>
                                </div>
                                <div class="kot-info-row">
                                    <div class="info-label">Elapsed:</div>
                                    <div class="info-value">${elapsedText}</div>
                                </div>
                                <div class="kot-info-row">
                                    <div class="info-label">Status:</div>
                                    <div class="info-value">
                                        <select id="kot-status-select">
                                            <option value="Queued" ${kot.workflow_state === 'Queued' ? 'selected' : ''}>Queued</option>
                                            <option value="In Progress" ${kot.workflow_state === 'In Progress' ? 'selected' : ''}>In Progress</option>
                                            <option value="Ready" ${kot.workflow_state === 'Ready' ? 'selected' : ''}>Ready</option>
                                            <option value="Served" ${kot.workflow_state === 'Served' ? 'selected' : ''}>Served</option>
                                            <option value="Cancelled" ${kot.workflow_state === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="kot-details-items">
                                <h4>Items</h4>
                                ${itemsHtml}
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="print-kot-btn" class="modal-button">Print KOT</button>
                        <button id="save-kot-btn" class="modal-button primary">Save Changes</button>
                    </div>
                </div>
            </div>
        `;
        
        // Show modal
        modalContainer.classList.add('active');
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
            });
        }
        
        // Bind print button
        const printBtn = modalContainer.querySelector('#print-kot-btn');
        if (printBtn) {
            printBtn.addEventListener('click', () => {
                this.printKot(kotName);
            });
        }
        
        // Bind save button
        const saveBtn = modalContainer.querySelector('#save-kot-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                // Get KOT status
                const kotStatus = modalContainer.querySelector('#kot-status-select').value;
                
                // Get item statuses
                const itemStatuses = [];
                modalContainer.querySelectorAll('.item-status-select').forEach(select => {
                    itemStatuses.push({
                        idx: select.dataset.itemIdx,
                        status: select.value
                    });
                });
                
                // Update KOT status
                this.updateKotWorkflowState(kotName, kotStatus);
                
                // Update item statuses
                itemStatuses.forEach(item => {
                    this.updateKotItemState(kotName, item.idx, item.status);
                });
                
                // Close modal
                modalContainer.classList.remove('active');
            });
        }
    },
    
    /**
     * Play a sound
     * @param {string} sound - Sound name to play
     */
    playSound: function(sound) {
        if (!this.settings.sound.enabled) return;
        
        // Check if specific sound is enabled
        switch (sound) {
            case 'new_kot':
                if (!this.settings.sound.newKot) return;
                break;
            case 'sla_warning':
                if (!this.settings.sound.slaWarning) return;
                break;
            case 'sla_critical':
                if (!this.settings.sound.slaCritical) return;
                break;
        }
        
        // Play sound if audio context is available
        if (this.state.audioContext) {
            try {
                const oscillator = this.state.audioContext.createOscillator();
                const gainNode = this.state.audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(this.state.audioContext.destination);
                
                // Set sound parameters based on type
                switch (sound) {
                    case 'new_kot':
                        oscillator.type = 'sine';
                        oscillator.frequency.value = 800;
                        gainNode.gain.value = 0.5;
                        oscillator.start();
                        setTimeout(() => oscillator.stop(), 200);
                        break;
                    
                    case 'sla_warning':
                        oscillator.type = 'square';
                        oscillator.frequency.value = 600;
                        gainNode.gain.value = 0.3;
                        oscillator.start();
                        setTimeout(() => {
                            oscillator.frequency.value = 800;
                            setTimeout(() => oscillator.stop(), 200);
                        }, 200);
                        break;
                    
                    case 'sla_critical':
                        oscillator.type = 'sawtooth';
                        oscillator.frequency.value = 400;
                        gainNode.gain.value = 0.4;
                        oscillator.start();
                        
                        // Create a sequence of beeps
                        setTimeout(() => {
                            oscillator.frequency.value = 600;
                            setTimeout(() => {
                                oscillator.frequency.value = 400;
                                setTimeout(() => oscillator.stop(), 200);
                            }, 200);
                        }, 200);
                        break;
                }
            } catch (e) {
                console.warn('Failed to play sound:', e);
            }
        }
    },
    
    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError: function(message) {
        const toastContainer = this.container.querySelector('#toast-container');
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast toast-error';
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fa fa-exclamation-circle toast-icon"></i>
                <div class="toast-message">${message}</div>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove after delay
        setTimeout(() => {
            toast.classList.add('toast-hiding');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 5000);
    },
    
    /**
     * Show toast message
     * @param {string} message - Toast message
     */
    showToast: function(message) {
        const toastContainer = this.container.querySelector('#toast-container');
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast toast-success';
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fa fa-check-circle toast-icon"></i>
                <div class="toast-message">${message}</div>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove after delay
        setTimeout(() => {
            toast.classList.add('toast-hiding');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    },

    /**
     * Build markup for item option chips
     * @param {Object} item - KOT item data
     * @returns {string} HTML string for rendered options
     */
    getItemOptionsMarkup: function(item) {
        const optionParts = this.getItemOptionParts(item);
        if (!optionParts.length) {
            return '';
        }

        const chips = optionParts
            .map(part => `<span class="option-chip">${this.escapeHtml(part)}</span>`)
            .join('');

        return `<div class="item-options">${chips}</div>`;
    },

    /**
     * Extract option labels from an item
     * @param {Object} item - KOT item data
     * @returns {string[]} Array of option labels
     */
    getItemOptionParts: function(item) {
        if (!item) {
            return [];
        }

        const displayParts = this.getOptionPartsFromValue(item.options_display);
        if (displayParts.length) {
            return displayParts;
        }

        return this.getOptionPartsFromValue(item.item_options);
    },

    /**
     * Normalize option data into an array of strings
     * @param {*} options - Option data
     * @returns {string[]} Array of option labels
     */
    getOptionPartsFromValue: function(options) {
        if (!options) {
            return [];
        }

        let formatted = '';

        if (typeof options === 'string') {
            const trimmed = options.trim();
            if (!trimmed) {
                return [];
            }

            formatted = trimmed;
            const parsed = this.formatItemOptions(options);
            if (parsed && parsed !== options) {
                formatted = parsed;
            }
        } else {
            formatted = this.formatItemOptions(options);
        }

        if (!formatted) {
            return [];
        }

        return formatted
            .split('|')
            .map(part => part.trim())
            .filter(Boolean);
    },

    /**
     * Escape HTML entities in a string
     * @param {string} value - Value to escape
     * @returns {string} Escaped string
     */
    escapeHtml: function(value) {
        if (value === null || value === undefined) {
            return '';
        }

        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    /**
     * Format item options into human readable text
     * @param {Object|string} options - Item options
     * @returns {string} Formatted options text
     */
    formatItemOptions: function(options) {
        if (!options) return '';
        if (typeof options === 'string') {
            try { options = JSON.parse(options); } catch (e) { return options; }
        }
        const parts = [];
        if (options.size) {
            parts.push(`Size: ${options.size.name}`);
        }
        if (options.spice) {
            parts.push(`Spice: ${options.spice.name}`);
        }
        if (options.sugar) {
            parts.push(`Sugar: ${options.sugar.name}`);
        }
        if (options.ice) {
            parts.push(`Ice: ${options.ice.name}`);
        }
        if (options.toppings && options.toppings.length) {
            parts.push(`Toppings: ${options.toppings.map(t => t.name).join(', ')}`);
        }
        return parts.join(' | ');
    },

    /**
     * Format date and time
     * @param {string} datetime - ISO datetime string
     * @returns {string} Formatted date and time
     */
    formatDateTime: function(datetime) {
        if (!datetime) return '';
        
        const date = new Date(datetime);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
};