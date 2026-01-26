/**
 * IMOGI POS Launcher - Desk to WWW Bridge
 * 
 * PURPOSE:
 * This page acts as a clean bridge from Frappe Desk to WWW routes.
 * 
 * WHY THIS PATTERN:
 * - Desk uses frappe.set_route() for internal navigation
 * - WWW routes use standard HTTP navigation
 * - Mixing them causes router conflicts
 * - This page is the "official exit point" from Desk to WWW
 * 
 * BEST PRACTICE:
 * - ERPNext POS core uses similar pattern
 * - Workspace shortcut type: "Page" → this page → redirect to WWW
 * - No DOM interception, no JS hacks, no race conditions
 */

frappe.pages['imogi-pos-launch'].on_page_load = function(wrapper) {
	// Immediate redirect to module-select WWW route
	// This ensures clean Desk → WWW transition
	window.location.href = '/shared/module-select';
};
