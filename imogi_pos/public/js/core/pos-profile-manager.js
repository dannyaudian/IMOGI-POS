/**
 * IMOGI POS - POS Profile Manager
 *
 * Manages active POS Profile selection across browser tabs and persists
 * the current POS Profile in localStorage. Provides derived branch info.
 * This replaces branch.js as the primary source of truth.
 * 
 * Usage:
 *   IMOGIPOSProfile.init()
 *   IMOGIPOSProfile.set('Counter POS', { syncToServer: true })
 *   IMOGIPOSProfile.get() // { name: 'Counter POS', branch: 'Jakarta', ... }
 *   IMOGIPOSProfile.getBranch() // 'Jakarta'
 */

const IMOGIPOSProfile = {
    storageKey: 'imogi_active_pos_profile',
    lastUsedKey: 'imogi:last_pos_profile',
    profileDataKey: 'imogi_pos_profile_data',
    channelName: 'imogi_pos_profile_updates',
    current: null,
    currentData: null,
    channel: null,
    initialized: false,

    /**
     * Initialize POS Profile manager
     * @returns {Promise<void>}
     */
    async init() {
        if (this.initialized) return;
        
        // Load from localStorage
        this.current = localStorage.getItem(this.lastUsedKey) || localStorage.getItem(this.storageKey) || null;
        
        try {
            const storedData = localStorage.getItem(this.profileDataKey);
            if (storedData) {
                this.currentData = JSON.parse(storedData);
            }
        } catch (e) {
            this.currentData = null;
        }

        // Update global variables for backward compatibility
        window.CURRENT_POS_PROFILE = this.current;
        if (this.currentData?.branch) {
            window.CURRENT_BRANCH = this.currentData.branch;
        }

        // Setup broadcast channel for cross-tab updates
        if (window.BroadcastChannel) {
            this.channel = new BroadcastChannel(this.channelName);
            this.channel.onmessage = (event) => {
                if (event.data.posProfile && event.data.posProfile !== this.current) {
                    this.current = event.data.posProfile;
                    this.currentData = event.data.profileData || null;
                    localStorage.setItem(this.storageKey, this.current);
                    localStorage.setItem(this.lastUsedKey, this.current);
                    if (this.currentData) {
                        localStorage.setItem(this.profileDataKey, JSON.stringify(this.currentData));
                    }
                    window.CURRENT_POS_PROFILE = this.current;
                    if (this.currentData?.branch) {
                        window.CURRENT_BRANCH = this.currentData.branch;
                    }
                    
                    // Dispatch custom event for React components to listen
                    window.dispatchEvent(new CustomEvent('posProfileChanged', {
                        detail: { posProfile: this.current, profileData: this.currentData }
                    }));
                }
            };
        }
        
        this.initialized = true;
    },

    /**
     * Set active POS Profile
     * @param {string} posProfile - POS Profile name
     * @param {Object} options - Options
     * @param {Object} [options.profileData] - Profile data (branch, domain, mode, etc)
     * @param {boolean} [options.broadcast=true] - Broadcast change to other tabs
     * @param {boolean} [options.syncToServer=false] - Sync to user's default field
     * @returns {Promise<Object>} Result from server if synced
     */
    async set(posProfile, options = {}) {
        const { profileData = null, broadcast = true, syncToServer = false } = options;
        
        if (!posProfile) return null;
        
        this.current = posProfile;
        this.currentData = profileData;
        localStorage.setItem(this.storageKey, posProfile);
        localStorage.setItem(this.lastUsedKey, posProfile);
        
        if (profileData) {
            localStorage.setItem(this.profileDataKey, JSON.stringify(profileData));
        }
        
        // Update global variables
        window.CURRENT_POS_PROFILE = posProfile;
        if (profileData?.branch) {
            window.CURRENT_BRANCH = profileData.branch;
            // Also update old storage for backward compatibility
            localStorage.setItem('imogi_active_branch', profileData.branch);
        }

        // Broadcast to other tabs
        if (broadcast && this.channel) {
            this.channel.postMessage({ posProfile, profileData });
        }
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('posProfileChanged', {
            detail: { posProfile, profileData }
        }));

        // Sync to server if requested
        if (syncToServer && typeof frappe !== 'undefined') {
            try {
                const result = await frappe.call({
                    method: 'imogi_pos.api.public.set_user_default_pos_profile',
                    args: { 
                        pos_profile: posProfile,
                        sync_to_server: true
                    }
                });
                return result?.message;
            } catch (e) {
                console.error('Error syncing POS Profile to server:', e);
            }
        }
        
        return { success: true, pos_profile: posProfile };
    },

    /**
     * Get current POS Profile name
     * @returns {string|null} Current POS Profile name
     */
    get() {
        return this.current;
    },
    
    /**
     * Get current POS Profile full data
     * @returns {Object|null} Current POS Profile data including branch, domain, mode
     */
    getData() {
        return this.currentData;
    },
    
    /**
     * Get branch derived from current POS Profile
     * @returns {string|null} Current branch name
     */
    getBranch() {
        return this.currentData?.branch || this.currentData?.imogi_branch || null;
    },
    
    /**
     * Get domain from current POS Profile
     * @returns {string|null} Domain (Restaurant/Retail/Service)
     */
    getDomain() {
        return this.currentData?.domain || this.currentData?.imogi_pos_domain || null;
    },
    
    /**
     * Get mode from current POS Profile
     * @returns {string|null} Mode (Table/Counter/Kiosk/Self-Order)
     */
    getMode() {
        return this.currentData?.mode || this.currentData?.imogi_mode || null;
    },

    /**
     * Clear current POS Profile selection
     * @param {boolean} [broadcast=true] - Broadcast change to other tabs
     */
    clear(broadcast = true) {
        this.current = null;
        this.currentData = null;
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.lastUsedKey);
        localStorage.removeItem(this.profileDataKey);
        window.CURRENT_POS_PROFILE = null;
        
        if (broadcast && this.channel) {
            this.channel.postMessage({ posProfile: null, profileData: null });
        }
        
        window.dispatchEvent(new CustomEvent('posProfileChanged', {
            detail: { posProfile: null, profileData: null }
        }));
    },
    
    /**
     * Load POS Profile info from server and set as current
     * @param {string} posProfile - POS Profile name to load
     * @param {Object} [options] - Options to pass to set()
     * @returns {Promise<Object|null>} Profile data or null
     */
    async loadFromServer(posProfile, options = {}) {
        if (!posProfile || typeof frappe === 'undefined') return null;
        
        try {
            const result = await frappe.call({
                method: 'frappe.client.get_value',
                args: {
                    doctype: 'POS Profile',
                    filters: { name: posProfile },
                    fieldname: ['name', 'imogi_branch', 'imogi_pos_domain', 'imogi_mode', 
                               'company', 'imogi_enable_cashier', 'imogi_enable_kot',
                               'imogi_enable_waiter', 'imogi_enable_kitchen']
                }
            });
            
            if (result?.message) {
                const profileData = {
                    name: result.message.name,
                    branch: result.message.imogi_branch,
                    domain: result.message.imogi_pos_domain,
                    mode: result.message.imogi_mode,
                    company: result.message.company,
                    enableCashier: result.message.imogi_enable_cashier,
                    enableKOT: result.message.imogi_enable_kot,
                    enableWaiter: result.message.imogi_enable_waiter,
                    enableKitchen: result.message.imogi_enable_kitchen
                };
                
                await this.set(posProfile, { profileData, ...options });
                return profileData;
            }
        } catch (e) {
            console.error('Error loading POS Profile from server:', e);
        }
        
        return null;
    }
};

// Initialize immediately
IMOGIPOSProfile.init();

// Export for modules or global usage
if (typeof module !== 'undefined') {
    module.exports = IMOGIPOSProfile;
} else {
    window.IMOGIPOSProfile = IMOGIPOSProfile;
}
