/**
 * IMOGI POS - Centralized API Manager
 * ====================================
 *
 * Single source of truth for ALL API calls and HTTP requests.
 * Prevents conflicts, duplication, and inconsistent error handling.
 *
 * Key Features:
 * - Standardized CSRF token handling
 * - Consistent error messages and toast notifications
 * - Single method selection (GET vs POST)
 * - Type-safe request/response handling
 * - Automatic retry logic with exponential backoff
 * - Audit logging
 */

// ============================================================================
// CORE API FUNCTIONS - USE ONLY THESE
// ============================================================================

/**
 * CENTRALIZED: Make API call with automatic CSRF token, error handling, and logging
 * 
 * This is the ONLY function that should make API calls from JavaScript.
 * All other modules (React hooks, fetch wrappers, etc.) should use this.
 * 
 * @param {string} method - API method path (e.g., 'imogi_pos.api.billing.submit_order')
 * @param {Object} args - Method arguments
 * @param {Object} options - Call options
 * @returns {Promise} Promise resolving with response.message
 * 
 * @example
 * // Simple read call
 * const orders = await callAPI('imogi_pos.api.billing.list_orders', { pos_profile: 'Main' });
 * 
 * // Write call with options
 * await callAPI('imogi_pos.api.billing.submit_order', 
 *   { order_name: 'POS-001' },
 *   { freeze: true, notify: true }
 * );
 */
async function callAPI(method, args = {}, options = {}) {
  const {
    freeze = false,
    notify = true,
    retry = 3,
    timeout = 30000,
    silent = false,
    callback = null,
    error: errorCallback = null
  } = options;

  let loadingEl = null;

  try {
    // Show loading indicator if freeze is true
    if (freeze) {
      loadingEl = createLoadingOverlay();
    }

    // Ensure CSRF token is available
    const csrfToken = getCentralizedCSRFToken();
    if (!csrfToken) {
      throw new Error('CSRF token not found. Session may have expired.');
    }

    // Determine HTTP method based on args
    const isReadOnly = !args || Object.keys(args).length === 0;
    const httpMethod = isReadOnly ? 'GET' : 'POST';

    // Clean up null/undefined values to prevent 400 errors
    const cleanArgs = cleanArguments(args);

    // Make the API call with retry logic
    const response = await makeAPICallWithRetry(
      method,
      cleanArgs,
      httpMethod,
      csrfToken,
      retry,
      timeout
    );

    // Call success callback if provided
    if (callback) {
      callback(response);
    }

    // Return message
    return response.message;

  } catch (error) {
    // Log error with full context
    logAPIError(method, args, error);

    // Show visible error unless silent
    if (!silent && window.IMOGIToast) {
      const errorMessage = getReadableErrorMessage(error);
      IMOGIToast.error(errorMessage);
    }

    // Call error callback if provided
    if (errorCallback) {
      errorCallback(error);
    }

    throw error;

  } finally {
    // Clean up loading indicator
    if (loadingEl) {
      loadingEl.remove();
    }
  }
}

/**
 * CENTRALIZED: Get CSRF token from single source
 * 
 * Single source of truth prevents token mismatch errors.
 * Automatically caches token in window.FRAPPE_CSRF_TOKEN.
 * 
 * @returns {string} CSRF token
 */
function getCentralizedCSRFToken() {
  // Return cached value if already set
  if (window.FRAPPE_CSRF_TOKEN) {
    return window.FRAPPE_CSRF_TOKEN;
  }

  // Try to get from meta tag (server-provided)
  const meta = document.querySelector('meta[name="csrf_token"]');
  if (meta) {
    window.FRAPPE_CSRF_TOKEN = meta.getAttribute('content');
    return window.FRAPPE_CSRF_TOKEN;
  }

  // Fallback to cookie
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  if (match) {
    window.FRAPPE_CSRF_TOKEN = match[1];
    return window.FRAPPE_CSRF_TOKEN;
  }

  // Try frappe polyfill getter
  if (typeof frappe !== 'undefined' && frappe.csrf_token) {
    window.FRAPPE_CSRF_TOKEN = frappe.csrf_token;
    return window.FRAPPE_CSRF_TOKEN;
  }

  return '';
}

/**
 * CENTRALIZED: Make API call with exponential backoff retry
 */
async function makeAPICallWithRetry(
  method,
  args,
  httpMethod,
  csrfToken,
  maxRetries,
  timeout
) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`/api/method/${method}`, {
        method: httpMethod,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Frappe-CSRF-Token': csrfToken,
          'X-Frappe-API-Call': 'true'
        },
        credentials: 'include',
        body: httpMethod === 'POST' ? JSON.stringify(args) : undefined,
        timeout
      });

      // Handle non-200 responses
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;

        // 503 with Session Stopped = session expired, just throw error
        if (response.status === 503) {
          try {
            const errorData = await response.json();
            if (errorData.exc_type === 'SessionStopped' || 
                (errorData.exception && errorData.exception.includes('Session Stopped'))) {
              console.warn('[api-manager] Session expired (503) - user needs to re-authenticate');
              // Just throw error to let UI handle it
              error.sessionExpired = true;
              throw error;
            }
          } catch (parseError) {
            // If JSON parse fails, continue with normal error handling
          }
        }

        // Don't retry on 401/403 (auth issues)
        if (response.status === 401 || response.status === 403) {
          throw error;
        }

        throw error;
      }

      // Parse and return response
      const data = await response.json();

      // Check for server-side errors in successful response
      if (data.exc_type || data.exception) {
        const error = new Error(data.exception || data.exc_type || 'Server error');
        error.serverError = data.exc_type;
        throw error;
      }

      return data;

    } catch (error) {
      lastError = error;

      // Determine if we should retry
      const isRetryable = isRetryableError(error);
      const isLastAttempt = attempt === maxRetries;

      if (isRetryable && !isLastAttempt) {
        // Exponential backoff: 1s, 2s, 4s, etc.
        const delayMs = Math.pow(2, attempt) * 1000;
        console.log(`API call failed (attempt ${attempt + 1}), retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        // Give up
        throw error;
      }
    }
  }

  throw lastError;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error) {
  // Session expired errors should NOT be retried (redirect already triggered)
  if (error.sessionExpired) {
    return false;
  }

  // Network errors are retryable
  if (!error.status || error.status >= 500) {
    // But NOT 503 Session Stopped (handled above)
    if (error.status === 503) {
      return false;
    }
    return true;
  }

  // Auth errors are NOT retryable
  if (error.status === 401 || error.status === 403) {
    return false;
  }

  // Client errors are generally NOT retryable
  if (error.status >= 400 && error.status < 500) {
    return false;
  }

  return true;
}

/**
 * Clean up arguments (remove null/undefined values)
 */
function cleanArguments(args) {
  const cleaned = {};

  for (const [key, value] of Object.entries(args)) {
    if (value !== null && value !== undefined) {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Create loading overlay for freeze option
 */
function createLoadingOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'imogi-api-loading';
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.3);
    z-index: 99998;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  overlay.innerHTML = `
    <div style="background: white; padding: 20px 30px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 24px; height: 24px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span>Processing...</span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Get readable error message for user
 */
function getReadableErrorMessage(error) {
  if (!error) return 'Unknown error occurred';

  // HTTP errors
  if (error.status === 400) {
    return 'Bad request. Please check your input.';
  }
  if (error.status === 401) {
    return 'Session expired. Please login again.';
  }
  if (error.status === 403) {
    return 'Access denied. You do not have permission for this action.';
  }
  if (error.status === 404) {
    return 'API endpoint not found. Please contact administrator.';
  }
  if (error.status >= 500) {
    return 'Server error. Please try again later.';
  }

  // Network errors
  if (error.message === 'Failed to fetch') {
    return 'Network error. Please check your connection.';
  }

  // Default
  return error.message || 'An error occurred. Please try again.';
}

/**
 * Log API error with full context
 */
function logAPIError(method, args, error) {
  console.error('=== IMOGI API ERROR ===');
  console.error('Method:', method);
  console.error('Args:', args);
  console.error('Error:', error);
  console.error('Error Status:', error.status);
  console.error('Error Message:', error.message);
  console.error('=======================');
}

// ============================================================================
// REACT HOOKS - BUILT ON TOP OF CENTRALIZED API
// ============================================================================

/**
 * React Hook: Use API with SWR-like caching and revalidation
 * 
 * Works with both frappe-react-sdk and standalone usage.
 * Automatically waits for session to be ready before calling.
 * 
 * @example
 * const { data, error, loading, refetch } = useAPI('method.name', { arg: 'value' });
 */
function useAPIHook(method, args = {}, cacheKey = null, options = {}) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  // Wait for session ready before calling API
  React.useEffect(() => {
    if (typeof frappe === 'undefined' || !frappe.session) {
      setError(new Error('Session not initialized'));
      setLoading(false);
      return;
    }

    frappe.session.ready(async () => {
      try {
        const result = await callAPI(method, args, { ...options, silent: true });
        setData(result);
        setError(null);
      } catch (err) {
        setError(err);
        setData(null);
      } finally {
        setLoading(false);
      }
    });
  }, [method, JSON.stringify(args)]);

  const refetch = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await callAPI(method, args, { ...options, silent: true });
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [method, JSON.stringify(args)]);

  return { data, error, loading, refetch };
}

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Wrapper for old frappe.call usage
 * 
 * Redirects to new centralized callAPI
 * This ensures old code continues to work while new code uses centralized module.
 * 
 * TODO: Remove this after migrating all code to callAPI
 */
if (typeof frappe !== 'undefined') {
  const originalFrappeCall = frappe.call;

  frappe.call = function(opts) {
    const { method, args = {}, callback, error: errorCallback, ...rest } = opts;

    callAPI(method, args, {
      ...rest,
      callback,
      error: errorCallback
    }).catch(err => {
      // frappe.call compatibility
      if (errorCallback) {
        errorCallback(err);
      }
    });
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  callAPI,
  getCentralizedCSRFToken,
  makeAPICallWithRetry,
  isRetryableError,
  useAPIHook
};

// Export as default for backward compatibility
export default {
  callAPI,
  getCentralizedCSRFToken,
  CSRF_TOKEN_SOURCE: 'window.FRAPPE_CSRF_TOKEN',
  API_ENDPOINT: '/api/method/'
};
