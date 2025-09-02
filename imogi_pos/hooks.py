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
  'imogi_pos/public/js/branch.js',
  'imogi_pos/public/js/print/service.js',
  'imogi_pos/public/js/print/adapter_bluetooth.js',
  'imogi_pos/public/js/print/adapter_bridge.js',
  'imogi_pos/public/js/print/adapter_spool.js'
]
app_include_css = []

web_include_js = [
    "js/branch.js",
    "js/auth.js",
    "js/print/service.js",
    "js/print/adapter_bluetooth.js",
    "js/print/adapter_bridge.js",
    "js/print/adapter_spool.js"
]

doctype_js = {
    "POS Order": "public/js/doctype/pos_order.js",
    "Restaurant Table": "public/js/restaurant_table_qr.js",
}
doc_events = {
    "POS Order": {
        "before_save": "imogi_pos.utils.audit.sync_last_edited_by",
        "on_trash": "imogi_pos.utils.audit.log_deletion",
    },
    "POS Order Item": {
        "before_save": "imogi_pos.utils.audit.sync_last_edited_by",
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
}
}

fixtures = [
    {"dt": "Custom Field", "filters": [["module", "=", "IMOGI POS"]]},
    {"dt": "Property Setter", "filters": [["module", "=", "IMOGI POS"]]},
    {"dt": "Workflow", "filters": [["name", "in", ["IMOGI POS Order Workflow", "IMOGI KOT Ticket Workflow"]]]},
    {"dt": "Workflow State", "filters": [["module", "=", "IMOGI POS"]]},
    {"dt": "Workflow Action Master", "filters": [["module", "=", "IMOGI POS"]]},
    {"dt": "Print Format", "filters": [["module", "=", "IMOGI POS"]]},
    {"dt": "Item Attribute", "filters": [["name", "=", "Doneness"]]},
    {"dt": "Workspace", "filters": [["name", "like", "IMOGI POS%"]]},
    {"dt": "Page", "filters": [["module", "=", "IMOGI POS"]]}
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
        "imogi_pos.utils.branding.get_brand_context"
    ]
}

