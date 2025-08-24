# Copyright (c) IMOGI
# MIT License. See LICENSE file for details.

from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

# get version from __version__ variable in imogi_pos/__init__.py
from imogi_pos import __version__ as version

setup(
    name="imogi_pos",
    version=version,
    description="Point of Sale system for ERPNext",
    author="IMOGI",
    author_email="info@imogi.tech",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires,
    license="MIT",
    classifiers=[
        "Development Status :: 4 - Beta",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3.10",
    ],
)