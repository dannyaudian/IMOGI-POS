import React, { useState, useEffect } from 'react'
import { useFrappeAuth, useSWRConfig } from 'frappe-react-sdk'
import './styles.css'

function App() {
  const { login } = useFrappeAuth()
  const { mutate } = useSWRConfig()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [branding, setBranding] = useState({ name: 'IMOGI POS', logo: null })

  // Load branding info
  useEffect(() => {
    const loadBranding = async () => {
      try {
        const response = await fetch('/api/method/imogi_pos.api.public.get_branding', {
          credentials: 'include'
        })
        if (response.ok) {
          const data = await response.json()
          if (data.message) {
            setBranding(data.message)
          }
        }
      } catch (err) {
        console.error('Failed to load branding:', err)
      }
    }
    loadBranding()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await login({ username, password })
      
      if (response) {
        // Clear all SWR cache after login
        mutate(() => true, undefined, { revalidate: false })
        
        // Get redirect URL from query params or default
        const urlParams = new URLSearchParams(window.location.search)
        const next = urlParams.get('next') || '/shared/module-select'
        
        // Redirect after successful login
        window.location.href = next
      }
    } catch (err) {
      console.error('Login error:', err)
      setError(err.message || 'Invalid username or password')
      setLoading(false)
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          {branding.logo && (
            <img src={branding.logo} alt={branding.name} className="brand-logo" />
          )}
          <h2>{branding.name}</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username or Email</label>
            <input
              type="text"
              id="username"
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>

          {error && <div className="error-message">{error}</div>}
        </form>
      </div>
    </div>
  )
}

export default App
