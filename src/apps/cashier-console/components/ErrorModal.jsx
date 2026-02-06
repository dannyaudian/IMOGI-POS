import React from 'react'
import PropTypes from 'prop-types'

/**
 * ErrorModal - Modal untuk menampilkan errors dengan retry option
 * Digunakan untuk API errors, payment errors, runtime errors
 */
export function ErrorModal({ 
  isOpen, 
  title = 'Error', 
  error, 
  onRetry, 
  onClose,
  showTechnicalDetails = false 
}) {
  if (!isOpen) return null

  const getErrorMessage = (err) => {
    if (!err) return 'An unknown error occurred'
    if (typeof err === 'string') return err
    if (err.message) return err.message
    if (err._server_messages) {
      try {
        const messages = JSON.parse(err._server_messages)
        return messages[0] || 'Server error occurred'
      } catch (e) {
        return err._server_messages
      }
    }
    if (err.exc) return err.exc
    return 'An error occurred. Please try again.'
  }

  const getTechnicalDetails = (err) => {
    if (!err) return null
    if (err.exc_type) return `${err.exc_type}: ${err.exc}`
    if (err.stack) return err.stack
    if (typeof err === 'object') return JSON.stringify(err, null, 2)
    return null
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && onClose) {
      onClose()
    }
  }

  const errorMessage = getErrorMessage(error)
  const technicalDetails = getTechnicalDetails(error)

  return (
    <div 
      className="cashier-error-modal-overlay" 
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-modal-title"
    >
      <div 
        className="cashier-error-modal-dialog" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cashier-error-modal-header">
          <div className="cashier-error-icon">
            <i className="fa-solid fa-exclamation-triangle"></i>
          </div>
          <h2 id="error-modal-title">{title}</h2>
          {onClose && (
            <button 
              className="cashier-error-modal-close"
              onClick={onClose}
              aria-label="Close error dialog"
            >
              <i className="fa-solid fa-times"></i>
            </button>
          )}
        </div>

        <div className="cashier-error-modal-body">
          <p className="cashier-error-message">{errorMessage}</p>
          
          {showTechnicalDetails && technicalDetails && (
            <details className="cashier-error-technical">
              <summary>Technical Details</summary>
              <pre className="cashier-error-stack">{technicalDetails}</pre>
            </details>
          )}
        </div>

        <div className="cashier-error-modal-footer">
          {onClose && (
            <button 
              className="cashier-btn cashier-btn-secondary"
              onClick={onClose}
              aria-label="Close error dialog"
            >
              <i className="fa-solid fa-times"></i>
              Close
            </button>
          )}
          {onRetry && (
            <button 
              className="cashier-btn cashier-btn-primary"
              onClick={() => {
                onRetry()
                onClose && onClose()
              }}
              aria-label="Retry operation"
            >
              <i className="fa-solid fa-rotate-right"></i>
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

ErrorModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  title: PropTypes.string,
  error: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      message: PropTypes.string,
      exc: PropTypes.string,
      exc_type: PropTypes.string,
      _server_messages: PropTypes.string,
      stack: PropTypes.string,
    }),
  ]),
  onRetry: PropTypes.func,
  onClose: PropTypes.func,
  showTechnicalDetails: PropTypes.bool,
}

ErrorModal.defaultProps = {
  title: 'Error',
  error: null,
  onRetry: null,
  onClose: null,
  showTechnicalDetails: false,
}
