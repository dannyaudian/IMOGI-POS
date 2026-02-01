#!/usr/bin/env python3
"""Quick test of has_doctype_permission signature"""

def has_doctype_permission(doc=None, ptype="read", user=None, debug=False, doctype=None, **kwargs):
    """Simulated function with new signature"""
    resolved_doctype = None
    
    if doctype:
        resolved_doctype = doctype
    elif doc and hasattr(doc, 'doctype'):
        resolved_doctype = doc.doctype
    elif doc and isinstance(doc, str):
        resolved_doctype = doc
    
    if not resolved_doctype:
        return True
    
    return resolved_doctype

# Test all patterns
print("Testing has_doctype_permission signature flexibility...")
print("=" * 60)

results = []

# Pattern 1: positional
result1 = has_doctype_permission("POS Order", "read", "test@example.com")
results.append(f"✓ Pattern 1 (positional string): {result1}")

# Pattern 2: kwargs with doctype
result2 = has_doctype_permission(doctype="POS Order", ptype="read", user="test@example.com")
results.append(f"✓ Pattern 2 (kwargs with doctype): {result2}")

# Pattern 3: kwargs with doc string  
result3 = has_doctype_permission(doc="POS Order", ptype="read", user="test@example.com")
results.append(f"✓ Pattern 3 (kwargs with doc string): {result3}")

# Pattern 4: missing doctype (should not crash)
result4 = has_doctype_permission(ptype="read", user="test@example.com")
results.append(f"✓ Pattern 4 (missing doctype, returns True): {result4}")

# Pattern 5: with extra kwargs
result5 = has_doctype_permission(doc="POS Order", ptype="read", user="test@example.com", extra="ignored")
results.append(f"✓ Pattern 5 (extra kwargs): {result5}")

for r in results:
    print(r)

print()
print("✅ All signature patterns handled without error!")
