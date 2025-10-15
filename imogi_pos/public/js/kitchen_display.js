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
        audioContext: null,
        hasKitchenFilters: false,
        recentEventIds: []
    },
    
    /**
     * Initialize the Kitchen Display
     * @param {Object} options - Configuration options
     */
    init: async function(options = {}) {
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
        try {
            this.initializeNavigation();
        } catch (err) {
            this.handleStepError('initializing navigation', err);
        }

        try {
            this.initializeAudio();
        } catch (err) {
            this.handleStepError('initializing audio', err);
        }

        await this.safeStep('loading settings', () => this.loadSettings());
        await this.safeStep('rendering interface', () => this.renderUI());

        this.state.hasKitchenFilters = this.detectKitchenFilters();

        await this.safeStep('binding interface events', () => this.bindEvents());

        if (this.state.hasKitchenFilters) {
            await this.safeStep('loading kitchen filters', () => this.loadKitchens());
        }

        await this.safeStep('fetching KOT tickets', () => this.fetchTickets());

        try {
            this.setupRefreshInterval();
        } catch (err) {
            this.handleStepError('configuring auto refresh', err);
        }

        try {
            this.setupRealTimeUpdates();
        } catch (err) {
            this.handleStepError('configuring realtime updates', err);
        }
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
                onBranchChange: async (branch) => {
                    this.settings.branch = branch;

                    if (this.state.hasKitchenFilters) {
                        await this.safeStep('loading kitchen filters', () => this.loadKitchens());
                    }

                    await this.safeStep('fetching KOT tickets', () => this.fetchTickets());
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
     * Determine whether kitchen or station filters are available
     * @returns {boolean} True when filter controls exist in the DOM
     */
    detectKitchenFilters: function() {
        const kitchenSelector = document.querySelector(this.options.kitchenSelector);
        const stationSelector = document.querySelector(this.options.stationSelector);

        return Boolean(kitchenSelector || stationSelector);
    },

    /**
     * Ensure the shared modal root exists on the document body.
     * @returns {HTMLElement|null} The modal root container when available.
     */
    getModalRoot: function() {
        let modalRoot = document.getElementById('modal-root');

        if (!modalRoot) {
            modalRoot = document.createElement('div');
            modalRoot.id = 'modal-root';
            document.body.appendChild(modalRoot);
        } else if (modalRoot.parentElement !== document.body) {
            document.body.appendChild(modalRoot);
        }

        return modalRoot;
    },

    /**
     * Load kitchens and stations
     * @returns {Promise} Promise resolving when kitchens are loaded
     */
    loadKitchens: function() {
        if (!this.state.hasKitchenFilters) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'imogi_pos.api.kot.get_kitchens_and_stations',
                args: {
                    branch: this.settings.branch
                },
                callback: (response) => {
                    const message = response && response.message;

                    if (!message) {
                        console.error('Failed to load kitchens');
                        this.showError('Failed to load kitchen filters.');
                        this.state.kitchens = [];
                        this.state.stations = [];
                        this.clearKitchenFilters();
                        resolve();
                        return;
                    }

                    const kitchens = message.kitchens || [];
                    const stations = message.stations || [];
                    const previousKitchen = this.settings.kitchen;
                    const previousStation = this.settings.station;
                    let settingsChanged = false;

                    this.state.kitchens = kitchens;
                    this.state.stations = stations;

                    if (kitchens.length === 1) {
                        const [singleKitchen] = kitchens;
                        if (singleKitchen && previousKitchen !== singleKitchen.name) {
                            this.settings.kitchen = singleKitchen.name;
                            settingsChanged = true;
                        }
                    } else if (kitchens.length === 0) {
                        if (previousKitchen) {
                            this.settings.kitchen = '';
                            settingsChanged = true;
                        }
                    } else if (previousKitchen && !kitchens.some(kitchen => kitchen.name === previousKitchen)) {
                        this.settings.kitchen = '';
                        settingsChanged = true;
                    }

                    if (stations.length === 1) {
                        const [singleStation] = stations;
                        if (singleStation && previousStation !== singleStation.name) {
                            this.settings.station = singleStation.name;
                            settingsChanged = true;
                        }
                    } else if (stations.length === 0) {
                        if (previousStation) {
                            this.settings.station = '';
                            settingsChanged = true;
                        }
                    } else if (previousStation && !stations.some(station => station.name === previousStation)) {
                        this.settings.station = '';
                        settingsChanged = true;
                    }

                    if (settingsChanged) {
                        this.saveSettings();
                    }

                    if (kitchens.length > 1 || stations.length > 1) {
                        this.renderKitchenFilters({
                            showKitchen: kitchens.length > 1,
                            showStation: stations.length > 1
                        });
                    } else {
                        this.clearKitchenFilters();
                    }

                    this.setupRealTimeUpdates();

                    resolve();
                },
                error: (err) => {
                    console.error('Error loading kitchens:', err);
                    this.showError('Unable to fetch kitchen filters. Showing last known data.');
                    this.clearKitchenFilters();
                    this.setupRealTimeUpdates();
                    resolve();
                }
            });
        });
    },

    /**
     * Render kitchen and station filters when multiple options exist
     * @param {Object} options
     * @param {boolean} [options.showKitchen=false]
     * @param {boolean} [options.showStation=false]
     */
    renderKitchenFilters: function({ showKitchen = false, showStation = false } = {}) {
        let filtersContainer = this.container.querySelector('#kitchen-filters');

        if (!filtersContainer) {
            filtersContainer = document.createElement('div');
            filtersContainer.id = 'kitchen-filters';
            filtersContainer.className = 'kitchen-filters hidden';

            const main = this.container.querySelector('.kitchen-main');
            if (main) {
                main.insertBefore(filtersContainer, main.firstChild);
            } else {
                this.container.appendChild(filtersContainer);
            }
        }

        filtersContainer.innerHTML = '';
        filtersContainer.classList.add('hidden');

        const kitchenSelectorId = this.options.kitchenSelector && this.options.kitchenSelector.startsWith('#')
            ? this.options.kitchenSelector.slice(1)
            : 'kitchen-selector';
        const stationSelectorId = this.options.stationSelector && this.options.stationSelector.startsWith('#')
            ? this.options.stationSelector.slice(1)
            : 'station-selector';

        const kitchenSelect = this.container.querySelector(`#${kitchenSelectorId}`);
        const stationSelect = this.container.querySelector(`#${stationSelectorId}`);

        const kitchenWrapper = kitchenSelect ? kitchenSelect.closest('.station-selector') : null;
        const stationWrapper = stationSelect ? stationSelect.closest('.station-selector') : null;

        if (kitchenWrapper) {
            kitchenWrapper.classList.toggle('hidden', !showKitchen);
        }

        if (stationWrapper) {
            stationWrapper.classList.toggle('hidden', !showStation);
        }

        if (kitchenSelect) {
            kitchenSelect.innerHTML = '';

            const defaultKitchenOption = document.createElement('option');
            defaultKitchenOption.value = '';
            defaultKitchenOption.textContent = 'All Kitchens';
            kitchenSelect.appendChild(defaultKitchenOption);

            if (showKitchen && this.state.kitchens.length) {
                this.state.kitchens.forEach(kitchen => {
                    const option = document.createElement('option');
                    option.value = kitchen.name;
                    option.textContent = kitchen.kitchen_name;
                    kitchenSelect.appendChild(option);
                });
                kitchenSelect.disabled = false;
            } else {
                kitchenSelect.disabled = true;
            }

            kitchenSelect.value = this.settings.kitchen || '';
            kitchenSelect.onchange = () => {
                this.settings.kitchen = kitchenSelect.value;
                this.saveSettings();
                this.safeStep('fetching KOT tickets', () => this.fetchTickets())
                    .finally(() => this.setupRealTimeUpdates());
            };
        }

        if (stationSelect) {
            stationSelect.innerHTML = '';

            const defaultStationOption = document.createElement('option');
            defaultStationOption.value = '';
            defaultStationOption.textContent = 'All Stations';
            stationSelect.appendChild(defaultStationOption);

            if (showStation && this.state.stations.length) {
                this.state.stations.forEach(station => {
                    const option = document.createElement('option');
                    option.value = station.name;
                    option.textContent = station.station_name;
                    stationSelect.appendChild(option);
                });
                stationSelect.disabled = false;
            } else {
                stationSelect.disabled = true;
            }

            stationSelect.value = this.settings.station || '';
            stationSelect.onchange = () => {
                this.settings.station = stationSelect.value;
                this.saveSettings();
                this.safeStep('fetching KOT tickets', () => this.fetchTickets())
                    .finally(() => this.setupRealTimeUpdates());
            };
        }
    },

    clearKitchenFilters: function() {
        const filtersContainer = this.container.querySelector('#kitchen-filters');
        if (filtersContainer) {
            filtersContainer.innerHTML = '';
            filtersContainer.classList.add('hidden');
        }

        const kitchenSelectorId = this.options.kitchenSelector && this.options.kitchenSelector.startsWith('#')
            ? this.options.kitchenSelector.slice(1)
            : 'kitchen-selector';
        const stationSelectorId = this.options.stationSelector && this.options.stationSelector.startsWith('#')
            ? this.options.stationSelector.slice(1)
            : 'station-selector';

        const kitchenSelect = this.container.querySelector(`#${kitchenSelectorId}`);
        const stationSelect = this.container.querySelector(`#${stationSelectorId}`);

        if (kitchenSelect) {
            kitchenSelect.innerHTML = '';
            const defaultKitchenOption = document.createElement('option');
            defaultKitchenOption.value = '';
            defaultKitchenOption.textContent = 'All Kitchens';
            kitchenSelect.appendChild(defaultKitchenOption);
            kitchenSelect.disabled = true;

            const wrapper = kitchenSelect.closest('.station-selector');
            if (wrapper) {
                wrapper.classList.add('hidden');
            }
        }

        if (stationSelect) {
            stationSelect.innerHTML = '';
            const defaultStationOption = document.createElement('option');
            defaultStationOption.value = '';
            defaultStationOption.textContent = 'All Stations';
            stationSelect.appendChild(defaultStationOption);
            stationSelect.disabled = true;

            const wrapper = stationSelect.closest('.station-selector');
            if (wrapper) {
                wrapper.classList.add('hidden');
            }
        }
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
            this.safeStep('fetching KOT tickets', () => this.fetchTickets());
        }, this.settings.refreshInterval);
    },
    
    /**
     * Set up realtime updates
     */
    setupRealTimeUpdates: function() {
        if (!frappe.realtime || typeof frappe.realtime.on !== 'function') {
            return;
        }

        if (!this._realtimeHandlers) {
            this._realtimeHandlers = [];
        }

        if (this._realtimeHandlers.length && typeof frappe.realtime.off === 'function') {
            this._realtimeHandlers.forEach(({ channel, handler }) => {
                try {
                    frappe.realtime.off(channel, handler);
                } catch (error) {
                    // Ignore failures when detaching handlers
                    console.warn('Failed to remove realtime handler', error);
                }
            });
        }

        this._realtimeHandlers = [];

        const subscribe = (channel) => {
            if (!channel) return;
            const handler = (data) => this.handleKitchenUpdate(data, channel);
            frappe.realtime.on(channel, handler);
            this._realtimeHandlers.push({ channel, handler });
        };

        subscribe('kitchen:all');

        if (this.settings.kitchen) {
            subscribe(`kitchen:${this.settings.kitchen}`);
        }

        if (this.settings.station) {
            subscribe(`kitchen:station:${this.settings.station}`);
        }
    },
    
    /**
     * Handle kitchen updates from realtime
     * @param {Object} data - Update data
     */
    handleKitchenUpdate: function(data) {
        if (!data) {
            return;
        }

        const eventType = data.event_type || data.action;

        if (!Array.isArray(this.state.recentEventIds)) {
            this.state.recentEventIds = [];
        }

        if (data.event_id) {
            if (this.state.recentEventIds.includes(data.event_id)) {
                return;
            }

            this.state.recentEventIds.push(data.event_id);
            if (this.state.recentEventIds.length > 50) {
                this.state.recentEventIds.shift();
            }
        }

        if (this.settings.branch && data.branch && data.branch !== this.settings.branch) {
            return;
        }

        const matchesKitchen = !this.settings.kitchen || !data.kitchen || data.kitchen === this.settings.kitchen;
        const matchesStation = !this.settings.station || !data.station || data.station === this.settings.station;

        if (!matchesKitchen || !matchesStation) {
            return;
        }

        const rawKot = data.kot_ticket || data.kot;
        const kot = this.normalizeKotPayload(rawKot);

        if (!kot) {
            const identifier = data.kot_name || data.ticket;
            const status = data.state || data.status;
            const itemIdentifier = data.item !== undefined ? data.item : data.item_idx;

            switch (eventType) {
                case 'kot_updated':
                case 'update_kot_status':
                    if (identifier && status) {
                        this.updateKotStatus(identifier, status);
                    }
                    break;

                case 'kot_item_updated':
                case 'update_item_status':
                    if (identifier && itemIdentifier !== undefined && status) {
                        this.updateKotItemStatus(identifier, itemIdentifier, status);
                    }
                    break;

                case 'kot_removed':
                case 'delete_kot':
                    if (identifier) {
                        this.removeKotFromState(identifier);
                    }
                    break;
            }
            return;
        }

        const changedItems = Array.isArray(data.changed_items || data.updated_items)
            ? data.changed_items || data.updated_items
            : [];
        const normalizedChanges = changedItems
            .map(item => this.normalizeKotItem(item))
            .filter(Boolean);

        switch (eventType) {
            case 'kot_created':
            case 'new_kot':
                this.updateKotInState(kot);
                this.playSound('new_kot');
                break;

            case 'kot_updated':
            case 'update_kot_status':
                if (['Served', 'Cancelled'].includes(kot.workflow_state)) {
                    this.removeKotFromState(kot.name);
                } else {
                    this.updateKotInState(kot);
                }
                break;

            case 'kot_item_updated':
            case 'update_item_status':
                if (['Served', 'Cancelled'].includes(kot.workflow_state)) {
                    this.removeKotFromState(kot.name);
                    break;
                }

                if (normalizedChanges.length) {
                    normalizedChanges.forEach(item => {
                        const identifier = item.name || item.idx || item.item || item.item_code;
                        const status = item.workflow_state || item.status;
                        if (identifier && status) {
                            this.updateKotItemStatus(kot.name, identifier, status);
                        }
                    });
                }

                this.updateKotInState(kot);
                break;

            case 'kot_removed':
            case 'delete_kot':
                this.removeKotFromState(kot.name);
                break;

            default:
                if (kot.workflow_state && ['Served', 'Cancelled'].includes(kot.workflow_state)) {
                    this.removeKotFromState(kot.name);
                } else {
                    this.updateKotInState(kot);
                }
                break;
        }
    },

    normalizeKotPayload: function(kot) {
        if (!kot) {
            return null;
        }

        const normalizedKot = Object.assign({}, kot);

        const workflowState = this.normalizeWorkflowState(
            normalizedKot.workflow_state || normalizedKot.status
        );
        normalizedKot.workflow_state = workflowState;
        normalizedKot.status = workflowState;

        if (Array.isArray(normalizedKot.items)) {
            normalizedKot.items = normalizedKot.items.map(item => this.normalizeKotItem(item)).filter(Boolean);
        } else {
            normalizedKot.items = [];
        }

        return normalizedKot;
    },

    normalizeKotItem: function(item) {
        if (!item) {
            return null;
        }

        const normalizedItem = Object.assign({}, item);

        const workflowState = this.normalizeWorkflowState(
            normalizedItem.workflow_state || normalizedItem.status
        );

        normalizedItem.status = workflowState;
        normalizedItem.workflow_state = workflowState;

        return normalizedItem;
    },
    
    /**
     * Fetch KOT tickets from server
     * @returns {Promise<Array>} List of KOT documents returned by the server
     */
    fetchTickets: async function() {
        const response = await new Promise((resolve, reject) => {
            frappe.call({
                method: 'imogi_pos.api.kot.get_kots_for_kitchen',
                args: {
                    kitchen: this.settings.kitchen,
                    station: this.settings.station,
                    branch: this.settings.branch
                },
                callback: resolve,
                error: reject
            });
        });

        if (!response || !response.message) {
            throw new Error('Failed to load KOT tickets');
        }

        // Group KOTs by status
        const kots = {
            queued: [],
            preparing: [],
            ready: []
        };

        // Process each KOT
        response.message.forEach(kot => {
            const normalizedKot = this.normalizeKotPayload(kot);
            if (!normalizedKot) {
                return;
            }

            const status = normalizedKot.workflow_state;
            const stateKey = this.getStateKeyForWorkflow(status);

            if (stateKey) {
                kots[stateKey].push(normalizedKot);
            }
        });

        // Update state
        this.state.kots = kots;

        // Apply filters and sorting
        this.filterAndSortKots();

        // Update UI
        this.renderColumns();

        // Check SLA status
        this.checkSlaBreach();

        return response.message;
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
            const getTableName = (kot) => kot.table || kot.table_name || '';
            const matchesSearch = (value) => {
                if (value === undefined || value === null) {
                    return false;
                }

                return String(value).toLowerCase().includes(searchTerm);
            };

            Object.keys(filteredKots).forEach(status => {
                filteredKots[status] = filteredKots[status].filter(kot => {
                    const kotName = (kot.name || '').toLowerCase();
                    if (kotName.includes(searchTerm)) return true;

                    // Search in table name
                    const tableName = getTableName(kot);
                    if (tableName && tableName.toLowerCase().includes(searchTerm)) return true;

                    // Search in order name
                    if (kot.pos_order && kot.pos_order.toLowerCase().includes(searchTerm)) return true;

                    if (matchesSearch(kot.branch)) return true;
                    if (matchesSearch(kot.kitchen)) return true;
                    if (matchesSearch(kot.kitchen_station)) return true;
                    if (matchesSearch(kot.floor)) return true;
                    if (matchesSearch(kot.order_type)) return true;
                    if (matchesSearch(kot.customer)) return true;
                    if (matchesSearch(kot.created_by || kot.owner)) return true;

                    // Search in items
                    if (kot.items && kot.items.some(item => {
                        const normalizedName = this.getItemDisplayName(item).toLowerCase();
                        if (normalizedName.includes(searchTerm)) {
                            return true;
                        }

                        const normalizedNotes = (item.notes || '').toLowerCase();
                        return normalizedNotes.includes(searchTerm);
                    })) return true;

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
                        const aTable = a.table || a.table_name;
                        const bTable = b.table || b.table_name;
                        if (!aTable && !bTable) return 0;
                        if (!aTable) return 1;
                        if (!bTable) return -1;
                        return aTable.localeCompare(bTable);
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
        
        const normalizedKot = this.normalizeKotPayload(kot);
        if (!normalizedKot) {
            return;
        }

        // Then add to the appropriate list based on current status
        const stateKey = this.getStateKeyForWorkflow(normalizedKot.workflow_state);
        if (stateKey) {
            this.state.kots[stateKey].push(normalizedKot);
        }
        
        // Re-apply filters and sorting
        this.filterAndSortKots();
        
        // Update UI
        this.renderColumns();
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
        this.renderColumns();
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
        const normalizedStatus = this.normalizeWorkflowState(status);
        const newStatusKey = this.getStateKeyForWorkflow(normalizedStatus);

        // Update the KOT status fields
        kot.workflow_state = normalizedStatus;
        kot.status = normalizedStatus;

        // Ensure item statuses follow the parent workflow
        const itemsUpdated = this.syncKotItemsWithStatus(kot, normalizedStatus);

        // If status is Served or Cancelled, remove from state
        if (newStatusKey === null) {
            this.removeKotFromState(kotName);
            return;
        }

        // If status has changed, move the KOT
        if (newStatusKey !== currentStatus) {
            if (currentStatus && this.state.kots[currentStatus]) {
                // Remove from current status list
                this.state.kots[currentStatus] = this.state.kots[currentStatus].filter(k => k.name !== kotName);
            }

            // Add to new status list
            if (!this.state.kots[newStatusKey]) {
                this.state.kots[newStatusKey] = [];
            }
            this.state.kots[newStatusKey].push(kot);

            // Re-apply filters and sorting
            this.filterAndSortKots();

            // Update UI
            this.renderColumns();
        } else if (itemsUpdated) {
            const kotCard = this.container.querySelector(`.kot-card[data-kot="${kotName}"]`);
            if (kotCard) {
                this.renderKotCard(kotCard, kot);
                this.bindKotCardEvents(kotCard, null);
            }
        }
    },
    
    /**
     * Update KOT item status
     * @param {string} kotName - KOT name
     * @param {string|number} itemIdentifier - Item index or identifier
     * @param {string} status - New status
     */
    updateKotItemStatus: function(kotName, itemIdentifier, status) {
        // Find the KOT in any of the lists
        let kot = null;

        Object.keys(this.state.kots).forEach(key => {
            const foundKot = this.state.kots[key].find(k => k.name === kotName);
            if (foundKot) {
                kot = foundKot;
            }
        });

        if (!kot || !kot.items || kot.items.length === 0) return;

        let targetItem = null;

        // Support both numeric indices and item identifiers
        const parsedIndex = typeof itemIdentifier === 'number' ? itemIdentifier : parseInt(itemIdentifier, 10);
        if (!Number.isNaN(parsedIndex)) {
            if (kot.items[parsedIndex]) {
                targetItem = kot.items[parsedIndex];
            } else if (parsedIndex > 0 && kot.items[parsedIndex - 1]) {
                targetItem = kot.items[parsedIndex - 1];
            }

            if (!targetItem) {
                targetItem = kot.items.find(item => String(item.idx) === String(parsedIndex));
            }
        }

        if (!targetItem && typeof itemIdentifier === 'string') {
            targetItem = kot.items.find(item => item.name === itemIdentifier || String(item.idx) === itemIdentifier);
        }

        if (!targetItem) return;

        // Update the item status
        const normalizedStatus = this.normalizeWorkflowState(status);
        targetItem.status = normalizedStatus;
        targetItem.workflow_state = normalizedStatus;

        // Re-render the KOT card
        const kotCard = this.container.querySelector(`.kot-card[data-kot="${kotName}"]`);
        if (kotCard) {
            this.renderKotCard(kotCard, kot);
            this.bindKotCardEvents(kotCard, null);
        }
    },

    /**
     * Keep individual KOT item statuses aligned with the KOT workflow status.
     * @param {Object} kot - KOT record
     * @param {string} workflowState - Target workflow state
     * @returns {boolean} True when any item status was updated
     */
    syncKotItemsWithStatus: function(kot, workflowState) {
        if (!kot || !Array.isArray(kot.items) || kot.items.length === 0) {
            return false;
        }

        const targetStatus = this.normalizeWorkflowState(workflowState);
        const managedStatuses = ['Queued', 'In Progress', 'Ready', 'Served', 'Cancelled'];

        if (!managedStatuses.includes(targetStatus)) {
            return false;
        }

        let updated = false;

        kot.items.forEach(item => {
            if (!item) return;

            const currentStatus = this.normalizeWorkflowState(item.workflow_state || item.status);
            let nextStatus = null;

            switch (targetStatus) {
                case 'Queued':
                    if (currentStatus !== 'Queued') {
                        nextStatus = 'Queued';
                    }
                    break;
                case 'In Progress':
                    if (currentStatus === 'Queued' || currentStatus === 'In Progress') {
                        nextStatus = 'In Progress';
                    }
                    break;
                case 'Ready':
                    if (!['Ready', 'Served', 'Cancelled'].includes(currentStatus)) {
                        nextStatus = 'Ready';
                    }
                    break;
                case 'Served':
                    if (currentStatus !== 'Served' && currentStatus !== 'Cancelled') {
                        nextStatus = 'Served';
                    }
                    break;
                case 'Cancelled':
                    if (currentStatus !== 'Cancelled') {
                        nextStatus = 'Cancelled';
                    }
                    break;
                default:
                    break;
            }

            if (nextStatus && nextStatus !== currentStatus) {
                item.status = nextStatus;
                item.workflow_state = nextStatus;
                updated = true;
            }
        });

        return updated;
    },

    /**
     * Normalize workflow state strings to canonical values
     * @param {string} status - Raw workflow status value
     * @returns {string} Canonical workflow state
     */
    normalizeWorkflowState: function(status) {
        if (status === null || status === undefined) {
            return 'Queued';
        }

        const normalized = String(status).trim().toLowerCase();

        switch (normalized) {
            case 'queued':
            case 'queue':
            case 'queuing':
            case 'waiting':
            case 'pending':
            case 'new':
                return 'Queued';

            case 'in progress':
            case 'in-progress':
            case 'progress':
            case 'preparing':
            case 'prepare':
            case 'processing':
            case 'in preparation':
            case 'in_preparation':
            case 'ongoing':
                return 'In Progress';

            case 'ready':
            case 'completed':
            case 'complete':
            case 'done':
            case 'selesai':
            case 'ready to serve':
                return 'Ready';

            case 'served':
            case 'serve':
            case 'served to customer':
                return 'Served';

            case 'cancelled':
            case 'canceled':
            case 'void':
            case 'voided':
                return 'Cancelled';

            default:
                return String(status).trim() || 'Queued';
        }
    },

    /**
     * Map canonical workflow state to internal state key
     * @param {string} status - Workflow state
     * @returns {string|null} Internal key or null when not displayed
     */
    getStateKeyForWorkflow: function(status) {
        const normalizedStatus = this.normalizeWorkflowState(status);

        switch (normalizedStatus) {
            case 'Queued':
                return 'queued';
            case 'In Progress':
                return 'preparing';
            case 'Ready':
                return 'ready';
            case 'Served':
            case 'Cancelled':
                return null;
            default:
                return 'queued';
        }
    },
    
    /**
     * Render the main UI
     */
    renderUI: function() {
        this.container.classList.add('kitchen-display');
        this.container.classList.toggle('compact-view', this.state.viewMode === 'compact');

        const kitchenSelectorId = this.options.kitchenSelector && this.options.kitchenSelector.startsWith('#')
            ? this.options.kitchenSelector.slice(1)
            : 'kitchen-selector';
        const stationSelectorId = this.options.stationSelector && this.options.stationSelector.startsWith('#')
            ? this.options.stationSelector.slice(1)
            : 'station-selector';

        this.container.innerHTML = `
            <header class="kitchen-header">
                <div class="kitchen-header-left">
                    <h1 class="kitchen-title">Kitchen Display</h1>
                    <div class="station-selector hidden">
                        <label class="station-label" for="${kitchenSelectorId}">Kitchen</label>
                        <select id="${kitchenSelectorId}" class="select" disabled>
                            <option value="">All Kitchens</option>
                        </select>
                    </div>
                    <div class="station-selector hidden">
                        <label class="station-label" for="${stationSelectorId}">Station</label>
                        <select id="${stationSelectorId}" class="select" disabled>
                            <option value="">All Stations</option>
                        </select>
                    </div>
                </div>
                <div class="kitchen-header-right">
                    <div class="search-container">
                        <input type="text" id="kot-search" placeholder="Search orders..." class="search-input">
                        <button id="search-btn" class="search-button" title="Search">
                            <i class="fa fa-search"></i>
                        </button>
                    </div>
                    <div class="header-actions">
                        <button id="refresh-btn" class="refresh-button" title="Refresh">
                            <i class="fa fa-sync"></i>
                            <span>Refresh</span>
                        </button>
                        <button id="view-mode-btn" class="icon-button" title="${this.state.viewMode === 'compact' ? 'Switch to Full View' : 'Switch to Compact View'}">
                            <i class="fa ${this.state.viewMode === 'compact' ? 'fa-expand' : 'fa-compress'}"></i>
                        </button>
                        <button id="sort-mode-btn" class="icon-button" title="Sort: ${this.state.sortMode}">
                            <i class="fa fa-sort"></i>
                        </button>
                        <button id="sound-toggle-btn" class="icon-button ${this.settings.sound.enabled ? 'active' : ''}" title="${this.settings.sound.enabled ? 'Mute Sounds' : 'Enable Sounds'}">
                            <i class="fa ${this.settings.sound.enabled ? 'fa-volume-up' : 'fa-volume-mute'}"></i>
                        </button>
                        <button id="settings-btn" class="icon-button" title="Settings">
                            <i class="fa fa-cog"></i>
                        </button>
                    </div>
                </div>
            </header>
            <main class="kitchen-main">
                <div id="kitchen-filters" class="kitchen-filters hidden"></div>
                <div class="kitchen-columns">
                    <section class="kitchen-column column-queued queued-column">
                        <div class="column-header">
                            <div class="column-title">Queued</div>
                            <div class="column-count" id="queued-count">0</div>
                        </div>
                        <div class="column-body column-content" id="queued-container">
                            <div class="column-empty empty-column">
                                <p>No queued orders</p>
                            </div>
                        </div>
                    </section>
                    <section class="kitchen-column column-preparing preparing-column">
                        <div class="column-header">
                            <div class="column-title">In Progress</div>
                            <div class="column-count" id="preparing-count">0</div>
                        </div>
                        <div class="column-body column-content" id="preparing-container">
                            <div class="column-empty empty-column">
                                <p>No orders in progress</p>
                            </div>
                        </div>
                    </section>
                    <section class="kitchen-column column-ready ready-column">
                        <div class="column-header">
                            <div class="column-title">Ready</div>
                            <div class="column-count" id="ready-count">0</div>
                        </div>
                        <div class="column-body column-content" id="ready-container">
                            <div class="column-empty empty-column">
                                <p>No ready orders</p>
                            </div>
                        </div>
                    </section>
                </div>
            </main>

            <div id="toast-container" class="toast-container"></div>
        `;

        // Ensure the modal root exists outside the kitchen display container so overlays
        // are not clipped by local layout constraints.
        this.getModalRoot();

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
                this.renderColumns();
            });
        }
        
        // Search button
        const searchBtn = this.container.querySelector('#search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.filterAndSortKots();
                this.renderColumns();
            });
        }
        
        // Refresh button
        const refreshBtn = this.container.querySelector('#refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.safeStep('fetching KOT tickets', () => this.fetchTickets());
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
        this.container.classList.toggle('compact-view', this.state.viewMode === 'compact');
        
        // Update button icon
        const viewModeBtn = this.container.querySelector('#view-mode-btn');
        if (viewModeBtn) {
            viewModeBtn.innerHTML = `<i class="fa ${this.state.viewMode === 'compact' ? 'fa-expand' : 'fa-compress'}"></i>`;
            viewModeBtn.title = this.state.viewMode === 'compact' ? 'Switch to Full View' : 'Switch to Compact View';
        }
        
        // Re-render columns to apply new view mode
        this.renderColumns();
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
        this.renderColumns();
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
        const modalContainer = this.getModalRoot();
        if (!modalContainer) return;
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-container">
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
    renderColumns: function() {
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
        this.syncKotItemsCollapseState();
    },

    collapseEmptyColumns: function() {
        const columnsWrapper = this.container.querySelector('.kitchen-columns');
        let hasEmptyColumn = false;

        ['queued', 'preparing', 'ready'].forEach(status => {
            const column = this.container.querySelector(`.${status}-column`);
            if (!column) return;

            const isEmpty = this.state.filteredKots[status].length === 0;
            column.classList.toggle('is-empty', isEmpty);
            column.removeAttribute('aria-hidden');

            if (isEmpty) {
                hasEmptyColumn = true;
            }
        });

        if (columnsWrapper) {
            columnsWrapper.classList.toggle('has-empty', hasEmptyColumn);
        }
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
                <div class="column-empty empty-column">
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
            const statusClass = kot.workflow_state.toLowerCase().replace(/\s+/g, '-');
            kotCard.classList.add(statusClass);
            kotCard.dataset.kot = kot.name;
            
            // Calculate time elapsed
            const creationTime = new Date(kot.creation_time || kot.creation);
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
        const creationTime = new Date(kot.creation_time || kot.creation);
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
        const optionContentMap = [];
        if (kot.items && kot.items.length > 0) {
            kot.items.forEach(item => {
                const itemStatus = this.normalizeWorkflowState(item.status || 'Queued');
                const itemStatusClass = itemStatus.toLowerCase().replace(/\s+/g, '-');
                const optionsDisplay = (item.options_display || '').trim();
                let optionsHtml = '';
                const itemDisplayName = this.getItemDisplayName(item);

                if (optionsDisplay) {
                    const optionParts = optionsDisplay
                        .split('|')
                        .map(part => part.trim())
                        .filter(Boolean);

                    if (optionParts.length) {
                        const listItems = optionParts
                            .map(part => `<li>${this.escapeHtml(part)}</li>`)
                            .join('');
                        optionsHtml = `<ul class="options-list">${listItems}</ul>`;
                    } else {
                        optionsHtml = `<ul class="options-list"><li>${this.escapeHtml(optionsDisplay)}</li></ul>`;
                    }
                } else if (item.item_options) {
                    optionsHtml = this.formatItemOptions(item.item_options);
                }

                itemsHtml += `
                    <div class="kot-item ${itemStatusClass}" data-item-idx="${item.idx}" data-status="${itemStatus}">
                        <div class="kot-item-qty">${item.qty}x</div>
                        <div class="kot-item-details">
                            <div class="kot-item-name">
                                ${this.escapeHtml(itemDisplayName)}
                                <span class="kot-item-status-badge status-${itemStatusClass}" data-item-status-badge>
                                    ${this.escapeHtml(itemStatus)}
                                </span>
                            </div>
                            ${item.notes ? `<div class="kot-item-note">${item.notes}</div>` : ''}
                            ${optionsHtml ? `<div class="item-options" data-options-idx="${item.idx}"></div>` : ''}
                        </div>
                    </div>
                `;

                if (optionsHtml) {
                    optionContentMap.push({ idx: item.idx, html: optionsHtml });
                }
            });
        } else {
            itemsHtml = `<div class="empty-items">No items</div>`;
        }
        
        const metaRows = [];

        const addMetaRow = (label, value) => {
            if (!this.hasValue(value)) {
                return;
            }

            metaRows.push(`
                <div class="kot-meta-row">
                    <span class="meta-label">${this.escapeHtml(label)}:</span>
                    <span class="meta-value">${this.escapeHtml(value)}</span>
                </div>
            `);
        };

        addMetaRow('Order', kot.pos_order);
        addMetaRow('Table', kot.table);
        addMetaRow('Priority', kot.priority);
        addMetaRow('Branch', kot.branch);
        addMetaRow('Kitchen', kot.kitchen);
        addMetaRow('Station', kot.kitchen_station);
        addMetaRow('Floor', kot.floor);
        addMetaRow('Order Type', kot.order_type);
        addMetaRow('Customer', kot.customer);

        const metaHtml = metaRows.join('');

        // Build card HTML
        card.innerHTML = `
            <div class="kot-header">
                <div class="kot-info">
                    <div class="kot-id">${this.escapeHtml(kot.name)}</div>
                    <div class="kot-time">
                        <i class="fa fa-clock"></i> ${this.escapeHtml(elapsedText)}
                    </div>
                </div>
                <div class="kot-meta">
                    ${metaHtml}
                </div>
            </div>
            
            <div class="kot-items">
                ${itemsHtml}
            </div>
            
            <div class="kot-actions">
                ${kot.workflow_state === 'Queued' ? `
                    <button type="button" class="kot-action-btn primary start-btn" data-action="start" data-kot="${kot.name}" title="Start Preparing" aria-label="Start Preparing">
                        Start Preparing
                    </button>
                ` : ''}

                ${kot.workflow_state === 'In Progress' ? `
                    <button type="button" class="kot-action-btn primary ready-btn" data-action="ready" data-kot="${kot.name}" title="Mark Ready" aria-label="Mark Ready">
                        Mark Ready
                    </button>
                ` : ''}

                ${['In Progress', 'Ready'].includes(kot.workflow_state) ? `
                    <button type="button" class="kot-action-btn primary serve-btn" data-action="serve" data-kot="${kot.name}" title="Mark Served" aria-label="Mark Served">
                        Mark Served
                    </button>
                ` : ''}

                <button type="button" class="kot-action-btn print-btn" data-action="print" data-kot="${kot.name}" title="Print KOT" aria-label="Print KOT">
                    <i class="fa fa-print"></i>
                </button>

                <button type="button" class="kot-action-btn info-btn" data-action="info" data-kot="${kot.name}" title="View Details" aria-label="View Details">
                    <i class="fa fa-info-circle"></i>
                </button>
            </div>
        `;

        optionContentMap.forEach(({ idx, html }) => {
            const optionsContainer = card.querySelector(`.item-options[data-options-idx="${idx}"]`);
            if (optionsContainer) {
                optionsContainer.innerHTML = html;
            }
        });

        // Add compact view markup if needed
        if (this.state.viewMode === 'compact') {
            const itemsContainer = card.querySelector('.kot-items');

            // Add item count badge
            const itemCount = kot.items ? kot.items.length : 0;
            const itemCountBadge = document.createElement('div');
            itemCountBadge.className = 'kot-item-count';
            itemCountBadge.textContent = itemCount;
            card.querySelector('.kot-header').appendChild(itemCountBadge);

            // Make items collapsible
            if (itemsContainer) {
                itemsContainer.classList.add('collapsed');
            }

            // Add toggle button
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'kot-toggle-btn';
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleKotItemsCollapse(card);
            });
            card.querySelector('.kot-meta').appendChild(toggleBtn);
            this.updateKotItemsToggleIndicator(card, itemsContainer);
        }
    },

    /**
     * Synchronize collapse classes and toggle indicators after rendering
     */
    syncKotItemsCollapseState: function() {
        const isCompact = this.state.viewMode === 'compact';
        const cards = this.container.querySelectorAll('.kot-card');

        cards.forEach(card => {
            const itemsContainer = card.querySelector('.kot-items');
            if (!itemsContainer) return;

            if (!isCompact) {
                itemsContainer.classList.remove('collapsed');
            }

            this.updateKotItemsToggleIndicator(card, itemsContainer);
        });
    },

    /**
     * Toggle the collapse state of a KOT items container
     * @param {HTMLElement} card - KOT card element
     * @param {boolean|null} forceState - Force collapse state when boolean, toggle when null
     */
    toggleKotItemsCollapse: function(card, forceState = null) {
        const itemsContainer = card.querySelector('.kot-items');
        if (!itemsContainer) return;

        if (typeof forceState === 'boolean') {
            itemsContainer.classList.toggle('collapsed', forceState);
        } else {
            itemsContainer.classList.toggle('collapsed');
        }

        this.updateKotItemsToggleIndicator(card, itemsContainer);
    },

    /**
     * Update the toggle button icon based on collapse state
     * @param {HTMLElement} card - KOT card element
     * @param {HTMLElement|null} itemsContainer - Optional items container reference
     */
    updateKotItemsToggleIndicator: function(card, itemsContainer = null) {
        const container = itemsContainer || card.querySelector('.kot-items');
        if (!container) return;

        const toggleBtn = card.querySelector('.kot-toggle-btn');
        if (!toggleBtn) return;

        const isCollapsed = container.classList.contains('collapsed');
        toggleBtn.innerHTML = isCollapsed
            ? '<i class="fa fa-chevron-down"></i>'
            : '<i class="fa fa-chevron-up"></i>';
    },
    
    /**
     * Bind events to KOT cards
     * @param {HTMLElement} container - Column container
     * @param {string} status - Column status
     */
    bindKotCardEvents: function(container, status) {
        // Action buttons
        container.querySelectorAll('.kot-action-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                this.handleActionButtonClick(event);
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
     * Handle clicks on KOT action buttons
     * @param {MouseEvent} event - Click event
     */
    handleActionButtonClick: function(event) {
        if (!event) return;

        const button = event.currentTarget || event.target.closest('.kot-action-btn');
        if (!button) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const action = button.dataset.action;
        const kotName = button.dataset.kot;

        if (!action || !kotName) {
            return;
        }

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
    },
    
    /**
     * Update KOT workflow state
     * @param {string} kotName - KOT name
     * @param {string} state - New workflow state
     */
    updateKotWorkflowState: function(kotName, state) {
        return new Promise((resolve, reject) => {
            const canCallServer = window.frappe && typeof window.frappe.call === 'function';

            if (!canCallServer) {
                console.warn('frappe.call is not available. Falling back to local state update for KOT workflow state.');
                this.updateKotStatus(kotName, state);
                this.showToast(`KOT ${kotName} updated to ${state}`);
                resolve({ success: true, offline: true });
                return;
            }

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
                        resolve(response.message);
                    } else {
                        const errorMessage = `Failed to update KOT status: ${response.message && response.message.error || 'Unknown error'}`;
                        this.showError(errorMessage);
                        reject(new Error(errorMessage));
                    }
                },
                error: (error) => {
                    const errorMessage = 'Failed to update KOT status';
                    this.showError(errorMessage);
                    reject(error || new Error(errorMessage));
                }
            });
        });
    },
    
    /**
     * Update KOT item state
     * @param {string} kotName - KOT name
     * @param {string} itemIdx - Item index
     * @param {string} state - New state
     */
    updateKotItemState: function(kotName, itemIdx, state) {
        return new Promise((resolve, reject) => {
            const canCallServer = window.frappe && typeof window.frappe.call === 'function';

            if (!canCallServer) {
                console.warn('frappe.call is not available. Falling back to local state update for KOT item state.');
                this.updateKotItemStatus(kotName, itemIdx, state);
                this.showToast(`Item updated to ${state}`);
                resolve({ success: true, offline: true });
                return;
            }

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
                        resolve(response.message);
                    } else {
                        const errorMessage = `Failed to update item status: ${response.message && response.message.error || 'Unknown error'}`;
                        this.showError(errorMessage);
                        reject(new Error(errorMessage));
                    }
                },
                error: (error) => {
                    const errorMessage = 'Failed to update item status';
                    this.showError(errorMessage);
                    reject(error || new Error(errorMessage));
                }
            });
        });
    },
    
    /**
     * Print KOT ticket
     * @param {string} kotName - KOT name
     */
    printKot: function(kotName) {
        return new Promise((resolve, reject) => {
            const canCallServer = window.frappe && typeof window.frappe.call === 'function';

            if (!canCallServer) {
                console.warn('frappe.call is not available. Simulating KOT print.');
                this.showToast('Simulated KOT print');
                resolve({ success: true, offline: true });
                return;
            }

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
                        resolve(response.message);
                    } else {
                        const errorMessage = `Failed to print KOT: ${response.message && response.message.error || 'Unknown error'}`;
                        this.showError(errorMessage);
                        reject(new Error(errorMessage));
                    }
                },
                error: (error) => {
                    const errorMessage = 'Failed to print KOT';
                    this.showError(errorMessage);
                    reject(error || new Error(errorMessage));
                }
            });
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
        const creationTimestamp = kot.creation_time || kot.creation;
        const creationTime = new Date(creationTimestamp);
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
                const itemStatus = this.normalizeWorkflowState(item.status || 'Queued');
                const itemStatusClass = itemStatus.toLowerCase().replace(/\s+/g, '-');
                const optionsHtml = this.getItemOptionsMarkup(item);
                const itemDisplayName = this.getItemDisplayName(item);

                itemsHtml += `
                    <div class="kot-item ${itemStatusClass}" data-item-idx="${item.idx}" data-status="${itemStatus}">
                        <div class="kot-item-qty">${item.qty}x</div>
                        <div class="kot-item-details">
                            <div class="kot-item-name">
                                ${this.escapeHtml(itemDisplayName)}
                                <span class="kot-item-status-badge status-${itemStatusClass}" data-item-status-badge>
                                    ${this.escapeHtml(itemStatus)}
                                </span>
                            </div>
                            ${item.notes ? `<div class="kot-item-note">${item.notes}</div>` : ''}
                            ${optionsHtml ? `<div class="item-options" data-options-idx="${item.idx}"></div>` : ''}
                        </div>
                    </div>
                `;
            });
        } else {
            itemsHtml = `<div class="empty-items">No items</div>`;
        }

        const headerRows = [];
        const addHeaderRow = (label, value, options = {}) => {
            const { fallback = 'N/A', formatter } = options;
            const hasActualValue = this.hasValue(value);
            let displayValue = value;

            if (hasActualValue && typeof formatter === 'function') {
                displayValue = formatter(value);
            }

            if (!hasActualValue) {
                displayValue = fallback;
            }

            headerRows.push(`
                <div class="kot-info-row">
                    <div class="info-label">${this.escapeHtml(label)}:</div>
                    <div class="info-value">${this.escapeHtml(displayValue)}</div>
                </div>
            `);
        };

        const creationSource = creationTimestamp;
        addHeaderRow('Order', kot.pos_order);
        addHeaderRow('Customer', kot.customer);
        addHeaderRow('Order Type', kot.order_type);
        addHeaderRow('Branch', kot.branch);
        addHeaderRow('Kitchen', kot.kitchen);
        addHeaderRow('Station', kot.kitchen_station);
        addHeaderRow('Table', kot.table);
        addHeaderRow('Floor', kot.floor);
        addHeaderRow('Created', creationSource, { formatter: (value) => this.formatDateTime(value) });
        addHeaderRow('Created By', kot.created_by || kot.owner);
        addHeaderRow('Elapsed', elapsedText, { fallback: '0m' });

        const headerRowsHtml = headerRows.join('');

        // Show modal
        const modalContainer = this.getModalRoot();
        if (!modalContainer) return;

        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-container">
                    <div class="modal-header">
                        <h3>KOT Details: ${this.escapeHtml(kot.name)}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="kot-details">
                            <div class="kot-details-header">
                                ${headerRowsHtml}
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

        const closeModal = () => {
            modalContainer.classList.remove('active');
            modalContainer.innerHTML = '';
        };

        const modalOverlay = modalContainer.querySelector('.modal-overlay');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (event) => {
                if (event.target === modalOverlay) {
                    closeModal();
                }
            });
        }
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                closeModal();
            });
        }
        
        // Bind print button
        const printBtn = modalContainer.querySelector('#print-kot-btn');
        if (printBtn) {
            printBtn.addEventListener('click', () => {
                const originalText = printBtn.textContent;
                printBtn.disabled = true;
                printBtn.classList.add('loading');
                printBtn.textContent = 'Printing...';

                this.printKot(kotName)
                    .catch(() => {})
                    .finally(() => {
                        printBtn.disabled = false;
                        printBtn.classList.remove('loading');
                        printBtn.textContent = originalText;
                    });
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

                const originalText = saveBtn.textContent;
                saveBtn.disabled = true;
                saveBtn.classList.add('loading');
                saveBtn.textContent = 'Saving...';

                const updatePromises = [
                    this.updateKotWorkflowState(kotName, kotStatus),
                    ...itemStatuses.map(item => this.updateKotItemState(kotName, item.idx, item.status))
                ];

                Promise.allSettled(updatePromises)
                    .then(results => {
                        const hasError = results.some(result => result.status === 'rejected');
                        if (!hasError) {
                            closeModal();
                        }
                    })
                    .finally(() => {
                        saveBtn.disabled = false;
                        saveBtn.classList.remove('loading');
                        saveBtn.textContent = originalText;
                    });
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
     * Execute a step and surface errors without interrupting the flow
     * @param {string} stepName - Description of the step being executed
     * @param {Function} stepFn - Function representing the step
     * @returns {Promise<*>} Result of the provided function or null when it fails
     */
    safeStep: async function(stepName, stepFn) {
        try {
            return await stepFn();
        } catch (error) {
            this.handleStepError(stepName, error);
            return null;
        }
    },

    /**
     * Extract a human friendly message from different error shapes
     * @param {*} error - Error object or message
     * @returns {string} Normalized message
     */
    extractErrorMessage: function(error) {
        if (!error) {
            return 'Unknown error';
        }

        if (typeof error === 'string') {
            return error;
        }

        if (error.message) {
            return error.message;
        }

        if (error.exception) {
            return error.exception;
        }

        if (error._server_messages) {
            try {
                const messages = JSON.parse(error._server_messages);
                if (Array.isArray(messages) && messages.length) {
                    return messages.join(', ');
                }
            } catch (e) {
                // Ignore JSON parse errors and continue with fallback handling
            }
        }

        if (error.toString && error.toString() !== '[object Object]') {
            return error.toString();
        }

        return 'Unknown error';
    },

    /**
     * Log and display an error toast for a failed step
     * @param {string} stepName - Step description
     * @param {*} error - Error object or message
     */
    handleStepError: function(stepName, error) {
        const detail = this.extractErrorMessage(error);
        const readableStep = stepName ? stepName.charAt(0).toUpperCase() + stepName.slice(1) : 'operation';

        console.error(`Kitchen Display error while ${stepName || 'operation'}:`, error);

        const prefix = stepName ? `Error while ${readableStep}` : 'Error';
        this.showError(`${prefix}: ${detail}`);
    },

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError: function(message) {
        if (!this.container) {
            console.error('Kitchen Display container not available for showing errors.');
            return;
        }

        let toastContainer = this.container.querySelector('#toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container';
            this.container.appendChild(toastContainer);
        }

        const finalMessage = (typeof message === 'string' && message.trim()) ? message : 'An unexpected error occurred';

        const toast = document.createElement('div');
        toast.className = 'toast toast-error';
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fa fa-exclamation-circle toast-icon"></i>
                <div class="toast-message"></div>
            </div>
        `;

        const messageContainer = toast.querySelector('.toast-message');
        if (messageContainer) {
            messageContainer.textContent = finalMessage;
        }

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
        if (!this.container) {
            console.error('Kitchen Display container not available for showing toasts.');
            return;
        }

        let toastContainer = this.container.querySelector('#toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container';
            this.container.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = 'toast toast-success';
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fa fa-check-circle toast-icon"></i>
                <div class="toast-message"></div>
            </div>
        `;

        const finalMessage = (typeof message === 'string' && message.trim()) ? message : 'Operation completed successfully';
        const messageContainer = toast.querySelector('.toast-message');
        if (messageContainer) {
            messageContainer.textContent = finalMessage;
        }

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
     * Safely extract the base name for a KOT item
     * @param {Object} item - KOT item data
     * @returns {string} Trimmed base name or empty string when unavailable
     */
    getItemBaseName: function(item) {
        if (!item) {
            return '';
        }

        const candidateValues = [item.item_name, item.item, item.name];
        for (const value of candidateValues) {
            if (value === undefined || value === null) {
                continue;
            }

            const stringValue = String(value).trim();
            if (stringValue) {
                return stringValue;
            }
        }

        return '';
    },

    /**
     * Determine the display label for a KOT item, providing a fallback when necessary
     * @param {Object} item - KOT item data
     * @returns {string} Display name for rendering
     */
    getItemDisplayName: function(item) {
        const baseName = this.getItemBaseName(item);
        if (!baseName) {
            return 'Unnamed Item';
        }

        const statusKeywords = [
            'queued',
            'in progress',
            'in-progress',
            'ready',
            'served',
            'cancelled',
            'canceled',
            'returned',
            'draft',
            'sent to kitchen',
            'sent-to-kitchen',
            'closed'
        ];

        const keywordSet = new Set(statusKeywords);
        const escapeRegex = (value) => value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const statusAlternatives = statusKeywords
            .map(keyword => keyword.trim())
            .filter(Boolean)
            .map(keyword => keyword
                .split(/\s+/)
                .map(part => escapeRegex(part))
                .join('\\s+')
            );

        const statusPattern = statusAlternatives.length
            ? new RegExp(`(?:[-–—|:/\\s(]*)(?:${statusAlternatives.join('|')})\\s*\\)?$`, 'i')
            : null;

        const sanitizePart = (part) => {
            if (!part) {
                return '';
            }

            let working = part.trim();
            if (!working) {
                return '';
            }

            if (keywordSet.has(working.toLowerCase())) {
                return '';
            }

            if (statusPattern) {
                let iterations = 0;
                while (statusPattern.test(working) && iterations < 3) {
                    working = working.replace(statusPattern, '').trim();
                    iterations += 1;
                }
            }

            if (!working) {
                return '';
            }

            if (keywordSet.has(working.toLowerCase())) {
                return '';
            }

            return working;
        };

        const parts = baseName
            .split('|')
            .map(part => part.trim())
            .filter(Boolean);

        if (!parts.length) {
            const sanitized = sanitizePart(baseName);
            return sanitized || baseName;
        }

        const cleanedParts = parts
            .map(part => sanitizePart(part))
            .filter(Boolean);

        if (!cleanedParts.length) {
            const fallback = sanitizePart(parts[0]);
            return fallback || parts[0];
        }

        return cleanedParts.join(' | ');
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
     * Check whether a value should be considered as present
     * @param {*} value - Value to evaluate
     * @returns {boolean} True when the value is non-empty
     */
    hasValue: function(value) {
        if (value === undefined || value === null) {
            return false;
        }

        if (typeof value === 'number') {
            return true;
        }

        if (typeof value === 'string') {
            return value.trim().length > 0;
        }

        return Boolean(value);
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
     * @param {Object|string} options - Item options
     * @returns {string} Formatted options HTML
     */
    formatItemOptions: function(options) {
        if (!options) return '';

        const escapeHtml = (value) => String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const extractDisplayValue = (value) => {
            if (value === undefined || value === null) {
                return '';
            }

            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                return String(value);
            }

            if (typeof value === 'object') {
                if (value.name) return String(value.name);
                if (value.label) return String(value.label);
                if (value.value) return String(value.value);
            }

            return '';
        };

        let parsedOptions = options;
        if (typeof parsedOptions === 'string') {
            try {
                parsedOptions = JSON.parse(parsedOptions);
            } catch (e) {
                const fallbackValue = extractDisplayValue(parsedOptions);
                return fallbackValue ? `<ul class="options-list"><li>${escapeHtml(fallbackValue)}</li></ul>` : '';
            }
        }

        if (!parsedOptions || typeof parsedOptions !== 'object') {
            const fallbackValue = extractDisplayValue(parsedOptions);
            return fallbackValue ? `<ul class="options-list"><li>${escapeHtml(fallbackValue)}</li></ul>` : '';
        }

        const listItems = [];
        const addOption = (label, optionValue) => {
            const displayValue = extractDisplayValue(optionValue);
            if (!displayValue) return;
            listItems.push(`<li>${escapeHtml(label)}: ${escapeHtml(displayValue)}</li>`);
        };

        addOption('Variant', parsedOptions.variant);
        addOption('Size', parsedOptions.size);
        addOption('Spice', parsedOptions.spice);
        addOption('Sugar', parsedOptions.sugar);
        addOption('Ice', parsedOptions.ice);

        if (Array.isArray(parsedOptions.toppings) && parsedOptions.toppings.length) {
            const toppings = parsedOptions.toppings
                .map(topping => extractDisplayValue(topping))
                .filter(Boolean)
                .map(value => escapeHtml(value));

            if (toppings.length) {
                listItems.push(`<li>Toppings: ${toppings.join(', ')}</li>`);
            }
        }

        if (!listItems.length) {
            return '';
        }

        return `<ul class="options-list">${listItems.join('')}</ul>`;
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

// Di akhir file kitchen_display.js, pastikan kode ini terlihat seperti berikut:
imogi_pos.kitchen_display.lifecycle = {
    init: imogi_pos.kitchen_display.init.bind(imogi_pos.kitchen_display),
    fetchTickets: imogi_pos.kitchen_display.fetchTickets.bind(imogi_pos.kitchen_display),
    renderColumns: imogi_pos.kitchen_display.renderColumns.bind(imogi_pos.kitchen_display),
    bindEvents: imogi_pos.kitchen_display.bindEvents.bind(imogi_pos.kitchen_display)
};
