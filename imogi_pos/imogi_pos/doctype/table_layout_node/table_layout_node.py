# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from frappe.model.document import Document

class TableLayoutNode(Document):
    def validate(self):
        self.validate_dimensions()
        self.fetch_table_info()
    
    def validate_dimensions(self):
        """Validate node dimensions are positive"""
        if self.width <= 0:
            self.width = 100
            
        if self.height <= 0:
            self.height = 100
            
        if self.position_x < 0:
            self.position_x = 0
            
        if self.position_y < 0:
            self.position_y = 0
            
    def fetch_table_info(self):
        """Fetch floor and label from table if not provided"""
        if self.node_type == "table" and self.table:
            if not self.label:
                self.label = frappe.db.get_value("Restaurant Table", self.table, "table_number")
                
            # Floor is fetched automatically via fetch_from in the JSON