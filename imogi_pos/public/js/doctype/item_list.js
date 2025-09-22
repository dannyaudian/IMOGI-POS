frappe.listview_settings["Item"] = {
    onload(listview) {
        let defaultBomFilter = null;

        const checkBomField = listview.page.add_field({
            fieldtype: "Check",
            fieldname: "check_bom",
            label: __("Check BOM"),
        });

        const toggleBomFilter = (checked) => {
            if (checked) {
                if (!defaultBomFilter) {
                    defaultBomFilter = listview.filter_area.add([
                        listview.doctype,
                        "default_bom",
                        "is set",
                    ]);
                }
            } else if (defaultBomFilter) {
                if (typeof defaultBomFilter.remove === "function") {
                    defaultBomFilter.remove();
                } else if (typeof listview.filter_area.remove === "function") {
                    listview.filter_area.remove(defaultBomFilter);
                }
                defaultBomFilter = null;
            }

            listview.refresh();
        };

        checkBomField.$input.on("change", () => {
            toggleBomFilter(checkBomField.$input.is(":checked"));
        });
    },
};
