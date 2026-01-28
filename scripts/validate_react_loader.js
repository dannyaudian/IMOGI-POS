/**
 * IMOGI React Loader - Validation Script
 * 
 * Run this in the browser console after navigating through pages to validate
 * that the shared loader is working correctly.
 * 
 * Usage:
 *   1. Navigate to Module Select
 *   2. Navigate to Cashier Console
 *   3. Navigate back to Module Select
 *   4. Navigate to Waiter
 *   5. Run this script in console
 */

(function validateImogiLoader() {
    console.log('=== IMOGI React Loader Validation ===\n');
    
    // Check if loader is available
    if (typeof window.loadImogiReactApp !== 'function') {
        console.error('❌ FAILED: window.loadImogiReactApp not found!');
        console.log('   Solution: Ensure imogi_loader.js is loaded via hooks.py');
        return false;
    }
    console.log('✅ Loader function available');
    
    // Check if debug helper is available
    if (typeof window.__imogiDebugScripts !== 'function') {
        console.error('❌ FAILED: Debug helper not found!');
        return false;
    }
    console.log('✅ Debug helper available');
    
    // Get script injection counts
    const scriptCounts = window.__imogiDebugScripts();
    console.log('\n📊 Script Injection Counts:');
    console.table(scriptCounts);
    
    // Validate: Each app should have exactly 1 script tag
    const apps = Object.keys(scriptCounts);
    let allValid = true;
    
    apps.forEach(app => {
        if (scriptCounts[app] !== 1) {
            console.error(`❌ FAILED: ${app} has ${scriptCounts[app]} script tags (expected 1)`);
            allValid = false;
        } else {
            console.log(`✅ ${app}: Single script tag`);
        }
    });
    
    // Check load counts
    if (window.__imogiLoadCounts) {
        console.log('\n📈 Load Attempt Counts:');
        console.table(window.__imogiLoadCounts);
        
        // It's OK for load counts to be > 1 (multiple page visits)
        // But script counts should remain 1
    }
    
    // Check for script tags without data-imogi-app attribute (potential old scripts)
    const allReactScripts = document.querySelectorAll('script[src*="/react/"]');
    const untaggedScripts = Array.from(allReactScripts).filter(s => !s.dataset.imogiApp);
    
    if (untaggedScripts.length > 0) {
        console.warn(`⚠️  WARNING: Found ${untaggedScripts.length} React script(s) without data-imogi-app:`);
        untaggedScripts.forEach(s => console.log('   ', s.src));
        console.log('   These may be from old injection code. Consider clearing cache.');
    }
    
    // Final result
    console.log('\n' + '='.repeat(50));
    if (allValid && untaggedScripts.length === 0) {
        console.log('✅ VALIDATION PASSED: All checks successful!');
        return true;
    } else if (allValid && untaggedScripts.length > 0) {
        console.log('⚠️  VALIDATION WARNING: Some issues detected (see above)');
        return true;
    } else {
        console.log('❌ VALIDATION FAILED: See errors above');
        return false;
    }
})();
