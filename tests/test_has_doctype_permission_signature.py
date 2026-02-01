"""
Test has_doctype_permission signature flexibility
Tests that the function handles various calling patterns from Frappe
"""
import frappe
from imogi_pos.utils.role_permissions import has_doctype_permission

def test_has_doctype_permission_signature():
    """Test that has_doctype_permission handles multiple argument patterns"""
    
    # Setup test user
    test_user = "test_cashier@example.com"
    
    # Pattern 1: Positional args (old style)
    result1 = has_doctype_permission("POS Order", "read", test_user)
    print(f"✓ Pattern 1 (positional string): {result1}")
    
    # Pattern 2: Keyword args with doctype
    result2 = has_doctype_permission(doctype="POS Order", ptype="read", user=test_user)
    print(f"✓ Pattern 2 (kwargs with doctype): {result2}")
    
    # Pattern 3: Keyword args with doc as string
    result3 = has_doctype_permission(doc="POS Order", ptype="read", user=test_user)
    print(f"✓ Pattern 3 (kwargs with doc string): {result3}")
    
    # Pattern 4: With doc instance (mock)
    class MockDoc:
        doctype = "POS Order"
        name = "TEST-001"
    
    mock_doc = MockDoc()
    result4 = has_doctype_permission(doc=mock_doc, ptype="read", user=test_user)
    print(f"✓ Pattern 4 (doc instance): {result4}")
    
    # Pattern 5: Mixed positional + kwargs (Frappe v15 style)
    result5 = has_doctype_permission(mock_doc, ptype="read", user=test_user)
    print(f"✓ Pattern 5 (mixed): {result5}")
    
    # Pattern 6: With extra kwargs (should not crash)
    result6 = has_doctype_permission(
        doc="POS Order", 
        ptype="read", 
        user=test_user,
        extra_param="ignored"
    )
    print(f"✓ Pattern 6 (extra kwargs): {result6}")
    
    # Pattern 7: Missing doctype (should not crash, return True)
    result7 = has_doctype_permission(ptype="read", user=test_user)
    print(f"✓ Pattern 7 (missing doctype, should allow): {result7}")
    
    print("\n✅ All signature patterns handled successfully!")
    
    # Verify results are consistent
    assert result1 == result2 == result3 == result4 == result5 == result6, \
        "Results should be consistent across all valid patterns"
    
    print("✅ Results are consistent across patterns")


def test_permission_logic():
    """Test that permission logic still works correctly"""
    
    # Test with Administrator (should always have access)
    result = has_doctype_permission(
        doctype="POS Order",
        ptype="delete",
        user="Administrator"
    )
    assert result == True, "Administrator should have all permissions"
    print("✓ Administrator has access")
    
    # Test with non-restricted doctype (should delegate to frappe.has_permission)
    result = has_doctype_permission(
        doctype="User",  # Not in DOCTYPE_RESTRICTIONS
        ptype="read",
        user="Administrator"
    )
    assert result == True
    print("✓ Non-restricted doctype delegated correctly")
    
    print("\n✅ Permission logic still works correctly!")


if __name__ == "__main__":
    # Run tests
    print("=" * 60)
    print("Testing has_doctype_permission signature flexibility")
    print("=" * 60)
    
    try:
        test_has_doctype_permission_signature()
        print()
        test_permission_logic()
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
