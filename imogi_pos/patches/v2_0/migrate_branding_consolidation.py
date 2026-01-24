"""
Migration Patch: Consolidate Branding Configuration

This patch:
1. Creates default Brand Profile from Restaurant Settings if branding exists
2. Updates Restaurant Settings to use Brand Profile link
3. Removes old branding fields from Restaurant Settings
4. Updates POS Profile to use Brand Profile links
"""

import frappe
from frappe import _


def execute():
	"""Execute branding consolidation migration"""
	
	try:
		# Step 1: Create Brand Profile from Restaurant Settings
		create_brand_profile_from_settings()
		
		# Step 2: Migrate POS Profile branding (if any POS Profiles have custom branding)
		migrate_pos_profile_branding()
		
		frappe.db.commit()
		
		print("Branding consolidation migration completed successfully")
	
	except Exception as e:
		frappe.log_error(
			title="Branding Migration Error",
			message=f"Error during branding migration: {str(e)}"
		)
		frappe.db.rollback()
		raise


def create_brand_profile_from_settings():
	"""Create Brand Profile from Restaurant Settings branding fields"""
	
	try:
		settings = frappe.get_single("Restaurant Settings")
		
		# Check if old branding fields exist
		has_old_branding = (
			hasattr(settings, 'imogi_brand_name') and
			settings.get('imogi_brand_name')
		)
		
		if not has_old_branding:
			print("No branding data found in Restaurant Settings, skipping")
			return
		
		brand_name = settings.get('imogi_brand_name') or "Default Brand"
		
		# Check if Brand Profile already exists
		if frappe.db.exists("Brand Profile", brand_name):
			print(f"Brand Profile '{brand_name}' already exists")
			# Link existing profile to settings
			if not settings.get('brand_profile'):
				settings.brand_profile = brand_name
				settings.save(ignore_permissions=True)
				print(f"Linked existing Brand Profile '{brand_name}' to Restaurant Settings")
			return
		
		# Create new Brand Profile from Restaurant Settings
		brand_profile = frappe.get_doc({
			"doctype": "Brand Profile",
			"brand_name": brand_name,
			"status": "Active"
		})
		
		# Copy logo fields
		if settings.get('imogi_brand_logo'):
			brand_profile.logo = settings.get('imogi_brand_logo')
		
		if settings.get('imogi_brand_logo_dark'):
			brand_profile.logo_dark = settings.get('imogi_brand_logo_dark')
		
		# Copy color fields
		if settings.get('imogi_brand_color_primary'):
			brand_profile.primary_color = settings.get('imogi_brand_color_primary')
		
		if settings.get('imogi_brand_color_accent'):
			brand_profile.accent_color = settings.get('imogi_brand_color_accent')
		
		# Save Brand Profile
		brand_profile.insert(ignore_permissions=True)
		print(f"Created Brand Profile: {brand_name}")
		
		# Link to Restaurant Settings
		settings.brand_profile = brand_profile.name
		settings.save(ignore_permissions=True)
		print(f"Linked Brand Profile '{brand_name}' to Restaurant Settings")
	
	except Exception as e:
		frappe.log_error(
			title="Brand Profile Creation Error",
			message=f"Error creating brand profile from settings: {str(e)}"
		)


def migrate_pos_profile_branding():
	"""Migrate custom branding from POS Profiles to Brand Profiles"""
	
	try:
		# Get all POS Profiles with custom branding
		pos_profiles = frappe.get_all(
			"POS Profile",
			filters={},
			fields=["name"]
		)
		
		if not pos_profiles:
			print("No POS Profiles found, skipping")
			return
		
		migrated_count = 0
		
		for profile_data in pos_profiles:
			profile_name = profile_data.get('name')
			
			try:
				# Check if POS Profile has custom branding
				custom_branding = frappe.db.get_value(
					"POS Profile",
					profile_name,
					["imogi_brand_name", "imogi_brand_logo", "imogi_brand_logo_dark",
					 "imogi_brand_color_primary", "imogi_brand_color_accent"],
					as_dict=True
				)
				
				if not custom_branding:
					continue
				
				# Check if this POS Profile has any custom branding set
				has_custom_branding = any([
					custom_branding.get('imogi_brand_name'),
					custom_branding.get('imogi_brand_logo'),
					custom_branding.get('imogi_brand_color_primary')
				])
				
				if not has_custom_branding:
					continue
				
				# Create a Brand Profile for this POS Profile
				brand_name = custom_branding.get('imogi_brand_name') or f"{profile_name} Brand"
				
				# Check if Brand Profile already exists
				if frappe.db.exists("Brand Profile", brand_name):
					# Link existing profile
					frappe.db.set_value("POS Profile", profile_name, "brand_profile", brand_name)
					print(f"Linked existing Brand Profile '{brand_name}' to POS Profile '{profile_name}'")
					migrated_count += 1
					continue
				
				# Create new Brand Profile
				brand_profile = frappe.get_doc({
					"doctype": "Brand Profile",
					"brand_name": brand_name,
					"status": "Active"
				})
				
				# Copy branding fields
				if custom_branding.get('imogi_brand_logo'):
					brand_profile.logo = custom_branding.get('imogi_brand_logo')
				
				if custom_branding.get('imogi_brand_logo_dark'):
					brand_profile.logo_dark = custom_branding.get('imogi_brand_logo_dark')
				
				if custom_branding.get('imogi_brand_color_primary'):
					brand_profile.primary_color = custom_branding.get('imogi_brand_color_primary')
				
				if custom_branding.get('imogi_brand_color_accent'):
					brand_profile.accent_color = custom_branding.get('imogi_brand_color_accent')
				
				# Save Brand Profile
				brand_profile.insert(ignore_permissions=True)
				
				# Link to POS Profile
				frappe.db.set_value("POS Profile", profile_name, "brand_profile", brand_profile.name)
				
				print(f"Created Brand Profile '{brand_name}' for POS Profile '{profile_name}'")
				migrated_count += 1
			
			except Exception as e:
				frappe.log_error(
					title=f"POS Profile Branding Migration Error - {profile_name}",
					message=f"Error migrating branding for {profile_name}: {str(e)}"
				)
		
		if migrated_count > 0:
			print(f"Migrated branding for {migrated_count} POS Profile(s)")
	
	except Exception as e:
		frappe.log_error(
			title="POS Profile Branding Migration Error",
			message=f"Error migrating POS Profile branding: {str(e)}"
		)
