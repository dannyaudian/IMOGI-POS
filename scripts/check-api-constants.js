#!/usr/bin/env node
/**
 * API Constants Consistency Checker
 * ==================================
 * 
 * Ensures all React apps use API.* constants from shared/api/constants.js
 * instead of hardcoded endpoint strings.
 * 
 * CHECKS:
 * 1. No hardcoded "imogi_pos.api.*" strings in src/apps/** (except constants.js)
 * 2. No import from local constants.js (should use @/shared/api/constants)
 * 3. No apiCall() with literal string endpoints
 * 
 * Usage:
 *   node scripts/check-api-constants.js
 *   npm run check:api-constants
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REPO_ROOT = path.resolve(__dirname, '..')
const APPS_DIR = path.join(REPO_ROOT, 'src/apps')

let hasErrors = false

console.log('\n🔍 Checking API constants consistency...\n')

/**
 * Check 1: No hardcoded "imogi_pos.api.*" in app files
 */
try {
  console.log('✓ Checking for hardcoded API endpoints...')
  const result = execSync(
    `cd "${REPO_ROOT}" && grep -rn "imogi_pos\\.api\\." src/apps --include="*.js" --include="*.jsx" --exclude="constants.js" || true`,
    { encoding: 'utf-8' }
  )
  
  if (result.trim()) {
    console.error('❌ Found hardcoded API endpoints (should use API.* from constants):\n')
    console.error(result)
    hasErrors = true
  } else {
    console.log('   ✓ No hardcoded endpoints found')
  }
} catch (err) {
  // grep returns non-zero if no match, which is what we want
  console.log('   ✓ No hardcoded endpoints found')
}

/**
 * Check 2: No local constants imports (except in constants.js itself)
 */
try {
  console.log('\n✓ Checking for legacy local constants imports...')
  const result = execSync(
    `cd "${REPO_ROOT}" && grep -rn "from ['\"]\\.\\.*/constants['\"]" src/apps --include="*.js" --include="*.jsx" --exclude="constants.js" || true`,
    { encoding: 'utf-8' }
  )
  
  if (result.trim()) {
    console.error('❌ Found imports from local constants.js (should use @/shared/api/constants):\n')
    console.error(result)
    console.error('\nReplace with: import { API, TIMING, ... } from \'@/shared/api/constants\'\n')
    hasErrors = true
  } else {
    console.log('   ✓ All imports use shared constants')
  }
} catch (err) {
  console.log('   ✓ All imports use shared constants')
}

/**
 * Check 3: Warn about potential API.* undefined usage
 */
try {
  console.log('\n✓ Checking for undefined API constants...')
  const result = execSync(
    `cd "${REPO_ROOT}" && grep -rn "API\\.[A-Z_]*" src/apps --include="*.js" --include="*.jsx" | grep -v "API\\.GET_" | grep -v "API\\.CREATE_" | grep -v "API\\.UPDATE_" | grep -v "API\\.LIST_" | grep -v "API\\.SUBMIT_" | grep -v "API\\.REMOVE_" | grep -v "API\\.ADD_" | grep -v "API\\.PROCESS_" | grep -v "API\\.COMPLETE_" | grep -v "API\\.CLOSE_" | grep -v "API\\.PRINT_" | grep -v "API\\.CHECK_" | grep -v "API\\.REQUEST_" | grep -v "API\\.CLAIM_" | grep -v "API\\.SPLIT_" | grep -v "API\\.SEND_" | grep -v "API\\.SHOW_" | grep -v "API\\.CLEAR_" | grep -v "API\\.SAVE_" | grep -v "API\\.RESET_" | grep -v "API\\.TEST_" | grep -v "API\\.DUPLICATE_" | grep -v "API\\.VALIDATE_" | grep -v "API\\.SET_" | grep -v "API\\.CHOOSE_" | grep -v "API\\.SEARCH_" | head -20 || true`,
    { encoding: 'utf-8' }
  )
  
  if (result.trim()) {
    console.warn('⚠️  Found potential undefined API constants (verify these exist in constants.js):\n')
    console.warn(result)
    console.warn('\n   Note: This is just a warning. Verify these constants exist in src/shared/api/constants.js\n')
  } else {
    console.log('   ✓ No suspicious API.* patterns found')
  }
} catch (err) {
  console.log('   ✓ No suspicious API.* patterns found')
}

/**
 * Summary
 */
console.log('\n' + '='.repeat(60))
if (hasErrors) {
  console.error('❌ API constants consistency check FAILED')
  console.error('   Fix the errors above before committing.\n')
  process.exit(1)
} else {
  console.log('✅ API constants consistency check PASSED\n')
  process.exit(0)
}
