import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import '@/shared/styles/global.css'

// Get initial state from server
const initialState = window.__INITIAL_STATE__ || {}

// Mount React app
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ImogiPOSProvider initialState={initialState}>
      <App initialState={initialState} />
    </ImogiPOSProvider>
  </React.StrictMode>
)
