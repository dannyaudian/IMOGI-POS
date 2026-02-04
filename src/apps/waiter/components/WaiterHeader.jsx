/**
 * Waiter Header Component
 */

import React from 'react'
import { useWaiterContext } from '../context/WaiterContext'
import { AppHeader } from '@/shared/components/UI'
import { NetworkStatus } from '@/shared/components/NetworkStatus'

export function WaiterHeader() {
  const { mode } = useWaiterContext()

  return (
    <header className="waiter-header">
      <NetworkStatus />
      <AppHeader 
        title={mode === 'Dine-in' ? 'Waiter - Table Service' : 'Waiter - Counter Service'} 
        user={window.frappe?.session?.user}
      />
    </header>
  )
}
