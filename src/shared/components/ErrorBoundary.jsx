import React from 'react'

/**
 * ErrorBoundary - Catch React errors and display graceful error UI
 * 
 * OBSERVABILITY ENHANCEMENTS:
 * - Captures build metadata (hash, commit, script URLs)
 * - Logs module loading information (type, order, URLs)
 * - Safe logging (no sensitive data like tokens, user emails)
 * - Integrates with global error handlers
 * 
 * Wraps entire app to prevent single component errors from crashing the whole app.
 * 
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      buildInfo: this.getBuildInfo(),
      scriptInfo: this.getScriptInfo()
    }
    
    // Register global error handlers once
    this.registerGlobalErrorHandlers()
  }

  /**
   * Extract build and deployment metadata
   * Used for error tracking and correlation
   */
  getBuildInfo() {
    // Try to get from manifest.json or build metadata
    const manifestScript = document.querySelector('script[src*="manifest"]')
    const mainScript = document.querySelector('script[data-imogi-app][src*="main"]')
    
    return {
      buildTime: window.__IMOGI_BUILD_TIME__ || 'unknown',
      commitHash: window.__IMOGI_COMMIT_HASH__ || 'unknown',
      appVersion: window.__IMOGI_VERSION__ || 'unknown',
      environment: import.meta.env.MODE || 'unknown',
      sourcemapEnabled: import.meta.env.DEV || window.location.search.includes('debug=1')
    }
  }

  /**
   * Extract script loading information
   * Helps diagnose module loading issues
   */
  getScriptInfo() {
    const scripts = {
      imogiLoader: null,
      mainBundles: [],
      css: []
    }

    // Find imogi loader
    const loaderScript = document.querySelector('script[src*="imogi_loader"]')
    if (loaderScript) {
      scripts.imogiLoader = {
        src: loaderScript.src,
        type: loaderScript.type || 'text/javascript',
        isModule: loaderScript.type === 'module'
      }
    }

    // Find main bundles (all scripts with data-imogi-app)
    document.querySelectorAll('script[data-imogi-app][src*="main"]').forEach(script => {
      scripts.mainBundles.push({
        app: script.dataset.imogiApp,
        src: script.src,
        type: script.type || 'text/javascript',
        isModule: script.type === 'module',
        async: script.async,
        defer: script.defer
      })
    })

    // Find CSS files
    document.querySelectorAll('link[data-imogi-app][rel="stylesheet"]').forEach(link => {
      scripts.css.push({
        app: link.dataset.imogiApp,
        href: link.href,
        media: link.media || 'all'
      })
    })

    return scripts
  }

  /**
   * Register global error handlers for unhandled errors
   * CRITICAL: Don't send sensitive data
   */
  registerGlobalErrorHandlers() {
    // Only register once per component instance
    if (this._globalHandlersRegistered) {
      return
    }
    this._globalHandlersRegistered = true

    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      // Filter out TDZ and reference errors
      if (
        event.error &&
        (event.error.message?.includes('Cannot access') ||
         event.error.message?.includes('before initialization') ||
         event.error.message?.includes('is not defined'))
      ) {
        console.error('[ErrorBoundary] Global Error Handler (TDZ/ReferenceError):', {
          type: 'reference_or_tdz_error',
          message: event.error.message,
          filename: this.sanitizeURL(event.filename),
          lineno: event.lineno,
          colno: event.colno,
          buildInfo: this.state.buildInfo,
          timestamp: new Date().toISOString()
        })

        // Send to error tracking if available
        if (window.__imogiErrorLogger) {
          try {
            window.__imogiErrorLogger({
              type: 'global_error',
              error: event.error.message,
              stack: event.error.stack,
              buildInfo: this.state.buildInfo,
              timestamp: new Date().toISOString()
            })
          } catch (err) {
            console.warn('[ErrorBoundary] Failed to log global error:', err)
          }
        }
      }
    })

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('[ErrorBoundary] Unhandled Promise Rejection:', {
        type: 'unhandled_rejection',
        reason: event.reason?.message || String(event.reason),
        buildInfo: this.state.buildInfo,
        timestamp: new Date().toISOString()
      })

      // Send to error tracking if available
      if (window.__imogiErrorLogger) {
        try {
          window.__imogiErrorLogger({
            type: 'unhandled_rejection',
            reason: event.reason?.message || String(event.reason),
            stack: event.reason?.stack || 'no stack',
            buildInfo: this.state.buildInfo,
            timestamp: new Date().toISOString()
          })
        } catch (err) {
          console.warn('[ErrorBoundary] Failed to log rejection:', err)
        }
      }
    })
  }

  /**
   * Sanitize URLs to avoid logging sensitive paths
   * @param {string} url - URL to sanitize
   * @returns {string} Sanitized URL
   */
  sanitizeURL(url) {
    if (!url) return 'unknown'
    // Remove query parameters and sensitive info
    const urlObj = new URL(url, window.location.origin)
    return `${urlObj.pathname}` // No query, just path
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error, errorInfo) {
    // Log error for debugging with full context
    const errorContext = {
      type: 'react_component_error',
      message: error.message,
      name: error.name,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      buildInfo: this.state.buildInfo,
      scriptInfo: this.state.scriptInfo,
      errorCount: this.state.errorCount + 1,
      timestamp: new Date().toISOString(),
      url: this.sanitizeURL(window.location.href),
      isDev: import.meta.env.DEV,
      hasSourceMap: this.state.buildInfo.sourcemapEnabled
    }

    console.error('[ErrorBoundary] React error caught:', errorContext)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)

    // Log with build metadata for correlation
    if (import.meta.env.DEV || window.location.search.includes('debug=1')) {
      console.group('[ErrorBoundary] Build Information')
      console.table(this.state.buildInfo)
      console.groupEnd()
      
      console.group('[ErrorBoundary] Script Loading Information')
      console.table(this.state.scriptInfo.mainBundles)
      console.groupEnd()
    }

    // Update state with error details
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }))

    // Send to error tracking service if available
    if (window.__imogiErrorLogger) {
      try {
        window.__imogiErrorLogger({
          type: 'react_error',
          error: error.toString(),
          message: error.message,
          componentStack: errorInfo.componentStack,
          buildInfo: this.state.buildInfo,
          timestamp: new Date().toISOString()
        })
      } catch (err) {
        console.error('[ErrorBoundary] Failed to log error:', err)
      }
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.content}>
            <div style={styles.icon}>⚠️</div>
            
            <h1 style={styles.title}>Oops! Something went wrong</h1>
            
            <p style={styles.description}>
              We encountered an unexpected error. Please try refreshing the page or contact support if the problem persists.
            </p>

            {(import.meta.env.DEV || window.location.search.includes('debug=1')) && (
              <>
                <details style={styles.details}>
                  <summary style={styles.summary}>
                    Error Details (Development Mode)
                  </summary>
                  <pre style={styles.errorText}>
                    {this.state.error?.toString()}
                    {'\n\n'}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>

                <details style={styles.details}>
                  <summary style={styles.summary}>
                    Build Information
                  </summary>
                  <pre style={styles.errorText}>
                    {JSON.stringify(this.state.buildInfo, null, 2)}
                  </pre>
                </details>

                <details style={styles.details}>
                  <summary style={styles.summary}>
                    Script Loading Information
                  </summary>
                  <pre style={styles.errorText}>
                    {JSON.stringify(this.state.scriptInfo, null, 2)}
                  </pre>
                </details>
              </>
            )}

            <div style={styles.actions}>
              <button
                onClick={this.handleReset}
                style={{ ...styles.button, ...styles.primaryButton }}
              >
                Try Again
              </button>
              
              <button
                onClick={() => window.location.reload()}
                style={{ ...styles.button, ...styles.secondaryButton }}
              >
                Refresh Page
              </button>
            </div>

            <p style={styles.errorCount}>
              Error Count: {this.state.errorCount}
            </p>

            {this.state.buildInfo.buildTime !== 'unknown' && (
              <p style={styles.buildVersion}>
                Build: {this.state.buildInfo.commitHash?.substring(0, 8)} @ {this.state.buildInfo.buildTime}
              </p>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  },
  content: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '40px',
    maxWidth: '600px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    textAlign: 'center'
  },
  icon: {
    fontSize: '64px',
    marginBottom: '20px'
  },
  title: {
    fontSize: '28px',
    fontWeight: '600',
    color: '#d32f2f',
    margin: '0 0 16px 0'
  },
  description: {
    fontSize: '16px',
    color: '#666',
    lineHeight: '1.6',
    margin: '0 0 24px 0'
  },
  details: {
    marginBottom: '24px',
    textAlign: 'left',
    backgroundColor: '#f9f9f9',
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '12px'
  },
  summary: {
    cursor: 'pointer',
    fontWeight: '600',
    color: '#666',
    userSelect: 'none'
  },
  errorText: {
    marginTop: '12px',
    backgroundColor: '#f5f5f5',
    padding: '12px',
    borderRadius: '4px',
    fontSize: '12px',
    overflow: 'auto',
    maxHeight: '200px',
    color: '#333',
    fontFamily: 'monospace'
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginBottom: '20px'
  },
  button: {
    padding: '10px 24px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  primaryButton: {
    backgroundColor: '#667eea',
    color: 'white'
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    color: '#333',
    border: '1px solid #ddd'
  },
  errorCount: {
    fontSize: '12px',
    color: '#999',
    margin: '0'
  },
  buildVersion: {
    fontSize: '11px',
    color: '#bbb',
    margin: '8px 0 0 0',
    fontFamily: 'monospace',
    borderTop: '1px solid #eee',
    paddingTop: '8px'
  }
}
