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
- Ganti dengan Frappe ORM `doc.save()` yang handle child tables dengan benar
- Tambah flag protection untuk prevent infinite loop

Related Error:
"Restaurant Table Update Error" - (1064, "You have an error in your SQL syntax ... near '[{'name': None, ... }]'")
"""

import frappe


def execute():
    """
    Patch ini rebuild semua Restaurant Floor child table records
    dengan cara yang aman menggunakan Frappe ORM.
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
            
            # Set flag to prevent triggering on_update loop
            floor_doc.flags.updating_tables_list = True
            
            # Clear dan rebuild tables list menggunakan ORM
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
            
            # Save dengan ORM - aman untuk child tables
            floor_doc.flags.ignore_validate_update_after_submit = True
            floor_doc.save(ignore_permissions=True)
            
            fixed_count += 1
                
        except Exception as e:
            error_count += 1
            frappe.log_error(
                title=f"Restaurant Floor Patch Error: {floor_name}",
                message=str(e)
            )
        finally:
            # Always clear flag
            if 'floor_doc' in locals():
                floor_doc.flags.updating_tables_list = False
    
    print(f"Restaurant Floor patch completed: {fixed_count} fixed, {error_count} errors")
    
    if error_count > 0:
        frappe.msgprint(
            f"Patch selesai dengan {error_count} error. Check Error Log untuk detail.",
            indicator="orange"
        )
