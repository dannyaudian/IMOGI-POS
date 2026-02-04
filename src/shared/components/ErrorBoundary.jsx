import React from 'react'

/**
 * ErrorBoundary - Catch React errors and display graceful error UI
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
      errorCount: 0
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error, errorInfo) {
    // Log error for debugging
    console.error('[ErrorBoundary] React error caught:', error)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)

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
          componentStack: errorInfo.componentStack,
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

            {import.meta.env.DEV && (
              <details style={styles.details}>
                <summary style={styles.summary}>
                  Error Details (Development Mode)
                </summary>
                <pre style={styles.errorText}>
                  {this.state.error?.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
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
  }
}
