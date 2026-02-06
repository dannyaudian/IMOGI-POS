/**
 * POS Profile Form Customization
 * Provides improved UX for IMOGI POS custom fields with conditional visibility
 */

frappe.ui.form.on('POS Profile', {
    onload(frm) {
        // Initialize field visibility on form load
        updateAllFieldVisibility(frm);
    },

    refresh(frm) {
        // Organize sections based on domain
        cur_frm.sections_head.find('.form-section-head').each(function() {
            const sectionName = $(this).data('fieldname');
            updateSectionVisibility(frm, sectionName);
        });

        // Re-initialize field visibility on refresh (in case of external changes)
        updateAllFieldVisibility(frm);

        // Add custom event handlers
        frm.on_change = function() {
            updateAllFieldVisibility(frm);
        };
    },

    imogi_pos_domain(frm) {
        // When domain changes, update all field visibility
        updateAllFieldVisibility(frm);
        frappe.ui.form.layout.make_section(frm);
    },

    imogi_mode(frm) {
        // When mode changes, update all field visibility
        updateAllFieldVisibility(frm);
        frappe.ui.form.layout.make_section(frm);
    },

    imogi_enable_cashier(frm) {
        updateSectionVisibility(frm, 'imogi_pos_session_section');
    },

    imogi_enable_waiter(frm) {
        // Waiter is Restaurant-only, visibility already handled in updateAllFieldVisibility
        // But update if any downstream effects
    },

    imogi_enable_kot(frm) {
        updateSectionVisibility(frm, 'imogi_kitchen_routing_section');
        // KOT affects bill format visibility (only shows when KOT enabled or Bill needed)
        updateAllFieldVisibility(frm);
    },

    imogi_enable_self_order(frm) {
        updateSectionVisibility(frm, 'imogi_self_order_section');
        updateSectionVisibility(frm, 'imogi_self_order_settings_section');
        // Self-order affects visibility of related fields
        updateAllFieldVisibility(frm);
    },

    imogi_require_pos_session(frm) {
        updateFieldVisibility(frm, 'imogi_pos_session_scope');
        updateFieldVisibility(frm, 'imogi_enforce_session_on_cashier');
        updateFieldVisibility(frm, 'imogi_enforce_session_on_kiosk');
        updateFieldVisibility(frm, 'imogi_enforce_session_on_counter');
    },

    imogi_enable_payment_gateway(frm) {
        // Payment gateway affects multiple fields
        updateFieldVisibility(frm, 'imogi_payment_gateway_account');
        updateFieldVisibility(frm, 'imogi_checkout_payment_mode');
        updateFieldVisibility(frm, 'imogi_show_payment_qr_on_customer_display');
        updateFieldVisibility(frm, 'imogi_payment_timeout_seconds');
        // Kiosk cashless only depends on payment_gateway being enabled
        updateFieldVisibility(frm, 'imogi_kiosk_cashless_only');
    }
});

/**
 * Update visibility for all conditional fields
 */
function updateAllFieldVisibility(frm) {
    const domain = frm.doc.imogi_pos_domain;
    const mode = frm.doc.imogi_mode;
    const kotEnabled = frm.doc.imogi_enable_kot;
    const selfOrderEnabled = frm.doc.imogi_enable_self_order;
    const paymentGatewayEnabled = frm.doc.imogi_enable_payment_gateway;

    // ==== Domain-dependent sections ====
    setFieldHidden(frm, 'imogi_branding_section', !domain);
    setFieldHidden(frm, 'brand_profile', !domain);
    setFieldHidden(frm, 'imogi_printer_configuration_section', !domain);

    // ==== Table Mode Specific (Restaurant domain + Table mode) ====
    setFieldHidden(frm, 'imogi_use_table_display', !(domain === 'Restaurant' && mode === 'Table'));
    setFieldHidden(frm, 'imogi_default_floor', !(domain === 'Restaurant' && mode === 'Table'));
    setFieldHidden(frm, 'imogi_default_layout_profile', !(domain === 'Restaurant' && mode === 'Table'));
    setFieldHidden(frm, 'imogi_hide_notes_on_table_bill', !(domain === 'Restaurant' && mode === 'Table'));

    // ==== Counter Mode Specific ====
    setFieldHidden(frm, 'imogi_order_customer_flow', mode !== 'Counter');

    // ==== Kiosk Mode Specific ====
    setFieldHidden(frm, 'imogi_kiosk_cashless_only', !(mode === 'Kiosk' && paymentGatewayEnabled));
    setFieldHidden(frm, 'imogi_kiosk_receipt_format', mode !== 'Kiosk');
    setFieldHidden(frm, 'imogi_print_notes_on_kiosk_receipt', mode !== 'Kiosk');

    // ==== Queue Format (Kiosk + Counter) ====
    setFieldHidden(frm, 'imogi_queue_format', !(mode === 'Kiosk' || mode === 'Counter'));

    // ==== Restaurant-only fields ====
    setFieldHidden(frm, 'imogi_enable_kot', domain !== 'Restaurant');
    setFieldHidden(frm, 'imogi_enable_waiter', domain !== 'Restaurant');
    setFieldHidden(frm, 'imogi_enable_self_order', domain !== 'Restaurant');
    setFieldHidden(frm, 'imogi_kitchen_routing_section', !(domain === 'Restaurant' && kotEnabled));
    
    // ==== Bill format (Table or Counter in Restaurant) ====
    setFieldHidden(frm, 'imogi_customer_bill_format', !(domain === 'Restaurant' && (mode === 'Table' || mode === 'Counter')));
    setFieldHidden(frm, 'imogi_customer_bill_copies', !(domain === 'Restaurant' && (mode === 'Table' || mode === 'Counter')));

    // ==== KOT Fields (Restaurant + KOT enabled) ====
    const showKot = domain === 'Restaurant' && kotEnabled;
    setFieldHidden(frm, 'imogi_printer_kitchen_interface', !showKot);
    setFieldHidden(frm, 'imogi_kot_format', !showKot);
    setFieldHidden(frm, 'imogi_kot_copies', !showKot);

    // ==== Self-order fields (Restaurant only) ====
    setFieldHidden(frm, 'imogi_self_order_section', !(domain === 'Restaurant' && selfOrderEnabled));
    setFieldHidden(frm, 'imogi_self_order_settings_section', !(domain === 'Restaurant' && selfOrderEnabled));
    setFieldHidden(frm, 'imogi_self_order_qr_sheet_format', !selfOrderEnabled);

    // ==== Session fields (Cashier enabled) ====
    const showSession = frm.doc.imogi_enable_cashier && frm.doc.imogi_require_pos_session;
    setFieldHidden(frm, 'imogi_pos_session_scope', !showSession);
    setFieldHidden(frm, 'imogi_enforce_session_on_cashier', !showSession);
    setFieldHidden(frm, 'imogi_enforce_session_on_kiosk', !showSession);
    setFieldHidden(frm, 'imogi_enforce_session_on_counter', !showSession);

    // ==== Payment gateway fields ====
    setFieldHidden(frm, 'imogi_payment_gateway_account', !paymentGatewayEnabled);
    setFieldHidden(frm, 'imogi_checkout_payment_mode', !paymentGatewayEnabled);
    setFieldHidden(frm, 'imogi_show_payment_qr_on_customer_display', !paymentGatewayEnabled);
    setFieldHidden(frm, 'imogi_payment_timeout_seconds', !paymentGatewayEnabled);
}

/**
 * Update visibility for a specific section
 */
function updateSectionVisibility(frm, sectionName) {
    const section = frm.get_field(sectionName);
    if (!section) return;

    let shouldHide = false;
    const domain = frm.doc.imogi_pos_domain;
    const mode = frm.doc.imogi_mode;

    switch(sectionName) {
        case 'imogi_kitchen_routing_section':
            shouldHide = domain !== 'Restaurant' || !frm.doc.imogi_enable_kot;
            break;
        case 'imogi_self_order_section':
        case 'imogi_self_order_settings_section':
            shouldHide = domain !== 'Restaurant' || !frm.doc.imogi_enable_self_order;
            break;
        case 'imogi_pos_session_section':
            shouldHide = !frm.doc.imogi_enable_cashier;
            break;
    }

    setFieldHidden(frm, sectionName, shouldHide);
}

/**
 * Update visibility for a specific field
 */
function updateFieldVisibility(frm, fieldName) {
    const field = frm.get_field(fieldName);
    if (!field) return;

    let shouldHide = false;
    const domain = frm.doc.imogi_pos_domain;
    const mode = frm.doc.imogi_mode;

    switch(fieldName) {
        case 'imogi_order_customer_flow':
            shouldHide = mode !== 'Counter';
            break;
        case 'imogi_pos_session_scope':
        case 'imogi_enforce_session_on_cashier':
        case 'imogi_enforce_session_on_kiosk':
        case 'imogi_enforce_session_on_counter':
            shouldHide = !frm.doc.imogi_require_pos_session;
            break;
        case 'imogi_payment_gateway_account':
        case 'imogi_checkout_payment_mode':
        case 'imogi_show_payment_qr_on_customer_display':
        case 'imogi_payment_timeout_seconds':
            shouldHide = !frm.doc.imogi_enable_payment_gateway;
            break;
    }

    setFieldHidden(frm, fieldName, shouldHide);
}

/**
 * Hide or show a field using Frappe API
 * Uses frm.set_df_property for reliable cross-version compatibility
 */
function setFieldHidden(frm, fieldName, hidden) {
    const field = frm.get_field(fieldName);
    if (!field) return;

    // Use Frappe's set_df_property for more reliable field hiding
    // This updates field.df.hidden and triggers proper UI updates
    frm.set_df_property(fieldName, 'hidden', hidden ? 1 : 0);
    
    // Also update field wrapper visibility as fallback for DOM consistency
    if (field.$wrapper) {
        if (hidden) {
            field.$wrapper.hide();
        } else {
            field.$wrapper.show();
        }
    }
}
