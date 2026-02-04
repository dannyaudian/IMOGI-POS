import { useKitchenContext } from '../context/KitchenContext'

export function KitchenHeader({ kitchen, user }) {
  const { activeCount } = useKitchenContext()

  return (
    <div className="kitchen-header">
      <div className="kitchen-info">
        <h2>{kitchen} Kitchen</h2>
        <span className="active-count">{activeCount} active orders</span>
      </div>
      <div className="user-info">
        <span>{user?.display_name || 'Kitchen Staff'}</span>
      </div>
    </div>
  )
}
