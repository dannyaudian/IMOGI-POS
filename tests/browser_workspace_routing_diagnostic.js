/**
 * IMOGI POS - Workspace Routing Diagnostic
 * =========================================
 * 
 * Test untuk diagnose "page null" routing issue.
 * 
 * USAGE:
 * 1. Login ke ERPNext Desk
 * 2. Go to IMOGI POS Workspace
 * 3. Buka browser console (F12)
 * 4. Copy-paste script ini
 * 5. Klik kanan "Open POS" shortcut → Inspect
 * 6. Run: diagnoseWorkspaceRouting()
 * 
 * EXPECTED:
 * - Show exact DOM structure of shortcut
 * - Show what href/data attributes exist
 * - Predict what handler will extract
 */

function diagnoseWorkspaceRouting() {
  console.log('🔍 IMOGI POS - Workspace Routing Diagnostic');
  console.log('============================================\n');

  // Get the currently inspected element ($0)
  let element = $0;
  
  // Auto-find shortcut if $0 is not useful (e.g., BODY tag)
  if (!element || element.tagName === 'BODY' || element.tagName === 'HTML') {
    console.log('⚠️  No specific element inspected, searching for "Open POS" shortcut...\n');
    
    // Try to find by text content
    const shortcuts = Array.from(document.querySelectorAll('.shortcut-widget-box'));
    element = shortcuts.find(el => {
      const text = (el.innerText || el.textContent || '').trim();
      return text.includes('Open POS');
    });
    
    if (!element) {
      console.error('❌ Cannot find "Open POS" shortcut automatically!');
      console.log('📝 Manual Instructions:');
      console.log('   1. Right-click on "Open POS" shortcut card/button');
      console.log('   2. Select "Inspect Element" (NOT "Inspect")');
      console.log('   3. Run: diagnoseWorkspaceRouting()');
      console.log('');
      console.log('🔍 Or try: diagnoseAllShortcuts() to see all workspace shortcuts');
      return;
    }
    
    console.log('✅ Found shortcut automatically!\n');
  }

  console.log('📋 INSPECTED ELEMENT');
  console.log('--------------------');
  console.log('Tag:', element.tagName);
  console.log('Classes:', element.className);
  console.log('ID:', element.id);
  console.log('');

  // Test closest anchor
  const anchor = element.closest('a');
  console.log('📋 CLOSEST <a> TAG');
  console.log('------------------');
  if (anchor) {
    console.log('✅ Found anchor:', anchor);
    console.log('   href attr:', anchor.getAttribute('href'));
    console.log('   href prop:', anchor.href);
    console.log('   onclick:', anchor.onclick);
  } else {
    console.log('⚠️  No <a> tag found in parent chain');
  }
  console.log('');

  // Test shortcut-widget-box
  const shortcutBox = element.closest('.shortcut-widget-box');
  console.log('📋 CLOSEST .shortcut-widget-box');
  console.log('--------------------------------');
  if (shortcutBox) {
    console.log('✅ Found shortcut box:', shortcutBox);
    console.log('   data-link-to:', shortcutBox.getAttribute('data-link-to'));
    console.log('   data-link:', shortcutBox.getAttribute('data-link'));
    console.log('   data-url:', shortcutBox.getAttribute('data-url'));
    console.log('   data-route:', shortcutBox.getAttribute('data-route'));
    console.log('   Text content:', (shortcutBox.innerText || shortcutBox.textContent || '').trim().slice(0, 50));
    console.log('   All dataset:', shortcutBox.dataset);
    
    // Check for nested anchor
    const nestedAnchor = shortcutBox.querySelector('a');
    if (nestedAnchor) {
      console.log('   Nested <a> href:', nestedAnchor.getAttribute('href'));
    }
  } else {
    console.log('⚠️  No .shortcut-widget-box found in parent chain');
  }
  console.log('');

  // Simulate URL resolution
  console.log('📋 URL RESOLUTION SIMULATION');
  console.log('-----------------------------');
  
  const shortcut_urls = {
    'Open POS': '/shared/module-select',
    'Cashier Console': '/counter/pos',
    'Kitchen Display': '/restaurant/kitchen',
    'Table Display': '/restaurant/tables',
    'Customer Display': '/devices/displays',
    'Customer Display Editor': '/customer_display_editor',
    'Table Layout Editor': '/table_layout_editor',
    'Waiter Order': '/restaurant/waiter',
    'Kiosk': '/restaurant/waiter?mode=kiosk'
  };

  function resolveUrl() {
    // Priority 1: Anchor href
    if (anchor) {
      const href = anchor.getAttribute('href') || anchor.href;
      if (href && href !== '#' && href !== 'javascript:void(0)') {
        return { source: 'anchor.href', url: href };
      }
    }

    // Priority 2: Data attributes
    if (shortcutBox) {
      const linkTo = shortcutBox.getAttribute('data-link-to') || 
                    shortcutBox.getAttribute('data-link') ||
                    shortcutBox.getAttribute('data-url') ||
                    shortcutBox.getAttribute('data-route');
      
      if (linkTo && linkTo !== 'null' && linkTo !== 'undefined' && linkTo !== '') {
        return { source: 'data-attribute', url: linkTo };
      }

      // Priority 3: Text mapping
      const text = (shortcutBox.innerText || shortcutBox.textContent || '').trim();
      const mapped = shortcut_urls[text];
      if (mapped) {
        return { source: 'text-mapping', text: text, url: mapped };
      }
    }

    return { source: 'none', url: null };
  }

  const resolution = resolveUrl();
  
  if (resolution.url) {
    console.log('✅ URL RESOLVED:');
    console.log('   Source:', resolution.source);
    if (resolution.text) console.log('   Text:', resolution.text);
    console.log('   URL:', resolution.url);
    console.log('');
    console.log('🎯 HANDLER WILL:');
    console.log('   1. preventDefault()');
    console.log('   2. window.location.assign("' + resolution.url + '")');
  } else {
    console.error('❌ URL NOT RESOLVED!');
    console.error('   This will cause "page null" error!');
    console.log('');
    console.log('🔧 LIKELY CAUSES:');
    console.log('   - Shortcut has no href attribute');
    console.log('   - Data attributes missing or empty');
    console.log('   - Text content doesn\'t match shortcut_urls mapping');
    console.log('');
    console.log('📝 RECOMMENDATIONS:');
    console.log('   1. Check workspace shortcut configuration');
    console.log('   2. Ensure "Link to" field is set to: /app/imogi-module-select');
    console.log('   3. Or set shortcut Label to exactly: "Open POS"');
  }
  console.log('');

  // Full HTML for reference
  console.log('📋 FULL ELEMENT HTML');
  console.log('--------------------');
  console.log(element.outerHTML.slice(0, 500));
  if (element.outerHTML.length > 500) {
    console.log('... (truncated, full length:', element.outerHTML.length, 'chars)');
  }
  console.log('');

  // Store for inspection
  window.diagnosticElement = element;
  window.diagnosticAnchor = anchor;
  window.diagnosticShortcutBox = shortcutBox;
  console.log('💾 Stored for inspection:');
  console.log('   window.diagnosticElement');
  console.log('   window.diagnosticAnchor');
  console.log('   window.diagnosticShortcutBox');
}

// Helper: Diagnose all shortcuts in workspace
function diagnoseAllShortcuts() {
  console.log('🔍 All Workspace Shortcuts');
  console.log('==========================\n');
  
  const shortcuts = Array.from(document.querySelectorAll('.shortcut-widget-box'));
  
  if (shortcuts.length === 0) {
    console.error('❌ No shortcuts found on this page!');
    console.log('   Are you on a workspace page?');
    return;
  }
  
  console.log(`Found ${shortcuts.length} shortcuts:\n`);
  
  // Check if this is IMOGI POS workspace
  const shortcutTexts = shortcuts.map(s => (s.innerText || s.textContent || '').trim());
  const hasImogiShortcuts = shortcutTexts.some(text => 
    text.includes('Open POS') || 
    text.includes('Cashier') || 
    text.includes('Kitchen Display') ||
    text.includes('Table Layout')
  );
  
  if (!hasImogiShortcuts) {
    console.warn('⚠️  WARNING: This does NOT look like IMOGI POS workspace!');
    console.warn('   Current shortcuts: ' + shortcutTexts.slice(0, 3).join(', ') + '...');
    console.log('');
    console.log('🔧 TO FIX:');
    console.log('   1. Click "Workspaces" in top menu');
    console.log('   2. Find and click "IMOGI POS" workspace');
    console.log('   3. Run this script again');
    console.log('');
    console.log('   OR navigate directly to: /app/imogi-pos');
    console.log('');
    
    // Offer auto-navigation
    console.log('💡 Quick fix: Run this to navigate automatically:');
    console.log('   window.location.href = "/app/imogi-pos"');
    console.log('');
  }
  
  shortcuts.forEach((shortcut, idx) => {
    const text = (shortcut.innerText || shortcut.textContent || '').trim();
    const linkTo = shortcut.getAttribute('data-link-to');
    const anchor = shortcut.querySelector('a');
    const href = anchor ? anchor.getAttribute('href') : null;
    
    console.log(`${idx + 1}. "${text}"`);
    console.log(`   data-link-to: ${linkTo || '(none)'}`);
    console.log(`   <a> href: ${href || '(none)'}`);
    
    // Predict resolution
    let predictedUrl = null;
    if (anchor && href && href !== '#') {
      predictedUrl = href;
    } else if (linkTo && linkTo !== 'null') {
      predictedUrl = linkTo;
    } else {
      const shortcut_urls = {
        'Open POS': '/app/imogi-module-select',
        'Cashier Console': '/counter/pos',
        'Kitchen Display': '/restaurant/kitchen',
      };
      predictedUrl = shortcut_urls[text];
    }
    
    if (predictedUrl) {
      console.log(`   ✅ Will navigate to: ${predictedUrl}`);
    } else {
      console.error(`   ❌ Cannot resolve URL! Will cause "page null" error`);
    }
    console.log('');
  });
  
  if (!hasImogiShortcuts) {
    console.log('');
    console.log('🔴 REMINDER: Navigate to IMOGI POS workspace first!');
    console.log('   window.location.href = "/app/imogi-pos"');
  } else {
    console.log('💡 To diagnose specific shortcut:');
    console.log('   1. Right-click shortcut → Inspect Element');
    console.log('   2. Run: diagnoseWorkspaceRouting()');
  }
}

// Auto-message
console.log('✨ Workspace Routing Diagnostic Script Loaded');
console.log('📝 Quick start:');
console.log('   • Run: diagnoseAllShortcuts() - see all workspace shortcuts');
console.log('   • Run: diagnoseWorkspaceRouting() - diagnose "Open POS" automatically');
console.log('   • Or: Right-click "Open POS" → Inspect → diagnoseWorkspaceRouting()');
console.log('');
