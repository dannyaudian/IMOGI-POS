/**
 * IMOGI POS - Branch Utility
 *
 * Manages active branch selection across browser tabs and persists
 * the current branch in localStorage. Exposes a global CURRENT_BRANCH
 * variable for other scripts.
 */

const IMOGIBranch = {
    storageKey: 'imogi_active_branch',
    channelName: 'imogi_branch_updates',
    current: null,
    channel: null,

    /**
     * Initialize branch manager
     */
    init() {
        // Load from localStorage if available
        this.current = localStorage.getItem(this.storageKey) || null;
        window.CURRENT_BRANCH = this.current;

        // Setup broadcast channel for cross-tab updates
        if (window.BroadcastChannel) {
            this.channel = new BroadcastChannel(this.channelName);
            this.channel.onmessage = (event) => {
                if (event.data.branch && event.data.branch !== this.current) {
                    this.current = event.data.branch;
                    localStorage.setItem(this.storageKey, this.current);
                    window.CURRENT_BRANCH = this.current;
                }
            };
        }

        // If no branch stored, fetch from server
        if (!this.current && typeof frappe !== 'undefined') {
            frappe.call({
                method: 'imogi_pos.api.public.get_active_branch',
                callback: (r) => {
                    if (r.message) {
                        this.set(r.message, false);
                    }
                }
            });
        }
    },

    /**
     * Set active branch
     * @param {string} branch - Branch name
     * @param {boolean} [broadcast=true] - Broadcast change to other tabs
     */
    set(branch, broadcast = true) {
        if (!branch) return;
        this.current = branch;
        localStorage.setItem(this.storageKey, branch);
        window.CURRENT_BRANCH = branch;

        if (broadcast && this.channel) {
            this.channel.postMessage({ branch });
        }

        if (typeof frappe !== 'undefined') {
            frappe.call({
                method: 'imogi_pos.api.public.set_active_branch',
                args: { branch }
            });
        }
    },

    /**
     * Get active branch
     * @returns {string|null} Current branch
     */
    get() {
        return this.current;
    }
};

// Initialize immediately
IMOGIBranch.init();

// Export for modules or global usage
if (typeof module !== 'undefined') {
    module.exports = IMOGIBranch;
} else {
    window.IMOGIBranch = IMOGIBranch;
}
