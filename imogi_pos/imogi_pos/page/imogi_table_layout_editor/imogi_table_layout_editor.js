/**
 * IMOGI Table Layout Editor - Desk to WWW Bridge
 * 
 * PURPOSE:
 * This page acts as a clean bridge from Frappe Desk to WWW routes.
 * 
 * WHY THIS PATTERN:
 * - Workspace shortcut type "URL" doesn't properly handle internal WWW routes
 * - Desk uses frappe.set_route() for internal navigation
 * - WWW routes use standard HTTP navigation
 * - Mixing them causes "page null" errors
 * - This page is the "official exit point" from Desk to WWW
 * 
 * BEST PRACTICE:
 * - Workspace shortcut type: "Page" → this page → redirect to WWW
 * - No DOM interception, no JS hacks, no race conditions
 */

frappe.pages['imogi-table-layout-editor'].on_page_load = function(wrapper) {
	// Immediate redirect to Table Management (Layout Editor) WWW route
	window.location.href = '/table_management';
};
