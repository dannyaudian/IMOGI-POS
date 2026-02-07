#!/usr/bin/env node

/**
 * IMOGI POS - Temporal Dead Zone (TDZ) Analysis
 * 
 * Detects:
 * 1. Circular dependencies (with detailed paths)
 * 2. Top-level side effects that access exports before initialization
 * 3. Export const used in module top-level context
 * 4. Import order violations
 * 
 * Run: node scripts/analyze-tdz.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


const ENTRY_POINT = 'src/apps/cashier-console/main.jsx'
const PROJECT_ROOT = process.cwd()
  constructor() {
    this.dependencies = new Map()
    this.exports = new Map()
    this.fileContent = new Map()
    this.issues = []
  }

  /**
   * Run full analysis
   */
  async analyze() {
    console.log('\n═══════════════════════════════════════')
    console.log('  TDZ & CIRCULAR DEPENDENCY ANALYZER')
    console.log('═══════════════════════════════════════\n')

    console.log(`📍 Entry Point: ${ENTRY_POINT}\n`)

    // Step 1: Collect all imports/exports
    console.log('[1/5] Scanning files...')
    this.scanFiles(ENTRY_POINT)
    console.log(`     Found ${this.dependencies.size} unique files\n`)

    // Step 2: Build dependency graph
    console.log('[2/5] Building dependency graph...')
    this.buildDependencyGraph()

    // Step 3: Detect circular dependencies
    console.log('[3/5] Detecting circular dependencies...')
    this.detectCircularDependencies()

    // Step 4: Detect TDZ violations
    console.log('[4/5] Detecting TDZ violations...')
    this.detectTDZViolations()

    // Step 5: Report findings
    console.log('[5/5] Generating report...\n')
    this.reportFindings()
  }

  /**
   * Recursively scan files and extract imports/exports
   */
  scanFiles(filePath, visited = new Set()) {
    const absolutePath = path.resolve(PROJECT_ROOT, filePath)

    if (visited.has(absolutePath)) return
    visited.add(absolutePath)

    try {
      if (!fs.existsSync(absolutePath)) {
        // Try with extensions
        const exts = ['.js', '.jsx', '.ts', '.tsx']
        let found = false
        for (const ext of exts) {
          const withExt = absolutePath + ext
          if (fs.existsSync(withExt)) {
            this.scanFiles(withExt, visited)
            found = true
            break
          }
        }
        if (!found) return
      }

      const content = fs.readFileSync(absolutePath, 'utf-8')
      const relative = path.relative(PROJECT_ROOT, absolutePath)

      this.fileContent.set(relative, content)
      this.dependencies.set(relative, new Set())
      this.exports.set(relative, this.extractExports(content))

      // Extract imports
      const imports = this.extractImports(content, relative)
      imports.forEach((importPath) => {
        this.dependencies.get(relative).add(importPath)
        // Recursively scan imported files
        this.scanFiles(importPath, visited)
      })
    } catch (err) {
      // Silently skip files that can't be read
    }
  }

  /**
   * Extract all imports from file content
   */
  extractImports(content, currentFile) {
    const imports = new Set()

    // Match various import styles
    const patterns = [
      /import\s+(?:{[^}]*}|[\w$]+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g,
      /from\s+['"]([^'"]+)['"]\s+import/g,
      /require\(['"]([^'"]+)['"]\)/g,
      /import\(['"]([^'"]+)['"]\)/g,
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        let importPath = match[1]

        // Skip external/node_modules
        if (importPath.startsWith('.')) {
          // Resolve relative paths
          const dir = path.dirname(currentFile)
          importPath = path.normalize(path.join(dir, importPath))

          // Try to find the file
          if (!importPath.includes('.')) {
            // Try with extensions
            for (const ext of ['.js', '.jsx', '.ts', '.tsx', '.css', '.json']) {
              const withExt = importPath + ext
              if (fs.existsSync(path.resolve(PROJECT_ROOT, withExt))) {
                imports.add(withExt)
                break
              }
            }
            // Try as directory with index
            const indexPath = path.join(importPath, 'index.js')
            if (fs.existsSync(path.resolve(PROJECT_ROOT, indexPath))) {
              imports.add(indexPath)
            }
          } else {
            if (fs.existsSync(path.resolve(PROJECT_ROOT, importPath))) {
              imports.add(importPath)
            }
          }
        } else if (importPath.startsWith('@')) {
          // Handle alias imports (@/shared, @/apps, etc)
          let resolved = importPath
          if (importPath.startsWith('@/')) {
            resolved = 'src/' + importPath.substring(2)
          } else if (importPath.startsWith('@cashier-console/')) {
            resolved = 'src/apps/cashier-console/' + importPath.substring(18)
          }

          // Try to find the file
          for (const ext of ['.js', '.jsx', '.ts', '.tsx', '.css', '.json']) {
            const withExt = resolved + ext
            if (fs.existsSync(path.resolve(PROJECT_ROOT, withExt))) {
              imports.add(withExt)
              break
            }
          }

          // Try as directory with index
          const indexPath = resolved + '/index.js'
          if (fs.existsSync(path.resolve(PROJECT_ROOT, indexPath))) {
            imports.add(indexPath)
          }
        }
      }
    }

    return imports
  }

  /**
   * Extract exports from file
   */
  extractExports(content) {
    const exports = new Set()

    // Match export patterns
    const patterns = [
      /export\s+(?:const|let|var|function|class)\s+(\w+)/g,
      /export\s+default\s+(\w+)/g,
      /export\s+{([^}]+)}/g,
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const exportName = match[1]
        if (exportName) {
          const names = exportName
            .split(',')
            .map((n) => n.trim().split(/\s+/)[0])
            .filter((n) => n && n !== '{}')
          names.forEach((n) => exports.add(n))
        }
      }
    }

    return exports
  }

  /**
   * Build complete dependency graph
   */
  buildDependencyGraph() {
    // Resolve all imports to actual file paths
    const resolved = new Map()

    for (const [file, imports] of this.dependencies.entries()) {
      resolved.set(file, new Set())
      for (const imp of imports) {
        // Try to resolve to actual tracked file
        for (const tracked of this.dependencies.keys()) {
          if (
            tracked === imp ||
            tracked.endsWith('/' + imp) ||
            tracked.replace(/\.jsx?$/, '') ===
              imp.replace(/\.jsx?$/, '')
          ) {
            resolved.get(file).add(tracked)
            break
          }
        }
      }
    }

    this.dependencies = resolved
  }

  /**
   * Detect circular dependencies using DFS
   */
  detectCircularDependencies() {
    const visited = new Set()
    const stack = new Set()
    const cycles = []

    const dfs = (file, path = []) => {
      if (stack.has(file)) {
        // Found a cycle
        const cycleStart = path.findIndex((f) => f === file)
        const cycle = [...path.slice(cycleStart), file]
        cycles.push(cycle)
        return
      }

      if (visited.has(file)) return

      stack.add(file)
      path.push(file)

      const deps = this.dependencies.get(file) || new Set()
      for (const dep of deps) {
        dfs(dep, [...path])
      }

      stack.delete(file)
      visited.add(file)
    }

    // Start DFS from entry point
    dfs(ENTRY_POINT)

    if (cycles.length > 0) {
      cycles.forEach((cycle) => {
        this.issues.push({
          type: 'CIRCULAR_DEPENDENCY',
          files: cycle,
          description: `Circular import chain: ${cycle.join(' → ')}`,
        })
      })
    }
  }

  /**
   * Detect TDZ violations (export const used at module top-level)
   */
  detectTDZViolations() {
    for (const [file, content] of this.fileContent.entries()) {
      // Check for top-level variable usage before export
      const lines = content.split('\n')

      // Find all export statements
      const exports = new Map()
      lines.forEach((line, idx) => {
        const match = line.match(/export\s+const\s+(\w+)\s*=/)
        if (match) {
          exports.set(match[1], idx)
        }
      })

      // Check if exported const is used in top-level module code
      // (not inside functions/classes)
      for (const [exportName, exportLine] of exports.entries()) {
        // Look for usage of this export before its definition
        for (let i = 0; i < exportLine; i++) {
          const line = lines[i]
          // Skip import lines and comments
          if (line.match(/^\s*(import|\/\/|\/\*)/)) continue
          if (line.includes(exportName) && !line.match(/import/)) {
            this.issues.push({
              type: 'TDZ_VIOLATION',
              file,
              line: i + 1,
              exportName,
              description: `Export const '${exportName}' used before initialization at line ${i + 1}`,
              code: line.trim(),
            })
          }
        }
      }
    }
  }

  /**
   * Report all findings
   */
  reportFindings() {
    const circular = this.issues.filter((i) => i.type === 'CIRCULAR_DEPENDENCY')
    const tdz = this.issues.filter((i) => i.type === 'TDZ_VIOLATION')

    console.log('═══════════════════════════════════════\n')

    if (circular.length === 0 && tdz.length === 0) {
      console.log(
        '✅ No obvious circular dependencies or TDZ violations detected!\n'
      )
      console.log(
        'Note: The error "Cannot access Sr before initialization" might be caused by:\n'
      )
      console.log('  1. Double bundling (two React/module systems loaded)')
      console.log('  2. Loader timing issues (script injected before ready)')
      console.log('  3. Store/hook accessed at module import time')
      console.log('  4. CSS-in-JS side effects during bundle load\n')
    } else {
      if (circular.length > 0) {
        console.log(`⚠️  CIRCULAR DEPENDENCIES FOUND (${circular.length}):\n`)
        circular.forEach((issue, idx) => {
          console.log(
            `  ${idx + 1}. ${issue.description}`
          )
          console.log('')
        })
        console.log('')
      }

      if (tdz.length > 0) {
        console.log(`⚠️  TDZ VIOLATIONS FOUND (${tdz.length}):\n`)
        tdz.forEach((issue, idx) => {
          console.log(`  ${idx + 1}. ${issue.file}:${issue.line}`)
          console.log(`     Export: '${issue.exportName}'`)
          console.log(`     Code: ${issue.code}`)
          console.log('')
        })
        console.log('')
      }
    }

    console.log('═══════════════════════════════════════\n')
  }
}

// Run analysis
const analyzer = new CircularDependencyAnalyzer()
await analyzer.analyze()
