/**
 * Production Diagnostic Script
 * 
 * Paste this into production console to diagnose:
 * 1. Whether dev mode is actually disabled
 * 2. Whether double-mounting is happening
 * 3. Listener accumulation
 * 
 * Usage: Copy and paste into browser console
 */

(function productionDiagnostic() {
  const report = {
    // Check if dev mode is enabled
    developer_mode: frappe?.boot?.developer_mode,
    hostname: window.location.hostname,
    isDev: frappe?.boot?.developer_mode || window.location.hostname === 'localhost',
    
    // Check React mount status
    cashierMounted: window.__cashierMounted,
    hasRoot: !!window.__cashierRoot,
    
    // Check listener counts
    popstateListeners: typeof getEventListeners === 'function' 
      ? getEventListeners(window).popstate?.length 
      : 'getEventListeners not available (use Chrome)',
    
    // Check hook mount count
    effectiveOpeningMountCount: window.__effectiveOpeningMountCount || 0,
    
    // Check cleanup handlers
    cleanupHandlers: window.__imogiCleanupHandlers 
      ? Object.keys(window.__imogiCleanupHandlers) 
      : [],
    
    // Check script injection counts
    scriptCounts: window.__imogiLoadCounts || {},
    
    // Check for duplicate scripts
    duplicateScripts: (() => {
      const scripts = document.querySelectorAll('script[data-imogi-app]');
      const counts = {};
      scripts.forEach(script => {
        const appKey = script.dataset.imogiApp;
        counts[appKey] = (counts[appKey] || 0) + 1;
      });
      return counts;
    })(),
    
    // Current route
    currentRoute: frappe?.get_route_str ? frappe.get_route_str() : window.location.pathname
  };
  
  console.group('🔍 PRODUCTION DIAGNOSTIC REPORT');
  console.log('Environment:', {
    developer_mode: report.developer_mode,
    hostname: report.hostname,
    isDev: report.isDev ? '⚠️ DEV MODE ENABLED' : '✅ Production mode'
  });
  
  console.log('React Mount Status:', {
    cashierMounted: report.cashierMounted,
    hasRoot: report.hasRoot,
    effectiveOpeningMountCount: report.effectiveOpeningMountCount + 
      (report.effectiveOpeningMountCount > 1 ? ' ⚠️ MULTIPLE MOUNTS!' : ' ✅')
  });
  
  console.log('Event Listeners:', {
    popstateListeners: report.popstateListeners,
    warning: typeof report.popstateListeners === 'number' && report.popstateListeners > 1
      ? '⚠️ Multiple popstate listeners detected!'
      : '✅'
  });
  
  console.log('Cleanup Handlers:', report.cleanupHandlers);
  console.log('Script Injection Counts:', report.scriptCounts);
  console.log('Duplicate Scripts:', report.duplicateScripts);
  console.log('Current Route:', report.currentRoute);
  
  console.groupEnd();
  
  // Return report object for further inspection
  return report;
})();

