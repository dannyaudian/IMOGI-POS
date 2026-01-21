/**
 * IMOGI POS - Authentication Helper
 * 
 * Provides authentication utilities for IMOGI POS web interfaces:
 * - Login helper (POST to /api/method/login)
 * - Session validation
 * - Guest redirection to /imogi-login
 * - Token-based access for guest-allowed pages
*/

// Remove any legacy session ID stored in localStorage.
// Session IDs are now managed by secure, HTTP-only cookies and kept only in
// memory via `frappe.sid` to mitigate XSS risks.
localStorage.removeItem('imogi_sid');

const IMOGIAuth = {
    /**
     * Initialize authentication system
     * @param {Object} options - Configuration options
     * @param {boolean} [options.redirectGuest=true] - Redirect guest users to login page
     * @param {boolean} [options.checkSession=true] - Validate session on initialization
     * @param {string} [options.loginPage='/imogi-login'] - Login page path
     * @param {Array<string>} [options.allowedGuestPages=[]] - Pages that allow guest access
     * @param {boolean} [options.allowTokenAccess=false] - Allow access via token (for self-order)
     * @param {Function} [options.onSessionExpired] - Callback when session expires
     * @param {Function} [options.onLogin] - Callback after successful login
     * @param {Function} [options.onLogout] - Callback after logout
     */
    init: function(options = {}) {
        this.options = Object.assign({
            redirectGuest: true,
            checkSession: true,
            loginPage: '/imogi-login',
            allowedGuestPages: [],
            allowTokenAccess: false,
            onSessionExpired: null,
            onLogin: null,
            onLogout: null
        }, options);

        // Set up session check interval (every 5 minutes)
        if (this.options.checkSession) {
            this.startSessionCheck();
            
            // Add listener for visibility change to check session when tab becomes visible
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this.checkSession();
                }
            });
        }
        
        // Check current session status
        if (this.options.redirectGuest) {
            this.validateCurrentSession();
        }
    },

    /**
     * Start periodic session check
     * Checks session validity every 5 minutes
     */
    startSessionCheck: function() {
        this.sessionCheckInterval = setInterval(() => {
            this.checkSession();
        }, 5 * 60 * 1000); // 5 minutes
    },

    /**
     * Stop periodic session check
     */
    stopSessionCheck: function() {
        if (this.sessionCheckInterval) {
            clearInterval(this.sessionCheckInterval);
            this.sessionCheckInterval = null;
        }
    },

    /**
     * Check if current session is valid
     * @returns {Promise<boolean>} Promise resolving to true if session is valid
     */
    checkSession: function() {
        return new Promise((resolve) => {
            frappe.call({
                method: 'imogi_pos.api.public.check_session',
                callback: (response) => {
                    const isValid = response.message && response.message.valid;
                    
                    if (!isValid && typeof this.options.onSessionExpired === 'function') {
                        this.options.onSessionExpired();
                    }
                    
                    if (!isValid && this.options.redirectGuest) {
                        this.redirectToLogin();
                    }
                    
                    resolve(isValid);
                },
                error: () => {
                    // On error, assume session is invalid
                    if (typeof this.options.onSessionExpired === 'function') {
                        this.options.onSessionExpired();
                    }
                    
                    if (this.options.redirectGuest) {
                        this.redirectToLogin();
                    }
                    
                    resolve(false);
                }
            });
        });
    },

    /**
     * Validate current session and redirect guest users if needed
     */
    validateCurrentSession: function() {
        // Check if we're on an allowed guest page
        const currentPath = window.location.pathname;
        if (this.options.allowedGuestPages.some(page => currentPath.startsWith(page))) {
            return; // Allow access to specified guest pages
        }
        
        // Check for token-based access (for self-order)
        if (this.options.allowTokenAccess && this.hasValidAccessToken()) {
            return; // Allow access with valid token
        }
        
        // For all other cases, check if user is logged in
        if (frappe.session.user === 'Guest') {
            this.redirectToLogin();
        } else {
            // Still verify the session is valid
            this.checkSession();
        }
    },

    /**
     * Check if current page has a valid access token
     * Used for self-order and other token-based access pages
     * @returns {boolean} Whether a valid token exists
     */
    hasValidAccessToken: function() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token') || params.get('slug');
        
        if (!token) return false;
        
        // Verify token on server - we'll do this asynchronously
        // but return true for now to prevent immediate redirect
        this.verifyAccessToken(token).catch(() => {
            // If token verification fails, redirect to login
            this.redirectToLogin();
        });
        
        return true;
    },

    /**
     * Verify an access token with the server
     * @param {string} token - Token or slug to verify
     * @returns {Promise} Promise that resolves if token is valid
     */
    verifyAccessToken: function(token) {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'imogi_pos.api.self_order.verify_session',
                args: {
                    token: token,
                    slug: token
                },
                callback: (response) => {
                    if (response.message) {
                        resolve(response.message);
                    } else {
                        reject(new Error('Invalid token'));
                    }
                },
                error: () => {
                    reject(new Error('Failed to verify token'));
                }
            });
        });
    },

    /**
     * Redirect to login page
     * @param {string} [returnTo] - URL to return to after login
     */
    redirectToLogin: function(returnTo) {
        const currentUrl = returnTo || window.location.href;
        const loginUrl = `${this.options.loginPage}?redirect=${encodeURIComponent(currentUrl)}`;
        window.location.href = loginUrl;
    },

    /**
     * Login with username and password
     * @param {string} username - Username/email
     * @param {string} password - Password
     * @param {string} [redirect] - URL to redirect to after login
     * @returns {Promise} Promise that resolves on successful login
     */
    login: function(username, password, redirect) {
        return new Promise((resolve, reject) => {
            if (!username || !password) {
                reject(new Error('Username and password are required'));
                return;
            }
            
            // Send login request
            $.ajax({
                type: 'POST',
                url: '/api/method/login',
                data: {
                    usr: username,
                    pwd: password
                },
                dataType: 'json',
                success: (data) => {
                    if (data.message === 'Logged In') {
                        // Update frappe session user
                        frappe.session.user = username;

                        // Store session id only in memory; persistence is handled by
                        // the server via HTTP-only cookies.
                        let sid = (frappe.session && frappe.session.sid);
                        if (!sid) {
                            const match = document.cookie.match(/(^|;)\s*sid=([^;]+)/);
                            sid = match ? decodeURIComponent(match[2]) : null;
                        }
                        if (sid) {
                            frappe.sid = sid;
                        }

                        // Call success callback
                        if (typeof this.options.onLogin === 'function') {
                            this.options.onLogin(username);
                        }

                        // Redirect based on explicit target or role defaults
                        if (redirect) {
                            window.location.href = redirect;
                        } else {
                            this.getCurrentUser()
                                .then((userInfo) => {
                                    const defaultRedirect = userInfo.default_redirect || '/';
                                    window.location.href = defaultRedirect;
                                })
                                .catch(() => {
                                    window.location.href = '/';
                                });
                        }

                        resolve(username);
                    } else {
                        reject(new Error('Login failed'));
                    }
                },
                error: (xhr) => {
                    let errorMessage = 'Login failed';
                    try {
                        const response = JSON.parse(xhr.responseText);
                        if (response && response._server_messages) {
                            const messages = JSON.parse(response._server_messages);
                            errorMessage = messages[0].message || 'Login failed';
                        }
                    } catch (e) {
                        errorMessage = 'Login failed: Server error';
                    }
                    reject(new Error(errorMessage));
                }
            });
        });
    },

    /**
     * Logout current user
     * @param {string} [redirect] - URL to redirect to after logout
     * @returns {Promise} Promise that resolves on successful logout
     */
    logout: function(redirect) {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'logout',
                callback: (response) => {
                    // Reset frappe session user
                    frappe.session.user = 'Guest';
                    
                    // Call logout callback
                    if (typeof this.options.onLogout === 'function') {
                        this.options.onLogout();
                    }
                    
                    // Redirect if specified
                    if (redirect) {
                        window.location.href = redirect;
                    } else if (this.options.redirectGuest) {
                        this.redirectToLogin();
                    }
                    
                    resolve();
                },
                error: (xhr) => {
                    reject(new Error('Logout failed'));
                }
            });
        });
    },

    /**
     * Get current user information
     * @returns {Promise<Object>} Promise resolving to user details
     */
    getCurrentUser: function() {
        return new Promise((resolve, reject) => {
            if (frappe.session.user === 'Guest') {
                resolve({ user: 'Guest', is_guest: true });
                return;
            }
            
            frappe.call({
                method: 'imogi_pos.api.public.get_current_user_info',
                callback: (response) => {
                    if (response.message) {
                        resolve(response.message);
                    } else {
                        reject(new Error('Failed to get user info'));
                    }
                },
                error: () => {
                    reject(new Error('Failed to get user info'));
                }
            });
        });
    },

    /**
     * Handle login form submission
     * @param {string} formId - ID of login form
     * @param {Object} options - Form handling options
     * @param {string} [options.usernameField='username'] - Username field name
     * @param {string} [options.passwordField='password'] - Password field name
     * @param {string} [options.submitButton='login-button'] - Submit button ID
     * @param {string} [options.errorContainer='login-error'] - Error container ID
     * @param {string} [options.redirect] - Redirect URL after login
     */
    handleLoginForm: function(formId, options = {}) {
        const form = document.getElementById(formId);
        if (!form) return;
        
        const opts = Object.assign({
            usernameField: 'username',
            passwordField: 'password',
            submitButton: 'login-button',
            errorContainer: 'login-error',
            redirect: null
        }, options);
        
        // Extract redirect from URL if present
        if (!opts.redirect) {
            const params = new URLSearchParams(window.location.search);
            opts.redirect = params.get('redirect') || '/';
        }
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const username = form.elements[opts.usernameField].value;
            const password = form.elements[opts.passwordField].value;
            
            // Disable submit button
            const submitButton = document.getElementById(opts.submitButton);
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.classList.add('loading');
            }
            
            // Clear previous errors
            const errorContainer = document.getElementById(opts.errorContainer);
            if (errorContainer) {
                errorContainer.textContent = '';
                errorContainer.style.display = 'none';
            }
            
            // Attempt login
            this.login(username, password, opts.redirect)
                .catch((error) => {
                    // Show error message
                    if (errorContainer) {
                        errorContainer.textContent = error.message;
                        errorContainer.style.display = 'block';
                    }
                })
                .finally(() => {
                    // Re-enable submit button
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.classList.remove('loading');
                    }
                });
        });
    },

    /**
     * Check if user has a specific role
     * @param {string} role - Role to check for
     * @returns {Promise<boolean>} Promise resolving to true if user has the role
     */
    hasRole: function(role) {
        return this.getCurrentUser().then(userInfo => {
            return userInfo.roles && userInfo.roles.includes(role);
        }).catch(() => false);
    },

    /**
     * Check if user has permission for a specific doctype
     * @param {string} doctype - DocType to check permissions for
     * @param {string} permType - Permission type (read, write, create, etc.)
     * @returns {Promise<boolean>} Promise resolving to true if user has permission
     */
    hasPermission: function(doctype, permType = 'read') {
        return new Promise((resolve) => {
            frappe.call({
                method: 'imogi_pos.api.public.check_permission',
                args: {
                    doctype: doctype,
                    perm_type: permType
                },
                callback: (response) => {
                    resolve(response.message === true);
                },
                error: () => {
                    resolve(false);
                }
            });
        });
    }
};

// Export for module usage
if (typeof module !== 'undefined') {
    module.exports = IMOGIAuth;
}