# -*- coding: utf-8 -*-
# Copyright (c) 2026, IMOGI and contributors
# For license information, please see license.txt

"""
Test suite for centralized POS Profile resolver

This test validates the architectural requirements from the refactoring spec:
1. Single resolver function controls all POS Profile access
2. System Manager / Administrator bypass default requirements
3. Regular users must be in "Applicable for Users" table
4. DefaultValue is optional fallback, never required
5. Multi-profile selection is deterministic
"""

import frappe
import unittest
from unittest.mock import Mock, patch, MagicMock
from imogi_pos.utils.pos_profile_resolver import (
    resolve_pos_profile_for_user,
    get_available_pos_profiles,
    validate_pos_profile_access,
    get_pos_profile_branch
)


class TestPOSProfileResolver(unittest.TestCase):
    """Test centralized POS Profile resolver"""
    
    def setUp(self):
        """Setup test data"""
        self.test_user = 'test_cashier@example.com'
        self.test_admin = 'Administrator'
        self.test_profile = 'Test-POS-Profile'
        self.test_branch = 'Test Branch'
    
    def tearDown(self):
        """Cleanup test data"""
        pass
    
    @patch('frappe.session')
    @patch('frappe.get_roles')
    def test_guest_user_no_access(self, mock_get_roles, mock_session):
        """Test that Guest user has no POS access"""
        mock_session.user = 'Guest'
        
        result = resolve_pos_profile_for_user(user='Guest')
        
        self.assertFalse(result['has_access'])
        self.assertIsNone(result['pos_profile'])
        self.assertEqual(result['selection_method'], 'none_no_access')
        self.assertEqual(len(result['available_profiles']), 0)
    
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('frappe.get_all')
    def test_system_manager_sees_all_profiles(self, mock_get_all, mock_get_roles, mock_session):
        """Test that System Manager sees all active POS Profiles"""
        mock_session.user = 'admin@example.com'
        mock_get_roles.return_value = ['System Manager']
        
        # Mock all active profiles
        mock_profiles = [
            {'name': 'Profile-A', 'imogi_branch': 'Branch A', 'company': 'Test Co'},
            {'name': 'Profile-B', 'imogi_branch': 'Branch B', 'company': 'Test Co'},
            {'name': 'Profile-C', 'imogi_branch': 'Branch C', 'company': 'Test Co'}
        ]
        mock_get_all.return_value = mock_profiles
        
        result = resolve_pos_profile_for_user(user='admin@example.com')
        
        self.assertTrue(result['is_privileged'])
        self.assertTrue(result['has_access'])
        self.assertEqual(len(result['available_profiles']), 3)
    
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('frappe.get_all')
    def test_regular_user_only_assigned_profiles(self, mock_get_all, mock_get_roles, mock_session):
        """Test that regular user only sees profiles in 'Applicable for Users' table"""
        mock_session.user = self.test_user
        mock_get_roles.return_value = ['Cashier']
        
        # First call: Get profile names from POS Profile User table
        # Second call: Get full profile data
        mock_get_all.side_effect = [
            # Profile names for user
            ['Profile-A'],
            # Full profile data
            [{'name': 'Profile-A', 'imogi_branch': 'Branch A', 'company': 'Test Co'}]
        ]
        
        result = resolve_pos_profile_for_user(user=self.test_user)
        
        self.assertFalse(result['is_privileged'])
        self.assertTrue(result['has_access'])
        self.assertEqual(len(result['available_profiles']), 1)
        self.assertEqual(result['available_profiles'][0]['name'], 'Profile-A')
    
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('frappe.get_all')
    def test_user_no_profiles_assigned(self, mock_get_all, mock_get_roles, mock_session):
        """Test user with no POS Profiles assigned"""
        mock_session.user = self.test_user
        mock_get_roles.return_value = ['Cashier']
        
        # User not in any POS Profile User table
        mock_get_all.return_value = []
        
        result = resolve_pos_profile_for_user(user=self.test_user)
        
        self.assertFalse(result['has_access'])
        self.assertIsNone(result['pos_profile'])
        self.assertEqual(result['selection_method'], 'none_no_access')
        self.assertEqual(len(result['available_profiles']), 0)
    
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('frappe.get_all')
    @patch('frappe.db.has_column')
    @patch('frappe.db.get_value')
    def test_auto_select_single_profile(self, mock_get_value, mock_has_column, 
                                       mock_get_all, mock_get_roles, mock_session):
        """Test auto-selection when user has only one profile"""
        mock_session.user = self.test_user
        mock_get_roles.return_value = ['Cashier']
        mock_has_column.return_value = True
        mock_get_value.return_value = None  # No default set
        
        # User has exactly one profile
        mock_get_all.side_effect = [
            ['Profile-A'],
            [{'name': 'Profile-A', 'imogi_branch': 'Branch A', 'company': 'Test Co'}]
        ]
        
        result = resolve_pos_profile_for_user(user=self.test_user)
        
        self.assertTrue(result['has_access'])
        self.assertEqual(result['pos_profile'], 'Profile-A')
        self.assertEqual(result['selection_method'], 'auto_single')
        self.assertFalse(result['needs_selection'])
    
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('frappe.get_all')
    @patch('frappe.db.has_column')
    @patch('frappe.db.get_value')
    def test_multiple_profiles_need_selection(self, mock_get_value, mock_has_column,
                                              mock_get_all, mock_get_roles, mock_session):
        """Test that multiple profiles require user selection"""
        mock_session.user = self.test_user
        mock_get_roles.return_value = ['Cashier']
        mock_has_column.return_value = True
        mock_get_value.return_value = None  # No default set
        
        # User has multiple profiles
        mock_get_all.side_effect = [
            ['Profile-A', 'Profile-B'],
            [
                {'name': 'Profile-A', 'imogi_branch': 'Branch A', 'company': 'Test Co'},
                {'name': 'Profile-B', 'imogi_branch': 'Branch B', 'company': 'Test Co'}
            ]
        ]
        
        result = resolve_pos_profile_for_user(user=self.test_user)
        
        self.assertTrue(result['has_access'])
        self.assertIsNone(result['pos_profile'])
        self.assertTrue(result['needs_selection'])
        self.assertEqual(result['selection_method'], 'none_requires_selection')
        self.assertEqual(len(result['available_profiles']), 2)
    
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('frappe.get_all')
    @patch('frappe.db.has_column')
    @patch('frappe.db.get_value')
    def test_user_default_persistent_priority(self, mock_get_value, mock_has_column,
                                              mock_get_all, mock_get_roles, mock_session):
        """Test that User.imogi_default_pos_profile has priority"""
        mock_session.user = self.test_user
        mock_get_roles.return_value = ['Cashier']
        mock_has_column.return_value = True
        
        # User has multiple profiles but default is set
        mock_get_all.side_effect = [
            ['Profile-A', 'Profile-B'],
            [
                {'name': 'Profile-A', 'imogi_branch': 'Branch A', 'company': 'Test Co'},
                {'name': 'Profile-B', 'imogi_branch': 'Branch B', 'company': 'Test Co'}
            ]
        ]
        
        # Mock User.imogi_default_pos_profile set to Profile-B
        # First call is for User field, subsequent for profile validation
        mock_get_value.side_effect = ['Profile-B', False]  # Profile B, not disabled
        
        result = resolve_pos_profile_for_user(user=self.test_user)
        
        self.assertTrue(result['has_access'])
        self.assertEqual(result['pos_profile'], 'Profile-B')
        self.assertEqual(result['selection_method'], 'user_default_persistent')
        self.assertFalse(result['needs_selection'])
    
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('frappe.get_all')
    def test_context_last_used_priority(self, mock_get_all, mock_get_roles, mock_session):
        """Test that context.last_used has highest priority"""
        mock_session.user = self.test_user
        mock_get_roles.return_value = ['Cashier']
        
        # User has multiple profiles
        mock_get_all.side_effect = [
            ['Profile-A', 'Profile-B', 'Profile-C'],
            [
                {'name': 'Profile-A', 'imogi_branch': 'Branch A', 'company': 'Test Co'},
                {'name': 'Profile-B', 'imogi_branch': 'Branch B', 'company': 'Test Co'},
                {'name': 'Profile-C', 'imogi_branch': 'Branch C', 'company': 'Test Co'}
            ]
        ]
        
        with patch('imogi_pos.utils.pos_profile_resolver._is_profile_active', return_value=True):
            result = resolve_pos_profile_for_user(
                user=self.test_user, 
                context={'last_used': 'Profile-C'}
            )
        
        self.assertTrue(result['has_access'])
        self.assertEqual(result['pos_profile'], 'Profile-C')
        self.assertEqual(result['selection_method'], 'context_last_used')
    
    @patch('frappe.db.exists')
    @patch('frappe.db.get_value')
    @patch('frappe.get_roles')
    def test_validate_access_system_manager(self, mock_get_roles, mock_get_value, mock_exists):
        """Test that System Manager has access to all profiles"""
        mock_get_roles.return_value = ['System Manager']
        mock_exists.return_value = True
        mock_get_value.return_value = 0  # Not disabled
        
        has_access = validate_pos_profile_access('Any-Profile', user='admin@example.com')
        
        self.assertTrue(has_access)
    
    @patch('frappe.db.exists')
    @patch('frappe.db.get_value')
    @patch('frappe.get_roles')
    def test_validate_access_regular_user_in_table(self, mock_get_roles, mock_get_value, mock_exists):
        """Test that regular user has access if in 'Applicable for Users' table"""
        mock_get_roles.return_value = ['Cashier']
        
        # First exists() checks POS Profile, second checks POS Profile User
        mock_exists.side_effect = [True, True]
        mock_get_value.return_value = 0  # Not disabled
        
        has_access = validate_pos_profile_access('Profile-A', user=self.test_user)
        
        self.assertTrue(has_access)
    
    @patch('frappe.db.exists')
    @patch('frappe.db.get_value')
    @patch('frappe.get_roles')
    def test_validate_access_regular_user_not_in_table(self, mock_get_roles, mock_get_value, mock_exists):
        """Test that regular user has no access if not in 'Applicable for Users' table"""
        mock_get_roles.return_value = ['Cashier']
        
        # First exists() checks POS Profile (True), second checks POS Profile User (False)
        mock_exists.side_effect = [True, False]
        mock_get_value.return_value = 0  # Not disabled
        
        has_access = validate_pos_profile_access('Profile-A', user=self.test_user)
        
        self.assertFalse(has_access)
    
    @patch('frappe.db.get_value')
    def test_get_pos_profile_branch(self, mock_get_value):
        """Test getting branch from POS Profile"""
        mock_get_value.return_value = 'Test Branch'
        
        branch = get_pos_profile_branch('Test-Profile')
        
        self.assertEqual(branch, 'Test Branch')
        mock_get_value.assert_called_once_with('POS Profile', 'Test-Profile', 'imogi_branch')
    
    def test_get_pos_profile_branch_none(self):
        """Test getting branch when profile is None"""
        branch = get_pos_profile_branch(None)
        self.assertIsNone(branch)
    
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('frappe.get_all')
    def test_disabled_profile_filtered_out(self, mock_get_all, mock_get_roles, mock_session):
        """Test that disabled profiles are automatically filtered"""
        mock_session.user = self.test_user
        mock_get_roles.return_value = ['Cashier']
        
        # Return only active profiles (disabled = 0 filter)
        mock_get_all.side_effect = [
            ['Profile-A', 'Profile-B'],
            [{'name': 'Profile-A', 'imogi_branch': 'Branch A', 'company': 'Test Co'}]
            # Profile-B is disabled, not returned
        ]
        
        result = resolve_pos_profile_for_user(user=self.test_user)
        
        # Only active profile returned
        self.assertEqual(len(result['available_profiles']), 1)
        self.assertEqual(result['available_profiles'][0]['name'], 'Profile-A')


def run_tests():
    """Run test suite"""
    suite = unittest.TestLoader().loadTestsFromTestCase(TestPOSProfileResolver)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return result.wasSuccessful()


if __name__ == '__main__':
    run_tests()
