"""
Custom POS Profile override to add validation for IMOGI POS custom fields.

This module provides cascading validation to clear hidden fields when parent
toggles are disabled, preventing stale data from being saved.
"""
import frappe
from frappe import _
from erpnext.accounts.doctype.pos_profile.pos_profile import POSProfile


class CustomPOSProfile(POSProfile):
    """
    Extended POS Profile with IMOGI POS validations.
    
    Handles cascading validation for fields with depends_on conditions,
    ensuring that hidden fields are cleared when their parent toggles change.
    """
    
    def validate(self):
        """Override validate to add custom validations"""
        super().validate()
        self.clear_hidden_fields()
        self.validate_session_scope()
        self.validate_module_compatibility()
    
    def clear_hidden_fields(self):
        """
        Clear values for fields that are hidden based on depends_on conditions.
        
        This prevents stale data from being saved when parent toggles change.
        Called before other validations to ensure clean state.
        """
        self._clear_domain_dependent_fields()
        self._clear_mode_dependent_fields()
        self._clear_self_order_fields()
        self._clear_session_fields()
        self._clear_payment_gateway_fields()
        self._clear_printer_interface_fields()
    
    def _clear_domain_dependent_fields(self):
        """Clear Restaurant-only fields when domain is not Restaurant."""
        if self.get("imogi_pos_domain") != "Restaurant":
            # Restaurant features (KOT, tables, self-order)
            self.imogi_enable_kot = 0
            self.imogi_enable_self_order = 0
            # Table-only fields (only clear if domain changes, mode change handled separately)
            self.imogi_use_table_display = 0
            self.imogi_default_floor = None
            self.imogi_default_layout_profile = None
            self.imogi_hide_notes_on_table_bill = 0
            # Customer bill (Restaurant only - applies to Table/Counter modes)
            self.imogi_customer_bill_format = None
            self.imogi_customer_bill_copies = None
    
    def _clear_mode_dependent_fields(self):
        """Clear mode-specific fields when mode changes."""
        mode = self.get("imogi_mode")
        
        # Table-only fields (Dine-In mode)
        if mode != "Table":
            self.imogi_use_table_display = 0
            self.imogi_default_floor = None
            self.imogi_default_layout_profile = None
            self.imogi_hide_notes_on_table_bill = 0
        
        # Counter-only fields
        if mode != "Counter":
            self.imogi_order_customer_flow = None
        
        # Kiosk-only fields
        if mode != "Kiosk":
            self.imogi_kiosk_receipt_format = None
            self.imogi_print_notes_on_kiosk_receipt = 0
            self.imogi_kiosk_cashless_only = 0
        
        # Queue format (Kiosk or Counter)
        if mode not in ("Kiosk", "Counter"):
            self.imogi_queue_format = None
    
    def _clear_self_order_fields(self):
        """Clear self-order fields when self-order is disabled."""
        if not self.get("imogi_enable_self_order"):
            # Primary self-order fields
            self.imogi_self_order_mode = None
            self.imogi_self_order_require_payment = 0
            self.imogi_self_order_allow_guest = 0
            self.imogi_self_order_token_ttl = None
            self.imogi_self_order_regenerate_on_close = 0
            # Self-order settings section
            self.imogi_self_order_brand_profile = None
            self.imogi_self_order_disclaimer = None
            self.imogi_self_order_rate_limit = None
            # Self-order QR sheet format
            self.imogi_self_order_qr_sheet_format = None
        elif self.get("imogi_self_order_mode") != "Takeaway":
            # Nested: require_payment only shown for Takeaway mode
            self.imogi_self_order_require_payment = 0
    
    def _clear_session_fields(self):
        """Clear session enforcement fields when session is not required."""
        if not self.get("imogi_require_pos_session"):
            self.imogi_pos_session_scope = None
            self.imogi_enforce_session_on_cashier = 0
            self.imogi_enforce_session_on_kiosk = 0
            self.imogi_enforce_session_on_counter = 0
    
    def _clear_payment_gateway_fields(self):
        """Clear payment gateway fields when gateway is disabled."""
        if not self.get("imogi_enable_payment_gateway"):
            self.imogi_payment_gateway_account = None
            self.imogi_checkout_payment_mode = None
            self.imogi_show_payment_qr_on_customer_display = 0
            self.imogi_payment_timeout_seconds = None
            self.imogi_kiosk_cashless_only = 0
    
    def _clear_printer_interface_fields(self):
        """Clear printer-specific fields based on interface selection."""
        cashier_iface = self.get("imogi_printer_cashier_interface")
        kitchen_iface = self.get("imogi_printer_kitchen_interface")
        domain = self.get("imogi_pos_domain")
        kot_enabled = self.get("imogi_enable_kot")
        
        # Kitchen printer only for Restaurant with KOT
        if domain != "Restaurant" or not kot_enabled:
            self.imogi_printer_kitchen_interface = None
            self.imogi_printer_kitchen = None
            self.imogi_usb_kitchen_device = None
            self.imogi_bt_kitchen_device_name = None
            self.imogi_bt_kitchen_vendor_profile = None
            kitchen_iface = None  # Update for subsequent checks
        
        # LAN fields - clear if interface is not LAN
        if cashier_iface != "LAN":
            self.imogi_printer_cashier = None
        if kitchen_iface and kitchen_iface != "LAN":
            self.imogi_printer_kitchen = None
        if cashier_iface != "LAN" and (not kitchen_iface or kitchen_iface != "LAN"):
            self.imogi_printer_port = None
        
        # USB fields - clear if interface is not USB
        if cashier_iface != "USB":
            self.imogi_usb_cashier_device = None
        if kitchen_iface and kitchen_iface != "USB":
            self.imogi_usb_kitchen_device = None
        
        # Bluetooth fields - clear if interface is not Bluetooth
        if cashier_iface != "Bluetooth":
            self.imogi_bt_cashier_device_name = None
            self.imogi_bt_cashier_vendor_profile = None
        if kitchen_iface and kitchen_iface != "Bluetooth":
            self.imogi_bt_kitchen_device_name = None
            self.imogi_bt_kitchen_vendor_profile = None
        if cashier_iface != "Bluetooth" and (not kitchen_iface or kitchen_iface != "Bluetooth"):
            self.imogi_bt_retry = None
            self.imogi_print_bridge_url = None
            self.imogi_print_bridge_token = None
    
    def validate_session_scope(self):
        """
        Validate session scope field has valid value.
        
        Options:
        - User: Each user has their own POS opening (recommended for individual accountability)
        - POS Profile: All users share one session per POS Profile (shared cash drawer)
        """
        if self.get("imogi_require_pos_session"):
            scope = self.get("imogi_pos_session_scope")
            valid_values = ["User", "POS Profile"]
            
            # Check if scope is set
            if not scope:
                # Set default to User (most common use case)
                self.imogi_pos_session_scope = "User"
            elif scope not in valid_values:
                # Invalid value - this can happen if the field was corrupted
                frappe.throw(
                    _("Session Scope must be one of: {0}").format(", ".join(valid_values)),
                    frappe.ValidationError
                )
    
    def validate_module_compatibility(self):
        """
        Validate that enabled modules are compatible with each other.
        
        Rules:
        1. Cashier (Counter) is MANDATORY - required for payment and session closing
        2. All modules are compatible with each other and support both Dine-In & Takeaway:
           - Cashier: Customer orders at counter, cashier processes payment immediately
           - Waiter: Waiter takes order (table or counter), cashier processes payment at Cashier module
           - Kiosk: Self-service ordering kiosk
           - Self-Order: QR code ordering via customer's phone
           - Kitchen: Displays KOT for kitchen staff
           - Customer Display: Shows order and payment details to customer
        
        Note: Dine-In vs Takeaway is determined at ORDER level, not MODULE level.
        Any module can create both dine-in and takeaway orders.
        """
        # Rule 1: Cashier is MANDATORY
        if not self.get('imogi_enable_cashier'):
            frappe.throw(
                _("Cashier (Counter) module must be enabled in every POS Profile.<br><br>"
                  "<b>Reason:</b> Cashier module is required for:<br>"
                  "• Payment processing (cash, card, QRIS)<br>"
                  "• POS Opening Entry opening and closing<br>"
                  "• Order reconciliation and reporting<br>"
                  "• Handling exceptions from Kiosk/Self-Order<br><br>"
                  "<b>Note:</b> All modules support both Dine-In and Take-Away orders.<br>"
                  "Order type is selected when creating the order, not determined by module."),
                frappe.ValidationError,
                title=_("Cashier Module Required")
            )
        
        # Optional: Log enabled modules for debugging
        enabled_modules = []
        module_flags = {
            'Cashier': self.get('imogi_enable_cashier'),
            'Waiter': self.get('imogi_enable_waiter'),
            'Kiosk': self.get('imogi_enable_kiosk'),
            'Self-Order': self.get('imogi_enable_self_order'),
            'Kitchen': self.get('imogi_enable_kitchen'),
            'Customer Display': self.get('imogi_enable_customer_display')
        }
        
        for module_name, is_enabled in module_flags.items():
            if is_enabled:
                enabled_modules.append(module_name)
        
        # Info message about enabled modules (only show in UI, not in tests)
        if len(enabled_modules) > 1 and frappe.flags.in_test != True:
            frappe.msgprint(
                _("POS Profile will support: {0}").format(", ".join(enabled_modules)),
                indicator="blue",
                title=_("Enabled Modules")
            )
