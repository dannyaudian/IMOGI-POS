import React from 'react'
import PropTypes from 'prop-types'

/**
 * ErrorModal - Modal untuk menampilkan error dengan opsi retry
 */
function ErrorModal({ isOpen, error, onRetry, onClose }) {
  if (!isOpen) return null

  const getErrorMessage = (error) => {
    if (!error) return 'An unknown error occurred'
    if (typeof error === 'string') return error
    if (error.message) return error.message
    if (error.exc) return error.exc
    return 'Failed to load modules'
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose?.()
    }
  }

  return (
    <div 
      className="error-modal-overlay" 
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-modal-title"
    >
      <div 
        className="error-modal-dialog" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="error-modal-header">
          <div className="error-icon">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h2 id="error-modal-title">Error Loading Modules</h2>
        </div>

        <div className="error-modal-body">
          <p className="error-message">{getErrorMessage(error)}</p>
          <p className="error-hint">
            This could be due to network issues or server problems. 
            Please try again or contact support if the problem persists.
          </p>
        </div>

        <div className="error-modal-footer">
          <button 
            className="btn btn-secondary"
            onClick={onClose}
            aria-label="Close error dialog"
          >
            <i className="fa-solid fa-times"></i>
            Close
          </button>
          <button 
            className="btn btn-primary"
            onClick={onRetry}
            aria-label="Retry loading modules"
          >
            <i className="fa-solid fa-rotate-right"></i>
            Retry
          </button>
        </div>
      </div>
    </div>
  )
}

ErrorModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  error: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      message: PropTypes.string,
      exc: PropTypes.string,
    }),
  ]),
  onRetry: PropTypes.func.isRequired,
  onClose: PropTypes.func,
}

ErrorModal.defaultProps = {
  error: null,
  onClose: null,
}

export default ErrorModal
