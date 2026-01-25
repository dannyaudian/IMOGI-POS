import React, { useState } from 'react'
import { useFrappeGetDocList } from 'frappe-react-sdk'
import './styles.css'

// Dine In Modal Component
function DineInModal({ onClose }) {
  const [selectedZone, setSelectedZone] = useState('')
  const [error, setError] = useState('')

  const { data: zones = [] } = useFrappeGetDocList('Restaurant Floor', {
    fields: ['name'],
  })

  const { data: tables = [] } = useFrappeGetDocList('Restaurant Table', {
    fields: ['table_number'],
    filters: selectedZone ? [['floor', '=', selectedZone], ['status', '=', 'Available']] : undefined,
  }, selectedZone ? undefined : false)

  const handleTableClick = (tableNumber) => {
    localStorage.setItem('imogi_service_type', 'dine_in')
    localStorage.setItem('imogi_table_number', tableNumber)
    localStorage.setItem('imogi_table_zone', selectedZone)
    window.location.href = '/kiosk?service=dine-in'
  }

  return (
    <div className="dine-in-overlay" onClick={onClose}>
      <div className="dine-in-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">
          <i className="fa-solid fa-chair"></i>
        </div>
        <h3>Dine In</h3>
        
        <label>Pilih Zona</label>
        <select 
          id="dine-in-zone"
          value={selectedZone}
          onChange={(e) => {
            setSelectedZone(e.target.value)
            setError('')
          }}
        >
          <option value="">Silakan pilih zona</option>
          {zones.map((zone) => (
            <option key={zone.name} value={zone.name}>
              {zone.name}
            </option>
          ))}
        </select>

        <div className="dine-in-table-list" id="dine-in-table-list">
          {selectedZone && tables.length === 0 && (
            <div className="no-tables">Tidak ada meja kosong di zona ini</div>
          )}
          {selectedZone && tables.map((table) => (
            <div
              key={table.table_number}
              className="table-item"
              onClick={() => handleTableClick(table.table_number)}
            >
              Meja {table.table_number}
            </div>
          ))}
        </div>

        {error && (
          <div className="dine-in-error" style={{ display: 'block' }}>
            {error}
          </div>
        )}

        <div className="dine-in-footer">
          <button onClick={onClose}>Kembali</button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [showDineInModal, setShowDineInModal] = useState(false)

  const handleServiceClick = (service) => {
    if (service === 'dine_in') {
      setShowDineInModal(true)
    } else if (service === 'take_away') {
      localStorage.setItem('imogi_service_type', 'take_away')
      window.location.href = '/kiosk?service=take-away'
    }
  }

  return (
    <>
      {/* Header dengan logo dan nama restoran */}
      <div className="header-branding">
        <img src="/assets/imogi_pos/images/imogi2.png" alt="Restaurant Logo" className="restaurant-logo" />
        <h1 className="restaurant-name">Restaurant</h1>
        <p className="welcome-text">Selamat datang di IMOGI Restaurant. Silakan pilih layanan yang Anda inginkan.</p>
      </div>

      {/* Pilihan layanan */}
      <div className="service-select">
        {/* Dine In */}
        <a className="service-link" onClick={(e) => { e.preventDefault(); handleServiceClick('dine_in'); }} href="#">
          <i className="fa-solid fa-utensils"></i>
          <span>Dine In</span>
          <p className="description">Masuk dan nikmati makanan di tempat kami dengan suasana yang nyaman</p>
          
          {/* Icon-icon dekoratif */}
          <i className="fa-solid fa-wine-glass deco-icon deco-icon-1"></i>
          <i className="fa-solid fa-plate-wheat deco-icon deco-icon-2"></i>
          <i className="fa-solid fa-arrow-right continue-arrow"></i>
        </a>
        
        {/* Take Away */}
        <a className="service-link" onClick={(e) => { e.preventDefault(); handleServiceClick('take_away'); }} href="#">
          <i className="fa-solid fa-bag-shopping"></i>
          <span>Take Away</span>
          <p className="description">Ambil dan nikmati makanan Anda di mana saja dengan praktis</p>
          
          {/* Icon-icon dekoratif */}
          <i className="fa-solid fa-box deco-icon deco-icon-1"></i>
          <i className="fa-solid fa-mug-hot deco-icon deco-icon-2"></i>
          <i className="fa-solid fa-arrow-right continue-arrow"></i>
        </a>
      </div>

      {/* Footer dekoratif */}
      <div className="page-footer">
        <div className="footer-decoration">
          <i className="fa-solid fa-star"></i>
          <i className="fa-solid fa-utensils"></i>
          <i className="fa-solid fa-star"></i>
        </div>
        <p>© IMOGI Restaurant 2025</p>
      </div>

      {/* Dine In Modal */}
      {showDineInModal && (
        <DineInModal onClose={() => setShowDineInModal(false)} />
      )}
    </>
  )
}

export default App
