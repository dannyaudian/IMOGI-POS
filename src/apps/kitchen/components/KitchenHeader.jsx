export function KitchenHeader({ kitchen, station, totalKOTs = 0, user }) {
  return (
    <div className="kitchen-header">
      <div className="header-left">
        <h1>
          <i className="fa fa-kitchen-set"></i>
          Kitchen Display
        </h1>
        {kitchen && (
          <div className="header-info">
            <span className="kitchen-name">{kitchen}</span>
            {station && (
              <>
                <i className="fa fa-angle-right"></i>
                <span className="station-name">{station}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="header-right">
        <div className="active-orders">
          <span className="label">Active Orders:</span>
          <span className="count">{totalKOTs}</span>
        </div>
        {user && (
          <div className="user-info">
            <i className="fa fa-user"></i>
            <span>{user.full_name || user.name}</span>
          </div>
        )}
      </div>
    </div>
  )
}
