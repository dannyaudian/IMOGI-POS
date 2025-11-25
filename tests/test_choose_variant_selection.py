import sys

from tests.test_variants_pricing import (
    DictNamespace,
    load_variants_module,
    unload_variants_module,
)


def test_choose_variant_for_order_item_selects_expected_variant():
    class DummyOrderItem:
        def __init__(self):
            self.item = "TEMPLATE-ITEM"
            self.item_name = "Template Item"
            self.description = "Template description"
            self.qty = 2
            self.notes = "No notes"
            self.rate = 0
            self.amount = 0
            self.kitchen = None
            self.kitchen_station = None
            self.saved = False

        def save(self):
            self.saved = True

        def as_dict(self):
            return {
                "item": self.item,
                "item_name": self.item_name,
                "description": self.description,
                "qty": self.qty,
                "notes": self.notes,
                "rate": self.rate,
                "amount": self.amount,
                "kitchen": self.kitchen,
                "kitchen_station": self.kitchen_station,
            }

    order_item = DummyOrderItem()

    template_doc = DictNamespace(
        name="TEMPLATE-ITEM",
        attributes=[DictNamespace(attribute="Color")],
    )

    variant_doc = DictNamespace(
        name="TEMPLATE-ITEM-RED",
        item_name="Template Item - Red",
        description="Template Item - Red",
        standard_rate=12000,
        default_kitchen="Kitchen-A",
        default_kitchen_station="Station-1",
    )

    def item_get_all(filters, fields, *_):
        assert filters["variant_of"] == "TEMPLATE-ITEM"
        assert filters["disabled"] == 0
        assert filters["name"] == ["in", ["TEMPLATE-ITEM-RED"]]
        return [DictNamespace(name="TEMPLATE-ITEM-RED")]

    def item_variant_attribute_get_all(filters, fields, *_):
        assert filters == {"attribute": "Color", "attribute_value": "Red"}
        return [DictNamespace(parent="TEMPLATE-ITEM-RED")]

    get_all_handlers = {
        "Item": item_get_all,
        "Item Variant Attribute": item_variant_attribute_get_all,
    }

    get_value_map = {
        ("POS Order", "POS-ORD-1", "branch"): "Main",
        ("Item", "TEMPLATE-ITEM", "has_variants"): 1,
    }

    variants = load_variants_module(
        get_all_handlers=get_all_handlers,
        get_value_map=get_value_map,
        exists_handler=lambda *_: False,
    )

    frappe_module = sys.modules["frappe"]
    frappe_module.ValidationError = getattr(
        frappe_module,
        "ValidationError",
        type("ValidationError", (Exception,), {}),
    )
    frappe_module.PermissionError = getattr(
        frappe_module,
        "PermissionError",
        type("PermissionError", (Exception,), {}),
    )

    get_doc_map = {
        ("POS Order Item", "POS-ROW-1"): order_item,
        ("POS Order", "POS-ORD-1"): DictNamespace(name="POS-ORD-1"),
        ("Item", "TEMPLATE-ITEM"): template_doc,
        ("Item", "TEMPLATE-ITEM-RED"): variant_doc,
    }

    def get_doc(doctype, name=None):
        key = (doctype, name)
        if key not in get_doc_map:
            raise KeyError(key)
        value = get_doc_map[key]
        return value() if callable(value) else value

    frappe_module.get_doc = get_doc

    try:
        response = variants.choose_variant_for_order_item(
            "POS-ORD-1",
            "POS-ROW-1",
            selected_attributes={"Color": "Red"},
        )
    finally:
        unload_variants_module()

    assert order_item.saved is True
    assert response["variant_item"] == "TEMPLATE-ITEM-RED"
    assert response["order_item"]["item"] == "TEMPLATE-ITEM-RED"
    assert response["order_item"]["rate"] == 12000
    assert response["order_item"]["kitchen"] == "Kitchen-A"


def test_choose_variant_for_order_item_selects_variant_with_multiple_attributes():
    class DummyOrderItem:
        def __init__(self):
            self.item = "TEMPLATE-ITEM"
            self.item_name = "Template Item"
            self.description = "Template description"
            self.qty = 1
            self.notes = "Notes"
            self.rate = 0
            self.amount = 0
            self.kitchen = None
            self.kitchen_station = None
            self.saved = False

        def save(self):
            self.saved = True

        def as_dict(self):
            return {
                "item": self.item,
                "item_name": self.item_name,
                "description": self.description,
                "qty": self.qty,
                "notes": self.notes,
                "rate": self.rate,
                "amount": self.amount,
                "kitchen": self.kitchen,
                "kitchen_station": self.kitchen_station,
            }

    order_item = DummyOrderItem()

    template_doc = DictNamespace(
        name="TEMPLATE-ITEM",
        attributes=[
            DictNamespace(attribute="Color"),
            DictNamespace(attribute="Size"),
        ],
    )

    variant_docs = {
        "TEMPLATE-ITEM-RED-L": DictNamespace(
            name="TEMPLATE-ITEM-RED-L",
            item_name="Template Item - Red Large",
            description="Template Item - Red Large",
            standard_rate=15000,
            default_kitchen=None,
            default_kitchen_station=None,
        )
    }

    variant_attribute_map = {
        ("Color", "Red"): ["TEMPLATE-ITEM-RED-L", "TEMPLATE-ITEM-RED-S"],
        ("Color", "Blue"): ["TEMPLATE-ITEM-BLUE-S"],
        ("Size", "Large"): ["TEMPLATE-ITEM-RED-L"],
        ("Size", "Small"): ["TEMPLATE-ITEM-RED-S", "TEMPLATE-ITEM-BLUE-S"],
    }

    def item_get_all(filters, fields, *_):
        assert filters["variant_of"] == "TEMPLATE-ITEM"
        assert filters["disabled"] == 0
        assert filters["name"] == ["in", ["TEMPLATE-ITEM-RED-L"]]
        return [DictNamespace(name="TEMPLATE-ITEM-RED-L")]

    def item_variant_attribute_get_all(filters, fields, *_):
        key = (filters["attribute"], filters["attribute_value"])
        parents = variant_attribute_map.get(key, [])
        return [DictNamespace(parent=parent) for parent in parents]

    get_all_handlers = {
        "Item": item_get_all,
        "Item Variant Attribute": item_variant_attribute_get_all,
    }

    get_value_map = {
        ("POS Order", "POS-ORD-1", "branch"): "Main",
        ("Item", "TEMPLATE-ITEM", "has_variants"): 1,
    }

    variants = load_variants_module(
        get_all_handlers=get_all_handlers,
        get_value_map=get_value_map,
        exists_handler=lambda *_: False,
    )

    frappe_module = sys.modules["frappe"]
    frappe_module.ValidationError = getattr(
        frappe_module,
        "ValidationError",
        type("ValidationError", (Exception,), {}),
    )
    frappe_module.PermissionError = getattr(
        frappe_module,
        "PermissionError",
        type("PermissionError", (Exception,), {}),
    )

    get_doc_map = {
        ("POS Order Item", "POS-ROW-1"): order_item,
        ("POS Order", "POS-ORD-1"): DictNamespace(name="POS-ORD-1"),
        ("Item", "TEMPLATE-ITEM"): template_doc,
        ("Item", "TEMPLATE-ITEM-RED-L"): variant_docs["TEMPLATE-ITEM-RED-L"],
    }

    def get_doc(doctype, name=None):
        key = (doctype, name)
        if key not in get_doc_map:
            raise KeyError(key)
        value = get_doc_map[key]
        return value() if callable(value) else value

    frappe_module.get_doc = get_doc

    try:
        response = variants.choose_variant_for_order_item(
            "POS-ORD-1",
            "POS-ROW-1",
            selected_attributes={"Color": "Red", "Size": "Large"},
        )
    finally:
        unload_variants_module()

    assert order_item.saved is True
    assert response["variant_item"] == "TEMPLATE-ITEM-RED-L"
    assert response["order_item"]["item"] == "TEMPLATE-ITEM-RED-L"
    assert response["order_item"]["rate"] == 15000
