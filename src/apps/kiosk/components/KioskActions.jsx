import { useKioskContext } from '../context/KioskContext'

export function KioskActions() {
  const { cart, cartTotal } = useKioskContext()
  const itemCount = cart.reduce((sum, item) => sum + item.qty, 0)

  const handleCheckout = () => {
    if (itemCount === 0) {
      alert('Cart is empty')
      return
    }
    console.log('Checkout cart:', cart)
    alert(`Checkout: ${itemCount} items, Total: $${cartTotal.toFixed(2)}`)
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '80px',
      background: 'white',
      borderTop: '2px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 1.5rem',
      zIndex: 50,
      boxShadow: '0 -2px 10px rgba(0,0,0,0.1)'
    }}>
      <div>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'} in cart
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#667eea' }}>
          ${cartTotal.toFixed(2)}
        </div>
      </div>
      <button 
        className="btn-primary" 
        onClick={handleCheckout}
        style={{ fontSize: '1.125rem', padding: '0.75rem 2rem' }}
      >
        Proceed to Checkout
      </button>
    </div>
  )
}
