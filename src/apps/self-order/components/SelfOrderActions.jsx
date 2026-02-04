export function SelfOrderActions() {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'white',
      padding: '1rem',
      boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
      display: 'flex',
      justifyContent: 'center',
      gap: '1rem'
    }}>
      <button className="btn-secondary">View Cart (0)</button>
      <button className="btn-success">Place Order</button>
    </div>
  )
}
