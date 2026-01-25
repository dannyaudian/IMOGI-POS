import React from 'react'
import './styles.css'

function App() {
  const handleDeviceClick = (device, href) => {
    // Store device selection if needed
    localStorage.setItem('imogi_device_type', device)
    window.location.href = href
  }

  return (
    <div className="device-select-wrapper">
      <div className="device-select">
        <a 
          className="device-link" 
          onClick={(e) => {
            e.preventDefault()
            handleDeviceClick('kiosk', '/opening-balance?device=kiosk&next=/service-select')
          }}
          href="/opening-balance?device=kiosk&next=/service-select"
        >
          Kiosk
        </a>
        <a 
          className="device-link"
          onClick={(e) => {
            e.preventDefault()
            handleDeviceClick('cashier', '/cashier-console')
          }}
          href="/cashier-console"
        >
          Cashier
        </a>
      </div>
    </div>
  )
}

export default App
