# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from frappe import _

def get_data():
    """
    This desktop.py only provides a launcher icon.
    Main navigation should be done through Workspaces (fixtures).
    """
    return [
        {
            "module_name": "IMOGI POS",
            "color": "#4287f5",
            "icon": "octicon octicon-device-desktop",
            "type": "module",
            "label": _("IMOGI POS"),
            "description": _("Restaurant POS with Table/Counter/Kiosk/Self-Order modes")
        }
    ]