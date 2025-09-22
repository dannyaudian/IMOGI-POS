(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const globalRoot = root || (typeof self !== 'undefined' ? self : window);
        if (!globalRoot.imogi_pos) {
            globalRoot.imogi_pos = {};
        }
        if (!globalRoot.imogi_pos.utils) {
            globalRoot.imogi_pos.utils = {};
        }
        if (!globalRoot.imogi_pos.utils.options) {
            globalRoot.imogi_pos.utils.options = {};
        }
        const api = factory();
        globalRoot.imogi_pos.utils.options.applyOptionsToLine = api.applyOptionsToLine;
        globalRoot.imogi_pos.utils.options.__helpers = api.__helpers;
    }
})(typeof window !== 'undefined' ? window : this, function () {
    const RESERVED_GROUP_KEYS = new Set(['price', 'extra_price']);

    const cloneSelections = (selections) => {
        if (!selections) {
            return {};
        }
        try {
            return JSON.parse(JSON.stringify(selections));
        } catch (error) {
            console.warn('Failed to clone selections payload', error);
            return selections;
        }
    };

    const extractLinkedItem = (selection) => {
        if (!selection) {
            return null;
        }
        if (Array.isArray(selection)) {
            for (const entry of selection) {
                const resolved = extractLinkedItem(entry);
                if (resolved) {
                    return resolved;
                }
            }
            return null;
        }
        if (typeof selection === 'object') {
            if (selection.linked_item) {
                return selection.linked_item;
            }
            if (selection.value && typeof selection.value === 'object') {
                return extractLinkedItem(selection.value);
            }
            return null;
        }
        return null;
    };

    const extractDisplayName = (selection) => {
        if (!selection) {
            return null;
        }
        if (Array.isArray(selection)) {
            for (const entry of selection) {
                const name = extractDisplayName(entry);
                if (name) {
                    return name;
                }
            }
            return null;
        }
        if (typeof selection === 'object') {
            if (selection.name) {
                return selection.name;
            }
            if (selection.value && typeof selection.value === 'object') {
                return extractDisplayName(selection.value);
            }
            if (typeof selection.value === 'string' && selection.value) {
                return selection.value;
            }
            return null;
        }
        if (typeof selection === 'string') {
            return selection;
        }
        return null;
    };

    const visitSelections = (value, callback) => {
        if (value === undefined || value === null) {
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((entry) => visitSelections(entry, callback));
            return;
        }
        callback(value);
        if (typeof value === 'object' && value.value !== undefined) {
            visitSelections(value.value, callback);
        }
    };

    const sumAdditionalPrice = (selections) => {
        let total = 0;
        Object.entries(selections || {}).forEach(([group, selection]) => {
            if (RESERVED_GROUP_KEYS.has(group)) {
                return;
            }
            visitSelections(selection, (entry) => {
                if (!entry || typeof entry !== 'object') {
                    return;
                }
                const linkedItem = entry.linked_item;
                const extra = Number(entry.additional_price || entry.price || 0) || 0;
                if (!linkedItem && extra) {
                    total += extra;
                }
            });
        });
        return total;
    };

    const hasAnyLinkedItem = (selections) => {
        let found = false;
        Object.entries(selections || {}).forEach(([group, selection]) => {
            if (RESERVED_GROUP_KEYS.has(group) || found) {
                return;
            }
            const linked = extractLinkedItem(selection);
            if (linked) {
                found = true;
            }
        });
        return found;
    };

    const getFrappe = (context) => {
        if (context && context.frappe) {
            return context.frappe;
        }
        if (typeof frappe !== 'undefined') {
            return frappe;
        }
        return null;
    };

    const callPricing = (itemCode, context) => {
        if (!itemCode) {
            return Promise.reject(new Error('Item code is required'));
        }
        if (context && typeof context.fetchRate === 'function') {
            return Promise.resolve(context.fetchRate(itemCode, context));
        }
        const frappeRef = getFrappe(context);
        if (!frappeRef || typeof frappeRef.call !== 'function') {
            return Promise.reject(new Error('Pricing service unavailable'));
        }
        const args = { item_code: itemCode };
        if (context && context.priceList) {
            args.price_list = context.priceList;
        }
        if (context && context.basePriceList) {
            args.base_price_list = context.basePriceList;
        }
        if (context && context.posProfile) {
            args.pos_profile = context.posProfile;
        }
        return new Promise((resolve, reject) => {
            frappeRef.call({
                method: 'imogi_pos.api.pricing.get_item_price',
                args,
                callback: (response) => {
                    resolve((response && response.message) || {});
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    };

    const normalizeQuantity = (line, context) => {
        const contextQty = context && typeof context.qty === 'number' ? context.qty : null;
        const lineQty = line && typeof line.qty === 'number' ? line.qty : null;
        const qty = contextQty !== null ? contextQty : (lineQty !== null ? lineQty : 1);
        return qty > 0 ? qty : 1;
    };

    const applyOptionsToLine = async (line, selections, context = {}) => {
        if (!line) {
            throw new Error('Line is required');
        }
        const originalItemCode = line.item || line.item_code;
        if (!originalItemCode) {
            throw new Error('Line must include an item code');
        }

        const clonedSelections = cloneSelections(selections);
        const variantSelection = clonedSelections ? clonedSelections.variant : null;
        const singleSelectSelections = [];
        const modifierSelections = [];

        Object.entries(clonedSelections || {}).forEach(([group, selection]) => {
            if (RESERVED_GROUP_KEYS.has(group) || group === 'variant') {
                return;
            }
            if (Array.isArray(selection)) {
                modifierSelections.push(selection);
            } else {
                singleSelectSelections.push(selection);
            }
        });

        const candidates = [];
        if (variantSelection) {
            candidates.push(variantSelection);
        }
        singleSelectSelections.forEach((selection) => candidates.push(selection));
        modifierSelections.forEach((selection) => candidates.push(selection));

        let resolvedItemCode = null;
        let resolvedSelection = null;
        for (const selection of candidates) {
            const linked = extractLinkedItem(selection);
            if (linked) {
                resolvedItemCode = linked;
                resolvedSelection = selection;
                break;
            }
        }

        const effectiveItemCode = resolvedItemCode || originalItemCode;
        const expectedLinkedItem = hasAnyLinkedItem(clonedSelections);
        const skuChanged = Boolean(resolvedItemCode && resolvedItemCode !== originalItemCode);

        const pricingResult = await callPricing(effectiveItemCode, context).catch((error) => {
            console.error('Failed to fetch item pricing', error);
            throw error;
        });

        const baseRate = Number(pricingResult && pricingResult.rate) || 0;
        const modifierSurcharge = sumAdditionalPrice(clonedSelections);
        const finalRate = baseRate + modifierSurcharge;
        const quantity = normalizeQuantity(line, context);

        const resolvedNameFromSelection = extractDisplayName(resolvedSelection);
        const resolvedItemName = (
            (pricingResult && pricingResult.item_name) ||
            resolvedNameFromSelection ||
            context.itemName ||
            line.item_name ||
            effectiveItemCode
        );

        line.template_item = line.template_item || originalItemCode;
        line.item = effectiveItemCode;
        line.item_code = effectiveItemCode;
        line.item_name = resolvedItemName;
        line.base_rate = baseRate;
        line.additional_price_total = modifierSurcharge;
        line.rate = finalRate;
        line.rate_final = finalRate;
        line.amount = finalRate * quantity;
        line.qty = quantity;
        line.item_options = clonedSelections;
        line.options = clonedSelections;
        line.sku_changed = skuChanged;
        line.expected_linked_item = expectedLinkedItem;
        if (pricingResult && pricingResult.price_list) {
            line.price_list = pricingResult.price_list;
        }
        if (pricingResult && pricingResult.base_price_list) {
            line.base_price_list = pricingResult.base_price_list;
        }

        return {
            item_code: effectiveItemCode,
            item_name: resolvedItemName,
            base_rate: baseRate,
            additional_price: modifierSurcharge,
            rate_final: finalRate,
            sku_changed: skuChanged,
            expected_linked_item: expectedLinkedItem,
        };
    };

    return {
        applyOptionsToLine,
        __helpers: {
            extractLinkedItem,
            sumAdditionalPrice,
            hasAnyLinkedItem,
        },
    };
});
