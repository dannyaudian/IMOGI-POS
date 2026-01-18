# Copyright (c) IMOGI
# MIT License. See LICENSE file for details.

from setuptools import setup, find_packages
import re
from pathlib import Path

# get version from __version__ variable in imogi_pos/__init__.py
def get_version():
    init_file = Path(__file__).parent / "imogi_pos" / "__init__.py"
    content = init_file.read_text()
    match = re.search(r'^__version__\s*=\s*[\'"]([^\'"]*)[\'"]', content, re.MULTILINE)
    if match:
        return match.group(1)
    raise RuntimeError("Unable to find version string.")

setup(
    name="imogi_pos",
    version=get_version(),
    zip_safe=False,
    include_package_data=True,
)
