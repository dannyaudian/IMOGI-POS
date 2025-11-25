const assert = require('assert');
const { applyOptionsToLine } = require('../utils/options');

async function testVariantResolution() {
    const selections = {
        variant: {
            value: 'Large',
            name: 'Large',
            linked_item: 'ITEM-LARGE',
            additional_price: 2000,
        },
        price: 2000,
    };

    const line = {
        item: 'ITEM-TEMPLATE',
        template_item: 'ITEM-TEMPLATE',
        item_name: 'Template Item',
        qty: 1,
    };

    const context = {
        qty: 1,
        fetchRate: async (code) => {
            assert.strictEqual(code, 'ITEM-LARGE');
            return { rate: 15000, item_name: 'Resolved Variant' };
        },
    };

    await applyOptionsToLine(line, selections, context);

    assert.strictEqual(line.item, 'ITEM-LARGE');
    assert.strictEqual(line.item_name, 'Resolved Variant');
    assert.strictEqual(line.rate, 15000);
    assert.strictEqual(line.amount, 15000);
    assert.strictEqual(line.additional_price_total, 0);
    assert.strictEqual(line.sku_changed, true);
    assert.strictEqual(line.expected_linked_item, true);
}

async function testModifierSurcharges() {
    const selections = {
        spice: {
            value: 'Medium',
            name: 'Medium',
            additional_price: 500,
        },
        topping: [
            { value: 'Cheese', name: 'Cheese', additional_price: 1000 },
            { value: 'Bacon', name: 'Bacon', additional_price: 1500 },
        ],
    };

    const line = {
        item: 'ITEM-BASE',
        template_item: 'ITEM-BASE',
        item_name: 'Base Item',
        qty: 2,
    };

    const context = {
        qty: 2,
        fetchRate: async (code) => {
            assert.strictEqual(code, 'ITEM-BASE');
            return { rate: 10000, item_name: 'Base Item' };
        },
    };

    await applyOptionsToLine(line, selections, context);

    assert.strictEqual(line.item, 'ITEM-BASE');
    assert.strictEqual(line.item_name, 'Base Item');
    assert.strictEqual(line.rate, 13000);
    assert.strictEqual(line.amount, 26000);
    assert.strictEqual(line.additional_price_total, 3000);
    assert.strictEqual(line.sku_changed, false);
    assert.strictEqual(line.expected_linked_item, false);
}

(async () => {
    await testVariantResolution();
    await testModifierSurcharges();
    console.log('options.test.js passed');
})().catch((error) => {
    console.error('options.test.js failed', error);
    process.exitCode = 1;
});
