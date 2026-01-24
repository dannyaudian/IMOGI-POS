/**
 * Workspace Shortcuts Initializer
 * Forces initialization of workspace shortcuts handler
 */

$(document).ready(function() {
    // Wait for imogi_pos to be available
    const initWorkspaceShortcuts = function() {
        if (window.imogi_pos && window.imogi_pos.workspace_shortcuts) {
            console.log('IMOGI POS: Initializing workspace shortcuts from init script');
            imogi_pos.workspace_shortcuts.init();
        } else {
            // Retry after 500ms if not loaded yet
            setTimeout(initWorkspaceShortcuts, 500);
        }
    };
    
    initWorkspaceShortcuts();
});

// Also try on app_ready event
$(document).on('app_ready', function() {
    if (window.imogi_pos && window.imogi_pos.workspace_shortcuts) {
        console.log('IMOGI POS: Re-initializing workspace shortcuts on app_ready');
        imogi_pos.workspace_shortcuts.init();
    }
});
