/* global frappe */
/* eslint-disable no-undef */

/**
 * IMOGI POS Login Form Handler
 * This is server-side Frappe JavaScript (not TypeScript)
 */

(function() {
  'use strict';

  const init = function() {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
  
    // Clear legacy session storage. Session persistence now relies on
    // secure, HTTP-only cookies set by the server.
    localStorage.removeItem('imogi_sid');

    // Get redirect URL from query parameter or set default
    const urlParams = new URLSearchParams(window.location.search);
    const redirectStorageKey = 'login_redirect';
    const redirectSourceKey = 'login_redirect_source';
    const redirectParam = urlParams.get('redirect');
    const fallbackRedirect = '/module-select';  // Updated from /cashier-console

    // Save the redirect URL for after login and remember if it was explicit
    const initialRedirect = redirectParam || fallbackRedirect;
    localStorage.setItem(redirectStorageKey, initialRedirect);
    localStorage.setItem(redirectSourceKey, redirectParam ? 'explicit' : 'default');
    
    // SECURITY WARNING: Never pass credentials in URL!
    // This is a major security vulnerability:
    // - Credentials stored in browser history
    // - Logged in server access logs
    // - Visible to anyone looking at screen
    // - Can be shared accidentally
    // Use session cookies or secure tokens instead
    
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      if (!username || !password) {
        showError('Please enter both username and password');
        return;
      }
      
      performLogin(username, password);
    });
    
    function performLogin(username, password) {
      // Disable form during submission
      setFormDisabled(true);
      
      // Call login API
      frappe.call({
        method: 'login',
        args: {
          usr: username,
          pwd: password,
          device: getDeviceInfo()
        },
        callback: function(response) {
          if (response.exc) {
            // Show error message
            showError('Login failed. Please check your credentials.');
            console.error(response.exc);
            setFormDisabled(false);
          } else if (response.message && response.message.message) {
            // Show message from server if any
            showError(response.message.message);
            setFormDisabled(false);
          } else if (
            response.message === 'Logged In' ||
            (frappe.session && frappe.session.user && frappe.session.user !== 'Guest')
          ) {
            // Login successful, fetch user info and redirect
            try {
              let sid = frappe.session && frappe.session.sid;
              if (!sid) {
                const match = document.cookie.match(/(^|;)\s*sid=([^;]+)/);
                sid = match ? decodeURIComponent(match[2]) : null;
              }
              if (sid) {
                // Store session id only in memory; persistence is handled by
                // server-managed HTTP-only cookies.
                frappe.sid = sid;
              }

              const storedRedirect = localStorage.getItem(redirectStorageKey) || fallbackRedirect;
              const redirectSource = localStorage.getItem(redirectSourceKey) || 'default';

              // Debug logging
              console.log('Login redirect info:', {
                storedRedirect,
                redirectSource,
                fallbackRedirect
              });

              frappe.call({
                method: 'imogi_pos.utils.auth_helpers.get_role_based_default_route',
                callback: function(r) {
                  let redirectTo = storedRedirect;
                  try {
                    console.log('Role-based route result:', r.message);
                    console.log('Redirect source is explicit?', redirectSource === 'explicit');
                    
                    // Use role-based routing ONLY if no explicit redirect
                    if (redirectSource !== 'explicit' && r.message) {
                      console.log('Using role-based redirect:', r.message);
                      redirectTo = r.message;
                    } else if (redirectSource === 'explicit') {
                      console.log('Using explicit redirect:', storedRedirect);
                      redirectTo = storedRedirect;
                    }

                    if (!redirectTo) {
                      redirectTo = r.message || '/app';
                    }

                    console.log('Final redirect URL:', redirectTo);
                    window.location.href = redirectTo;
                  } finally {
                    localStorage.removeItem(redirectStorageKey);
                    localStorage.removeItem(redirectSourceKey);
                  }
                },
                error: function() {
                  const redirectTo = storedRedirect || '/app';
                  window.location.href = redirectTo;
                  localStorage.removeItem(redirectStorageKey);
                  localStorage.removeItem(redirectSourceKey);
                }
              });
            } catch (e) {
              console.error('Redirect error:', e);
              window.location.href = fallbackRedirect;
              localStorage.removeItem(redirectStorageKey);
              localStorage.removeItem(redirectSourceKey);
            }
          } else {
            // Show error message if login did not succeed
            showError('Login failed. Please check your credentials.');
            setFormDisabled(false);
          }
        },
        error: function(xhr, textStatus) {
          showError('Login failed. Please try again.');
          console.error(textStatus);
          setFormDisabled(false);
        }
      });
    }
    
    function showError(message) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
    }
    
    function setFormDisabled(disabled) {
      const inputs = loginForm.querySelectorAll('input, button');
      inputs.forEach(function(input) {
        input.disabled = disabled;
      });
      
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      if (disabled) {
        submitBtn.textContent = 'Logging in...';
      } else {
        submitBtn.textContent = 'Login';
      }
    }
    
    function getDeviceInfo() {
      return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height
      };
    }
    
    // Initialize UI enhancements
    document.getElementById('username').focus();
  }; // End init function

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
