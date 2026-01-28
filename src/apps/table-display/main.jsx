import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@/shared/styles/global.css'

const initialState = window.__INITIAL_STATE__ || {}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App initialState={initialState} />
  </React.StrictMode>
)

// Expose mount/unmount functions for Desk page integration
window.imogiTablesMount = function(element, options = {}) {
  const state = options.initialState || window.__INITIAL_STATE__ || {}
  const root = ReactDOM.createRoot(element)
  root.render(
    <React.StrictMode>
      <App initialState={state} />
    </React.StrictMode>
  )
  element._reactRoot = root
  return root
}

window.imogiTablesUnmount = function(element) {
  if (element._reactRoot) {
    element._reactRoot.unmount()
    element._reactRoot = null
  }
}
