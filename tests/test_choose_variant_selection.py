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
        list_filters = [tuple(f) for f in filters if isinstance(f, (list, tuple))]
        assert ("variant_of", "=", "TEMPLATE-ITEM") in list_filters
        assert ("disabled", "=", 0) in list_filters
        assert ("Item Variant Attribute", "attribute", "=", "Color") in list_filters
        assert ("Item Variant Attribute", "attribute_value", "=", "Red") in list_filters

        for condition in filters:
            if isinstance(condition, (list, tuple)):
                assert "and" not in condition

        return [DictNamespace(name="TEMPLATE-ITEM-RED")]

    get_all_handlers = {
        "Item": item_get_all,
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
