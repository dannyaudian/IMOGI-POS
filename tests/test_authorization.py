"""
Test cases untuk Authorization & Permission improvements

Run dengan: bench run-tests --app imogi_pos --module tests.test_authorization
"""

import frappe
import unittest
from unittest.mock import patch, MagicMock
from imogi_pos.utils.permissions import (
    has_privileged_access,
    validate_api_permission,
    validate_branch_access
)
from imogi_pos.utils.decorators import (
    require_permission,
    require_config_access,
    require_runtime_access
)


class TestPermissionChecks(unittest.TestCase):
    """Test permission checking utilities"""
    
    def setUp(self):
        """Setup test data"""
        self.test_user = "test_cashier@example.com"
        self.test_branch = "Test Branch"
        
    @patch('frappe.session')
    @patch('frappe.get_roles')
    def test_has_privileged_access_administrator(self, mock_get_roles, mock_session):
        """Test Administrator has privileged access"""
        mock_session.user = "Administrator"
        
        result = has_privileged_access()
        
        self.assertTrue(result)
        
    @patch('frappe.session')
    @patch('frappe.get_roles')
    def test_has_privileged_access_system_manager(self, mock_get_roles, mock_session):
        """Test System Manager has privileged access"""
        mock_session.user = "test@example.com"
        mock_get_roles.return_value = ["System Manager", "Sales User"]
        
        result = has_privileged_access()
        
        self.assertTrue(result)
        
    @patch('frappe.session')
    @patch('frappe.get_roles')
    def test_has_privileged_access_regular_user(self, mock_get_roles, mock_session):
        """Test regular user does not have privileged access"""
        mock_session.user = "cashier@example.com"
        mock_get_roles.return_value = ["Cashier", "Sales User"]
        
        result = has_privileged_access()
        
        self.assertFalse(result)
        
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('frappe.has_permission')
    def test_validate_api_permission_with_permission(self, mock_has_perm, mock_get_roles, mock_session):
        """Test validate_api_permission when user has permission"""
        mock_session.user = "cashier@example.com"
        mock_get_roles.return_value = ["Cashier"]
        mock_has_perm.return_value = True
        
        result = validate_api_permission("POS Order", perm_type="read", throw=False)
        
        self.assertTrue(result)
        mock_has_perm.assert_called_once()
        
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('frappe.has_permission')
    @patch('frappe.throw')
    def test_validate_api_permission_without_permission(self, mock_throw, mock_has_perm, mock_get_roles, mock_session):
        """Test validate_api_permission when user lacks permission"""
        mock_session.user = "cashier@example.com"
        mock_get_roles.return_value = ["Cashier"]
        mock_has_perm.return_value = False
        
        validate_api_permission("Sales Invoice", perm_type="delete", throw=True)
        
        # Should call frappe.throw with informative message
        mock_throw.assert_called_once()
        args = mock_throw.call_args[0]
        self.assertIn("Access Denied", args[0])
        self.assertIn("cashier@example.com", args[0])
        self.assertIn("Cashier", args[0])
        
    @patch('frappe.session')
    @patch('frappe.has_permission')
    def test_validate_branch_access_privileged(self, mock_has_perm, mock_session):
        """Test branch access for privileged user"""
        mock_session.user = "Administrator"
        
        result = validate_branch_access("Any Branch", throw=False)
        
        self.assertTrue(result)
        # Should not check permission for privileged users
        mock_has_perm.assert_not_called()
        
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('frappe.has_permission')
    def test_validate_branch_access_with_permission(self, mock_has_perm, mock_get_roles, mock_session):
        """Test branch access when user has permission"""
        mock_session.user = "cashier@example.com"
        mock_get_roles.return_value = ["Cashier"]
        mock_has_perm.return_value = True
        
        result = validate_branch_access("Test Branch", throw=False)
        
        self.assertTrue(result)
        mock_has_perm.assert_called_once_with("Branch", doc="Test Branch")
        
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('frappe.has_permission')
    @patch('frappe.throw')
    def test_validate_branch_access_without_permission(self, mock_throw, mock_has_perm, mock_get_roles, mock_session):
        """Test branch access when user lacks permission"""
        mock_session.user = "cashier@example.com"
        mock_get_roles.return_value = ["Cashier"]
        mock_has_perm.return_value = False
        
        validate_branch_access("Other Branch", throw=True)
        
        # Should call frappe.throw with informative message
        mock_throw.assert_called_once()
        args = mock_throw.call_args[0]
        self.assertIn("Access Denied", args[0])
        self.assertIn("Other Branch", args[0])
        self.assertIn("cashier@example.com", args[0])


class TestPermissionDecorators(unittest.TestCase):
    """Test permission decorator functionality"""
    
    @patch('frappe.session')
    @patch('imogi_pos.utils.decorators.has_privileged_access')
    def test_require_permission_decorator_privileged_user(self, mock_privileged, mock_session):
        """Test @require_permission decorator allows privileged users"""
        from imogi_pos.utils.decorators import require_permission
        
        mock_session.user = "Administrator"
        mock_privileged.return_value = True
        
        @require_permission("POS Order", "write")
        def test_function():
            return "success"
        
        result = test_function()
        
        self.assertEqual(result, "success")
        
    @patch('frappe.session')
    @patch('imogi_pos.utils.decorators.has_privileged_access')
    @patch('imogi_pos.utils.decorators.validate_api_permission')
    def test_require_permission_decorator_regular_user(self, mock_validate, mock_privileged, mock_session):
        """Test @require_permission decorator checks permission for regular users"""
        from imogi_pos.utils.decorators import require_permission
        
        mock_session.user = "cashier@example.com"
        mock_privileged.return_value = False
        mock_validate.return_value = True
        
        @require_permission("POS Order", "read")
        def test_function():
            return "success"
        
        result = test_function()
        
        self.assertEqual(result, "success")
        mock_validate.assert_called_once_with("POS Order", perm_type="read", throw=True)
        
    @patch('frappe.session')
    @patch('frappe.get_roles')
    @patch('imogi_pos.utils.decorators.has_privileged_access')
    def test_require_role_decorator_with_role(self, mock_privileged, mock_get_roles, mock_session):
        """Test @require_role decorator allows users with required role"""
        from imogi_pos.utils.decorators import require_role
        
        mock_session.user = "cashier@example.com"
        mock_privileged.return_value = False
        mock_get_roles.return_value = ["Cashier", "Sales User"]
        
        @require_role("Cashier", "Branch Manager")
        def test_function():
            return "success"
        
        result = test_function()
        
        self.assertEqual(result, "success")


def run_tests():
    """Run all authorization tests"""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestPermissionChecks))
    suite.addTests(loader.loadTestsFromTestCase(TestPermissionDecorators))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == "__main__":
    run_tests()
