import { useKitchenContext } from '../context/KitchenContext'

export function KitchenFilterBar() {
  const {
    selectedStation,
    setSelectedStation,
    showCompleted,
    setShowCompleted,
    lastUpdate,
    availableStations
  } = useKitchenContext()

  return (
    <div className="kitchen-filter-bar">
      <div className="filter-group">
        <label htmlFor="station-select">Station:</label>
        <select
          id="station-select"
          value={selectedStation || ''}
          onChange={(e) => setSelectedStation(e.target.value || null)}
        >
          <option value="">All Stations</option>
          {availableStations.map(station => (
            <option key={station} value={station}>
              {station}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="show-completed">
          <input
            id="show-completed"
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          Show Completed
        </label>
      </div>

      <div className="last-update">
        Last updated: {lastUpdate?.toLocaleTimeString()}
      </div>
    </div>
  )
}
