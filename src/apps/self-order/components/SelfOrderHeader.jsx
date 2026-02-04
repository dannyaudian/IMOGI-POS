import { useSelfOrderContext } from '../context/SelfOrderContext'

export function SelfOrderHeader() {
  const { tableNumber } = useSelfOrderContext()

  return (
    <header style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '1rem',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Order from Your Table</h1>
      {tableNumber && <p style={{ margin: '0.5rem 0 0', opacity: 0.9 }}>Table: {tableNumber}</p>}
    </header>
  )
}
