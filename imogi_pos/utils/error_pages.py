"""
Error page helper for www pages.

Provides centralized error handling with user-friendly error pages
for setup issues and other errors.
"""

import frappe
from frappe import _
from imogi_pos.utils.branding import (
    PRIMARY_COLOR,
    ACCENT_COLOR,
    HEADER_BG_COLOR,
)


def set_setup_error(context, error_type="pos_profile", error_message=None, page_name="this page"):
    """
    Set error context for a user-friendly error page.
    
    Args:
        context: Frappe context dict
        error_type: Type of error - "pos_profile", "session", "permission", "generic"
        error_message: Optional custom error message
        page_name: Name of the page for display purposes
    
    Returns:
        context with error fields set
    """
    context.setup_error = True
    
    # Set default branding for error page
    context.branding = {
        "primary_color": PRIMARY_COLOR,
        "accent_color": ACCENT_COLOR,
        "header_bg_color": HEADER_BG_COLOR,
        "logo_url": None,
        "brand_name": "IMOGI POS"
    }
    
    context.show_back_button = True
    context.back_url = "/app"
    context.back_label = _("Go to Desk")
    
    if error_type == "pos_profile":
        context.error_title = _("Setup Required")
        context.error_message = error_message or _("No POS Profiles are assigned to your account. Please contact your administrator to set one up.")
        context.error_details = [
            _("A POS Profile is required to use {0}.").format(page_name),
            _("Go to POS Profile list and create a new profile."),
            _("Assign the profile to your user account.")
        ]
        context.error_icon = "warning"
        
    elif error_type == "session":
        context.error_title = _("Session Required")
        context.error_message = error_message or _("An active POS session is required to access this page.")
        context.error_details = [
            _("You need to open a POS session first."),
            _("Go to POS Opening Entry and create a new session."),
            _("Once opened, you can access {0}.").format(page_name)
        ]
        context.error_icon = "lock"
        context.back_url = "/app/pos-opening-entry/new-pos-opening-entry"
        context.back_label = _("Open Session")
        
    elif error_type == "permission":
        context.error_title = _("Access Denied")
        context.error_message = error_message or _("You don't have permission to access this page.")
        context.error_details = [
            _("This page requires specific roles to access."),
            _("Contact your administrator to request access."),
        ]
        context.error_icon = "lock"
        
    elif error_type == "branch":
        context.error_title = _("Branch Required")
        context.error_message = error_message or _("No branch is configured for your account.")
        context.error_details = [
            _("A branch assignment is required to use {0}.").format(page_name),
            _("Contact your administrator to assign you to a branch."),
        ]
        context.error_icon = "warning"
        
    else:  # generic
        context.error_title = _("Error")
        context.error_message = error_message or _("An unexpected error occurred.")
        context.error_details = [
            _("Please try again or contact support."),
        ]
        context.error_icon = "error"
    
    return context


def get_error_page_html():
    """
    Returns the HTML template for error pages that can be included in templates.
    """
    return """
{% if setup_error %}
<!-- Setup Error Page -->
<div class="setup-error-container">
  <div class="setup-error-card">
    <div class="error-icon {% if error_icon == 'lock' %}error-icon-lock{% elif error_icon == 'error' %}error-icon-error{% else %}error-icon-warning{% endif %}">
      {% if error_icon == 'lock' %}
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      {% elif error_icon == 'error' %}
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
      {% else %}
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      {% endif %}
    </div>
    <h1 class="error-title">{{ error_title }}</h1>
    <p class="error-message">{{ error_message }}</p>
    {% if error_details %}
    <ul class="error-details">
      {% for detail in error_details %}
      <li>{{ detail }}</li>
      {% endfor %}
    </ul>
    {% endif %}
    {% if show_back_button %}
    <a href="{{ back_url }}" class="error-back-button">{{ back_label }}</a>
    {% endif %}
  </div>
</div>
{% endif %}
"""


def get_error_page_css():
    """
    Returns the CSS styles for error pages.
    """
    return """
.setup-error-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  background: #F7F5F2;
}
.setup-error-card {
  background: white;
  border-radius: 16px;
  padding: 48px;
  max-width: 500px;
  text-align: center;
  box-shadow: 0 10px 40px rgba(0,0,0,0.1);
}
.error-icon {
  margin-bottom: 24px;
}
.error-icon-warning {
  color: #f59e0b;
}
.error-icon-lock {
  color: #6b7280;
}
.error-icon-error {
  color: #ef4444;
}
.error-title {
  font-size: 24px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 12px 0;
}
.error-message {
  font-size: 16px;
  color: #6b7280;
  margin: 0 0 24px 0;
  line-height: 1.6;
}
.error-details {
  text-align: left;
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px 16px 16px 32px;
  margin: 0 0 24px 0;
  color: #4b5563;
  font-size: 14px;
  list-style-type: disc;
}
.error-details li {
  margin-bottom: 8px;
}
.error-details li:last-child {
  margin-bottom: 0;
}
.error-back-button {
  display: inline-block;
  background: #6B9080;
  color: white;
  padding: 12px 32px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 500;
  transition: opacity 0.2s;
}
.error-back-button:hover {
  opacity: 0.9;
  color: white;
}
"""
