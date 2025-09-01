frappe.listview_settings['Brand Profile'] = {
    add_fields: ["status"],
    get_indicator: function(doc) {
        if (doc.status === "Active") {
            return [__("Active"), "green", "status,=,Active"];
        } else {
            return [__("Inactive"), "gray", "status,=,Inactive"];
        }
    }
};