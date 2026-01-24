from __future__ import unicode_literals
from . import __version__ as app_version
from frappe import _

app_name = "imogi_pos"
app_title = "IMOGI POS"
app_publisher = "IMOGI"
app_description = "A modular and scalable restaurant POS solution for ERPNext v15"
app_icon = "octicon octicon-file-directory"
app_color = "#4287f5"
app_email = "support@imogi.com"
app_license = "MIT"

app_include_js = [
    '/assets/imogi_pos/js/escpos_printing.js',
    '/assets/imogi_pos/js/workspace_shortcuts.js'
]
app_include_css = []

# web_include_js = [
#     "js/branch.js",
#     "js/auth.js",
#     "js/print/service.js",
#     "js/print/adapter_bluetooth.js",
#     "js/print/adapter_bridge.js",
#     "js/print/adapter_spool.js",
#     "js/print/adapter_lan.js"
# ]

doctype_js = {
    "POS Order": "public/js/doctype/pos_order.js",
    "Restaurant Table": "public/js/restaurant_table_qr.js",
}

doctype_list_js = {"Item": "public/js/doctype/item_list.js"}
doc_events = {
    "POS Order": {
        "before_save": "imogi_pos.utils.audit.sync_last_edited_by",
        "on_trash": "imogi_pos.utils.audit.log_deletion",
    },
    "POS Order Item": {
        "before_save": [
            "imogi_pos.utils.audit.sync_last_edited_by",
            "imogi_pos.api.orders.validate_item_is_sales_item",
            "imogi_pos.api.customizations.validate_item_customisations",
        ],
    },
    "KOT Ticket": {
        "before_save": "imogi_pos.utils.audit.sync_last_edited_by",
        "on_update": "imogi_pos.utils.audit.log_state_change",
    },
    "KOT Item": {
        "before_save": "imogi_pos.utils.audit.sync_last_edited_by",
    },
    "Restaurant Table": {
        "before_save": "imogi_pos.utils.audit.sync_last_edited_by",
    },
    "Table Layout Profile": {
        "before_save": "imogi_pos.utils.audit.sync_last_edited_by",
    },
    "Table Layout Node": {
        "before_save": "imogi_pos.utils.audit.sync_last_edited_by",
    },
    "Item": {
        "validate": "imogi_pos.api.items.set_item_flags",
    },
    "Sales Invoice": {
        "before_submit": "imogi_pos.api.invoice_modifiers.apply_invoice_modifiers",
        "on_submit": "imogi_pos.api.billing.on_sales_invoice_submit",
    },
    "Item Price": {
        "on_update": "imogi_pos.api.pricing.publish_item_price_update",
        "on_trash": "imogi_pos.api.pricing.publish_item_price_update",
    },
}

fixtures = [
    {"dt": "Custom Field", "filters": [["module", "=", "IMOGI POS"]]},
    {"dt": "Property Setter", "filters": [["module", "=", "IMOGI POS"]]},
    # Workflow State dan Action Master harus dimuat sebelum Workflow
    {"dt": "Workflow State", "filters": [["module", "=", "IMOGI POS"]]},
    {"dt": "Workflow Action Master", "filters": [["module", "=", "IMOGI POS"]]},
    {"dt": "Workflow", "filters": [["name", "in", ["IMOGI POS Order", "IMOGI KOT Ticket"]]]},
    {"dt": "Item Attribute", "filters": [["name", "=", "Doneness"]]},
    {"dt": "Workspace", "filters": [["module", "=", "IMOGI POS"]]},
]

scheduler_events = {
    "hourly": [
        "imogi_pos.kitchen.sla.process_hourly_metrics"
    ],
    "daily": [
        "imogi_pos.kitchen.sla.generate_daily_report"
    ]
}

jinja = {
    "methods": [
        "imogi_pos.utils.branding.get_brand_context",
        "imogi_pos.utils.printing.format_kot_options",
    ]
}

# Security: Add security headers to all responses
after_request = [
    "imogi_pos.utils.security.add_security_headers"
]

# Security: Track failed login attempts
on_login_fail = [
    "imogi_pos.utils.security.on_login_fail"
]

# Website route redirects for new architecture
website_route_rules = [
    {"from_route": "/create-order", "to_route": "/restaurant/waiter"},
    {"from_route": "/waiter_order", "to_route": "/restaurant/waiter"},
    {"from_route": "/kiosk", "to_route": "/restaurant/waiter?mode=kiosk"},
    {"from_route": "/cashier-console", "to_route": "/counter/pos"},
    {"from_route": "/customer-display", "to_route": "/devices/displays"},
    {"from_route": "/kitchen_display", "to_route": "/restaurant/kitchen"},
    {"from_route": "/table_display", "to_route": "/restaurant/tables"},
    {"from_route": "/imogi-login", "to_route": "/shared/login"},
    {"from_route": "/device-select", "to_route": "/shared/device-select"},
    {"from_route": "/service-select", "to_route": "/shared/service-select"},
    {"from_route": "/so", "to_route": "/restaurant/self-order"},
]

after_install = "imogi_pos.setup.install.after_install"
after_migrate = "imogi_pos.setup.install.after_migrate"
