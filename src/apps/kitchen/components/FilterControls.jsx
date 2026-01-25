export function FilterControls({ 
  stations = [], 
  selectedStation, 
  onStationChange,
  showCompleted = false,
  onToggleCompleted
}) {
  return (
    <div className="filter-controls">
      <div className="filter-group">
        <label>
          <i className="fa fa-filter"></i>
          Station:
        </label>
        <select
          value={selectedStation || ''}
          onChange={(e) => onStationChange(e.target.value || null)}
          className="station-filter"
        >
          <option value="">All Stations</option>
          {stations.map(station => (
            <option key={station} value={station}>
              {station}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label>
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => onToggleCompleted(e.target.checked)}
          />
          Show completed orders
        </label>
      </div>

      <div className="refresh-indicator">
        <i className="fa fa-sync"></i>
        <span>Auto-refresh every 5s</span>
      </div>
    </div>
  )
}
