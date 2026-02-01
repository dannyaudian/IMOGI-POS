"""
Test: Restaurant Floor table update fix

Verify that update_tables_list() method does not cause SQL injection error
when updating child table records.
"""

import unittest
import frappe
from frappe.tests.utils import FrappeTestCase


class TestRestaurantFloorTableUpdate(FrappeTestCase):
    """Test that Restaurant Floor child table updates work without SQL errors"""
    
    @classmethod
    def setUpClass(cls):
        """Setup test data"""
        frappe.set_user("Administrator")
        
        # Create test branch
        if not frappe.db.exists("Branch", "Test Branch Floor"):
            branch = frappe.get_doc({
                "doctype": "Branch",
                "branch": "Test Branch Floor",
                "branch_name": "Test Branch Floor"
            })
            branch.insert(ignore_permissions=True)
        
        # Create test floor
        if frappe.db.exists("Restaurant Floor", "Test Floor SQL"):
            frappe.delete_doc("Restaurant Floor", "Test Floor SQL", force=True)
            
        floor = frappe.get_doc({
            "doctype": "Restaurant Floor",
            "name": "Test Floor SQL",
            "floor_name": "Test Floor SQL",
            "branch": "Test Branch Floor"
        })
        floor.insert(ignore_permissions=True)
        
        # Create test tables
        for i in range(1, 4):
            table_name = f"TBL-SQL-{i:02d}"
            if frappe.db.exists("Restaurant Table", table_name):
                frappe.delete_doc("Restaurant Table", table_name, force=True)
                
            table = frappe.get_doc({
                "doctype": "Restaurant Table",
                "name": table_name,
                "table_name": table_name,
                "table_number": str(i),
                "floor": "Test Floor SQL",
                "branch": "Test Branch Floor",
                "status": "Available",
                "minimum_seating": 2,
                "maximum_seating": 4
            })
            table.insert(ignore_permissions=True)
    
    def test_update_tables_list_no_sql_error(self):
        """Test that update_tables_list doesn't cause SQL 1064 error"""
        floor = frappe.get_doc("Restaurant Floor", "Test Floor SQL")
        
        # This should NOT raise MariaDB 1064 error
        try:
            floor.update_tables_list()
            frappe.db.commit()
        except Exception as e:
            error_msg = str(e)
            # Check it's not the SQL syntax error
            self.assertNotIn("1064", error_msg, 
                           f"SQL syntax error occurred: {error_msg}")
            self.assertNotIn("[{", error_msg,
                           f"List/dict injected to SQL: {error_msg}")
            raise
        
        # Verify child records were created
        child_count = frappe.db.count(
            "Restaurant Floor Table",
            {"parent": "Test Floor SQL"}
        )
        self.assertEqual(child_count, 3, 
                        "Should have 3 child table records")
    
    def test_update_tables_list_data_integrity(self):
        """Test that child table data is correct after update"""
        floor = frappe.get_doc("Restaurant Floor", "Test Floor SQL")
        floor.update_tables_list()
        frappe.db.commit()
        
        # Reload to get fresh data
        floor.reload()
        
        # Verify child table count
        self.assertEqual(len(floor.tables), 3, 
                        "Should have 3 tables in child table")
        
        # Verify data content
        table_names = {row.table for row in floor.tables}
        expected_names = {"TBL-SQL-01", "TBL-SQL-02", "TBL-SQL-03"}
        self.assertEqual(table_names, expected_names,
                        "Child table should have correct table references")
    
    def test_update_tables_list_parameterized_query(self):
        """Test that SQL queries use parameterized approach"""
        floor = frappe.get_doc("Restaurant Floor", "Test Floor SQL")
        
        # Update with different statuses
        frappe.db.set_value("Restaurant Table", "TBL-SQL-01", "status", "Occupied")
        frappe.db.set_value("Restaurant Table", "TBL-SQL-02", "status", "Reserved")
        
        floor.update_tables_list()
        frappe.db.commit()
        floor.reload()
        
        # Find the updated tables in child table
        statuses = {row.table: row.status for row in floor.tables}
        
        self.assertEqual(statuses.get("TBL-SQL-01"), "Occupied")
        self.assertEqual(statuses.get("TBL-SQL-02"), "Reserved")
        self.assertEqual(statuses.get("TBL-SQL-03"), "Available")
    
    def test_multiple_updates_no_error(self):
        """Test that multiple consecutive updates don't cause errors"""
        floor = frappe.get_doc("Restaurant Floor", "Test Floor SQL")
        
        # Update multiple times
        for _ in range(3):
            floor.update_tables_list()
            frappe.db.commit()
        
        # Should still have correct count
        floor.reload()
        self.assertEqual(len(floor.tables), 3)
    
    @classmethod
    def tearDownClass(cls):
        """Cleanup test data"""
        # Clean up in reverse order
        for i in range(1, 4):
            table_name = f"TBL-SQL-{i:02d}"
            if frappe.db.exists("Restaurant Table", table_name):
                frappe.delete_doc("Restaurant Table", table_name, force=True)
        
        if frappe.db.exists("Restaurant Floor", "Test Floor SQL"):
            frappe.delete_doc("Restaurant Floor", "Test Floor SQL", force=True)
        
        if frappe.db.exists("Branch", "Test Branch Floor"):
            frappe.delete_doc("Branch", "Test Branch Floor", force=True)


if __name__ == "__main__":
    unittest.main()
