# -*- coding: utf-8 -*-
"""Setup guide for using native Item Variants in IMOGI POS.

For fresh deployments, follow this guide to create items with variants
using Frappe/ERPNext's built-in Item Variant system.
"""

from __future__ import unicode_literals
import frappe


def create_sample_attributes():
    """Create sample Item Attributes for common use cases."""
    
    attributes_data = [
        {
            "name": "Size",
            "values": [
                {"value": "Small", "abbr": "S"},
                {"value": "Medium", "abbr": "M"},
                {"value": "Large", "abbr": "L"},
                {"value": "Extra Large", "abbr": "XL"}
            ]
        },
        {
            "name": "Sugar Level",
            "values": [
                {"value": "No Sugar", "abbr": "NS"},
                {"value": "Low Sugar", "abbr": "LS"},
                {"value": "Normal", "abbr": "N"},
                {"value": "Extra Sweet", "abbr": "ES"}
            ]
        },
        {
            "name": "Ice Level",
            "values": [
                {"value": "No Ice", "abbr": "NI"},
                {"value": "Less Ice", "abbr": "LI"},
                {"value": "Normal Ice", "abbr": "NM"},
                {"value": "Extra Ice", "abbr": "EI"}
            ]
        },
        {
            "name": "Spice Level",
            "values": [
                {"value": "Mild", "abbr": "MLD"},
                {"value": "Medium", "abbr": "MED"},
                {"value": "Hot", "abbr": "HOT"},
                {"value": "Extra Hot", "abbr": "XHT"}
            ]
        },
        {
            "name": "Topping",
            "values": [
                {"value": "Cheese", "abbr": "CHE"},
                {"value": "Mushroom", "abbr": "MSH"},
                {"value": "Olives", "abbr": "OLV"},
                {"value": "Extra Sauce", "abbr": "XSC"}
            ]
        }
    ]
    
    created = []
    
    for attr_data in attributes_data:
        attr_name = attr_data["name"]
        
        # Check if exists
        if frappe.db.exists("Item Attribute", attr_name):
            print(f"ℹ️  Item Attribute '{attr_name}' already exists")
            continue
        
        # Create attribute
        attr_doc = frappe.new_doc("Item Attribute")
        attr_doc.attribute_name = attr_name
        
        # Add values
        for val in attr_data["values"]:
            attr_doc.append("item_attribute_values", {
                "attribute_value": val["value"],
                "abbr": val["abbr"]
            })
        
        attr_doc.flags.ignore_permissions = True
        attr_doc.insert()
        created.append(attr_name)
        print(f"✅ Created Item Attribute: {attr_name}")
    
    if created:
        frappe.db.commit()
        print(f"\n✅ Created {len(created)} new Item Attributes")
    else:
        print("\n✅ All sample attributes already exist")
    
    return created


def create_sample_item_with_variants():
    """Create a sample item template with variants."""
    
    template_code = "SAMPLE-COFFEE"
    
    # Check if exists
    if frappe.db.exists("Item", template_code):
        print(f"ℹ️  Sample item '{template_code}' already exists")
        return
    
    # Create template
    item = frappe.new_doc("Item")
    item.item_code = template_code
    item.item_name = "Coffee (Sample)"
    item.item_group = "Products"
    item.stock_uom = "Nos"
    item.has_variants = 1
    item.is_sales_item = 1
    item.standard_rate = 25000
    
    # Add attributes
    item.append("attributes", {
        "attribute": "Size",
        "from_range": 0,
        "to_range": 0,
        "increment": 0
    })
    
    item.append("attributes", {
        "attribute": "Sugar Level",
        "from_range": 0,
        "to_range": 0,
        "increment": 0
    })
    
    item.flags.ignore_permissions = True
    item.insert()
    
    print(f"✅ Created sample item template: {template_code}")
    
    # Create sample variants
    variants_data = [
        {"Size": "Small", "Sugar Level": "Normal", "rate": 20000},
        {"Size": "Medium", "Sugar Level": "Normal", "rate": 25000},
        {"Size": "Large", "Sugar Level": "Normal", "rate": 30000},
        {"Size": "Medium", "Sugar Level": "No Sugar", "rate": 25000},
    ]
    
    for variant_attrs in variants_data:
        rate = variant_attrs.pop("rate", 25000)
        
        # Create variant
        variant = frappe.new_doc("Item")
        variant.variant_of = template_code
        
        suffix = "-".join(v[:3].upper() for v in variant_attrs.values())
        variant.item_code = f"{template_code}-{suffix}"
        variant.item_name = f"Coffee - {' '.join(variant_attrs.values())}"
        variant.item_group = "Products"
        variant.stock_uom = "Nos"
        variant.is_sales_item = 1
        variant.standard_rate = rate
        
        # Add attributes
        for attr, value in variant_attrs.items():
            variant.append("attributes", {
                "attribute": attr,
                "attribute_value": value
            })
        
        variant.flags.ignore_permissions = True
        variant.insert()
        print(f"  ✅ Created variant: {variant.item_code}")
    
    frappe.db.commit()
    print(f"\n✅ Sample item with {len(variants_data)} variants created!")


def execute():
    """Execute setup - create sample attributes and items."""
    
    print("\n" + "="*60)
    print("IMOGI POS - Native Item Variants Setup")
    print("="*60 + "\n")
    
    print("Step 1: Creating sample Item Attributes...")
    create_sample_attributes()
    
    print("\nStep 2: Creating sample item with variants...")
    create_sample_item_with_variants()
    
    print("\n" + "="*60)
    print("Setup Complete!")
    print("="*60)
    print("\nNext steps:")
    print("1. Go to Item List and explore the sample items")
    print("2. Check Restaurant Settings for variant options")
    print("3. Use native variants in POS instead of custom options")
    print("\nDocumentation: ARCHITECTURE.md")
    print("="*60 + "\n")


if __name__ == "__main__":
    execute()
