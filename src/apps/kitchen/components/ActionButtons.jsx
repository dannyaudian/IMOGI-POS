export function ActionButtons({ kot, currentState, onUpdateStatus, updating = false }) {
  const handleAction = (newState) => {
    if (updating) return
    onUpdateStatus(kot.name, newState)
  }

  const renderButtons = () => {
    switch (currentState) {
      case 'queued':
        return (
          <button
            className="btn-primary"
            onClick={() => handleAction('In Progress')}
            disabled={updating}
          >
            <i className="fa fa-play"></i>
            Start Preparing
          </button>
        )

      case 'preparing':
        return (
          <div className="button-group">
            <button
              className="btn-primary"
              onClick={() => handleAction('Ready')}
              disabled={updating}
            >
              <i className="fa fa-check"></i>
              Mark Ready
            </button>
            <button
              className="btn-secondary"
              onClick={() => handleAction('Queued')}
              disabled={updating}
              title="Return to Queue"
            >
              <i className="fa fa-rotate-left"></i>
            </button>
          </div>
        )

      case 'ready':
        return (
          <div className="button-group">
            <button
              className="btn-success"
              onClick={() => handleAction('Served')}
              disabled={updating}
            >
              <i className="fa fa-utensils"></i>
              Mark Served
            </button>
            <button
              className="btn-secondary"
              onClick={() => handleAction('In Progress')}
              disabled={updating}
              title="Return to Kitchen"
            >
              <i className="fa fa-rotate-left"></i>
            </button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="kot-actions">
      {renderButtons()}
      <button
        className="btn-danger btn-icon"
        onClick={() => {
          if (confirm(`Cancel KOT ${kot.name}?`)) {
            handleAction('Cancelled')
          }
        }}
        disabled={updating}
        title="Cancel KOT"
      >
        <i className="fa fa-times"></i>
      </button>
    </div>
  )
}
