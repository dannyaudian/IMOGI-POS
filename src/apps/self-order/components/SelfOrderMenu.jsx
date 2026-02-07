import { useSelfOrderContext } from '../context/SelfOrderContext'
import { LoadingSpinner, ErrorMessage, Card } from '@/shared/components/UI'

export function SelfOrderMenu() {
  const { items, itemsLoading, itemsError } = useSelfOrderContext()

  const handleItemClick = (item) => {
    const hasVariants = item.has_variants === 1 || item.has_variants === true
    
    if (hasVariants) {
      if (window.frappe?.show_alert) {
        window.frappe.show_alert({
          message: `${item.item_name} has variants. Variant picker coming soon!`,
          indicator: 'orange'
        }, 3)
      }
      return
    }
    
    // TODO: Add to cart
    if (window.frappe?.show_alert) {
      window.frappe.show_alert({
        message: `${item.item_name} added to cart (placeholder)`,
        indicator: 'green'
      }, 2)
    }
  }

  return (
    <Card title="Menu">
      {itemsLoading && <LoadingSpinner message="Loading menu..." />}
      {itemsError && <ErrorMessage error={itemsError} />}
      {items && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.slice(0, 10).map(item => {
            const hasVariants = item.has_variants === 1 || item.has_variants === true
            
            return (
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
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <strong>{item.item_name}</strong>
                  {hasVariants && (
                    <span style={{
                      padding: '0.125rem 0.5rem',
                      background: '#3b82f6',
                      color: 'white',
                      fontSize: '0.625rem',
                      borderRadius: '4px',
                      fontWeight: '600'
                    }}>
                      HAS VARIANTS
                    </span>
                  )}
                </div>
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
                <button 
                  className="btn-primary" 
                  style={{ padding: '0.5rem 1rem' }}
                  onClick={() => handleItemClick(item)}
                >
                  Add
                </button>
              </div>
            </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
