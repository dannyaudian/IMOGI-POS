import importlib, sys, types, pytest


def load_module():
    sys.path.insert(0, '.')
    frappe = types.ModuleType('frappe')
    class ValidationError(Exception):
        pass
    frappe.ValidationError = ValidationError
    def throw(msg, exc=None):
        raise (exc or Exception)(msg)
    frappe.throw = throw
    frappe._ = lambda x: x
    sys.modules['frappe'] = frappe
    mod = importlib.import_module('imogi_pos.api.customizations')
    importlib.reload(mod)
    return mod, frappe


def unload_module():
    sys.modules.pop('frappe', None)
    sys.modules.pop('imogi_pos.api.customizations', None)
    if sys.path[0] == '.':
        sys.path.pop(0)


def test_validate_group_min_max():
    mod, frappe = load_module()
    group = {'name': 'Toppings', 'selection_type': 'multi', 'min_select': 1, 'max_select': 2}
    mod.validate_group_selection(group, ['Cheese'])  # valid
    with pytest.raises(frappe.ValidationError):
        mod.validate_group_selection(group, [])  # too few
    with pytest.raises(frappe.ValidationError):
        mod.validate_group_selection(group, ['Cheese', 'Ham', 'Bacon'])  # too many
    unload_module()


def test_validate_group_selection_types():
    mod, frappe = load_module()
    single_group = {'name': 'Size', 'selection_type': 'single', 'min_select': 1, 'max_select': 1}
    mod.validate_group_selection(single_group, {'name': 'Large'})
    with pytest.raises(frappe.ValidationError):
        mod.validate_group_selection(single_group, ['Large', 'Medium'])

    qty_group = {'name': 'Sauce', 'selection_type': 'quantity', 'min_select': 0, 'max_select': 5}
    mod.validate_group_selection(qty_group, [{'name': 'Ketchup', 'qty': 3}])
    with pytest.raises(frappe.ValidationError):
        mod.validate_group_selection(qty_group, [{'name': 'Ketchup', 'qty': 6}])
    unload_module()
