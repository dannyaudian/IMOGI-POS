import { FrappeProvider } from 'frappe-react-sdk'

/**
 * Root provider untuk semua IMOGI POS apps
 * Wraps aplikasi dengan FrappeProvider dan shared context
 */
export function ImogiPOSProvider({ children, initialState = {} }) {
  // Get Frappe site URL from window location (same domain)
  const frappeUrl = window.location.origin
  
  return (
    <FrappeProvider
      url={frappeUrl}
      tokenParams={{
        useToken: false, // Use cookie-based auth (same domain dengan ERPNext)
        type: 'Bearer'
      }}
    >
      {children}
    </FrappeProvider>
  )
}
