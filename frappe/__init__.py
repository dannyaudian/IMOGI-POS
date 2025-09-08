"""Minimal Frappe stub for testing.

This module provides a safe implementation of :func:`errprint` that avoids
propagating ``BrokenPipeError`` when writing to ``stderr`` fails.  The real
Frappe framework offers many more utilities; however, for the purposes of this
project only the error printing behaviour is required.
"""

from __future__ import annotations

import logging
import sys
from typing import Any


def errprint(*args: Any, **kwargs: Any) -> None:
    """Print to ``stderr`` while ignoring broken pipe errors.

    When the output stream is closed (for instance, when a client disconnects),
    the builtin :func:`print` may raise :class:`BrokenPipeError`.  This wrapper
    suppresses that specific exception so that logging does not interfere with
    the application's error handling.
    """

    kwargs.setdefault("file", sys.stderr)
    try:
        print(*args, **kwargs)
    except BrokenPipeError:
        # Fail silently; optionally log at debug level for developers.
        logging.getLogger(__name__).debug(
            "BrokenPipeError in errprint", exc_info=True
        )


def log_error(message: str, title: str | None = None) -> None:
    """Simple ``log_error`` stub used by the tests.

    Parameters
    ----------
    message:
        The message to log.
    title:
        Optional title for the log entry.
    """

    if title:
        logging.getLogger(__name__).error("%s: %s", title, message)
    else:
        logging.getLogger(__name__).error("%s", message)


__all__ = ["errprint", "log_error"]
