/**
 * Unit Tests for Module Select Utilities
 * 
 * Run with: npm test src/apps/module-select/utils/__tests__/moduleUtils.test.js
 */

import { getVisibleModules, getModuleStatusBadges, isModuleAccessible } from '../moduleUtils'
import { getModulePriority, isModuleVisibleForRoles } from '../moduleRules'

describe('moduleRules', () => {
  describe('getModulePriority', () => {
    test('returns correct priority for cashier module', () => {
      expect(getModulePriority('cashier')).toBe('primary')
    })

    test('returns correct priority for kitchen module', () => {
      expect(getModulePriority('kitchen')).toBe('secondary')
    })

    test('returns tertiary for unknown module', () => {
      expect(getModulePriority('unknown-module')).toBe('tertiary')
    })
  })

  describe('isModuleVisibleForRoles', () => {
    test('cashier module visible to Cashier role', () => {
      expect(isModuleVisibleForRoles('cashier', ['Cashier'])).toBe(true)
    })

    test('cashier module visible to System Manager', () => {
      expect(isModuleVisibleForRoles('cashier', ['System Manager'])).toBe(true)
    })

    test('cashier module not visible to Waiter role', () => {
      expect(isModuleVisibleForRoles('cashier', ['Waiter'])).toBe(false)
    })

    test('kiosk module visible to all roles (no restrictions)', () => {
      expect(isModuleVisibleForRoles('kiosk', ['Guest'])).toBe(true)
      expect(isModuleVisibleForRoles('kiosk', [])).toBe(true)
    })

    test('returns false for empty user roles on restricted module', () => {
      expect(isModuleVisibleForRoles('cashier', [])).toBe(false)
    })
  })
})

describe('moduleUtils', () => {
  const mockModules = [
    { type: 'cashier', name: 'Cashier', requires_opening: true },
    { type: 'waiter', name: 'Waiter', requires_opening: false },
    { type: 'kitchen', name: 'Kitchen', requires_opening: false },
    { type: 'kiosk', name: 'Kiosk', requires_opening: false },
  ]

  describe('getVisibleModules', () => {
    test('filters modules based on user roles', () => {
      const visible = getVisibleModules(mockModules, ['Cashier'])
      const types = visible.map(m => m.type)
      
      expect(types).toContain('cashier')
      expect(types).toContain('kiosk') // kiosk is visible to all
      expect(types).not.toContain('waiter')
      expect(types).not.toContain('kitchen')
    })

    test('sorts modules by priority (primary first)', () => {
      const visible = getVisibleModules(mockModules, ['System Manager'])
      
      // System Manager can see all modules
      expect(visible[0].type).toBe('cashier') // primary
      expect(visible[1].type).toBe('waiter') // primary
      expect(visible[2].type).toBe('kitchen') // secondary
      expect(visible[3].type).toBe('kiosk') // tertiary
    })

    test('returns empty array for empty input', () => {
      expect(getVisibleModules([], [])).toEqual([])
    })

    test('handles undefined modules gracefully', () => {
      expect(getVisibleModules(undefined, ['Cashier'])).toEqual([])
    })
  })

  describe('getModuleStatusBadges', () => {
    test('returns warning badge when opening required but not active', () => {
      const module = { requires_opening: true }
      const status = { hasOpening: false }
      
      const badges = getModuleStatusBadges(module, status)
      
      expect(badges).toHaveLength(1)
      expect(badges[0].tone).toBe('warning')
      expect(badges[0].text).toBe('Requires Opening')
    })

    test('returns success badge when opening is active', () => {
      const module = { requires_opening: true }
      const status = { hasOpening: true }
      
      const badges = getModuleStatusBadges(module, status)
      
      expect(badges).toHaveLength(1)
      expect(badges[0].tone).toBe('success')
      expect(badges[0].text).toBe('Session Active')
    })

    test('returns empty array for module without constraints', () => {
      const module = { requires_opening: false }
      const status = { hasOpening: false }
      
      const badges = getModuleStatusBadges(module, status)
      
      expect(badges).toEqual([])
    })

    test('handles missing posOpeningStatus', () => {
      const module = { requires_opening: true }
      
      const badges = getModuleStatusBadges(module, undefined)
      
      expect(badges).toHaveLength(1)
      expect(badges[0].tone).toBe('warning')
    })
  })

  describe('isModuleAccessible', () => {
    test('module accessible when no opening required', () => {
      const module = { requires_opening: false }
      const status = { hasOpening: false }
      
      expect(isModuleAccessible(module, status)).toBe(true)
    })

    test('module not accessible when opening required but not active', () => {
      const module = { requires_opening: true }
      const status = { hasOpening: false }
      
      expect(isModuleAccessible(module, status)).toBe(false)
    })

    test('module accessible when opening required and active', () => {
      const module = { requires_opening: true }
      const status = { hasOpening: true, posOpeningEntry: 'POS-001' }
      
      expect(isModuleAccessible(module, status)).toBe(true)
    })

    test('handles undefined inputs gracefully', () => {
      expect(isModuleAccessible(undefined, {})).toBe(true)
      expect(isModuleAccessible({}, undefined)).toBe(true)
    })
  })
})
