import React, { useState } from 'react'
import { apiCall } from '@/shared/utils/api'

/**
 * CustomerInfo Component
 * Customer selection and quick creation
 */
export function CustomerInfo({ 
  currentCustomer, 
  onCustomerSelect, 
  onCustomerCreate,
  disabled 
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newCustomer, setNewCustomer] = useState({
    customer_name: '',
    mobile_no: '',
    email: ''
  })

  // Search customers
  const handleSearch = async (term) => {
    setSearchTerm(term)
    if (term.length < 2) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const results = await apiCall('frappe.client.get_list', {
        doctype: 'Customer',
        filters: [
          ['customer_name', 'like', `%${term}%`],
          ['OR'],
          ['mobile_no', 'like', `%${term}%`]
        ],
        fields: ['name', 'customer_name', 'mobile_no', 'email'],
        limit: 10
      })
      setSearchResults(results || [])
    } catch (error) {
      console.error('[imogi][customer] Error searching customers:', error)
    } finally {
      setSearching(false)
    }
  }

  // Select customer
  const handleSelectCustomer = (customer) => {
    onCustomerSelect(customer)
    setShowSearch(false)
    setSearchTerm('')
    setSearchResults([])
  }

  // Create new customer
  const handleCreateCustomer = async () => {
    if (!newCustomer.customer_name) {
      frappe.show_alert({
        message: 'Customer name is required',
        indicator: 'red'
      })
      return
    }

    try {
      const customer = await apiCall('frappe.client.insert', {
        doc: {
          doctype: 'Customer',
          customer_name: newCustomer.customer_name,
          mobile_no: newCustomer.mobile_no,
          email: newCustomer.email,
          customer_type: 'Individual',
          customer_group: 'Individual'
        }
      })

      if (customer) {
        onCustomerCreate(customer)
        setShowCreateForm(false)
        setNewCustomer({ customer_name: '', mobile_no: '', email: '' })
        if (window.frappe && window.frappe.show_alert) {
          frappe.show_alert({
            message: 'Customer created successfully',
            indicator: 'green'
          })
        }
      }
    } catch (error) {
      console.error('[imogi][customer] Error creating customer:', error)
      if (window.frappe && window.frappe.show_alert) {
        frappe.show_alert({
          message: 'Error creating customer',
          indicator: 'red'
        })
      }
    }
  }

  // Use walk-in customer
  const handleWalkIn = () => {
    onCustomerSelect({
      name: 'Walk-In Customer',
      customer_name: 'Walk-In Customer'
    })
  }

  return (
    <div className="cashier-customer-info">
      <h4>Customer Information</h4>

      {/* Current Customer Display */}
      {currentCustomer ? (
        <div className="current-customer">
          <div className="customer-display">
            <div className="customer-icon">👤</div>
            <div className="customer-details">
              <strong>{currentCustomer.customer_name}</strong>
              {currentCustomer.mobile_no && (
                <div className="customer-phone">{currentCustomer.mobile_no}</div>
              )}
            </div>
          </div>
          <button 
            className="btn-change-customer"
            onClick={() => setShowSearch(true)}
            disabled={disabled}
          >
            Change
          </button>
        </div>
      ) : (
        <div className="customer-actions">
          <button 
            className="btn-walk-in"
            onClick={handleWalkIn}
            disabled={disabled}
          >
            🚶 Walk-In Customer
          </button>
          <button 
            className="btn-search-customer"
            onClick={() => setShowSearch(true)}
            disabled={disabled}
          >
            🔍 Search Customer
          </button>
          <button 
            className="btn-create-customer"
            onClick={() => setShowCreateForm(true)}
            disabled={disabled}
          >
            ➕ New Customer
          </button>
        </div>
      )}

      {/* Customer Search Modal */}
      {showSearch && (
        <div className="customer-search-modal">
          <div className="modal-header">
            <h3>Search Customer</h3>
            <button onClick={() => setShowSearch(false)}>✕</button>
          </div>

          <div className="search-input-group">
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="search-results">
            {searching && <div className="spinner"></div>}
            
            {searchResults.length > 0 ? (
              searchResults.map(customer => (
                <button
                  key={customer.name}
                  className="search-result-item"
                  onClick={() => handleSelectCustomer(customer)}
                >
                  <div className="customer-name">{customer.customer_name}</div>
                  {customer.mobile_no && (
                    <div className="customer-phone">{customer.mobile_no}</div>
                  )}
                </button>
              ))
            ) : searchTerm.length >= 2 && !searching ? (
              <div className="no-results">
                <p>No customers found</p>
                <button 
                  className="btn-create-new"
                  onClick={() => {
                    setShowSearch(false)
                    setShowCreateForm(true)
                  }}
                >
                  Create New Customer
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Create Customer Form */}
      {showCreateForm && (
        <div className="customer-create-modal">
          <div className="modal-header">
            <h3>Create New Customer</h3>
            <button onClick={() => setShowCreateForm(false)}>✕</button>
          </div>

          <div className="create-form">
            <div className="form-field">
              <label>Customer Name *</label>
              <input
                type="text"
                value={newCustomer.customer_name}
                onChange={(e) => setNewCustomer({...newCustomer, customer_name: e.target.value})}
                placeholder="Enter customer name"
              />
            </div>

            <div className="form-field">
              <label>Mobile Number</label>
              <input
                type="tel"
                value={newCustomer.mobile_no}
                onChange={(e) => setNewCustomer({...newCustomer, mobile_no: e.target.value})}
                placeholder="Enter mobile number"
              />
            </div>

            <div className="form-field">
              <label>Email</label>
              <input
                type="email"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                placeholder="Enter email (optional)"
              />
            </div>

            <div className="form-actions">
              <button 
                className="btn-cancel"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-save"
                onClick={handleCreateCustomer}
              >
                Create Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
