import { useSelfOrderContext } from '../context/SelfOrderContext'
import { LoadingSpinner, ErrorMessage, Card } from '@/shared/components/UI'

export function SelfOrderMenu() {
  const { items, itemsLoading, itemsError } = useSelfOrderContext()

  return (
    <Card title="Menu">
      {itemsLoading && <LoadingSpinner message="Loading menu..." />}
      {itemsError && <ErrorMessage error={itemsError} />}
      {items && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.slice(0, 10).map(item => (
            <div
              key={item.item_code}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              <div>
                <strong>{item.item_name}</strong>
                {item.description && (
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {item.description}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: '#667eea', fontWeight: '600', fontSize: '1.125rem' }}>
                  ${item.rate || '0.00'}
                </span>
                <button className="btn-primary" style={{ padding: '0.5rem 1rem' }}>
                  Add
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
