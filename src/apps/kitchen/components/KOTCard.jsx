import { KOTItem } from './KOTItem'
import { ActionButtons } from './ActionButtons'
import { formatElapsedTime } from '../utils/timeHelpers'

export function KOTCard({ kot, currentState }) {
  const elapsed = formatElapsedTime(kot.creation_time || kot.creation)

  return (
    <div className="kot-card" data-kot={kot.name}>
      <div className="kot-header">
        <div className="kot-info">
          <span className="kot-number">{kot.name}</span>
          <span className="kot-time" title={new Date(kot.creation).toLocaleString()}>
            {elapsed}
          </span>
        </div>
        <div className="kot-table">
          {kot.table ? (
            <>
              <i className="fa fa-utensils"></i>
              <span>{kot.table}</span>
            </>
          ) : (
            <>
              <i className="fa fa-cash-register"></i>
              <span>Counter</span>
            </>
          )}
        </div>
      </div>

      <div className="kot-items">
        {kot.items && kot.items.length > 0 ? (
          kot.items.map((item, idx) => (
            <KOTItem key={item.name || item.idx || idx} item={item} />
          ))
        ) : (
          <div className="no-items">No items</div>
        )}
      </div>

      <div className="kot-meta">
        {kot.kitchen_station && (
          <span className="station">
            <i className="fa fa-location-dot"></i>
            {kot.kitchen_station}
          </span>
        )}
      </div>

      <ActionButtons
        kot={kot}
        currentState={currentState}
      />
    </div>
  )
}
