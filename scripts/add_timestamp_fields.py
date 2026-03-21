"""Add transition timestamp fields to KOT Ticket and KOT Item DocTypes."""
import json
import os

BASE = "/Users/dannyaudian/github/IMOGI-POS/imogi_pos/imogi_pos/doctype"

TIMESTAMP_FIELDS = [
    {"fieldname": "in_progress_at", "fieldtype": "Datetime", "label": "In Progress At", "read_only": 1, "no_copy": 1},
    {"fieldname": "ready_at",       "fieldtype": "Datetime", "label": "Ready At",        "read_only": 1, "no_copy": 1},
    {"fieldname": "served_at",      "fieldtype": "Datetime", "label": "Served At",       "read_only": 1, "no_copy": 1},
    {"fieldname": "cancelled_at",   "fieldtype": "Datetime", "label": "Cancelled At",    "read_only": 1, "no_copy": 1},
]

def already_has(fields, name):
    return any(f.get("fieldname") == name for f in fields)

# KOT Ticket — insert after 'created_by'
ticket_path = os.path.join(BASE, "kot_ticket", "kot_ticket.json")
with open(ticket_path) as f:
    ticket = json.load(f)

if not already_has(ticket["fields"], "in_progress_at"):
    idx = next(i for i, f in enumerate(ticket["fields"]) if f.get("fieldname") == "created_by")
    for offset, fld in enumerate(TIMESTAMP_FIELDS, start=1):
        ticket["fields"].insert(idx + offset, fld)
    with open(ticket_path, "w") as f:
        json.dump(ticket, f, indent=1, ensure_ascii=False)
    print(f"KOT Ticket: added {len(TIMESTAMP_FIELDS)} fields after 'created_by'")
else:
    print("KOT Ticket: timestamp fields already present, skipped")

# KOT Item — insert after 'workflow_state'
item_path = os.path.join(BASE, "kot_item", "kot_item.json")
with open(item_path) as f:
    item = json.load(f)

if not already_has(item["fields"], "in_progress_at"):
    idx = next(i for i, f in enumerate(item["fields"]) if f.get("fieldname") == "workflow_state")
    for offset, fld in enumerate(TIMESTAMP_FIELDS, start=1):
        item["fields"].insert(idx + offset, fld)
    with open(item_path, "w") as f:
        json.dump(item, f, indent=1, ensure_ascii=False)
    print(f"KOT Item: added {len(TIMESTAMP_FIELDS)} fields after 'workflow_state'")
else:
    print("KOT Item: timestamp fields already present, skipped")
