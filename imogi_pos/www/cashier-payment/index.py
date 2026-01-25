import frappe

no_cache = 1

def get_context(context):
    """
    Cashier Payment - Table Service Payment Processing
    """
    context.no_cache = 1
    
    # Check if user is logged in
    if frappe.session.user == 'Guest':
        frappe.local.flags.redirect_location = '/login'
        raise frappe.Redirect
    
    # Check if user has cashier permissions
    # You can add role-based checks here if needed
    # if not frappe.has_permission('POS Invoice', 'create'):
    #     frappe.throw('You do not have permission to access Cashier Console')
    
    context.title = 'Cashier Payment - IMOGI POS'
    context.include_js = []
    context.include_css = []
    
    # Get user info
    context.user = frappe.session.user
    context.user_fullname = frappe.session.user_fullname or frappe.session.user
    
    # Get user's default branch if set
    context.default_branch = frappe.db.get_value(
        'User', 
        frappe.session.user, 
        'default_branch'
    )
    
    return context
