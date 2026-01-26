#!/bin/bash

# IMOGI POS - Branch Fix Quick Test
# Date: January 26, 2026
# 
# This script tests the branch API fix from command line
# Run: bash tests/test_branch_api.sh

echo "============================================================"
echo "IMOGI POS - Branch API Test (January 26, 2026)"
echo "============================================================"
echo ""

# Check if jq is available for pretty JSON
if command -v jq &> /dev/null; then
    JSON_TOOL="jq ."
else
    JSON_TOOL="python3 -m json.tool"
fi

echo "🔍 Test 1: Branch API (get_user_branch_info)"
echo "Expected: 200 OK with current_branch and available_branches"
echo ""

# Test the main branch API
curl -s \
  -H "Accept: application/json" \
  --cookie-jar /tmp/frappe_cookies.txt \
  --cookie /tmp/frappe_cookies.txt \
  "http://localhost:8000/api/method/imogi_pos.api.module_select.get_user_branch_info" \
  | $JSON_TOOL

echo ""
echo "============================================================"
echo "🔍 Test 2: Module Select API"
echo "Expected: 200 OK with list of available modules"
echo ""

curl -s \
  -H "Accept: application/json" \
  --cookie /tmp/frappe_cookies.txt \
  "http://localhost:8000/api/method/imogi_pos.api.module_select.get_available_modules" \
  | $JSON_TOOL

echo ""
echo "============================================================"
echo "✅ Test complete!"
echo ""
echo "Expected results:"
echo "  - Status 200 (not 400, 403, or 417)"
echo "  - Branch API returns current_branch + available_branches"
echo "  - Module API returns list of modules"
echo ""
echo "If you see 417 errors: Branch query still using invalid fields"
echo "If you see 401/403: Not logged in or session expired"
echo "If you see 400: CSRF or request format issue"
echo ""
echo "NOTE: This test requires active login session."
echo "For better testing, use browser console: verifyBranchFix()"
echo "============================================================"
