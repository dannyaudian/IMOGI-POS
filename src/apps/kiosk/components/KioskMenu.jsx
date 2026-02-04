import { useKioskContext } from '../context/KioskContext'

export function KioskMenu() {
  const { items, itemsLoading, itemsError } = useKioskContext()
  const { LoadingSpinner, ErrorMessage, Card } = require('@/shared/components/UI')

  return (
    <Card title="Welcome! Select your items">
      {itemsLoading && <LoadingSpinner message="Loading menu..." />}
      {itemsError && <ErrorMessage error={itemsError} />}
      {items && (
        <div className="grid grid-4">
          {items.slice(0, 12).map(item => (
            <div
              key={item.item_code}
              style={{
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.borderColor = '#667eea'}
              onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🍽️</div>
              <strong>{item.item_name}</strong>
              <div style={{ marginTop: '0.5rem', color: '#667eea', fontSize: '1.125rem' }}>
                ${item.rate || '0.00'}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
