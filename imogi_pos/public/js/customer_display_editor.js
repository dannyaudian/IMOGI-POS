/**
 * IMOGI POS - Customer Display Editor
 * 
 * Main module for the Customer Display Profile Editor interface
 * Handles:
 * - Customer Display Profile management
 * - Block configuration
 * - Layout editing
 * - Preview
 */

frappe.provide('imogi_pos.customer_display_editor');

imogi_pos.customer_display_editor = {
    // Settings and state
    settings: {
        branch: null,
        profile: null,
    },
    state: {
        profiles: [],
        currentProfile: null,
        blocks: [],
        hasUnsavedChanges: false,
        selectedBlock: null
    },
    
    /**
     * Initialize the Customer Display Editor
     * @param {Object} options - Configuration options
     */
    init: function(options = {}) {
        this.options = Object.assign({
            container: '#customer-display-editor'
        }, options);
        
        this.container = document.querySelector(this.options.container);
        if (!this.container) {
            console.error('Customer Display Editor container not found');
            return;
        }
        
        // Initialize components
        this.initializeNavigation();
        this.loadSettings()
            .then(() => {
                this.renderUI();
                this.bindEvents();
                this.loadProfiles();
            })
            .catch(err => {
                console.error('Failed to initialize Customer Display Editor:', err);
                this.showError('Failed to initialize Customer Display Editor. Please refresh the page.');
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
                    this.loadProfiles();
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
            const savedSettings = localStorage.getItem('imogi_customer_display_editor_settings');
            if (savedSettings) {
                try {
                    const parsedSettings = JSON.parse(savedSettings);
                    this.settings = Object.assign({}, this.settings, parsedSettings);
                } catch (e) {
                    console.warn('Failed to parse saved settings');
                }
            }
            resolve();
        });
    },
    
    /**
     * Save settings to localStorage
     */
    saveSettings: function() {
        localStorage.setItem('imogi_customer_display_editor_settings', JSON.stringify({
            profile: this.settings.profile
        }));
    },
    
    /**
     * Load Customer Display Profiles
     * @returns {Promise} Promise resolving when profiles are loaded
     */
    loadProfiles: function() {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Customer Display Profile',
                    filters: {
                        branch: this.settings.branch || CURRENT_BRANCH
                    },
                    fields: ['name', 'profile_name', 'branch', 'is_active', 'layout_type']
                },
                callback: (response) => {
                    if (response.message) {
                        this.state.profiles = response.message;
                        this.populateProfileSelector();
                        
                        // Load first profile or selected one
                        if (this.settings.profile) {
                            this.loadProfile(this.settings.profile);
                        } else if (this.state.profiles.length > 0) {
                            this.loadProfile(this.state.profiles[0].name);
                        }
                        
                        resolve();
                    } else {
                        reject(new Error('Failed to load profiles'));
                    }
                },
                error: reject
            });
        });
    },
    
    /**
     * Load a specific Customer Display Profile
     * @param {String} profileName - Profile name
     * @returns {Promise} Promise resolving when profile is loaded
     */
    loadProfile: function(profileName) {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'frappe.client.get',
                args: {
                    doctype: 'Customer Display Profile',
                    name: profileName
                },
                callback: (response) => {
                    if (response.message) {
                        this.state.currentProfile = response.message;
                        this.settings.profile = profileName;
                        this.saveSettings();
                        
                        // Update UI
                        this.renderProfileDetails();
                        this.renderBlocksList();
                        
                        resolve();
                    } else {
                        reject(new Error('Failed to load profile'));
                    }
                },
                error: reject
            });
        });
    },
    
    /**
     * Render main UI
     */
    renderUI: function() {
        this.container.innerHTML = `
            <div class="customer-display-editor">
                <div class="editor-header">
                    <div class="header-controls">
                        <div class="control-group">
                            <label for="profile-selector">Customer Display Profile:</label>
                            <select id="profile-selector" class="form-control">
                                <option value="">Select Profile...</option>
                            </select>
                            <button id="new-profile-btn" class="btn btn-primary btn-sm">New Profile</button>
                            <button id="edit-profile-btn" class="btn btn-default btn-sm" disabled>Edit Profile</button>
                        </div>
                    </div>
                </div>
                
                <div class="editor-content">
                    <div class="editor-sidebar">
                        <div class="sidebar-section">
                            <h4>Profile Details</h4>
                            <div id="profile-details"></div>
                        </div>
                        
                        <div class="sidebar-section">
                            <h4>Display Blocks</h4>
                            <div id="blocks-list"></div>
                            <button id="add-block-btn" class="btn btn-default btn-sm" style="margin-top: 10px;">
                                Add Block
                            </button>
                        </div>
                    </div>
                    
                    <div class="editor-main">
                        <div class="preview-container">
                            <h4>Preview</h4>
                            <div id="display-preview" class="display-preview">
                                <p class="text-muted">Select a profile to preview</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.applyStyles();
    },
    
    /**
     * Apply CSS styles
     */
    applyStyles: function() {
        if (document.getElementById('customer-display-editor-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'customer-display-editor-styles';
        style.textContent = `
            .customer-display-editor {
                display: flex;
                flex-direction: column;
                height: calc(100vh - 60px);
                background: #f5f5f5;
            }
            
            .editor-header {
                background: white;
                padding: 15px 20px;
                border-bottom: 1px solid #ddd;
                box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            }
            
            .header-controls {
                display: flex;
                gap: 20px;
                align-items: center;
            }
            
            .control-group {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .control-group label {
                margin: 0;
                font-weight: 500;
            }
            
            #profile-selector {
                min-width: 250px;
            }
            
            .editor-content {
                display: flex;
                flex: 1;
                overflow: hidden;
            }
            
            .editor-sidebar {
                width: 350px;
                background: white;
                border-right: 1px solid #ddd;
                overflow-y: auto;
                padding: 20px;
            }
            
            .sidebar-section {
                margin-bottom: 30px;
            }
            
            .sidebar-section h4 {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 15px;
                color: #333;
            }
            
            .editor-main {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
            }
            
            .preview-container {
                background: white;
                border-radius: 4px;
                padding: 20px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            
            .preview-container h4 {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 15px;
                color: #333;
            }
            
            .display-preview {
                border: 2px solid #ddd;
                border-radius: 4px;
                min-height: 500px;
                background: #000;
                color: #fff;
                padding: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            }
            
            .profile-detail {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #f0f0f0;
            }
            
            .profile-detail:last-child {
                border-bottom: none;
            }
            
            .profile-detail-label {
                font-weight: 500;
                color: #666;
            }
            
            .profile-detail-value {
                color: #333;
            }
            
            .block-item {
                background: #f9f9f9;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                padding: 12px;
                margin-bottom: 10px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .block-item:hover {
                background: #f0f0f0;
                border-color: #d0d0d0;
            }
            
            .block-item.selected {
                background: #e8f4fd;
                border-color: #2490ef;
            }
            
            .block-item-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 5px;
            }
            
            .block-item-title {
                font-weight: 500;
                color: #333;
            }
            
            .block-item-type {
                font-size: 11px;
                color: #888;
                background: #e0e0e0;
                padding: 2px 6px;
                border-radius: 3px;
            }
            
            .block-item-info {
                font-size: 12px;
                color: #666;
            }
        `;
        document.head.appendChild(style);
    },
    
    /**
     * Bind event handlers
     */
    bindEvents: function() {
        // Profile selector
        const profileSelector = document.getElementById('profile-selector');
        if (profileSelector) {
            profileSelector.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.loadProfile(e.target.value);
                }
            });
        }
        
        // New profile button
        const newProfileBtn = document.getElementById('new-profile-btn');
        if (newProfileBtn) {
            newProfileBtn.addEventListener('click', () => {
                this.createNewProfile();
            });
        }
        
        // Edit profile button
        const editProfileBtn = document.getElementById('edit-profile-btn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', () => {
                this.editCurrentProfile();
            });
        }
        
        // Add block button
        const addBlockBtn = document.getElementById('add-block-btn');
        if (addBlockBtn) {
            addBlockBtn.addEventListener('click', () => {
                this.addBlock();
            });
        }
    },
    
    /**
     * Populate profile selector
     */
    populateProfileSelector: function() {
        const selector = document.getElementById('profile-selector');
        if (!selector) return;
        
        selector.innerHTML = '<option value="">Select Profile...</option>';
        
        this.state.profiles.forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.name;
            option.textContent = profile.profile_name + (profile.is_active ? '' : ' (Inactive)');
            if (profile.name === this.settings.profile) {
                option.selected = true;
            }
            selector.appendChild(option);
        });
        
        // Enable/disable edit button
        const editBtn = document.getElementById('edit-profile-btn');
        if (editBtn) {
            editBtn.disabled = !this.settings.profile;
        }
    },
    
    /**
     * Render profile details
     */
    renderProfileDetails: function() {
        const container = document.getElementById('profile-details');
        if (!container || !this.state.currentProfile) {
            if (container) container.innerHTML = '<p class="text-muted">No profile selected</p>';
            return;
        }
        
        const profile = this.state.currentProfile;
        container.innerHTML = `
            <div class="profile-detail">
                <span class="profile-detail-label">Branch:</span>
                <span class="profile-detail-value">${profile.branch || '-'}</span>
            </div>
            <div class="profile-detail">
                <span class="profile-detail-label">Layout Type:</span>
                <span class="profile-detail-value">${profile.layout_type || 'Grid'}</span>
            </div>
            <div class="profile-detail">
                <span class="profile-detail-label">Status:</span>
                <span class="profile-detail-value">${profile.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            ${profile.layout_type === 'Grid' ? `
                <div class="profile-detail">
                    <span class="profile-detail-label">Grid:</span>
                    <span class="profile-detail-value">${profile.grid_columns || 3} × ${profile.grid_rows || 2}</span>
                </div>
            ` : ''}
        `;
    },
    
    /**
     * Render blocks list
     */
    renderBlocksList: function() {
        const container = document.getElementById('blocks-list');
        if (!container) return;
        
        if (!this.state.currentProfile || !this.state.currentProfile.blocks || this.state.currentProfile.blocks.length === 0) {
            container.innerHTML = '<p class="text-muted">No blocks configured</p>';
            return;
        }
        
        container.innerHTML = this.state.currentProfile.blocks.map((block, idx) => `
            <div class="block-item" data-idx="${idx}">
                <div class="block-item-header">
                    <span class="block-item-title">${block.block_title || 'Block ' + (idx + 1)}</span>
                    <span class="block-item-type">${block.block_type || 'Static'}</span>
                </div>
                <div class="block-item-info">
                    ${block.content_type || 'Text'} - Position: ${block.grid_position || '-'}
                </div>
            </div>
        `).join('');
        
        // Bind click events to blocks
        container.querySelectorAll('.block-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.idx);
                this.selectBlock(idx);
            });
        });
        
        // Update preview
        this.renderPreview();
    },
    
    /**
     * Render display preview
     */
    renderPreview: function() {
        const container = document.getElementById('display-preview');
        if (!container || !this.state.currentProfile) return;
        
        const profile = this.state.currentProfile;
        
        if (!profile.blocks || profile.blocks.length === 0) {
            container.innerHTML = '<p class="text-muted">No blocks to display</p>';
            return;
        }
        
        const layoutClass = profile.layout_type === 'Grid' ? 'preview-grid' : 'preview-flex';
        const gridStyle = profile.layout_type === 'Grid' 
            ? `grid-template-columns: repeat(${profile.grid_columns || 3}, 1fr); grid-template-rows: repeat(${profile.grid_rows || 2}, 1fr);`
            : '';
        
        container.innerHTML = `
            <div class="${layoutClass}" style="${gridStyle}">
                ${profile.blocks.map(block => `
                    <div class="preview-block" style="grid-area: ${block.grid_position || 'auto'};">
                        <div class="preview-block-title">${block.block_title || 'Block'}</div>
                        <div class="preview-block-content">
                            ${block.content_type === 'Image' ? '🖼️ Image' : 
                              block.content_type === 'Video' ? '🎥 Video' : 
                              block.content_html || block.content_text || 'Empty'}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Add preview styles
        this.addPreviewStyles();
    },
    
    /**
     * Add preview-specific styles
     */
    addPreviewStyles: function() {
        if (document.getElementById('preview-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'preview-styles';
        style.textContent = `
            .preview-grid {
                display: grid;
                gap: 10px;
                width: 100%;
                height: 100%;
            }
            
            .preview-flex {
                display: flex;
                flex-direction: column;
                gap: 10px;
                width: 100%;
            }
            
            .preview-block {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                padding: 15px;
                overflow: hidden;
            }
            
            .preview-block-title {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 10px;
                color: #fff;
            }
            
            .preview-block-content {
                font-size: 14px;
                color: #ddd;
            }
        `;
        document.head.appendChild(style);
    },
    
    /**
     * Select a block
     * @param {Number} idx - Block index
     */
    selectBlock: function(idx) {
        this.state.selectedBlock = idx;
        
        // Update UI
        document.querySelectorAll('.block-item').forEach((item, i) => {
            if (i === idx) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    },
    
    /**
     * Create new profile
     */
    createNewProfile: function() {
        const d = new frappe.ui.Dialog({
            title: __('Create New Customer Display Profile'),
            fields: [
                {
                    fieldname: 'profile_name',
                    fieldtype: 'Data',
                    label: __('Profile Name'),
                    reqd: 1
                },
                {
                    fieldname: 'branch',
                    fieldtype: 'Link',
                    options: 'Branch',
                    label: __('Branch'),
                    default: this.settings.branch || CURRENT_BRANCH,
                    reqd: 1
                },
                {
                    fieldname: 'description',
                    fieldtype: 'Small Text',
                    label: __('Description')
                },
                {
                    fieldname: 'layout_type',
                    fieldtype: 'Select',
                    options: ['Grid', 'Flex', 'Full'],
                    label: __('Layout Type'),
                    default: 'Grid',
                    reqd: 1
                },
                {
                    fieldname: 'grid_columns',
                    fieldtype: 'Int',
                    label: __('Grid Columns'),
                    default: 3,
                    depends_on: 'eval:doc.layout_type=="Grid"'
                },
                {
                    fieldname: 'grid_rows',
                    fieldtype: 'Int',
                    label: __('Grid Rows'),
                    default: 2,
                    depends_on: 'eval:doc.layout_type=="Grid"'
                }
            ],
            primary_action_label: __('Create'),
            primary_action: (values) => {
                frappe.call({
                    method: 'frappe.client.insert',
                    args: {
                        doc: {
                            doctype: 'Customer Display Profile',
                            profile_name: values.profile_name,
                            branch: values.branch,
                            description: values.description,
                            layout_type: values.layout_type,
                            grid_columns: values.grid_columns || 3,
                            grid_rows: values.grid_rows || 2,
                            is_active: 1
                        }
                    },
                    callback: (r) => {
                        if (r.message) {
                            frappe.show_alert({
                                message: __('Profile created successfully'),
                                indicator: 'green'
                            });
                            d.hide();
                            
                            // Reload profiles and select the new one
                            this.loadProfiles().then(() => {
                                this.loadProfile(r.message.name);
                            });
                        }
                    },
                    error: (err) => {
                        frappe.msgprint({
                            title: __('Error'),
                            indicator: 'red',
                            message: err.message || __('Failed to create profile')
                        });
                    }
                });
            }
        });
        
        d.show();
    },
    
    /**
     * Edit current profile
     */
    editCurrentProfile: function() {
        if (!this.state.currentProfile) {
            frappe.msgprint(__('Please select a profile first'));
            return;
        }
        
        const profile = this.state.currentProfile;
        
        const d = new frappe.ui.Dialog({
            title: __('Edit Customer Display Profile'),
            fields: [
                {
                    fieldname: 'profile_name',
                    fieldtype: 'Data',
                    label: __('Profile Name'),
                    default: profile.profile_name,
                    reqd: 1
                },
                {
                    fieldname: 'branch',
                    fieldtype: 'Link',
                    options: 'Branch',
                    label: __('Branch'),
                    default: profile.branch,
                    reqd: 1,
                    read_only: 1
                },
                {
                    fieldname: 'description',
                    fieldtype: 'Small Text',
                    label: __('Description'),
                    default: profile.description
                },
                {
                    fieldname: 'is_active',
                    fieldtype: 'Check',
                    label: __('Is Active'),
                    default: profile.is_active
                },
                {
                    fieldname: 'layout_type',
                    fieldtype: 'Select',
                    options: ['Grid', 'Flex', 'Full'],
                    label: __('Layout Type'),
                    default: profile.layout_type || 'Grid',
                    reqd: 1
                },
                {
                    fieldname: 'grid_columns',
                    fieldtype: 'Int',
                    label: __('Grid Columns'),
                    default: profile.grid_columns || 3,
                    depends_on: 'eval:doc.layout_type=="Grid"'
                },
                {
                    fieldname: 'grid_rows',
                    fieldtype: 'Int',
                    label: __('Grid Rows'),
                    default: profile.grid_rows || 2,
                    depends_on: 'eval:doc.layout_type=="Grid"'
                }
            ],
            primary_action_label: __('Update'),
            primary_action: (values) => {
                frappe.call({
                    method: 'frappe.client.set_value',
                    args: {
                        doctype: 'Customer Display Profile',
                        name: profile.name,
                        fieldname: {
                            profile_name: values.profile_name,
                            description: values.description,
                            is_active: values.is_active,
                            layout_type: values.layout_type,
                            grid_columns: values.grid_columns || 3,
                            grid_rows: values.grid_rows || 2
                        }
                    },
                    callback: (r) => {
                        if (!r.exc) {
                            frappe.show_alert({
                                message: __('Profile updated successfully'),
                                indicator: 'green'
                            });
                            d.hide();
                            
                            // Reload the profile
                            this.loadProfile(profile.name);
                        }
                    },
                    error: (err) => {
                        frappe.msgprint({
                            title: __('Error'),
                            indicator: 'red',
                            message: err.message || __('Failed to update profile')
                        });
                    }
                });
            }
        });
        
        d.show();
    },
    
    /**
     * Add new block
     */
    addBlock: function() {
        if (!this.state.currentProfile) {
            frappe.msgprint(__('Please select a profile first'));
            return;
        }
        
        frappe.msgprint(__('Please use the "Edit Profile" button to add blocks through the form'));
    },
    
    /**
     * Show error message
     * @param {String} message - Error message
     */
    showError: function(message) {
        frappe.msgprint({
            title: __('Error'),
            indicator: 'red',
            message: message
        });
    }
};
