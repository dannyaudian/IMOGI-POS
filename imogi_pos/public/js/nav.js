/**
 * IMOGI POS - Navigation & Header UI
 * 
 * Handles header components, back button, POS Profile switching,
 * branch selection, and brand styling.
 */

const IMOGINav = {
    /**
     * Initialize navigation functionality
     * @param {Object} options - Configuration options
     * @param {string} [options.container='#imogi-header'] - Header container selector
     * @param {boolean} [options.showBack=true] - Show back button
     * @param {boolean} [options.showBranch=true] - Show branch selector
     * @param {boolean} [options.showProfile=true] - Show POS Profile selector
     * @param {boolean} [options.showLogo=true] - Show brand logo
     * @param {boolean} [options.showUser=true] - Show user menu
     * @param {Function} [options.onBack] - Custom back button handler
     * @param {Function} [options.onBranchChange] - Branch change callback
     * @param {Function} [options.onProfileChange] - Profile change callback
     * @param {string} [options.backUrl] - URL to navigate on back button click
     * @param {string} [options.activeBranch] - Initial active branch
     * @param {string} [options.activeProfile] - Initial active POS Profile
     */
    init: function(options = {}) {
        this.options = Object.assign({
            container: '#imogi-header',
            showBack: true,
            showBranch: true,
            showProfile: true,
            showLogo: true,
            showUser: true,
            onBack: null,
            onBranchChange: null,
            onProfileChange: null,
            backUrl: null,
            activeBranch: null,
            activeProfile: null
        }, options);

        this.container = document.querySelector(this.options.container);
        
        if (!this.container) {
            console.error('IMOGI Nav: Header container not found');
            return;
        }

        this.loadActiveBranch()
            .then(() => this.loadActiveProfile())
            .then(() => this.loadBrandingAssets())
            .then(() => this.renderHeader())
            .then(() => this.bindEvents())
            .catch(err => console.error('IMOGI Nav initialization error:', err));

        // Listen for branch updates from other tabs/windows
        if (window.BroadcastChannel) {
            this.branchChannel = new BroadcastChannel('imogi_branch_updates');
            this.branchChannel.onmessage = (event) => {
                if (event.data.branch && event.data.branch !== this.activeBranch) {
                    this.updateActiveBranch(event.data.branch, false);
                }
            };
        }
    },

    /**
     * Load active branch from localStorage or server
     * @returns {Promise} Promise resolving with active branch
     */
    loadActiveBranch: function() {
        return new Promise((resolve) => {
            // First try from options
            if (this.options.activeBranch) {
                this.activeBranch = this.options.activeBranch;
                return resolve(this.activeBranch);
            }

            // Then try from localStorage
            const storedBranch = localStorage.getItem('imogi_active_branch');
            if (storedBranch) {
                this.activeBranch = storedBranch;
                return resolve(this.activeBranch);
            }

            // Lastly, fetch from server
            frappe.call({
                method: 'imogi_pos.api.public.get_active_branch',
                callback: (response) => {
                    if (response.message) {
                        this.activeBranch = response.message;
                        localStorage.setItem('imogi_active_branch', this.activeBranch);
                    }
                    resolve(this.activeBranch);
                }
            });
        });
    },

    /**
     * Load active POS Profile from localStorage or server
     * @returns {Promise} Promise resolving with active POS Profile
     */
    loadActiveProfile: function() {
        return new Promise((resolve) => {
            // First try from options
            if (this.options.activeProfile) {
                this.activeProfile = this.options.activeProfile;
                return resolve(this.activeProfile);
            }

            // Then try from localStorage
            const storedProfile = localStorage.getItem('imogi_active_pos_profile');
            if (storedProfile) {
                this.activeProfile = storedProfile;
                return resolve(this.activeProfile);
            }

            // Lastly, fetch from server
            frappe.call({
                method: 'imogi_pos.api.public.get_default_pos_profile',
                args: {
                    branch: this.activeBranch
                },
                callback: (response) => {
                    if (response.message) {
                        this.activeProfile = response.message;
                        localStorage.setItem('imogi_active_pos_profile', this.activeProfile);
                    }
                    resolve(this.activeProfile);
                }
            });
        });
    },

    /**
     * Load branding assets from POS Profile > Restaurant Settings > Company
     * @returns {Promise} Promise resolving when branding is loaded
     */
    loadBrandingAssets: function() {
        return new Promise((resolve) => {
            frappe.call({
                method: 'imogi_pos.api.public.get_branding_assets',
                args: {
                    pos_profile: this.activeProfile,
                    branch: this.activeBranch
                },
                callback: (response) => {
                    if (response.message) {
                        this.branding = response.message;
                        this.applyBrandingStyles();
                    }
                    resolve();
                }
            });
        });
    },

    /**
     * Apply branding styles as CSS variables
     */
    applyBrandingStyles: function() {
        if (!this.branding) return;

        const root = document.documentElement;
        
        // Apply primary colors
        if (this.branding.primary_color) {
            root.style.setProperty('--brand', this.branding.primary_color);
        }
        
        if (this.branding.accent_color) {
            root.style.setProperty('--accent', this.branding.accent_color);
        }
        
        if (this.branding.header_bg) {
            root.style.setProperty('--header-bg', this.branding.header_bg);
        }
        
        // Apply dark mode specific colors if in dark mode
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark && this.branding.dark_mode) {
            if (this.branding.dark_mode.primary_color) {
                root.style.setProperty('--brand', this.branding.dark_mode.primary_color);
            }
            if (this.branding.dark_mode.accent_color) {
                root.style.setProperty('--accent', this.branding.dark_mode.accent_color);
            }
        }
        
        // Apply any custom CSS variables
        if (this.branding.css_vars) {
            try {
                const customVars = JSON.parse(this.branding.css_vars);
                for (const [key, value] of Object.entries(customVars)) {
                    root.style.setProperty(`--${key}`, value);
                }
            } catch (e) {
                console.error('Error parsing custom CSS variables:', e);
            }
        }
        
        // Add class to body for branding
        if (this.branding.name) {
            document.body.classList.add(`brand-${this.branding.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`);
        }
    },

    /**
     * Render header components
     */
    renderHeader: function() {
        if (!this.container) return;
        
        // Clear existing content
        this.container.innerHTML = '';
        
        // Create header elements
        const header = document.createElement('div');
        header.className = 'imogi-header-content';
        
        // Back button
        if (this.options.showBack) {
            const backBtn = document.createElement('button');
            backBtn.className = 'imogi-back-btn';
            backBtn.innerHTML = '<i class="fa fa-arrow-left"></i>';
            backBtn.setAttribute('aria-label', 'Go back');
            header.appendChild(backBtn);
        }
        
        // Logo
        if (this.options.showLogo && this.branding) {
            const logoContainer = document.createElement('div');
            logoContainer.className = 'imogi-logo-container';
            
            if (this.branding.logo) {
                const logo = document.createElement('img');
                logo.src = this.branding.logo;
                logo.alt = this.branding.name || 'IMOGI POS';
                logo.className = 'imogi-logo';
                logoContainer.appendChild(logo);
            } else if (this.branding.name) {
                const textLogo = document.createElement('span');
                textLogo.className = 'imogi-text-logo';
                textLogo.textContent = this.branding.name;
                logoContainer.appendChild(textLogo);
            }
            
            header.appendChild(logoContainer);
        }
        
        // Branch selector
        if (this.options.showBranch) {
            const branchSelector = document.createElement('div');
            branchSelector.className = 'imogi-branch-selector';
            branchSelector.innerHTML = `
                <span class="imogi-selector-label">Branch:</span>
                <select class="imogi-branch-select"></select>
            `;
            header.appendChild(branchSelector);
        }
        
        // POS Profile selector
        if (this.options.showProfile) {
            const profileSelector = document.createElement('div');
            profileSelector.className = 'imogi-profile-selector';
            profileSelector.innerHTML = `
                <span class="imogi-selector-label">Profile:</span>
                <select class="imogi-profile-select"></select>
            `;
            header.appendChild(profileSelector);
        }
        
        // User menu
        if (this.options.showUser) {
            const userMenu = document.createElement('div');
            userMenu.className = 'imogi-user-menu';
            userMenu.innerHTML = `
                <button class="imogi-user-btn">
                    <i class="fa fa-user"></i>
                    <span class="imogi-username">${frappe.session.user}</span>
                </button>
                <div class="imogi-user-dropdown">
                    <a href="/app">Desk</a>
                    <a href="/app/settings">Settings</a>
                    <a href="#" class="imogi-logout">Logout</a>
                </div>
            `;
            header.appendChild(userMenu);
        }
        
        this.container.appendChild(header);
        
        // Populate branch selector
        if (this.options.showBranch) {
            this.populateBranchSelector();
        }
        
        // Populate profile selector
        if (this.options.showProfile) {
            this.populateProfileSelector();
        }
    },

    /**
     * Populate branch selector dropdown
     */
    populateBranchSelector: function() {
        const branchSelect = this.container.querySelector('.imogi-branch-select');
        if (!branchSelect) return;
        
        frappe.call({
            method: 'imogi_pos.api.public.get_allowed_branches',
            callback: (response) => {
                if (response.message && Array.isArray(response.message)) {
                    // Clear existing options
                    branchSelect.innerHTML = '';
                    
                    // Add branches to dropdown
                    response.message.forEach(branch => {
                        const option = document.createElement('option');
                        option.value = branch.name;
                        option.textContent = branch.branch_name;
                        if (branch.name === this.activeBranch) {
                            option.selected = true;
                        }
                        branchSelect.appendChild(option);
                    });
                    
                    // If no branches, disable selector
                    if (response.message.length === 0) {
                        branchSelect.disabled = true;
                        branchSelect.innerHTML = '<option>No branches available</option>';
                    } else if (response.message.length === 1) {
                        // If only one branch, select it
                        this.updateActiveBranch(response.message[0].name);
                    }
                }
            }
        });
    },

    /**
     * Populate POS Profile selector dropdown
     */
    populateProfileSelector: function() {
        const profileSelect = this.container.querySelector('.imogi-profile-select');
        if (!profileSelect) return;
        
        frappe.call({
            method: 'imogi_pos.api.public.get_allowed_pos_profiles',
            args: {
                branch: this.activeBranch
            },
            callback: (response) => {
                if (response.message && Array.isArray(response.message)) {
                    // Clear existing options
                    profileSelect.innerHTML = '';
                    
                    // Add profiles to dropdown
                    response.message.forEach(profile => {
                        const option = document.createElement('option');
                        option.value = profile.name;
                        option.textContent = profile.profile_name || profile.name;
                        option.dataset.domain = profile.imogi_pos_domain || 'Restaurant';
                        option.dataset.mode = profile.imogi_mode || 'Table';
                        
                        if (profile.name === this.activeProfile) {
                            option.selected = true;
                        }
                        profileSelect.appendChild(option);
                    });
                    
                    // If no profiles, disable selector
                    if (response.message.length === 0) {
                        profileSelect.disabled = true;
                        profileSelect.innerHTML = '<option>No profiles available</option>';
                    } else if (response.message.length === 1) {
                        // If only one profile, select it
                        this.updateActiveProfile(response.message[0].name);
                    }
                }
            }
        });
    },

    /**
     * Bind events to header elements
     */
    bindEvents: function() {
        // Back button click
        const backBtn = this.container.querySelector('.imogi-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (typeof this.options.onBack === 'function') {
                    this.options.onBack();
                } else if (this.options.backUrl) {
                    window.location.href = this.options.backUrl;
                } else {
                    window.history.back();
                }
            });
        }
        
        // Branch selector change
        const branchSelect = this.container.querySelector('.imogi-branch-select');
        if (branchSelect) {
            branchSelect.addEventListener('change', () => {
                const newBranch = branchSelect.value;
                this.updateActiveBranch(newBranch);
            });
        }
        
        // Profile selector change
        const profileSelect = this.container.querySelector('.imogi-profile-select');
        if (profileSelect) {
            profileSelect.addEventListener('change', () => {
                const newProfile = profileSelect.value;
                this.updateActiveProfile(newProfile);
            });
        }
        
        // User menu toggle
        const userBtn = this.container.querySelector('.imogi-user-btn');
        if (userBtn) {
            userBtn.addEventListener('click', () => {
                const dropdown = this.container.querySelector('.imogi-user-dropdown');
                if (dropdown) {
                    dropdown.classList.toggle('active');
                }
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (event) => {
                const dropdown = this.container.querySelector('.imogi-user-dropdown');
                if (dropdown && dropdown.classList.contains('active') && 
                    !event.target.closest('.imogi-user-menu')) {
                    dropdown.classList.remove('active');
                }
            });
            
            // Logout button
            const logoutBtn = this.container.querySelector('.imogi-logout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.logout();
                });
            }
        }
        
        // Dark mode detection
        if (window.matchMedia) {
            const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            darkModeMediaQuery.addEventListener('change', () => {
                this.applyBrandingStyles();
            });
        }
    },

    /**
     * Update active branch
     * @param {string} branch - Branch name
     * @param {boolean} [broadcast=true] - Whether to broadcast the change
     */
    updateActiveBranch: function(branch, broadcast = true) {
        if (this.activeBranch === branch) return;
        
        this.activeBranch = branch;
        localStorage.setItem('imogi_active_branch', branch);
        
        // Broadcast branch change to other tabs
        if (broadcast && window.BroadcastChannel && this.branchChannel) {
            this.branchChannel.postMessage({ branch });
        }
        
        // Refresh profile selector with new branch
        this.populateProfileSelector();
        
        // Reload branding assets
        this.loadBrandingAssets().then(() => {
            // Update UI to reflect branch change
            const branchSelect = this.container.querySelector('.imogi-branch-select');
            if (branchSelect) {
                Array.from(branchSelect.options).forEach(option => {
                    option.selected = option.value === branch;
                });
            }
            
            // Call callback if provided
            if (typeof this.options.onBranchChange === 'function') {
                this.options.onBranchChange(branch);
            }
        });
        
        // Save to server
        frappe.call({
            method: 'imogi_pos.api.public.set_active_branch',
            args: { branch },
            callback: (response) => {
                if (!response.message) {
                    console.error('Failed to set active branch on server');
                }
            }
        });
    },

    /**
     * Update active POS Profile
     * @param {string} profile - POS Profile name
     */
    updateActiveProfile: function(profile) {
        if (this.activeProfile === profile) return;
        
        this.activeProfile = profile;
        localStorage.setItem('imogi_active_pos_profile', profile);
        
        // Get profile details
        frappe.call({
            method: 'imogi_pos.api.public.get_pos_profile_details',
            args: { profile },
            callback: (response) => {
                if (response.message) {
                    this.profileDetails = response.message;
                    
                    // Update branch if profile has default branch
                    if (response.message.imogi_branch && 
                        response.message.imogi_branch !== this.activeBranch) {
                        this.updateActiveBranch(response.message.imogi_branch);
                    }
                    
                    // Reload branding assets
                    this.loadBrandingAssets().then(() => {
                        // Update UI to reflect profile change
                        const profileSelect = this.container.querySelector('.imogi-profile-select');
                        if (profileSelect) {
                            Array.from(profileSelect.options).forEach(option => {
                                option.selected = option.value === profile;
                            });
                        }
                        
                        // Call callback if provided
                        if (typeof this.options.onProfileChange === 'function') {
                            this.options.onProfileChange(profile, this.profileDetails);
                        }
                    });
                }
            }
        });
    },

    /**
     * Get active branch
     * @returns {string} Active branch name
     */
    getActiveBranch: function() {
        return this.activeBranch;
    },

    /**
     * Get active POS Profile
     * @returns {string} Active POS Profile name
     */
    getActiveProfile: function() {
        return this.activeProfile;
    },

    /**
     * Get POS Profile domain (Restaurant/Retail/Service)
     * @returns {string} Domain name
     */
    getProfileDomain: function() {
        if (!this.profileDetails) return 'Restaurant'; // Default
        return this.profileDetails.imogi_pos_domain || 'Restaurant';
    },

    /**
     * Get POS Profile mode (Table/Counter/Kiosk/Self-Order)
     * @returns {string} Mode name
     */
    getProfileMode: function() {
        if (!this.profileDetails) return 'Table'; // Default
        return this.profileDetails.imogi_mode || 'Table';
    },

    /**
     * Check if a domain-specific feature is enabled
     * @param {string} feature - Feature name
     * @returns {boolean} Whether feature is enabled
     */
    isFeatureEnabled: function(feature) {
        if (!this.profileDetails) return false;
        return Boolean(this.profileDetails[feature]);
    },

    /**
     * Get branding assets
     * @returns {Object} Branding information
     */
    getBranding: function() {
        return this.branding || {};
    },

    /**
     * Logout current user
     */
    logout: function() {
        frappe.call({
            method: 'logout',
            callback: function() {
                window.location.href = '/login';
            }
        });
    }
};

// Export for module usage
if (typeof module !== 'undefined') {
    module.exports = IMOGINav;
}