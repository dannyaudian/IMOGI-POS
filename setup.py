# Copyright (c) IMOGI
# MIT License. See LICENSE file for details.

from setuptools import setup, find_packages

# get version from __version__ variable in imogi_pos/__init__.py
from imogi_pos import __version__ as version

setup(
    name="imogi_pos",
    version=version,
    zip_safe=False,
    include_package_data=True,
)
