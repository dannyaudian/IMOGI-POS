import React, { useState } from 'react'
import { LoadingSpinner } from '@/shared/components/UI'

export function DisplayConfigTab() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <div style={{ background: 'white', padding: '3rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📺</div>
        <h3>Display Settings</h3>
        <p style={{ color: '#6b7280' }}>Configure table display devices and settings</p>
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#9ca3af' }}>Coming soon...</p>
      </div>
    </div>
  )
}
