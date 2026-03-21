import { useKitchenContext } from '../context/KitchenContext'

export function ActionButtons({ kot, currentState }) {
  const { handleAction, stateLoading } = useKitchenContext()

  const handleClick = (action) => {
    if (stateLoading) return
    handleAction(action, kot.name).catch(err => {
      console.error('KOT action failed:', err)
    })
  }

  const handleCancel = () => {
    const reason = window.prompt(`Reason for cancelling KOT ${kot.name}?`)
    if (reason !== null && reason.trim()) {
      handleAction('cancel', kot.name, reason).catch(err => {
        console.error('KOT cancel failed:', err)
      })
    }
  }

  const renderButtons = () => {
    switch (currentState) {
      case 'queued':
        return (
          <button
            className="btn-primary"
            onClick={() => handleClick('start')}
            disabled={stateLoading}
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
              onClick={() => handleClick('ready')}
              disabled={stateLoading}
            >
              <i className="fa fa-check"></i>
              Mark Ready
            </button>
            <button
              className="btn-secondary"
              onClick={() => handleClick('return_queue')}
              disabled={stateLoading}
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
              onClick={() => handleClick('served')}
              disabled={stateLoading}
            >
              <i className="fa fa-utensils"></i>
              Mark Served
            </button>
            <button
              className="btn-secondary"
              onClick={() => handleClick('return_kitchen')}
              disabled={stateLoading}
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
        onClick={handleCancel}
        disabled={stateLoading}
        title="Cancel KOT"
      >
        <i className="fa fa-times"></i>
      </button>
    </div>
  )
}
