"""Utilities for working with item options."""

from typing import Any, Dict, List, Union
import json


def format_options_for_display(options: Union[str, Dict[str, Any], List[Any], None]) -> str:
    """Return a human readable string for item options.

    Accepts a dict, list or JSON string and returns a string formatted as
    ``"Key: Value"`` pairs joined by ``" | "``. Underscores in keys are
    replaced with spaces and capitalised. Values that are dictionaries or
    lists are flattened to comma separated names.
    """
    if not options:
        return ""

    # If the options are passed as a JSON string attempt to parse them
    if isinstance(options, str):
        try:
            options = json.loads(options)
        except Exception:
            # If parsing fails just return the original string
            return options

    parts: List[str] = []

    if isinstance(options, dict):
        for key, value in options.items():
            label = key.replace("_", " ").title()
            if isinstance(value, dict):
                name = value.get("name") or value.get("label") or str(value)
                parts.append(f"{label}: {name}")
            elif isinstance(value, list):
                names = [
                    (item.get("name") or item.get("label") or str(item))
                    if isinstance(item, dict) else str(item)
                    for item in value
                ]
                parts.append(f"{label}: {', '.join(names)}")
            else:
                parts.append(f"{label}: {value}")
    elif isinstance(options, list):
        names = [
            (item.get("name") or item.get("label") or str(item))
            if isinstance(item, dict) else str(item)
            for item in options
        ]
        parts.append(", ".join(names))
    else:
        return str(options)

    return " | ".join(parts)
