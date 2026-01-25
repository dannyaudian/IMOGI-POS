import React from 'react'

/**
 * OrderCart Component
 * Displays current cart items with totals and actions
 */
export function OrderCart({ 
  items, 
  onUpdateQuantity, 
  onRemoveItem, 
  onAddNote,
  onClearCart,
  onSendToKitchen,
  loading 
}) {
  // Ensure items is always an array
  const cartItems = Array.isArray(items) ? items : []
  
  const calculateSubtotal = () => {
    return cartItems.reduce((sum, item) => sum + (item.rate * item.qty), 0)
  }

  const getTotalItems = () => {
    return cartItems.reduce((sum, item) => sum + item.qty, 0)
  }

  if (cartItems.length === 0) {
    return (
      <div className="order-cart empty">
        <div className="cart-empty-state">
          <div className="empty-icon">🛒</div>
          <p>Cart is empty</p>
          <small>Add items from the menu</small>
        </div>
      </div>
    )
  }

  return (
    <div className="order-cart">
      <div className="cart-header">
        <h3>Order Cart ({getTotalItems()} items)</h3>
        <button 
          className="btn-clear-cart"
          onClick={onClearCart}
          disabled={loading}
        >
          Clear All
        </button>
      </div>

      <div className="cart-items">
        {cartItems.map((item, index) => (
          <CartItem
            key={`${item.item_code}-${index}`}
            item={item}
            onUpdateQuantity={(qty) => onUpdateQuantity(index, qty)}
            onRemove={() => onRemoveItem(index)}
            onAddNote={(note) => onAddNote(index, note)}
            disabled={loading}
          />
        ))}
      </div>

      <div className="cart-footer">
        <div className="cart-total">
          <span className="total-label">Subtotal:</span>
          <span className="total-amount">
            {frappe.format(calculateSubtotal(), { fieldtype: 'Currency' })}
          </span>
        </div>

        <button
          className="btn-send-kitchen"
          onClick={onSendToKitchen}
          disabled={loading || cartItems.length === 0}
        >
          {loading ? 'Sending...' : 'Send to Kitchen'}
        </button>
      </div>
    </div>
  )
}

function CartItem({ item, onUpdateQuantity, onRemove, onAddNote, disabled }) {
  const [showNoteInput, setShowNoteInput] = React.useState(false)
  const [note, setNote] = React.useState(item.notes || '')

  const handleSaveNote = () => {
    onAddNote(note)
    setShowNoteInput(false)
  }

  return (
    <div className="cart-item">
      <div className="cart-item-header">
        <div className="item-name">
          {item.item_name}
          {item.variant_of && (
            <small className="item-variant">({item.variant_of})</small>
          )}
        </div>
        <button
          className="btn-remove-item"
          onClick={onRemove}
          disabled={disabled}
          title="Remove item"
        >
          ×
        </button>
      </div>

      <div className="cart-item-details">
        <div className="item-quantity">
          <button
            className="qty-btn"
            onClick={() => onUpdateQuantity(item.qty - 1)}
            disabled={disabled || item.qty <= 1}
          >
            −
          </button>
          <span className="qty-value">{item.qty}</span>
          <button
            className="qty-btn"
            onClick={() => onUpdateQuantity(item.qty + 1)}
            disabled={disabled}
          >
            +
          </button>
        </div>

        <div className="item-price">
          {frappe.format(item.rate, { fieldtype: 'Currency' })}
        </div>

        <div className="item-total">
          {frappe.format(item.rate * item.qty, { fieldtype: 'Currency' })}
        </div>
      </div>

      {item.notes && !showNoteInput && (
        <div className="item-notes">
          <span className="notes-icon">📝</span>
          <span className="notes-text">{item.notes}</span>
          <button
            className="btn-edit-note"
            onClick={() => setShowNoteInput(true)}
          >
            Edit
          </button>
        </div>
      )}

      {showNoteInput && (
        <div className="item-note-input">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add special instructions..."
            rows={2}
          />
          <div className="note-actions">
            <button className="btn-save-note" onClick={handleSaveNote}>
              Save
            </button>
            <button 
              className="btn-cancel-note"
              onClick={() => {
                setNote(item.notes || '')
                setShowNoteInput(false)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!item.notes && !showNoteInput && (
        <button
          className="btn-add-note"
          onClick={() => setShowNoteInput(true)}
        >
          + Add note
        </button>
      )}
    </div>
  )
}
