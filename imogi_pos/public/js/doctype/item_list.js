frappe.listview_settings["Item"] = {
    onload(listview) {
        let defaultBomFilter = null;

        const checkBomWrapper = $(
            "<div class=\"frappe-control form-group\"></div>"
        ).appendTo(
            listview.page.page_form
        );

        const checkBomControl = frappe.ui.form.make_control({
            parent: checkBomWrapper.get(0),
            df: {
                fieldtype: "Check",
                fieldname: "check_bom",
                label: __("Check BOM"),
            },
            render_input: true,
        });
        checkBomControl.refresh();

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

        checkBomControl.$input.on("change", () => {
            toggleBomFilter(checkBomControl.$input.is(":checked"));
        });
    },
};
