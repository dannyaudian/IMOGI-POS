import { useTableDisplayContext } from '../context/TableDisplayContext'

export function TableGrid() {
  const { tables } = useTableDisplayContext()

  return (
    <main style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '1.5rem',
      maxWidth: '1400px',
      margin: '0 auto'
    }}>
      {tables && tables.map(table => {
        const statusColors = {
          'Available': '#10b981',
          'Occupied': '#f59e0b',
          'Reserved': '#3b82f6',
          'Cleaning': '#6b7280'
        }

        const bgColor = statusColors[table.status] || '#6b7280'

        return (
          <div
            key={table.name}
            style={{
              background: bgColor,
              borderRadius: '12px',
              padding: '2rem',
              textAlign: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              transition: 'transform 0.2s',
              cursor: 'pointer'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>
              {table.status === 'Available' ? '✓' : table.status === 'Occupied' ? '👥' : '⏰'}
            </div>
            <h2 style={{ fontSize: '1.75rem', margin: '0.5rem 0' }}>{table.name}</h2>
            <p style={{ opacity: 0.9, fontSize: '1.125rem' }}>{table.status}</p>
            {table.seating_capacity && (
              <p style={{ marginTop: '0.5rem', opacity: 0.8 }}>
                Seats: {table.seating_capacity}
              </p>
            )}
          </div>
        )
      })}
    </main>
  )
}
