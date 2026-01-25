import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import '@/shared/styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ImogiPOSProvider>
      <App />
    </ImogiPOSProvider>
  </React.StrictMode>
)
