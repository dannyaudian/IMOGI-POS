import { KOTCard } from './KOTCard'

const STATE_CONFIG = {
  queued: {
    title: 'Queued',
    icon: '⏳',
    color: '#fbbf24',
    bgColor: '#fef3c7'
  },
  preparing: {
    title: 'In Progress',
    icon: '👨‍🍳',
    color: '#3b82f6',
    bgColor: '#dbeafe'
  },
  ready: {
    title: 'Ready',
    icon: '✅',
    color: '#10b981',
    bgColor: '#d1fae5'
  }
}

export function KOTColumn({ state, kots = [], onUpdateStatus, updating = false }) {
  const config = STATE_CONFIG[state]

  if (!config) {
    console.warn(`Unknown state: ${state}`)
    return null
  }

  return (
    <div className="kot-column" data-state={state}>
      <div className="column-header" style={{ borderColor: config.color }}>
        <span className="icon">{config.icon}</span>
        <h2>{config.title}</h2>
        <span className="count">{kots.length}</span>
      </div>

      <div className="kot-cards-container">
        {kots.length === 0 ? (
          <div className="empty-state">
            <p>No orders</p>
          </div>
        ) : (
          kots.map(kot => (
            <KOTCard
              key={kot.name}
              kot={kot}
              currentState={state}
              onUpdateStatus={onUpdateStatus}
              updating={updating}
            />
          ))
        )}
      </div>
    </div>
  )
}
