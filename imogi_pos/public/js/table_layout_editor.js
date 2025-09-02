/**
 * IMOGI POS - Table Layout Editor
 * 
 * Main module for the Table Layout Editor interface
 * Handles:
 * - Restaurant floor layout editing
 * - Table placement and configuration
 * - Wall, text, and decoration elements
 * - Layout saving and loading
 */

frappe.provide('imogi_pos.table_layout_editor');

imogi_pos.table_layout_editor = {
    // Settings and state
    settings: {
        branch: null,
        floor: null,
        layoutProfile: null,
    },
    state: {
        floors: [],
        tables: [],
        layoutData: null,
        selectedNode: null,
        isDragging: false,
        isResizing: false,
        dragOffset: { x: 0, y: 0 },
        resizeDirection: null,
        snapToGrid: true,
        gridSize: 10,
        canvasWidth: 1200,
        canvasHeight: 800,
        layoutProfiles: [],
        editMode: 'select', // select, table, text, wall, decoration
        undoStack: [],
        redoStack: [],
        lastSaved: null,
        hasUnsavedChanges: false
    },
    
    /**
     * Initialize the Table Layout Editor
     * @param {Object} options - Configuration options
     */
    init: function(options = {}) {
        this.options = Object.assign({
            container: '#layout-editor',
            floorSelector: '#floor-selector',
            profileSelector: '#layout-profile-selector',
            branchSelector: '#branch-selector'
        }, options);
        
        this.container = document.querySelector(this.options.container);
        if (!this.container) {
            console.error('Layout Editor container not found');
            return;
        }
        
        // Get parameters from URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('floor')) {
            this.settings.floor = urlParams.get('floor');
        }
        
        // Initialize components
        this.initializeNavigation();
        this.loadSettings()
            .then(() => {
                this.renderUI();
                this.bindEvents();
                this.loadFloors()
                    .then(() => {
                        // Load profiles after floors
                        this.loadLayoutProfiles().then(() => {
                            // Finally load the layout
                            this.loadTableLayout();
                        });
                    });
            })
            .catch(err => {
                console.error('Failed to initialize Layout Editor:', err);
                this.showError('Failed to initialize Layout Editor. Please refresh the page.');
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
                backUrl: '/app/table-display',
                onBranchChange: (branch) => {
                    this.settings.branch = branch;
                    this.loadFloors().then(() => {
                        this.loadLayoutProfiles().then(() => {
                            this.loadTableLayout();
                        });
                    });
                }
            });
        }
    },
    
    /**
     * Load settings from localStorage or defaults
     * @returns {Promise} Promise resolving when settings are loaded
     */
    loadSettings: function() {
        return new Promise((resolve) => {
            // Try to load from localStorage
            const savedSettings = localStorage.getItem('imogi_table_layout_editor_settings');
            if (savedSettings) {
                try {
                    const parsedSettings = JSON.parse(savedSettings);
                    this.settings = Object.assign({}, this.settings, parsedSettings);
                } catch (e) {
                    console.warn('Failed to parse saved settings');
                }
            }
            
            // Get state settings
            const savedState = localStorage.getItem('imogi_table_layout_editor_state');
            if (savedState) {
                try {
                    const parsedState = JSON.parse(savedState);
                    this.state = Object.assign({}, this.state, {
                        snapToGrid: parsedState.snapToGrid,
                        gridSize: parsedState.gridSize,
                        canvasWidth: parsedState.canvasWidth,
                        canvasHeight: parsedState.canvasHeight
                    });
                } catch (e) {
                    console.warn('Failed to parse saved state');
                }
            }
            
            resolve();
        });
    },
    
    /**
     * Save settings to localStorage
     */
    saveSettings: function() {
        localStorage.setItem('imogi_table_layout_editor_settings', JSON.stringify({
            floor: this.settings.floor,
            layoutProfile: this.settings.layoutProfile
        }));
        
        localStorage.setItem('imogi_table_layout_editor_state', JSON.stringify({
            snapToGrid: this.state.snapToGrid,
            gridSize: this.state.gridSize,
            canvasWidth: this.state.canvasWidth,
            canvasHeight: this.state.canvasHeight
        }));
    },
    
    /**
     * Load restaurant floors
     * @returns {Promise} Promise resolving when floors are loaded
     */
    loadFloors: function() {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'imogi_pos.api.layout.get_restaurant_floors',
                args: {
                    branch: this.settings.branch
                },
                callback: (response) => {
                    if (response.message) {
                        this.state.floors = response.message;
                        
                        // Populate floor selector
                        this.populateFloorSelector();
                        
                        resolve();
                    } else {
                        reject(new Error('Failed to load floors'));
                    }
                },
                error: reject
            });
        });
    },
    
    /**
     * Load layout profiles
     * @returns {Promise} Promise resolving when profiles are loaded
     */
    loadLayoutProfiles: function() {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'imogi_pos.api.layout.get_layout_profiles',
                args: {
                    branch: this.settings.branch
                },
                callback: (response) => {
                    if (response.message) {
                        this.state.layoutProfiles = response.message;
                        
                        // Populate profile selector
                        this.populateProfileSelector();
                        
                        resolve();
                    } else {
                        this.state.layoutProfiles = [];
                        resolve();
                    }
                },
                error: (err) => {
                    console.error('Error loading layout profiles:', err);
                    this.state.layoutProfiles = [];
                    resolve(); // Still resolve to continue
                }
            });
        });
    },
    
    /**
     * Populate floor selector dropdown
     */
    populateFloorSelector: function() {
        const floorSelector = document.querySelector(this.options.floorSelector);
        if (!floorSelector) return;
        
        // Clear existing options
        floorSelector.innerHTML = '';
        
        // Add floor options
        this.state.floors.forEach(floor => {
            const option = document.createElement('option');
            option.value = floor.name;
            option.textContent = floor.floor_name;
            floorSelector.appendChild(option);
        });
        
        // Add create new option
        const createOption = document.createElement('option');
        createOption.value = 'new';
        createOption.textContent = '+ Create New Floor';
        floorSelector.appendChild(createOption);
        
        // Set selected value from settings
        if (this.settings.floor && this.settings.floor !== 'new' && 
            this.state.floors.some(f => f.name === this.settings.floor)) {
            floorSelector.value = this.settings.floor;
        } else if (this.state.floors.length > 0) {
            // Set first floor as default if not already set
            this.settings.floor = this.state.floors[0].name;
            floorSelector.value = this.settings.floor;
        } else {
            // No floors available
            floorSelector.value = 'new';
            this.settings.floor = 'new';
        }
        
        // Bind change event
        floorSelector.addEventListener('change', () => {
            if (this.state.hasUnsavedChanges) {
                this.showConfirmDialog(
                    'Unsaved Changes',
                    'You have unsaved changes. Do you want to continue and discard these changes?',
                    'Continue',
                    'Cancel',
                    () => {
                        // Reset unsaved changes flag
                        this.state.hasUnsavedChanges = false;
                        
                        // Update floor and load layout
                        this.handleFloorChange(floorSelector.value);
                    },
                    () => {
                        // Reset selector to previous value
                        floorSelector.value = this.settings.floor;
                    }
                );
            } else {
                this.handleFloorChange(floorSelector.value);
            }
        });
    },
    
    /**
     * Handle floor selection change
     * @param {string} value - Selected floor value
     */
    handleFloorChange: function(value) {
        if (value === 'new') {
            this.showCreateFloorDialog();
        } else {
            this.settings.floor = value;
            this.saveSettings();
            
            // Update URL without reloading
            const url = new URL(window.location);
            url.searchParams.set('floor', value);
            window.history.pushState({}, '', url);
            
            this.loadTableLayout();
        }
    },
    
    /**
     * Show dialog to create a new floor
     */
    showCreateFloorDialog: function() {
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container active';
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Create New Floor</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-floor-form">
                            <div class="form-group">
                                <label for="floor-name">Floor Name</label>
                                <input type="text" id="floor-name" required class="form-input">
                            </div>
                            <div class="form-group">
                                <label for="floor-description">Description (Optional)</label>
                                <textarea id="floor-description" class="form-textarea"></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button id="save-floor-btn" class="modal-button primary">Create Floor</button>
                        <button id="cancel-floor-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalContainer);
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
                
                // Reset floor selector to previous value
                const floorSelector = document.querySelector(this.options.floorSelector);
                if (floorSelector) {
                    floorSelector.value = this.settings.floor;
                }
            });
        }
        
        // Bind cancel button
        const cancelBtn = modalContainer.querySelector('#cancel-floor-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
                
                // Reset floor selector to previous value
                const floorSelector = document.querySelector(this.options.floorSelector);
                if (floorSelector) {
                    floorSelector.value = this.settings.floor;
                }
            });
        }
        
        // Bind save button
        const saveBtn = modalContainer.querySelector('#save-floor-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const floorName = modalContainer.querySelector('#floor-name').value;
                const floorDescription = modalContainer.querySelector('#floor-description').value;
                
                if (!floorName) {
                    this.showError('Floor name is required');
                    return;
                }
                
                this.createNewFloor(floorName, floorDescription);
                document.body.removeChild(modalContainer);
            });
        }
        
        // Focus name input
        const nameInput = modalContainer.querySelector('#floor-name');
        if (nameInput) {
            setTimeout(() => {
                nameInput.focus();
            }, 100);
        }
    },
    
    /**
     * Create a new floor
     * @param {string} floorName - Floor name
     * @param {string} description - Floor description
     */
    createNewFloor: function(floorName, description) {
        this.showLoading(true, 'Creating new floor...');
        
        frappe.call({
            method: 'imogi_pos.api.layout.create_restaurant_floor',
            args: {
                floor_name: floorName,
                description: description,
                branch: this.settings.branch
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.name) {
                    this.showToast(`Floor "${floorName}" created successfully`);
                    
                    // Add new floor to the list
                    this.state.floors.push({
                        name: response.message.name,
                        floor_name: floorName
                    });
                    
                    // Update floor selector
                    this.populateFloorSelector();
                    
                    // Set the new floor as active
                    this.settings.floor = response.message.name;
                    
                    // Update selector value
                    const floorSelector = document.querySelector(this.options.floorSelector);
                    if (floorSelector) {
                        floorSelector.value = this.settings.floor;
                    }
                    
                    // Save settings
                    this.saveSettings();
                    
                    // Update URL without reloading
                    const url = new URL(window.location);
                    url.searchParams.set('floor', this.settings.floor);
                    window.history.pushState({}, '', url);
                    
                    // Initialize empty layout
                    this.initializeEmptyLayout();
                } else {
                    this.showError('Failed to create floor');
                    
                    // Reset floor selector to previous value
                    const floorSelector = document.querySelector(this.options.floorSelector);
                    if (floorSelector) {
                        floorSelector.value = this.settings.floor;
                    }
                }
            },
            error: (err) => {
                this.showLoading(false);
                this.showError(`Failed to create floor: ${err.message}`);
                
                // Reset floor selector to previous value
                const floorSelector = document.querySelector(this.options.floorSelector);
                if (floorSelector) {
                    floorSelector.value = this.settings.floor;
                }
            }
        });
    },
    
    /**
     * Populate layout profile selector dropdown
     */
    populateProfileSelector: function() {
        const profileSelector = document.querySelector(this.options.profileSelector);
        if (!profileSelector) return;
        
        // Clear existing options
        profileSelector.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Default Layout';
        profileSelector.appendChild(defaultOption);
        
        // Add profile options
        this.state.layoutProfiles.forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.name;
            option.textContent = profile.profile_name;
            profileSelector.appendChild(option);
        });
        
        // Add create new option
        const createOption = document.createElement('option');
        createOption.value = 'new';
        createOption.textContent = '+ Create New Profile';
        profileSelector.appendChild(createOption);
        
        // Set selected value from settings
        if (this.settings.layoutProfile && this.settings.layoutProfile !== 'new' && 
            this.state.layoutProfiles.some(p => p.name === this.settings.layoutProfile)) {
            profileSelector.value = this.settings.layoutProfile;
        } else {
            // Use default
            profileSelector.value = '';
            this.settings.layoutProfile = '';
        }
        
        // Bind change event
        profileSelector.addEventListener('change', () => {
            if (this.state.hasUnsavedChanges) {
                this.showConfirmDialog(
                    'Unsaved Changes',
                    'You have unsaved changes. Do you want to continue and discard these changes?',
                    'Continue',
                    'Cancel',
                    () => {
                        // Reset unsaved changes flag
                        this.state.hasUnsavedChanges = false;
                        
                        // Update profile and load layout
                        this.handleProfileChange(profileSelector.value);
                    },
                    () => {
                        // Reset selector to previous value
                        profileSelector.value = this.settings.layoutProfile || '';
                    }
                );
            } else {
                this.handleProfileChange(profileSelector.value);
            }
        });
    },
    
    /**
     * Handle profile selection change
     * @param {string} value - Selected profile value
     */
    handleProfileChange: function(value) {
        if (value === 'new') {
            this.showCreateProfileDialog();
        } else {
            this.settings.layoutProfile = value;
            this.saveSettings();
            this.loadTableLayout();
        }
    },
    
    /**
     * Show dialog to create a new layout profile
     */
    showCreateProfileDialog: function() {
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container active';
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Create New Layout Profile</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-profile-form">
                            <div class="form-group">
                                <label for="profile-name">Profile Name</label>
                                <input type="text" id="profile-name" required class="form-input">
                            </div>
                            <div class="form-group">
                                <label for="profile-description">Description (Optional)</label>
                                <textarea id="profile-description" class="form-textarea"></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button id="save-profile-btn" class="modal-button primary">Create Profile</button>
                        <button id="cancel-profile-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalContainer);
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
                
                // Reset profile selector to previous value
                const profileSelector = document.querySelector(this.options.profileSelector);
                if (profileSelector) {
                    profileSelector.value = this.settings.layoutProfile || '';
                }
            });
        }
        
        // Bind cancel button
        const cancelBtn = modalContainer.querySelector('#cancel-profile-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
                
                // Reset profile selector to previous value
                const profileSelector = document.querySelector(this.options.profileSelector);
                if (profileSelector) {
                    profileSelector.value = this.settings.layoutProfile || '';
                }
            });
        }
        
        // Bind save button
        const saveBtn = modalContainer.querySelector('#save-profile-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const profileName = modalContainer.querySelector('#profile-name').value;
                const profileDescription = modalContainer.querySelector('#profile-description').value;
                
                if (!profileName) {
                    this.showError('Profile name is required');
                    return;
                }
                
                this.createNewProfile(profileName, profileDescription);
                document.body.removeChild(modalContainer);
            });
        }
        
        // Focus name input
        const nameInput = modalContainer.querySelector('#profile-name');
        if (nameInput) {
            setTimeout(() => {
                nameInput.focus();
            }, 100);
        }
    },
    
    /**
     * Create a new layout profile
     * @param {string} profileName - Profile name
     * @param {string} description - Profile description
     */
    createNewProfile: function(profileName, description) {
        this.showLoading(true, 'Creating new profile...');
        
        frappe.call({
            method: 'imogi_pos.api.layout.create_layout_profile',
            args: {
                profile_name: profileName,
                description: description,
                floor: this.settings.floor,
                branch: this.settings.branch
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.name) {
                    this.showToast(`Profile "${profileName}" created successfully`);
                    
                    // Add new profile to the list
                    this.state.layoutProfiles.push({
                        name: response.message.name,
                        profile_name: profileName
                    });
                    
                    // Update profile selector
                    this.populateProfileSelector();
                    
                    // Set the new profile as active
                    this.settings.layoutProfile = response.message.name;
                    
                    // Update selector value
                    const profileSelector = document.querySelector(this.options.profileSelector);
                    if (profileSelector) {
                        profileSelector.value = this.settings.layoutProfile;
                    }
                    
                    // Save settings
                    this.saveSettings();
                    
                    // Initialize empty layout or copy current layout to new profile
                    if (this.state.layoutData) {
                        this.saveLayoutToProfile(this.settings.layoutProfile);
                    } else {
                        this.initializeEmptyLayout();
                    }
                } else {
                    this.showError('Failed to create profile');
                    
                    // Reset profile selector to previous value
                    const profileSelector = document.querySelector(this.options.profileSelector);
                    if (profileSelector) {
                        profileSelector.value = this.settings.layoutProfile || '';
                    }
                }
            },
            error: (err) => {
                this.showLoading(false);
                this.showError(`Failed to create profile: ${err.message}`);
                
                // Reset profile selector to previous value
                const profileSelector = document.querySelector(this.options.profileSelector);
                if (profileSelector) {
                    profileSelector.value = this.settings.layoutProfile || '';
                }
            }
        });
    },
    
    /**
     * Load table layout data
     */
    loadTableLayout: function() {
        if (!this.settings.floor || this.settings.floor === 'new') {
            return;
        }
        
        // Show loading
        this.showLoading(true, 'Loading layout...');
        
        frappe.call({
            method: 'imogi_pos.api.layout.get_table_layout',
            args: {
                floor: this.settings.floor,
                branch: this.settings.branch,
                layout_profile: this.settings.layoutProfile || null,
                for_editor: 1
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message) {
                    // Store layout data
                    this.state.layoutData = response.message.layout || null;
                    this.state.tables = response.message.tables || [];
                    
                    // Clear undo/redo stacks
                    this.state.undoStack = [];
                    this.state.redoStack = [];
                    
                    // Set last saved state
                    this.state.lastSaved = JSON.stringify(this.state.layoutData);
                    this.state.hasUnsavedChanges = false;
                    
                    // Initialize layout if needed
                    if (!this.state.layoutData) {
                        this.initializeEmptyLayout();
                    } else {
                        // Render layout
                        this.renderTableLayout();
                    }
                    
                    // Update UI state
                    this.updateUIState();
                } else {
                    console.error('Failed to load table layout');
                    this.showError('Failed to load table layout');
                    
                    // Initialize empty layout
                    this.initializeEmptyLayout();
                }
            },
            error: (err) => {
                this.showLoading(false);
                console.error('Error loading table layout:', err);
                this.showError('Error loading table layout');
                
                // Initialize empty layout
                this.initializeEmptyLayout();
            }
        });
    },
    
    /**
     * Initialize an empty layout
     */
    initializeEmptyLayout: function() {
        // Create empty layout data
        this.state.layoutData = {
            floor: this.settings.floor,
            width: this.state.canvasWidth,
            height: this.state.canvasHeight,
            background_image: null,
            nodes: []
        };
        
        // Set last saved state
        this.state.lastSaved = JSON.stringify(this.state.layoutData);
        this.state.hasUnsavedChanges = false;
        
        // Clear undo/redo stacks
        this.state.undoStack = [];
        this.state.redoStack = [];
        
        // Render layout
        this.renderTableLayout();
        
        // Update UI state
        this.updateUIState();
    },
    
    /**
     * Update UI state based on current state
     */
    updateUIState: function() {
        // Update save button state
        const saveBtn = document.querySelector('#save-layout-btn');
        if (saveBtn) {
            saveBtn.disabled = !this.state.hasUnsavedChanges;
        }
        
        // Update undo button state
        const undoBtn = document.querySelector('#undo-btn');
        if (undoBtn) {
            undoBtn.disabled = this.state.undoStack.length === 0;
        }
        
        // Update redo button state
        const redoBtn = document.querySelector('#redo-btn');
        if (redoBtn) {
            redoBtn.disabled = this.state.redoStack.length === 0;
        }
        
        // Update edit mode buttons
        document.querySelectorAll('.edit-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.state.editMode);
        });
        
        // Update snap to grid button
        const snapBtn = document.querySelector('#snap-grid-btn');
        if (snapBtn) {
            snapBtn.classList.toggle('active', this.state.snapToGrid);
        }
    },
    
    /**
     * Render the main UI
     */
    renderUI: function() {
        this.container.innerHTML = `
            <div class="layout-editor-container">
                <div class="editor-toolbar">
                    <div class="toolbar-section">
                        <button id="save-layout-btn" class="toolbar-button" title="Save Layout" disabled>
                            <i class="fa fa-save"></i> Save
                        </button>
                        <button id="undo-btn" class="toolbar-button" title="Undo" disabled>
                            <i class="fa fa-undo"></i>
                        </button>
                        <button id="redo-btn" class="toolbar-button" title="Redo" disabled>
                            <i class="fa fa-redo"></i>
                        </button>
                    </div>
                    
                    <div class="toolbar-section">
                        <button class="toolbar-button edit-mode-btn active" data-mode="select" title="Select Mode">
                            <i class="fa fa-mouse-pointer"></i>
                        </button>
                        <button class="toolbar-button edit-mode-btn" data-mode="table" title="Add Table">
                            <i class="fa fa-square"></i>
                        </button>
                        <button class="toolbar-button edit-mode-btn" data-mode="text" title="Add Text">
                            <i class="fa fa-font"></i>
                        </button>
                        <button class="toolbar-button edit-mode-btn" data-mode="wall" title="Add Wall">
                            <i class="fa fa-grip-lines"></i>
                        </button>
                        <button class="toolbar-button edit-mode-btn" data-mode="decoration" title="Add Decoration">
                            <i class="fa fa-image"></i>
                        </button>
                    </div>
                    
                    <div class="toolbar-section">
                        <button id="snap-grid-btn" class="toolbar-button active" title="Snap to Grid">
                            <i class="fa fa-th"></i>
                        </button>
                        <button id="bg-image-btn" class="toolbar-button" title="Set Background Image">
                            <i class="fa fa-image"></i>
                        </button>
                        <button id="canvas-size-btn" class="toolbar-button" title="Canvas Size">
                            <i class="fa fa-expand-arrows-alt"></i>
                        </button>
                    </div>
                    
                    <div class="toolbar-section">
                        <button id="delete-node-btn" class="toolbar-button" title="Delete Selected Node" disabled>
                            <i class="fa fa-trash"></i>
                        </button>
                    </div>
                </div>
                
                <div class="editor-main">
                    <div class="editor-canvas-container">
                        <div class="editor-canvas" id="editor-canvas">
                            <div class="loading-placeholder">Loading layout...</div>
                        </div>
                    </div>
                    
                    <div class="editor-properties-panel" id="properties-panel">
                        <div class="properties-header">
                            <h3>Properties</h3>
                        </div>
                        <div class="properties-content">
                            <div class="empty-properties">
                                <p>Select an element to edit its properties</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="toast-container" class="toast-container"></div>
        `;
        
        // Bind events
        this.bindEvents();
    },
    
    /**
     * Bind event listeners
     */
    bindEvents: function() {
        // Save layout button
        const saveBtn = this.container.querySelector('#save-layout-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveLayout();
            });
        }
        
        // Undo button
        const undoBtn = this.container.querySelector('#undo-btn');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                this.undo();
            });
        }
        
        // Redo button
        const redoBtn = this.container.querySelector('#redo-btn');
        if (redoBtn) {
            redoBtn.addEventListener('click', () => {
                this.redo();
            });
        }
        
        // Edit mode buttons
        this.container.querySelectorAll('.edit-mode-btn').forEach(button => {
            button.addEventListener('click', () => {
                const mode = button.dataset.mode;
                this.setEditMode(mode);
            });
        });
        
        // Snap to grid button
        const snapBtn = this.container.querySelector('#snap-grid-btn');
        if (snapBtn) {
            snapBtn.addEventListener('click', () => {
                this.toggleSnapToGrid();
            });
        }
        
        // Background image button
        const bgImageBtn = this.container.querySelector('#bg-image-btn');
        if (bgImageBtn) {
            bgImageBtn.addEventListener('click', () => {
                this.showBackgroundImageDialog();
            });
        }
        
        // Canvas size button
        const canvasSizeBtn = this.container.querySelector('#canvas-size-btn');
        if (canvasSizeBtn) {
            canvasSizeBtn.addEventListener('click', () => {
                this.showCanvasSizeDialog();
            });
        }
        
        // Delete node button
        const deleteNodeBtn = this.container.querySelector('#delete-node-btn');
        if (deleteNodeBtn) {
            deleteNodeBtn.addEventListener('click', () => {
                this.deleteSelectedNode();
            });
        }
        
        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Check if we're not in an input field
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                // Undo: Ctrl+Z
                if (e.ctrlKey && e.key === 'z') {
                    e.preventDefault();
                    this.undo();
                }
                
                // Redo: Ctrl+Y or Ctrl+Shift+Z
                if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
                    e.preventDefault();
                    this.redo();
                }
                
                // Delete: Delete or Backspace
                if ((e.key === 'Delete' || e.key === 'Backspace') && this.state.selectedNode) {
                    e.preventDefault();
                    this.deleteSelectedNode();
                }
                
                // Save: Ctrl+S
                if (e.ctrlKey && e.key === 's') {
                    e.preventDefault();
                    this.saveLayout();
                }
            }
        });
        
        // Warn before leaving if there are unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (this.state.hasUnsavedChanges) {
                const message = 'You have unsaved changes. Are you sure you want to leave?';
                e.returnValue = message;
                return message;
            }
        });
    },
    
    /**
     * Set edit mode
     * @param {string} mode - Edit mode to set
     */
    setEditMode: function(mode) {
        this.state.editMode = mode;
        
        // Update edit mode buttons
        this.container.querySelectorAll('.edit-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        
        // Update canvas cursor
        const canvas = this.container.querySelector('#editor-canvas');
        if (canvas) {
            // Remove all cursor classes
            canvas.classList.remove('cursor-select', 'cursor-table', 'cursor-text', 'cursor-wall', 'cursor-decoration');
            
            // Add appropriate cursor class
            canvas.classList.add(`cursor-${mode}`);
        }
        
        // Deselect node when changing to add mode
        if (mode !== 'select' && this.state.selectedNode) {
            this.deselectNode();
        }
    },
    
    /**
     * Toggle snap to grid
     */
    toggleSnapToGrid: function() {
        this.state.snapToGrid = !this.state.snapToGrid;
        
        // Update button state
        const snapBtn = this.container.querySelector('#snap-grid-btn');
        if (snapBtn) {
            snapBtn.classList.toggle('active', this.state.snapToGrid);
        }
        
        // Save settings
        this.saveSettings();
    },
    
    /**
     * Show dialog to set background image
     */
    showBackgroundImageDialog: function() {
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container active';
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Set Background Image</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="bg-image-url">Image URL</label>
                            <input type="text" id="bg-image-url" class="form-input" value="${this.state.layoutData.background_image || ''}">
                        </div>
                        <div class="upload-container">
                            <label>Or upload an image:</label>
                            <input type="file" id="bg-image-upload" accept="image/*" class="form-input">
                        </div>
                        ${this.state.layoutData.background_image ? `
                            <div class="bg-image-preview">
                                <label>Current Background:</label>
                                <img src="${this.state.layoutData.background_image}" alt="Background" class="bg-preview-img">
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button id="clear-bg-btn" class="modal-button">Clear Background</button>
                        <button id="save-bg-btn" class="modal-button primary">Save</button>
                        <button id="cancel-bg-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalContainer);
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind cancel button
        const cancelBtn = modalContainer.querySelector('#cancel-bg-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind clear button
        const clearBtn = modalContainer.querySelector('#clear-bg-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                // Save layout state for undo
                this.saveStateForUndo();
                
                // Clear background image
                this.state.layoutData.background_image = null;
                
                // Update layout
                this.renderTableLayout();
                
                // Mark as unsaved
                this.state.hasUnsavedChanges = true;
                this.updateUIState();
                
                // Close dialog
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind save button
        const saveBtn = modalContainer.querySelector('#save-bg-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const imageUrl = modalContainer.querySelector('#bg-image-url').value;
                
                // Save layout state for undo
                this.saveStateForUndo();
                
                // Set background image
                this.state.layoutData.background_image = imageUrl;
                
                // Update layout
                this.renderTableLayout();
                
                // Mark as unsaved
                this.state.hasUnsavedChanges = true;
                this.updateUIState();
                
                // Close dialog
                document.body.removeChild(modalContainer);
            });
        }
        
        // Handle file upload
        const fileUpload = modalContainer.querySelector('#bg-image-upload');
        if (fileUpload) {
            fileUpload.addEventListener('change', () => {
                if (fileUpload.files && fileUpload.files[0]) {
                    // Show loading
                    this.showLoading(true, 'Uploading image...');
                    
                    // Upload file
                    const formData = new FormData();
                    formData.append('file', fileUpload.files[0]);
                    formData.append('doctype', 'Table Layout Profile');
                    formData.append('fieldname', 'background_image');
                    
                    fetch('/api/method/upload_file', {
                        method: 'POST',
                        body: formData,
                        headers: {
                            'X-Frappe-CSRF-Token': frappe.csrf_token,
                            'X-Frappe-Sid': localStorage.getItem('imogi_sid') || frappe.sid
                        }
                    })
                    .then(response => response.json())
                    .then(data => {
                        this.showLoading(false);
                        
                        if (data.message && data.message.file_url) {
                            // Set the URL in the input field
                            const urlInput = modalContainer.querySelector('#bg-image-url');
                            if (urlInput) {
                                urlInput.value = data.message.file_url;
                            }
                        } else {
                            this.showError('Failed to upload image');
                        }
                    })
                    .catch(error => {
                        this.showLoading(false);
                        this.showError(`Failed to upload image: ${error.message}`);
                    });
                }
            });
        }
    },
    
    /**
     * Show dialog to set canvas size
     */
    showCanvasSizeDialog: function() {
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container active';
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Set Canvas Size</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="canvas-width">Width (px)</label>
                            <input type="number" id="canvas-width" class="form-input" value="${this.state.canvasWidth}" min="500" max="5000">
                        </div>
                        <div class="form-group">
                            <label for="canvas-height">Height (px)</label>
                            <input type="number" id="canvas-height" class="form-input" value="${this.state.canvasHeight}" min="500" max="5000">
                        </div>
                        <div class="form-group">
                            <label for="grid-size">Grid Size (px)</label>
                            <input type="number" id="grid-size" class="form-input" value="${this.state.gridSize}" min="5" max="100">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="save-canvas-btn" class="modal-button primary">Save</button>
                        <button id="cancel-canvas-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalContainer);
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind cancel button
        const cancelBtn = modalContainer.querySelector('#cancel-canvas-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind save button
        const saveBtn = modalContainer.querySelector('#save-canvas-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const width = parseInt(modalContainer.querySelector('#canvas-width').value) || 1200;
                const height = parseInt(modalContainer.querySelector('#canvas-height').value) || 800;
                const gridSize = parseInt(modalContainer.querySelector('#grid-size').value) || 10;
                
                // Save layout state for undo
                this.saveStateForUndo();
                
                // Update canvas size
                this.state.canvasWidth = width;
                this.state.canvasHeight = height;
                this.state.gridSize = gridSize;
                
                // Update layout data
                this.state.layoutData.width = width;
                this.state.layoutData.height = height;
                
                // Save settings
                this.saveSettings();
                
                // Update layout
                this.renderTableLayout();
                
                // Mark as unsaved
                this.state.hasUnsavedChanges = true;
                this.updateUIState();
                
                // Close dialog
                document.body.removeChild(modalContainer);
            });
        }
    },
    
    /**
     * Render table layout
     */
    renderTableLayout: function() {
        const canvas = this.container.querySelector('#editor-canvas');
        if (!canvas) return;
        
        if (!this.state.layoutData) {
            canvas.innerHTML = `
                <div class="empty-layout">
                    <p>No layout data available for this floor</p>
                </div>
            `;
            return;
        }
        
        // Clear canvas
        canvas.innerHTML = '';
        
        // Set canvas dimensions
        canvas.style.width = `${this.state.layoutData.width}px`;
        canvas.style.height = `${this.state.layoutData.height}px`;
        
        // Add background image if available
        if (this.state.layoutData.background_image) {
            canvas.style.backgroundImage = `url('${this.state.layoutData.background_image}')`;
        } else {
            canvas.style.backgroundImage = 'none';
            
            // Add grid background if snap to grid is enabled
            if (this.state.snapToGrid) {
                canvas.style.backgroundSize = `${this.state.gridSize}px ${this.state.gridSize}px`;
                canvas.style.backgroundImage = `
                    linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px)
                `;
            }
        }
        
        // Add nodes to canvas
        if (this.state.layoutData.nodes && this.state.layoutData.nodes.length > 0) {
            this.state.layoutData.nodes.forEach((node, index) => {
                const nodeElement = document.createElement('div');
                nodeElement.className = 'layout-node editor-node';
                nodeElement.dataset.index = index;
                nodeElement.style.left = `${node.left}px`;
                nodeElement.style.top = `${node.top}px`;
                nodeElement.style.width = `${node.width}px`;
                nodeElement.style.height = `${node.height}px`;
                
                // Add node content based on type
                switch (node.node_type) {
                    case 'table':
                        // Create table node
                        nodeElement.classList.add('table-node');
                        
                        // Add table data attribute
                        nodeElement.dataset.table = node.table;
                        
                        // Get table info
                        const table = this.state.tables.find(t => t.name === node.table);
                        
                        if (table) {
                            nodeElement.innerHTML = `
                                <div class="table-content">
                                    <div class="table-name">${table.table_name || table.name}</div>
                                    <div class="table-capacity">${table.capacity || 2}</div>
                                </div>
                                <div class="node-resizers">
                                    <div class="node-resizer node-resizer-nw" data-dir="nw"></div>
                                    <div class="node-resizer node-resizer-ne" data-dir="ne"></div>
                                    <div class="node-resizer node-resizer-sw" data-dir="sw"></div>
                                    <div class="node-resizer node-resizer-se" data-dir="se"></div>
                                </div>
                            `;
                            
                            // Add table shape class
                            nodeElement.classList.add(`shape-${table.shape || 'rectangle'}`);
                        } else {
                            nodeElement.innerHTML = `
                                <div class="table-content">
                                    <div class="table-name">Unknown Table</div>
                                </div>
                                <div class="node-resizers">
                                    <div class="node-resizer node-resizer-nw" data-dir="nw"></div>
                                    <div class="node-resizer node-resizer-ne" data-dir="ne"></div>
                                    <div class="node-resizer node-resizer-sw" data-dir="sw"></div>
                                    <div class="node-resizer node-resizer-se" data-dir="se"></div>
                                </div>
                            `;
                            nodeElement.classList.add('invalid-table');
                        }
                        break;
                    
                    case 'text':
                        // Create text node
                        nodeElement.classList.add('text-node');
                        nodeElement.innerHTML = `
                            <div class="text-content">${node.text || ''}</div>
                            <div class="node-resizers">
                                <div class="node-resizer node-resizer-nw" data-dir="nw"></div>
                                <div class="node-resizer node-resizer-ne" data-dir="ne"></div>
                                <div class="node-resizer node-resizer-sw" data-dir="sw"></div>
                                <div class="node-resizer node-resizer-se" data-dir="se"></div>
                            </div>
                        `;
                        
                        // Set font size if specified
                        if (node.font_size) {
                            nodeElement.style.fontSize = `${node.font_size}px`;
                        }
                        break;
                    
                    case 'wall':
                        // Create wall node
                        nodeElement.classList.add('wall-node');
                        nodeElement.innerHTML = `
                            <div class="node-resizers">
                                <div class="node-resizer node-resizer-nw" data-dir="nw"></div>
                                <div class="node-resizer node-resizer-ne" data-dir="ne"></div>
                                <div class="node-resizer node-resizer-sw" data-dir="sw"></div>
                                <div class="node-resizer node-resizer-se" data-dir="se"></div>
                            </div>
                        `;
                        
                        // Set wall style if specified
                        if (node.wall_style) {
                            nodeElement.classList.add(`wall-${node.wall_style}`);
                        }
                        break;
                    
                    case 'decoration':
                        // Create decoration node
                        nodeElement.classList.add('decoration-node');
                        nodeElement.innerHTML = `
                            <div class="node-resizers">
                                <div class="node-resizer node-resizer-nw" data-dir="nw"></div>
                                <div class="node-resizer node-resizer-ne" data-dir="ne"></div>
                                <div class="node-resizer node-resizer-sw" data-dir="sw"></div>
                                <div class="node-resizer node-resizer-se" data-dir="se"></div>
                            </div>
                        `;
                        
                        if (node.decoration_type) {
                            nodeElement.classList.add(`decoration-${node.decoration_type}`);
                        }
                        
                        // Add decoration icon if specified
                        if (node.decoration_icon) {
                            const iconElement = document.createElement('i');
                            iconElement.className = `fa ${node.decoration_icon}`;
                            nodeElement.insertBefore(iconElement, nodeElement.firstChild);
                        }
                        break;
                }
                
                // Add node to canvas
                canvas.appendChild(nodeElement);
                
                // Bind node events
                this.bindNodeEvents(nodeElement);
            });
        }
        
        // Bind canvas click event for adding new nodes
        this.bindCanvasEvents(canvas);
    },
    
    /**
     * Bind events to canvas
     * @param {HTMLElement} canvas - Canvas element
     */
    bindCanvasEvents: function(canvas) {
        canvas.addEventListener('click', (e) => {
            // Only handle click if we're in add mode and clicking directly on the canvas
            if (e.target === canvas && this.state.editMode !== 'select') {
                const rect = canvas.getBoundingClientRect();
                let x = e.clientX - rect.left;
                let y = e.clientY - rect.top;
                
                // Apply snap to grid if enabled
                if (this.state.snapToGrid) {
                    x = Math.round(x / this.state.gridSize) * this.state.gridSize;
                    y = Math.round(y / this.state.gridSize) * this.state.gridSize;
                }
                
                // Add node based on edit mode
                switch (this.state.editMode) {
                    case 'table':
                        this.addTableNode(x, y);
                        break;
                    case 'text':
                        this.addTextNode(x, y);
                        break;
                    case 'wall':
                        this.addWallNode(x, y);
                        break;
                    case 'decoration':
                        this.addDecorationNode(x, y);
                        break;
                }
            }
        });
    },
    
    /**
     * Bind events to a node
     * @param {HTMLElement} nodeElement - Node element
     */
    bindNodeEvents: function(nodeElement) {
        // Select node on click
        nodeElement.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Only select if in select mode
            if (this.state.editMode === 'select') {
                const index = parseInt(nodeElement.dataset.index);
                this.selectNode(index);
            }
        });
        
        // Drag node
        nodeElement.addEventListener('mousedown', (e) => {
            // Only handle mousedown in select mode and not on resizers
            if (this.state.editMode !== 'select' || e.target.classList.contains('node-resizer')) {
                return;
            }
            
            e.stopPropagation();
            
            // Select this node
            const index = parseInt(nodeElement.dataset.index);
            this.selectNode(index);
            
            // Start dragging
            this.state.isDragging = true;
            
            // Calculate offset
            const rect = nodeElement.getBoundingClientRect();
            this.state.dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            
            // Add dragging class
            nodeElement.classList.add('dragging');
            
            // Save state for undo
            this.saveStateForUndo();
        });
        
        // Resize node
        const resizers = nodeElement.querySelectorAll('.node-resizer');
        resizers.forEach(resizer => {
            resizer.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                
                // Only handle mousedown in select mode
                if (this.state.editMode !== 'select') {
                    return;
                }
                
                // Select this node
                const index = parseInt(nodeElement.dataset.index);
                this.selectNode(index);
                
                // Start resizing
                this.state.isResizing = true;
                this.state.resizeDirection = resizer.dataset.dir;
                
                // Add resizing class
                nodeElement.classList.add('resizing');
                
                // Save state for undo
                this.saveStateForUndo();
            });
        });
    },
    
    /**
     * Add a table node at specified position
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    addTableNode: function(x, y) {
        // Show table selector dialog
        this.showTableSelectorDialog(x, y);
    },
    
    /**
     * Show dialog to select a table
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    showTableSelectorDialog: function(x, y) {
        if (!this.state.tables || this.state.tables.length === 0) {
            this.showError('No tables available. Please create tables first.');
            return;
        }
        
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container active';
        
        // Build table options
        let tableOptionsHtml = '';
        this.state.tables.forEach(table => {
            // Check if table is already in layout
            const isUsed = this.state.layoutData.nodes.some(node => 
                node.node_type === 'table' && node.table === table.name
            );
            
            tableOptionsHtml += `
                <div class="table-option ${isUsed ? 'table-used' : ''}" data-table="${table.name}">
                    <div class="table-name">${table.table_name || table.name}</div>
                    <div class="table-capacity">Capacity: ${table.capacity || 2}</div>
                    ${isUsed ? '<div class="table-used-label">Already in layout</div>' : ''}
                </div>
            `;
        });
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Select Table</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="tables-list">
                            ${tableOptionsHtml}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="new-table-btn" class="modal-button">Create New Table</button>
                        <button id="cancel-table-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalContainer);
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind cancel button
        const cancelBtn = modalContainer.querySelector('#cancel-table-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind new table button
        const newTableBtn = modalContainer.querySelector('#new-table-btn');
        if (newTableBtn) {
            newTableBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
                this.showCreateTableDialog(x, y);
            });
        }
        
        // Bind table options
        modalContainer.querySelectorAll('.table-option').forEach(option => {
            option.addEventListener('click', () => {
                if (option.classList.contains('table-used')) {
                    return; // Ignore if table is already used
                }
                
                const tableName = option.dataset.table;
                document.body.removeChild(modalContainer);
                
                // Create table node
                this.createTableNode(tableName, x, y);
            });
        });
    },
    
    /**
     * Show dialog to create a new table
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    showCreateTableDialog: function(x, y) {
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container active';
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Create New Table</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-table-form">
                            <div class="form-group">
                                <label for="table-name">Table Name</label>
                                <input type="text" id="table-name" required class="form-input">
                            </div>
                            <div class="form-group">
                                <label for="table-capacity">Capacity</label>
                                <input type="number" id="table-capacity" value="4" min="1" max="50" class="form-input">
                            </div>
                            <div class="form-group">
                                <label for="table-shape">Shape</label>
                                <select id="table-shape" class="form-select">
                                    <option value="rectangle">Rectangle</option>
                                    <option value="circle">Circle</option>
                                    <option value="oval">Oval</option>
                                </select>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button id="save-table-btn" class="modal-button primary">Create Table</button>
                        <button id="cancel-table-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalContainer);
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind cancel button
        const cancelBtn = modalContainer.querySelector('#cancel-table-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind save button
        const saveBtn = modalContainer.querySelector('#save-table-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const tableName = modalContainer.querySelector('#table-name').value;
                const capacity = parseInt(modalContainer.querySelector('#table-capacity').value) || 4;
                const shape = modalContainer.querySelector('#table-shape').value;
                
                if (!tableName) {
                    this.showError('Table name is required');
                    return;
                }
                
                this.createNewTable(tableName, capacity, shape, x, y);
                document.body.removeChild(modalContainer);
            });
        }
        
        // Focus name input
        const nameInput = modalContainer.querySelector('#table-name');
        if (nameInput) {
            setTimeout(() => {
                nameInput.focus();
            }, 100);
        }
    },
    
    /**
     * Create a new table
     * @param {string} tableName - Table name
     * @param {number} capacity - Table capacity
     * @param {string} shape - Table shape
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    createNewTable: function(tableName, capacity, shape, x, y) {
        this.showLoading(true, 'Creating new table...');
        
        frappe.call({
            method: 'imogi_pos.api.layout.create_restaurant_table',
            args: {
                table_name: tableName,
                capacity: capacity,
                shape: shape,
                floor: this.settings.floor,
                branch: this.settings.branch
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.name) {
                    this.showToast(`Table "${tableName}" created successfully`);
                    
                    // Add new table to the list
                    this.state.tables.push({
                        name: response.message.name,
                        table_name: tableName,
                        capacity: capacity,
                        shape: shape
                    });
                    
                    // Create table node
                    this.createTableNode(response.message.name, x, y);
                } else {
                    this.showError('Failed to create table');
                }
            },
            error: (err) => {
                this.showLoading(false);
                this.showError(`Failed to create table: ${err.message}`);
            }
        });
    },
    
    /**
     * Create a table node
     * @param {string} tableName - Table name
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    createTableNode: function(tableName, x, y) {
        // Save state for undo
        this.saveStateForUndo();
        
        // Get table info
        const table = this.state.tables.find(t => t.name === tableName);
        if (!table) {
            this.showError('Table not found');
            return;
        }
        
        // Create new node
        const newNode = {
            node_type: 'table',
            table: tableName,
            left: x,
            top: y,
            width: 100,
            height: 80
        };
        
        // Add to layout
        this.state.layoutData.nodes.push(newNode);
        
        // Render layout
        this.renderTableLayout();
        
        // Mark as unsaved
        this.state.hasUnsavedChanges = true;
        this.updateUIState();
    },
    
    /**
     * Add a text node at specified position
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    addTextNode: function(x, y) {
        // Show text dialog
        this.showTextDialog(x, y);
    },
    
    /**
     * Show dialog to add text
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    showTextDialog: function(x, y) {
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container active';
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Add Text</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="text-content">Text</label>
                            <input type="text" id="text-content" class="form-input">
                        </div>
                        <div class="form-group">
                            <label for="font-size">Font Size (px)</label>
                            <input type="number" id="font-size" value="16" min="8" max="72" class="form-input">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="add-text-btn" class="modal-button primary">Add Text</button>
                        <button id="cancel-text-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalContainer);
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind cancel button
        const cancelBtn = modalContainer.querySelector('#cancel-text-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind add button
        const addBtn = modalContainer.querySelector('#add-text-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const text = modalContainer.querySelector('#text-content').value;
                const fontSize = parseInt(modalContainer.querySelector('#font-size').value) || 16;
                
                this.createTextNode(text, fontSize, x, y);
                document.body.removeChild(modalContainer);
            });
        }
        
        // Focus text input
        const textInput = modalContainer.querySelector('#text-content');
        if (textInput) {
            setTimeout(() => {
                textInput.focus();
            }, 100);
        }
    },
    
    /**
     * Create a text node
     * @param {string} text - Text content
     * @param {number} fontSize - Font size
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    createTextNode: function(text, fontSize, x, y) {
        // Save state for undo
        this.saveStateForUndo();
        
        // Create new node
        const newNode = {
            node_type: 'text',
            text: text,
            font_size: fontSize,
            left: x,
            top: y,
            width: text.length * fontSize * 0.6,
            height: fontSize * 1.5
        };
        
        // Add to layout
        this.state.layoutData.nodes.push(newNode);
        
        // Render layout
        this.renderTableLayout();
        
        // Mark as unsaved
        this.state.hasUnsavedChanges = true;
        this.updateUIState();
    },
    
    /**
     * Add a wall node at specified position
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    addWallNode: function(x, y) {
        // Show wall dialog
        this.showWallDialog(x, y);
    },
    
    /**
     * Show dialog to add wall
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    showWallDialog: function(x, y) {
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container active';
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Add Wall</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="wall-width">Width (px)</label>
                            <input type="number" id="wall-width" value="100" min="10" max="1000" class="form-input">
                        </div>
                        <div class="form-group">
                            <label for="wall-height">Height (px)</label>
                            <input type="number" id="wall-height" value="20" min="10" max="1000" class="form-input">
                        </div>
                        <div class="form-group">
                            <label for="wall-style">Style</label>
                            <select id="wall-style" class="form-select">
                                <option value="solid">Solid</option>
                                <option value="dashed">Dashed</option>
                                <option value="dotted">Dotted</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="add-wall-btn" class="modal-button primary">Add Wall</button>
                        <button id="cancel-wall-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalContainer);
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind cancel button
        const cancelBtn = modalContainer.querySelector('#cancel-wall-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind add button
        const addBtn = modalContainer.querySelector('#add-wall-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const width = parseInt(modalContainer.querySelector('#wall-width').value) || 100;
                const height = parseInt(modalContainer.querySelector('#wall-height').value) || 20;
                const style = modalContainer.querySelector('#wall-style').value;
                
                this.createWallNode(width, height, style, x, y);
                document.body.removeChild(modalContainer);
            });
        }
    },
    
    /**
     * Create a wall node
     * @param {number} width - Wall width
     * @param {number} height - Wall height
     * @param {string} style - Wall style
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    createWallNode: function(width, height, style, x, y) {
        // Save state for undo
        this.saveStateForUndo();
        
        // Create new node
        const newNode = {
            node_type: 'wall',
            wall_style: style,
            left: x,
            top: y,
            width: width,
            height: height
        };
        
        // Add to layout
        this.state.layoutData.nodes.push(newNode);
        
        // Render layout
        this.renderTableLayout();
        
        // Mark as unsaved
        this.state.hasUnsavedChanges = true;
        this.updateUIState();
    },
    
    /**
     * Add a decoration node at specified position
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    addDecorationNode: function(x, y) {
        // Show decoration dialog
        this.showDecorationDialog(x, y);
    },
    
    /**
     * Show dialog to add decoration
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    showDecorationDialog: function(x, y) {
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container active';
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Add Decoration</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="decoration-type">Type</label>
                            <select id="decoration-type" class="form-select">
                                <option value="plant">Plant</option>
                                <option value="bar">Bar</option>
                                <option value="door">Door</option>
                                <option value="window">Window</option>
                                <option value="stairs">Stairs</option>
                                <option value="custom">Custom Icon</option>
                            </select>
                        </div>
                        <div class="form-group" id="icon-selector" style="display: none;">
                            <label for="decoration-icon">Icon (Font Awesome)</label>
                            <input type="text" id="decoration-icon" placeholder="fa-tree" class="form-input">
                            <div class="icon-suggestions">
                                <span class="icon-suggestion" data-icon="fa-tree"><i class="fa fa-tree"></i></span>
                                <span class="icon-suggestion" data-icon="fa-glass-martini"><i class="fa fa-glass-martini"></i></span>
                                <span class="icon-suggestion" data-icon="fa-door-open"><i class="fa fa-door-open"></i></span>
                                <span class="icon-suggestion" data-icon="fa-window"><i class="fa fa-window"></i></span>
                                <span class="icon-suggestion" data-icon="fa-stairs"><i class="fa fa-stairs"></i></span>
                                <span class="icon-suggestion" data-icon="fa-coffee"><i class="fa fa-coffee"></i></span>
                                <span class="icon-suggestion" data-icon="fa-restroom"><i class="fa fa-restroom"></i></span>
                                <span class="icon-suggestion" data-icon="fa-utensils"><i class="fa fa-utensils"></i></span>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="decoration-width">Width (px)</label>
                            <input type="number" id="decoration-width" value="50" min="10" max="500" class="form-input">
                        </div>
                        <div class="form-group">
                            <label for="decoration-height">Height (px)</label>
                            <input type="number" id="decoration-height" value="50" min="10" max="500" class="form-input">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="add-decoration-btn" class="modal-button primary">Add Decoration</button>
                        <button id="cancel-decoration-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalContainer);
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind cancel button
        const cancelBtn = modalContainer.querySelector('#cancel-decoration-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Show/hide icon selector based on decoration type
        const decorationType = modalContainer.querySelector('#decoration-type');
        const iconSelector = modalContainer.querySelector('#icon-selector');
        
        if (decorationType && iconSelector) {
            decorationType.addEventListener('change', () => {
                iconSelector.style.display = decorationType.value === 'custom' ? 'block' : 'none';
            });
        }
        
        // Bind icon suggestions
        const iconSuggestions = modalContainer.querySelectorAll('.icon-suggestion');
        const iconInput = modalContainer.querySelector('#decoration-icon');
        
        if (iconSuggestions && iconInput) {
            iconSuggestions.forEach(suggestion => {
                suggestion.addEventListener('click', () => {
                    iconInput.value = suggestion.dataset.icon;
                });
            });
        }
        
        // Bind add button
        const addBtn = modalContainer.querySelector('#add-decoration-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const type = modalContainer.querySelector('#decoration-type').value;
                const width = parseInt(modalContainer.querySelector('#decoration-width').value) || 50;
                const height = parseInt(modalContainer.querySelector('#decoration-height').value) || 50;
                let icon = null;
                
                if (type === 'custom') {
                    icon = modalContainer.querySelector('#decoration-icon').value;
                } else {
                    // Default icons based on type
                    switch (type) {
                        case 'plant': icon = 'fa-tree'; break;
                        case 'bar': icon = 'fa-glass-martini'; break;
                        case 'door': icon = 'fa-door-open'; break;
                        case 'window': icon = 'fa-window'; break;
                        case 'stairs': icon = 'fa-stairs'; break;
                    }
                }
                
                this.createDecorationNode(type, icon, width, height, x, y);
                document.body.removeChild(modalContainer);
            });
        }
    },
    
    /**
     * Create a decoration node
     * @param {string} type - Decoration type
     * @param {string} icon - Decoration icon
     * @param {number} width - Decoration width
     * @param {number} height - Decoration height
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    createDecorationNode: function(type, icon, width, height, x, y) {
        // Save state for undo
        this.saveStateForUndo();
        
        // Create new node
        const newNode = {
            node_type: 'decoration',
            decoration_type: type,
            decoration_icon: icon,
            left: x,
            top: y,
            width: width,
            height: height
        };
        
        // Add to layout
        this.state.layoutData.nodes.push(newNode);
        
        // Render layout
        this.renderTableLayout();
        
        // Mark as unsaved
        this.state.hasUnsavedChanges = true;
        this.updateUIState();
    },
    
    /**
     * Select a node by index
     * @param {number} index - Node index
     */
    selectNode: function(index) {
        // Deselect any previously selected node
        this.deselectNode();
        
        // Get node element
        const nodeElement = this.container.querySelector(`.editor-node[data-index="${index}"]`);
        if (!nodeElement) return;
        
        // Add selected class
        nodeElement.classList.add('selected');
        
        // Update state
        this.state.selectedNode = index;
        
        // Enable delete button
        const deleteBtn = this.container.querySelector('#delete-node-btn');
        if (deleteBtn) {
            deleteBtn.disabled = false;
        }
        
        // Render properties panel
        this.renderPropertiesPanel();
    },
    
    /**
     * Deselect the currently selected node
     */
    deselectNode: function() {
        // Remove selected class from any selected node
        const selectedNode = this.container.querySelector('.editor-node.selected');
        if (selectedNode) {
            selectedNode.classList.remove('selected');
        }
        
        // Clear state
        this.state.selectedNode = null;
        
        // Disable delete button
        const deleteBtn = this.container.querySelector('#delete-node-btn');
        if (deleteBtn) {
            deleteBtn.disabled = true;
        }
        
        // Render empty properties panel
        this.renderEmptyPropertiesPanel();
    },
    
    /**
     * Delete the selected node
     */
    deleteSelectedNode: function() {
        if (this.state.selectedNode === null) return;
        
        // Save state for undo
        this.saveStateForUndo();
        
        // Remove node from layout
        this.state.layoutData.nodes.splice(this.state.selectedNode, 1);
        
        // Clear selection
        this.deselectNode();
        
        // Render layout
        this.renderTableLayout();
        
        // Mark as unsaved
        this.state.hasUnsavedChanges = true;
        this.updateUIState();
    },
    
    /**
     * Render properties panel for selected node
     */
    renderPropertiesPanel: function() {
        const propertiesPanel = this.container.querySelector('#properties-panel');
        if (!propertiesPanel) return;
        
        if (this.state.selectedNode === null) {
            this.renderEmptyPropertiesPanel();
            return;
        }
        
        // Get node data
        const node = this.state.layoutData.nodes[this.state.selectedNode];
        if (!node) {
            this.renderEmptyPropertiesPanel();
            return;
        }
        
        // Render different properties based on node type
        let propertiesContent = '';
        
        switch (node.node_type) {
            case 'table':
                // Get table info
                const table = this.state.tables.find(t => t.name === node.table);
                
                propertiesContent = `
                    <div class="property-group">
                        <h4>Table Properties</h4>
                        <div class="property-row">
                            <label>Table:</label>
                            <span>${table ? table.table_name : 'Unknown'}</span>
                        </div>
                        <div class="property-row">
                            <label>Capacity:</label>
                            <span>${table ? table.capacity : 'N/A'}</span>
                        </div>
                        <div class="property-row">
                            <label>Shape:</label>
                            <span>${table ? table.shape : 'N/A'}</span>
                        </div>
                    </div>
                `;
                break;
                
            case 'text':
                propertiesContent = `
                    <div class="property-group">
                        <h4>Text Properties</h4>
                        <div class="property-row">
                            <label for="text-content-edit">Text:</label>
                            <input type="text" id="text-content-edit" value="${node.text || ''}" class="property-input">
                        </div>
                        <div class="property-row">
                            <label for="font-size-edit">Font Size:</label>
                            <input type="number" id="font-size-edit" value="${node.font_size || 16}" min="8" max="72" class="property-input">
                        </div>
                    </div>
                `;
                break;
                
            case 'wall':
                propertiesContent = `
                    <div class="property-group">
                        <h4>Wall Properties</h4>
                        <div class="property-row">
                            <label for="wall-style-edit">Style:</label>
                            <select id="wall-style-edit" class="property-select">
                                <option value="solid" ${node.wall_style === 'solid' ? 'selected' : ''}>Solid</option>
                                <option value="dashed" ${node.wall_style === 'dashed' ? 'selected' : ''}>Dashed</option>
                                <option value="dotted" ${node.wall_style === 'dotted' ? 'selected' : ''}>Dotted</option>
                            </select>
                        </div>
                    </div>
                `;
                break;
                
            case 'decoration':
                propertiesContent = `
                    <div class="property-group">
                        <h4>Decoration Properties</h4>
                        <div class="property-row">
                            <label for="decoration-type-edit">Type:</label>
                            <select id="decoration-type-edit" class="property-select">
                                <option value="plant" ${node.decoration_type === 'plant' ? 'selected' : ''}>Plant</option>
                                <option value="bar" ${node.decoration_type === 'bar' ? 'selected' : ''}>Bar</option>
                                <option value="door" ${node.decoration_type === 'door' ? 'selected' : ''}>Door</option>
                                <option value="window" ${node.decoration_type === 'window' ? 'selected' : ''}>Window</option>
                                <option value="stairs" ${node.decoration_type === 'stairs' ? 'selected' : ''}>Stairs</option>
                                <option value="custom" ${node.decoration_type === 'custom' ? 'selected' : ''}>Custom Icon</option>
                            </select>
                        </div>
                        <div class="property-row" id="icon-selector-edit" ${node.decoration_type !== 'custom' ? 'style="display: none;"' : ''}>
                            <label for="decoration-icon-edit">Icon:</label>
                            <input type="text" id="decoration-icon-edit" value="${node.decoration_icon || ''}" class="property-input">
                        </div>
                    </div>
                `;
                break;
        }
        
        // Add common position properties
        propertiesContent += `
            <div class="property-group">
                <h4>Position & Size</h4>
                <div class="property-row">
                    <label for="node-left-edit">Left:</label>
                    <input type="number" id="node-left-edit" value="${node.left}" class="property-input">
                </div>
                <div class="property-row">
                    <label for="node-top-edit">Top:</label>
                    <input type="number" id="node-top-edit" value="${node.top}" class="property-input">
                </div>
                <div class="property-row">
                    <label for="node-width-edit">Width:</label>
                    <input type="number" id="node-width-edit" value="${node.width}" class="property-input">
                </div>
                <div class="property-row">
                    <label for="node-height-edit">Height:</label>
                    <input type="number" id="node-height-edit" value="${node.height}" class="property-input">
                </div>
            </div>
        `;
        
        // Update properties panel content
        propertiesPanel.querySelector('.properties-content').innerHTML = propertiesContent;
        
        // Bind property change events
        this.bindPropertyEvents();
    },
    
    /**
     * Render empty properties panel
     */
    renderEmptyPropertiesPanel: function() {
        const propertiesPanel = this.container.querySelector('#properties-panel');
        if (!propertiesPanel) return;
        
        propertiesPanel.querySelector('.properties-content').innerHTML = `
            <div class="empty-properties">
                <p>Select an element to edit its properties</p>
            </div>
        `;
    },
    
    /**
     * Bind property change events
     */
    bindPropertyEvents: function() {
        if (this.state.selectedNode === null) return;
        
        const node = this.state.layoutData.nodes[this.state.selectedNode];
        if (!node) return;
        
        // Bind common position properties
        const leftInput = this.container.querySelector('#node-left-edit');
        const topInput = this.container.querySelector('#node-top-edit');
        const widthInput = this.container.querySelector('#node-width-edit');
        const heightInput = this.container.querySelector('#node-height-edit');
        
        if (leftInput) {
            leftInput.addEventListener('change', () => {
                // Save state for undo
                this.saveStateForUndo();
                
                node.left = parseInt(leftInput.value) || 0;
                this.updateNodePosition();
            });
        }
        
        if (topInput) {
            topInput.addEventListener('change', () => {
                // Save state for undo
                this.saveStateForUndo();
                
                node.top = parseInt(topInput.value) || 0;
                this.updateNodePosition();
            });
        }
        
        if (widthInput) {
            widthInput.addEventListener('change', () => {
                // Save state for undo
                this.saveStateForUndo();
                
                node.width = parseInt(widthInput.value) || 10;
                this.updateNodePosition();
            });
        }
        
        if (heightInput) {
            heightInput.addEventListener('change', () => {
                // Save state for undo
                this.saveStateForUndo();
                
                node.height = parseInt(heightInput.value) || 10;
                this.updateNodePosition();
            });
        }
        
        // Bind node-specific properties
        switch (node.node_type) {
            case 'text':
                const textInput = this.container.querySelector('#text-content-edit');
                const fontSizeInput = this.container.querySelector('#font-size-edit');
                
                if (textInput) {
                    textInput.addEventListener('change', () => {
                        // Save state for undo
                        this.saveStateForUndo();
                        
                        node.text = textInput.value;
                        this.updateNodeProperties();
                    });
                }
                
                if (fontSizeInput) {
                    fontSizeInput.addEventListener('change', () => {
                        // Save state for undo
                        this.saveStateForUndo();
                        
                        node.font_size = parseInt(fontSizeInput.value) || 16;
                        this.updateNodeProperties();
                    });
                }
                break;
                
            case 'wall':
                const wallStyleSelect = this.container.querySelector('#wall-style-edit');
                
                if (wallStyleSelect) {
                    wallStyleSelect.addEventListener('change', () => {
                        // Save state for undo
                        this.saveStateForUndo();
                        
                        node.wall_style = wallStyleSelect.value;
                        this.updateNodeProperties();
                    });
                }
                break;
                
            case 'decoration':
                const decorationTypeSelect = this.container.querySelector('#decoration-type-edit');
                const decorationIconInput = this.container.querySelector('#decoration-icon-edit');
                const iconSelectorEdit = this.container.querySelector('#icon-selector-edit');
                
                if (decorationTypeSelect) {
                    decorationTypeSelect.addEventListener('change', () => {
                        // Save state for undo
                        this.saveStateForUndo();
                        
                        node.decoration_type = decorationTypeSelect.value;
                        
                        // Show/hide icon selector
                        if (iconSelectorEdit) {
                            iconSelectorEdit.style.display = node.decoration_type === 'custom' ? 'block' : 'none';
                        }
                        
                        // Update icon based on type
                        if (node.decoration_type !== 'custom') {
                            switch (node.decoration_type) {
                                case 'plant': node.decoration_icon = 'fa-tree'; break;
                                case 'bar': node.decoration_icon = 'fa-glass-martini'; break;
                                case 'door': node.decoration_icon = 'fa-door-open'; break;
                                case 'window': node.decoration_icon = 'fa-window'; break;
                                case 'stairs': node.decoration_icon = 'fa-stairs'; break;
                            }
                            
                            if (decorationIconInput) {
                                decorationIconInput.value = node.decoration_icon;
                            }
                        }
                        
                        this.updateNodeProperties();
                    });
                }
                
                if (decorationIconInput) {
                    decorationIconInput.addEventListener('change', () => {
                        // Save state for undo
                        this.saveStateForUndo();
                        
                        node.decoration_icon = decorationIconInput.value;
                        this.updateNodeProperties();
                    });
                }
                break;
        }
    },
    
    /**
     * Update node position in the layout
     */
    updateNodePosition: function() {
        if (this.state.selectedNode === null) return;
        
        // Render layout to update node positions
        this.renderTableLayout();
        
        // Re-select the node
        this.selectNode(this.state.selectedNode);
        
        // Mark as unsaved
        this.state.hasUnsavedChanges = true;
        this.updateUIState();
    },
    
    /**
     * Update node properties in the layout
     */
    updateNodeProperties: function() {
        if (this.state.selectedNode === null) return;
        
        // Render layout to update node properties
        this.renderTableLayout();
        
        // Re-select the node
        this.selectNode(this.state.selectedNode);
        
        // Mark as unsaved
        this.state.hasUnsavedChanges = true;
        this.updateUIState();
    },
    
    /**
     * Save layout state for undo
     */
    saveStateForUndo: function() {
        // Push current state to undo stack
        this.state.undoStack.push(JSON.stringify(this.state.layoutData));
        
        // Clear redo stack
        this.state.redoStack = [];
        
        // Update UI state
        this.updateUIState();
    },
    
    /**
     * Undo the last change
     */
    undo: function() {
        if (this.state.undoStack.length === 0) return;
        
        // Save current state to redo stack
        this.state.redoStack.push(JSON.stringify(this.state.layoutData));
        
        // Pop state from undo stack
        const previousState = this.state.undoStack.pop();
        this.state.layoutData = JSON.parse(previousState);
        
        // Render layout
        this.renderTableLayout();
        
        // Update UI state
        this.updateUIState();
        
        // Mark as unsaved if different from last saved
        this.state.hasUnsavedChanges = this.state.lastSaved !== previousState;
        this.updateUIState();
    },
    
    /**
     * Redo the last undone change
     */
    redo: function() {
        if (this.state.redoStack.length === 0) return;
        
        // Save current state to undo stack
        this.state.undoStack.push(JSON.stringify(this.state.layoutData));
        
        // Pop state from redo stack
        const nextState = this.state.redoStack.pop();
        this.state.layoutData = JSON.parse(nextState);
        
        // Render layout
        this.renderTableLayout();
        
        // Update UI state
        this.updateUIState();
        
        // Mark as unsaved if different from last saved
        this.state.hasUnsavedChanges = this.state.lastSaved !== nextState;
        this.updateUIState();
    },
    
    /**
     * Save the current layout
     */
    saveLayout: function() {
        if (!this.state.layoutData) return;
        
        // Show loading indicator
        this.showLoading(true, 'Saving layout...');
        
        // Prepare layout data
        const layoutData = {
            floor: this.settings.floor,
            profile: this.settings.layoutProfile || null,
            branch: this.settings.branch,
            layout: this.state.layoutData
        };
        
        // Save layout
        frappe.call({
            method: 'imogi_pos.api.layout.save_table_layout',
            args: layoutData,
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    this.showToast('Layout saved successfully');
                    
                    // Update last saved state
                    this.state.lastSaved = JSON.stringify(this.state.layoutData);
                    this.state.hasUnsavedChanges = false;
                    this.updateUIState();
                } else {
                    this.showError(`Failed to save layout: ${response.message && response.message.error || 'Unknown error'}`);
                }
            },
            error: (err) => {
                this.showLoading(false);
                this.showError(`Failed to save layout: ${err.message}`);
            }
        });
    },
    
    /**
     * Save layout to a specific profile
     * @param {string} profileName - Profile name
     */
    saveLayoutToProfile: function(profileName) {
        if (!this.state.layoutData || !profileName) return;
        
        // Show loading indicator
        this.showLoading(true, 'Saving layout to profile...');
        
        // Prepare layout data
        const layoutData = {
            floor: this.settings.floor,
            profile: profileName,
            branch: this.settings.branch,
            layout: this.state.layoutData
        };
        
        // Save layout
        frappe.call({
            method: 'imogi_pos.api.layout.save_table_layout',
            args: layoutData,
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    this.showToast(`Layout saved to profile "${profileName}" successfully`);
                    
                    // Update last saved state
                    this.state.lastSaved = JSON.stringify(this.state.layoutData);
                    this.state.hasUnsavedChanges = false;
                    this.updateUIState();
                } else {
                    this.showError(`Failed to save layout to profile: ${response.message && response.message.error || 'Unknown error'}`);
                }
            },
            error: (err) => {
                this.showLoading(false);
                this.showError(`Failed to save layout to profile: ${err.message}`);
            }
        });
    },
    
    /**
     * Show loading indicator
     * @param {boolean} show - Whether to show or hide
     * @param {string} [message] - Optional message
     */
    showLoading: function(show, message = 'Loading...') {
        const loadingContainer = document.querySelector('.loading-container');
        
        // If loading container exists, just update it
        if (loadingContainer) {
            if (show) {
                loadingContainer.style.display = 'flex';
                loadingContainer.innerHTML = `
                    <div class="loading-spinner"></div>
                    <div class="loading-message">${message}</div>
                `;
            } else {
                loadingContainer.style.display = 'none';
            }
            return;
        }
        
        // Otherwise create a new one
        if (show) {
            const newLoadingContainer = document.createElement('div');
            newLoadingContainer.className = 'loading-container';
            newLoadingContainer.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-message">${message}</div>
            `;
            document.body.appendChild(newLoadingContainer);
        }
    },
    
    /**
     * Show confirmation dialog
     * @param {string} title - Dialog title
     * @param {string} message - Dialog message
     * @param {string} confirmText - Confirm button text
     * @param {string} cancelText - Cancel button text
     * @param {Function} onConfirm - Confirm callback
     * @param {Function} [onCancel] - Optional cancel callback
     */
    showConfirmDialog: function(title, message, confirmText, cancelText, onConfirm, onCancel) {
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container active';
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${title}</h3>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button id="confirm-btn" class="modal-button primary">${confirmText}</button>
                        <button id="cancel-btn" class="modal-button">${cancelText}</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalContainer);
        
        // Bind buttons
        const confirmBtn = modalContainer.querySelector('#confirm-btn');
        const cancelBtn = modalContainer.querySelector('#cancel-btn');
        
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
                if (onConfirm) onConfirm();
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
                if (onCancel) onCancel();
            });
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
    }
};

// Setup document mouse events for dragging and resizing
document.addEventListener('mousemove', (e) => {
    const editor = imogi_pos.table_layout_editor;
    
    // Handle node dragging
    if (editor.state.isDragging && editor.state.selectedNode !== null) {
        const canvas = document.querySelector('#editor-canvas');
        if (!canvas) return;
        
        const nodeElement = document.querySelector(`.editor-node[data-index="${editor.state.selectedNode}"]`);
        if (!nodeElement) return;
        
        const canvasRect = canvas.getBoundingClientRect();
        
        // Calculate new position
        let left = e.clientX - canvasRect.left - editor.state.dragOffset.x;
        let top = e.clientY - canvasRect.top - editor.state.dragOffset.y;
        
        // Apply snap to grid if enabled
        if (editor.state.snapToGrid) {
            left = Math.round(left / editor.state.gridSize) * editor.state.gridSize;
            top = Math.round(top / editor.state.gridSize) * editor.state.gridSize;
        }
        
        // Keep node within canvas bounds
        left = Math.max(0, Math.min(left, canvas.offsetWidth - nodeElement.offsetWidth));
        top = Math.max(0, Math.min(top, canvas.offsetHeight - nodeElement.offsetHeight));
        
        // Update node position
        nodeElement.style.left = `${left}px`;
        nodeElement.style.top = `${top}px`;
        
        // Update node data
        editor.state.layoutData.nodes[editor.state.selectedNode].left = left;
        editor.state.layoutData.nodes[editor.state.selectedNode].top = top;
        
        // Update properties panel
        const leftInput = document.querySelector('#node-left-edit');
        const topInput = document.querySelector('#node-top-edit');
        
        if (leftInput) leftInput.value = left;
        if (topInput) topInput.value = top;
        
        // Mark as unsaved
        editor.state.hasUnsavedChanges = true;
        editor.updateUIState();
    }
    
    // Handle node resizing
    if (editor.state.isResizing && editor.state.selectedNode !== null) {
        const canvas = document.querySelector('#editor-canvas');
        if (!canvas) return;
        
        const nodeElement = document.querySelector(`.editor-node[data-index="${editor.state.selectedNode}"]`);
        if (!nodeElement) return;
        
        const canvasRect = canvas.getBoundingClientRect();
        const nodeRect = nodeElement.getBoundingClientRect();
        
        // Calculate new dimensions based on resize direction
        let newWidth = nodeElement.offsetWidth;
        let newHeight = nodeElement.offsetHeight;
        let newLeft = parseInt(nodeElement.style.left);
        let newTop = parseInt(nodeElement.style.top);
        
        const mouseX = e.clientX - canvasRect.left;
        const mouseY = e.clientY - canvasRect.top;
        
        switch (editor.state.resizeDirection) {
            case 'se':
                // Bottom-right corner: adjust width and height
                newWidth = mouseX - newLeft;
                newHeight = mouseY - newTop;
                break;
                
            case 'sw':
                // Bottom-left corner: adjust width and height, adjust left
                newWidth = newLeft + nodeElement.offsetWidth - mouseX;
                newHeight = mouseY - newTop;
                newLeft = mouseX;
                break;
                
            case 'ne':
                // Top-right corner: adjust width and height, adjust top
                newWidth = mouseX - newLeft;
                newHeight = newTop + nodeElement.offsetHeight - mouseY;
                newTop = mouseY;
                break;
                
            case 'nw':
                // Top-left corner: adjust width and height, adjust left and top
                newWidth = newLeft + nodeElement.offsetWidth - mouseX;
                newHeight = newTop + nodeElement.offsetHeight - mouseY;
                newLeft = mouseX;
                newTop = mouseY;
                break;
        }
        
        // Apply snap to grid if enabled
        if (editor.state.snapToGrid) {
            newLeft = Math.round(newLeft / editor.state.gridSize) * editor.state.gridSize;
            newTop = Math.round(newTop / editor.state.gridSize) * editor.state.gridSize;
            newWidth = Math.round(newWidth / editor.state.gridSize) * editor.state.gridSize;
            newHeight = Math.round(newHeight / editor.state.gridSize) * editor.state.gridSize;
        }
        
        // Ensure minimum dimensions
        newWidth = Math.max(10, newWidth);
        newHeight = Math.max(10, newHeight);
        
        // Keep node within canvas bounds
        newLeft = Math.max(0, Math.min(newLeft, canvas.offsetWidth - newWidth));
        newTop = Math.max(0, Math.min(newTop, canvas.offsetHeight - newHeight));
        
        // Update node dimensions
        nodeElement.style.width = `${newWidth}px`;
        nodeElement.style.height = `${newHeight}px`;
        nodeElement.style.left = `${newLeft}px`;
        nodeElement.style.top = `${newTop}px`;
        
        // Update node data
        editor.state.layoutData.nodes[editor.state.selectedNode].width = newWidth;
        editor.state.layoutData.nodes[editor.state.selectedNode].height = newHeight;
        editor.state.layoutData.nodes[editor.state.selectedNode].left = newLeft;
        editor.state.layoutData.nodes[editor.state.selectedNode].top = newTop;
        
        // Update properties panel
        const leftInput = document.querySelector('#node-left-edit');
        const topInput = document.querySelector('#node-top-edit');
        const widthInput = document.querySelector('#node-width-edit');
        const heightInput = document.querySelector('#node-height-edit');
        
        if (leftInput) leftInput.value = newLeft;
        if (topInput) topInput.value = newTop;
        if (widthInput) widthInput.value = newWidth;
        if (heightInput) heightInput.value = newHeight;
        
        // Mark as unsaved
        editor.state.hasUnsavedChanges = true;
        editor.updateUIState();
    }
});

document.addEventListener('mouseup', () => {
    const editor = imogi_pos.table_layout_editor;
    
    // End dragging
    if (editor.state.isDragging) {
        const nodeElement = document.querySelector('.editor-node.dragging');
        if (nodeElement) {
            nodeElement.classList.remove('dragging');
        }
        editor.state.isDragging = false;
    }
    
    // End resizing
    if (editor.state.isResizing) {
        const nodeElement = document.querySelector('.editor-node.resizing');
        if (nodeElement) {
            nodeElement.classList.remove('resizing');
        }
        editor.state.isResizing = false;
        editor.state.resizeDirection = null;
    }
});