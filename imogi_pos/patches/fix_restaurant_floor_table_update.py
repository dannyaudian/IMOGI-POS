# -*- coding: utf-8 -*-
# Copyright (c) 2026, IMOGI and contributors
# For license information, please see license.txt

"""
Patch: Fix Restaurant Floor table update SQL injection error

Issue:
- MariaDB Error 1064 terjadi karena `frappe.db.set_value()` dipanggil 
  dengan list/dict sebagai value untuk child table field
- Query SQL jadi: ... WHERE ... = '[{...}]' yang invalid

Solution:
- Ganti dengan `frappe.db.sql()` dengan parameterized query
- Atau lebih baik: langsung pakai `doc.save()` untuk update child tables

Related Error:
"Restaurant Table Update Error" - (1064, "You have an error in your SQL syntax ... near '[{'name': None, ... }]'")
"""

import frappe


def execute():
    """
    Patch ini tidak perlu migrasi data karena hanya fix bug di kode.
    Tapi kita validate bahwa semua Restaurant Floor records bisa di-load dengan benar.
    """
    frappe.reload_doc("imogi_pos", "doctype", "restaurant_floor")
    frappe.reload_doc("imogi_pos", "doctype", "restaurant_floor_table")
    
    # Validate existing floors dapat diproses tanpa error
    floors = frappe.get_all("Restaurant Floor", pluck="name")
    
    fixed_count = 0
    error_count = 0
    
    for floor_name in floors:
        try:
            floor_doc = frappe.get_doc("Restaurant Floor", floor_name)
            
            # Clear dan rebuild tables list menggunakan metode yang aman
            floor_doc.tables = []
            
            tables = frappe.get_all(
                "Restaurant Table", 
                filters={"floor": floor_name},
                fields=["name", "table_number", "status", "current_pos_order"]
            )
            
            for table in tables:
                floor_doc.append("tables", {
                    "table": table.name,
                    "table_number": table.table_number,
                    "status": table.status,
                    "current_pos_order": table.current_pos_order
                })
            
            # Gunakan save() yang aman untuk child tables, bukan set_value()
            if tables:
                floor_doc.save(ignore_permissions=True)
                fixed_count += 1
                
        except Exception as e:
            error_count += 1
            frappe.log_error(
                title=f"Restaurant Floor Patch Error: {floor_name}",
                message=str(e)
            )
    
    print(f"Restaurant Floor patch completed: {fixed_count} fixed, {error_count} errors")
    
    if error_count > 0:
        frappe.msgprint(
            f"Patch selesai dengan {error_count} error. Check Error Log untuk detail.",
            indicator="orange"
        )
