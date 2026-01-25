import { useState, useEffect } from 'react'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { useTables, useItems } from '@/shared/api/imogi-api'
import { AppHeader, LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { TableLayout, OrderCart, MenuCatalog } from './components'
import { useCart, useTableOrder } from './hooks'
import './waiter.css'

function WaiterContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Waiter', 'Branch Manager', 'System Manager'])
  
  const branch = initialState.branch || 'Default'
  const posProfile = initialState.pos_profile || 'Default'
  const mode = initialState.mode || 'Dine-in' // Dine-in or Counter
  
  const [selectedTable, setSelectedTable] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  
  // Fetch data
  const { data: tablesData, error: tablesError, isLoading: tablesLoading, mutate: refreshTables } = useTables(branch)
  const { data: itemsData, error: itemsError, isLoading: itemsLoading } = useItems(branch, posProfile)
  
  // Ensure arrays are properly initialized
  const tables = Array.isArray(tablesData) ? tablesData : []
  const items = Array.isArray(itemsData) ? itemsData : []

  // Cart management
  const {
    items: cartItems,
    addItem,
    removeItem,
    updateQuantity,
    updateNotes,
    clearCart,
    getCartSummary
  } = useCart()

  // Order management
  const {
    loading: orderLoading,
    error: orderError,
    createAndSendToKitchen
  } = useTableOrder(branch)

  if (authLoading) {
    return <LoadingSpinner message="Authenticating..." />
  }

  if (authError || !hasAccess) {
    return <ErrorMessage error={authError || 'Access denied'} />
  }

  // Get unique categories
  const categories = items && items.length > 0
    ? [...new Set(items.map(item => item.item_group).filter(Boolean))]
    : []

  // Handle table selection
  const handleTableSelect = (table) => {
    if (mode === 'Counter') {
      // In counter mode, don't require table selection
      setSelectedTable(null)
    } else {
      setSelectedTable(table)
    }
  }

  // Handle add item to cart
  const handleAddToCart = (item) => {
    addItem(item)
  }

  // Handle send to kitchen
  const handleSendToKitchen = async () => {
    try {
      // Validate
      if (mode === 'Dine-in' && !selectedTable) {
        frappe.show_alert({
          message: 'Please select a table first',
          indicator: 'orange'
        }, 3)
        return
      }

      if (cartItems.length === 0) {
        frappe.show_alert({
          message: 'Cart is empty',
          indicator: 'orange'
        }, 3)
        return
      }

      // Create order and send to kitchen
      const result = await createAndSendToKitchen({
        table: mode === 'Dine-in' ? selectedTable.name : null,
        customer: 'Walk-in Customer',
        waiter: user.name,
        items: cartItems,
        mode: mode
      })

      // Success
      frappe.show_alert({
        message: `Order sent to kitchen! ${result.kots.length} KOT(s) created`,
        indicator: 'green'
      }, 5)

      // Clear cart and selection
      clearCart()
      setSelectedTable(null)
      refreshTables()

      // Show success animation
      setShowSuccessMessage(true)
      setTimeout(() => setShowSuccessMessage(false), 3000)

    } catch (error) {
      frappe.show_alert({
        message: error.message || 'Failed to send order',
        indicator: 'red'
      }, 5)
    }
  }

  const cartSummary = getCartSummary()

  return (
    <div className="waiter-app">
      <AppHeader title={mode === 'Dine-in' ? 'Waiter - Table Service' : 'Waiter - Counter Service'} user={user} />
      
      {orderError && (
        <div className="error-banner" style={{ margin: '1rem' }}>
          <ErrorMessage error={orderError} />
        </div>
      )}

      {showSuccessMessage && (
        <div className="success-banner">
          <div className="success-icon">✓</div>
          <p>Order sent to kitchen successfully!</p>
        </div>
      )}
      
      <main className="waiter-main">
        <div className="waiter-left-panel">
          {mode === 'Dine-in' && (
            <div className="table-section">
              <h3 className="section-title">
                Select Table {selectedTable && `- ${selectedTable.name}`}
              </h3>
              {tablesLoading && <LoadingSpinner message="Loading tables..." />}
              {tablesError && <ErrorMessage error={tablesError} />}
              {tables && (
                <TableLayout
                  tables={tables}
                  selectedTable={selectedTable}
                  onTableSelect={handleTableSelect}
                  mode={mode}
                />
              )}
            </div>
          )}

          <div className="menu-section">
            <h3 className="section-title">Menu</h3>
            {itemsLoading && <LoadingSpinner message="Loading menu..." />}
            {itemsError && <ErrorMessage error={itemsError} />}
            {items && (
              <MenuCatalog
                items={items}
                categories={categories}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
                onAddToCart={handleAddToCart}
                loading={itemsLoading}
              />
            )}
          </div>
        </div>

        <div className="waiter-right-panel">
          <OrderCart
            items={cartItems}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            onAddNote={updateNotes}
            onClearCart={clearCart}
            onSendToKitchen={handleSendToKitchen}
            loading={orderLoading}
          />
        </div>
      </main>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <WaiterContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
