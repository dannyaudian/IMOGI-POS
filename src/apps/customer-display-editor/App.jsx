import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { AppHeader, LoadingSpinner, ErrorMessage, Card } from '@/shared/components/UI'
import { useState, useEffect } from 'react'
import { useFrappeGetDoc, useFrappeUpdateDoc } from 'frappe-react-sdk'

function CustomerDisplayEditorContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Branch Manager', 'System Manager'])
  
  const posProfile = initialState.posProfile
  const branch = initialState.branch
  const branding = initialState.branding || {}
  
  // Fetch POS Profile settings
  const { data: posProfileDoc, error: profileError, isLoading: profileLoading, mutate } = useFrappeGetDoc(
    'POS Profile',
    posProfile,
    posProfile ? undefined : null
  )
  
  const { updateDoc, loading: saving } = useFrappeUpdateDoc()
  
  // Editor state
  const [settings, setSettings] = useState({
    showLogo: true,
    showImages: true,
    fontSize: 'large',
    theme: 'gradient',
    autoScroll: true,
    scrollSpeed: 3000,
    showTotalPrice: true
  })

  // Load settings from POS Profile
  useEffect(() => {
    if (posProfileDoc) {
      const customDisplaySettings = posProfileDoc.imogi_customer_display_settings
      if (customDisplaySettings) {
        try {
          const parsed = JSON.parse(customDisplaySettings)
          setSettings(prev => ({ ...prev, ...parsed }))
        } catch (e) {
          console.error('Failed to parse display settings:', e)
        }
      }
    }
  }, [posProfileDoc])

  if (authLoading || profileLoading) {
    return <LoadingSpinner message="Loading editor..." />
  }

  if (authError || !hasAccess) {
    return <ErrorMessage error={authError || 'Access denied - Manager role required'} />
  }

  if (profileError) {
    return <ErrorMessage error={`Failed to load POS Profile: ${profileError.message}`} />
  }

  const handleSave = async () => {
    try {
      await updateDoc('POS Profile', posProfile, {
        imogi_customer_display_settings: JSON.stringify(settings)
      })
      
      window.frappe.show_alert({ 
        message: 'Settings saved successfully!', 
        indicator: 'green' 
      })
      
      mutate()
    } catch (error) {
      console.error('Save failed:', error)
      window.frappe.show_alert({ 
        message: 'Failed to save settings', 
        indicator: 'red' 
      })
    }
  }

  return (
    <div className="imogi-app">
      <AppHeader title="Customer Display Editor" user={user} />
      
      <main className="imogi-main">
        <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
          <div>
            <h2>Configure Customer Display</h2>
            <p style={{ color: '#6b7280', marginTop: '0.25rem' }}>
              Branch: <strong>{branch}</strong> • POS Profile: <strong>{posProfile}</strong>
            </p>
          </div>
          <button 
            className="btn-primary" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
        
        <div className="grid-2" style={{ gap: '1.5rem', alignItems: 'start' }}>
          {/* Settings Panel */}
          <Card title="Display Settings">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox"
                  checked={settings.showLogo}
                  onChange={(e) => setSettings({...settings, showLogo: e.target.checked})}
                />
                <span>Show Brand Logo</span>
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox"
                  checked={settings.showImages}
                  onChange={(e) => setSettings({...settings, showImages: e.target.checked})}
                />
                <span>Show Item Images</span>
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox"
                  checked={settings.showTotalPrice}
                  onChange={(e) => setSettings({...settings, showTotalPrice: e.target.checked})}
                />
                <span>Show Total Price</span>
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox"
                  checked={settings.autoScroll}
                  onChange={(e) => setSettings({...settings, autoScroll: e.target.checked})}
                />
                <span>Auto-scroll Items</span>
              </label>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Font Size
                </label>
                <select 
                  value={settings.fontSize}
                  onChange={(e) => setSettings({...settings, fontSize: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="xlarge">Extra Large</option>
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Theme
                </label>
                <select 
                  value={settings.theme}
                  onChange={(e) => setSettings({...settings, theme: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}
                >
                  <option value="gradient">Gradient</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="brand">Brand Colors</option>
                </select>
              </div>
              
              {settings.autoScroll && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                    Scroll Speed (ms)
                  </label>
                  <input 
                    type="number"
                    min="1000"
                    max="10000"
                    step="500"
                    value={settings.scrollSpeed}
                    onChange={(e) => setSettings({...settings, scrollSpeed: parseInt(e.target.value)})}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb'
                    }}
                  />
                </div>
              )}
            </div>
          </Card>
          
          {/* Live Preview */}
          <Card title="Live Preview">
            <div 
              style={{
                background: settings.theme === 'gradient' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' :
                           settings.theme === 'dark' ? '#1f2937' : 
                           settings.theme === 'brand' ? branding.primary_color : 'white',
                color: settings.theme === 'light' ? '#1f2937' : 'white',
                padding: '2rem',
                borderRadius: '8px',
                minHeight: '400px',
                fontSize: settings.fontSize === 'small' ? '0.875rem' : 
                          settings.fontSize === 'large' ? '1.25rem' : 
                          settings.fontSize === 'xlarge' ? '1.5rem' : '1rem'
              }}
            >
              {settings.showLogo && branding.logo && (
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <img 
                    src={branding.logo} 
                    alt={branding.name}
                    style={{ maxWidth: '150px', height: 'auto' }}
                  />
                </div>
              )}
              
              <h3 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                Current Order
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '6px'
                }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {settings.showImages && (
                      <div style={{ 
                        width: '60px', 
                        height: '60px', 
                        background: 'rgba(255,255,255,0.2)',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2rem'
                      }}>
                        🍕
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: '600' }}>Sample Pizza</div>
                      <div style={{ opacity: 0.7, fontSize: '0.875em' }}>2x</div>
                    </div>
                  </div>
                  <div style={{ fontWeight: '600' }}>$24.00</div>
                </div>
                
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '6px'
                }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {settings.showImages && (
                      <div style={{ 
                        width: '60px', 
                        height: '60px', 
                        background: 'rgba(255,255,255,0.2)',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2rem'
                      }}>
                        🥤
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: '600' }}>Soft Drink</div>
                      <div style={{ opacity: 0.7, fontSize: '0.875em' }}>1x</div>
                    </div>
                  </div>
                  <div style={{ fontWeight: '600' }}>$3.00</div>
                </div>
              </div>
              
              {settings.showTotalPrice && (
                <div style={{
                  marginTop: '2rem',
                  paddingTop: '1rem',
                  borderTop: '2px solid rgba(255,255,255,0.3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '1.5em',
                  fontWeight: '700'
                }}>
                  <span>Total</span>
                  <span>$27.00</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <CustomerDisplayEditorContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App

