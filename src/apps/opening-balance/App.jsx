import React, { useState, useEffect } from 'react'
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk'
import './styles.css'

const DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000]

function formatRupiah(val) {
  const digits = String(val).replace(/[^\d]/g, '')
  if (!digits) return 'Rp 0'
  const withDots = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return 'Rp ' + withDots
}

function App() {
  const params = new URLSearchParams(window.location.search)
  const device = params.get('device') || 'kiosk'
  const next = params.get('next') || '/service-select'

  const [quantities, setQuantities] = useState({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  // Get previous session data
  const { data: sessions } = useFrappeGetCall('imogi_pos.api.public.get_cashier_device_sessions')
  const lastSession = sessions?.[0]

  // Post opening balance
  const { call: recordBalance } = useFrappePostCall('imogi_pos.api.public.record_opening_balance')

  // Initialize quantities
  useEffect(() => {
    const initial = {}
    DENOMINATIONS.forEach(denom => {
      initial[denom] = 0
    })
    setQuantities(initial)
  }, [])

  // Calculate total
  useEffect(() => {
    let sum = 0
    const denoms = []
    DENOMINATIONS.forEach(denom => {
      const qty = quantities[denom] || 0
      const subtotal = denom * qty
      if (qty > 0) {
        denoms.push({ nominal: denom, quantity: qty, subtotal })
      }
      sum += subtotal
    })
    setTotal(sum)
  }, [quantities])

  const handleQuantityChange = (denom, value) => {
    // Remove non-digits
    const cleaned = value.replace(/[^\d]/g, '')
    // Remove leading zeros
    const normalized = cleaned.replace(/^0+(?=\d)/, '')
    
    setQuantities(prev => ({
      ...prev,
      [denom]: normalized === '' ? 0 : parseInt(normalized, 10)
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const denoms = []
      DENOMINATIONS.forEach(denom => {
        const qty = quantities[denom] || 0
        if (qty > 0) {
          denoms.push({
            nominal: denom,
            quantity: qty,
            subtotal: denom * qty
          })
        }
      })

      await recordBalance({
        device_type: device,
        opening_balance: total,
        denominations: denoms
      })

      // Redirect after success
      window.location.href = next
    } catch (err) {
      console.error('Failed to record opening balance:', err)
      alert(err.message || 'Failed to open session')
      setLoading(false)
    }
  }

  const getSubtotal = (denom) => {
    const qty = quantities[denom] || 0
    return denom * qty
  }

  return (
    <div className="opening-balance-wrapper">
      <div className="session-card">
        {/* Header Icon */}
        <div className="session-header">
          <i className="fas fa-cash-register"></i>
        </div>

        {/* Left: Cashier Device Session Details */}
        <div className="session-details">
          <h2>Cashier Session</h2>

          <div className="form-group">
            <label>
              <i className="fas fa-clock"></i> Timestamp
            </label>
            <div>{lastSession?.timestamp || '-'}</div>
          </div>
          
          <div className="form-group">
            <label>
              <i className="fas fa-user"></i> User
            </label>
            <div>{lastSession?.user || '-'}</div>
          </div>
          
          <div className="form-group">
            <label>
              <i className="fas fa-desktop"></i> Device
            </label>
            <div>{lastSession?.device || '-'}</div>
          </div>

          <div className="form-group">
            <label>
              <i className="fas fa-hashtag"></i> Shift ID
            </label>
            <div>{lastSession?.name || '-'}</div>
          </div>

          <div className="form-group">
            <label>
              <i className="fas fa-wallet"></i> Opening Balance
            </label>
            <div>{formatRupiah(total)}</div>
          </div>
        </div>

        {/* Right: Opening Balance Input Form */}
        <form id="opening-balance-form" className="opening-balance-form" onSubmit={handleSubmit}>
          <h3>
            <i className="fas fa-money-bill-wave"></i>
            New Opening Balance
          </h3>

          <table id="denomination-table">
            <thead>
              <tr>
                <th>Denomination</th>
                <th>Quantity</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {DENOMINATIONS.map(denom => (
                <tr key={denom} data-nominal={denom}>
                  <td className="denomination-value">{formatRupiah(denom)}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={quantities[denom] || 0}
                      onChange={(e) => handleQuantityChange(denom, e.target.value)}
                      onFocus={(e) => {
                        if (e.target.value === '0') e.target.value = ''
                        e.target.select()
                      }}
                      onBlur={(e) => {
                        if (e.target.value === '' || isNaN(parseInt(e.target.value))) {
                          handleQuantityChange(denom, '0')
                        }
                      }}
                      onKeyDown={(e) => {
                        if (['e', 'E', '+', '-', '.', ',', ' '].includes(e.key)) {
                          e.preventDefault()
                        }
                      }}
                      className="count"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      disabled={loading}
                    />
                  </td>
                  <td className="subtotal-value">{formatRupiah(getSubtotal(denom))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="2">Total</td>
                <td id="denomination-total">{formatRupiah(total)}</td>
              </tr>
            </tfoot>
          </table>

          <button type="submit" disabled={loading}>
            <i className="fas fa-play"></i>
            {loading ? 'Processing...' : 'Start'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default App
