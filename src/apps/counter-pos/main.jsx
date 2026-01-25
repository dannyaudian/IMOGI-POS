import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Get initial state from server
const initialState = window.__INITIAL_STATE__ || {}

// Mount React app
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App initialState={initialState} />
  </React.StrictMode>
)
