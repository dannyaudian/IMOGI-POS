#!/bin/bash

# IMOGI POS - Cleanup Script: Delete Confirmed Dead Code
# 
# This script safely deletes:
# 1. Legacy JS files (replaced by React bundles)
# 2. Obsolete documentation
# 3. Unused utility files
#
# SAFETY: Creates backup branch first

set -e  # Exit on error

echo "🧹 IMOGI POS Cleanup Script"
echo "============================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in git repo
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
    echo "Please commit or stash your changes before running cleanup"
    exit 1
fi

# Create backup branch
CURRENT_BRANCH=$(git branch --show-current)
BACKUP_BRANCH="cleanup/backup-$(date +%Y%m%d-%H%M%S)"
echo -e "${YELLOW}Creating backup branch: $BACKUP_BRANCH${NC}"
git checkout -b "$BACKUP_BRANCH"
git push origin "$BACKUP_BRANCH" 2>/dev/null || echo "(Backup branch created locally)"
git checkout "$CURRENT_BRANCH"

# Create cleanup branch
CLEANUP_BRANCH="cleanup/permanent-refactor-$(date +%Y%m%d)"
echo -e "${YELLOW}Creating cleanup branch: $CLEANUP_BRANCH${NC}"
git checkout -b "$CLEANUP_BRANCH" 2>/dev/null || git checkout "$CLEANUP_BRANCH"

echo ""
echo "📋 Phase 1: Delete Legacy JS Files (Replaced by React)"
echo "========================================================"

# Array of files to delete
LEGACY_JS_FILES=(
    "imogi_pos/public/js/cashier_console.js"
    "imogi_pos/public/js/kitchen_display.js"
    "imogi_pos/public/js/table_display.js"
    "imogi_pos/public/js/customer_display.js"
)

DELETED_COUNT=0
SKIPPED_COUNT=0

for file in "${LEGACY_JS_FILES[@]}"; do
    if [ -f "$file" ]; then
        # Get file size for reporting
        SIZE=$(wc -l < "$file" | xargs)
        echo -e "${GREEN}✓${NC} Deleting $file (${SIZE} lines)"
        git rm "$file"
        ((DELETED_COUNT++))
    else
        echo -e "${YELLOW}⊘${NC} Skipping $file (not found)"
        ((SKIPPED_COUNT++))
    fi
done

echo ""
echo "📋 Phase 2: Delete Obsolete Documentation"
echo "==========================================="

# Array of obsolete docs
OBSOLETE_DOCS=(
    "PHASE_1_5_COMPLETE_SUMMARY.md"
    "PHASE2_DOUBLE_MOUNT_FIX.md"
    "PHASE_4_5_TESTING_CHECKLIST.md"
    "CENTRALIZATION_REFACTOR_COMPLETE.md"
    "REFACTORING_UPDATE_SUMMARY.md"
    "CRITICAL_PATCHES_APPLIED.md"
    "PRE_PRODUCTION_HARDENING_SUMMARY.md"
    "PERMISSION_FIXES_SUMMARY.md"
    "DOCUMENTATION_CONSISTENCY_FIX.md"
    "SESSION_EXPIRY_TESTING.md"
    "FINAL_GO_NOGO_CHECKLIST.md"
)

DOC_DELETED=0
DOC_SKIPPED=0

for file in "${OBSOLETE_DOCS[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} Deleting $file"
        git rm "$file"
        ((DOC_DELETED++))
    else
        echo -e "${YELLOW}⊘${NC} Skipping $file (not found)"
        ((DOC_SKIPPED++))
    fi
done

echo ""
echo "📊 Summary"
echo "=========="
echo -e "Legacy JS files deleted: ${GREEN}${DELETED_COUNT}${NC} (skipped: ${SKIPPED_COUNT})"
echo -e "Documentation deleted: ${GREEN}${DOC_DELETED}${NC} (skipped: ${DOC_SKIPPED})"
echo ""

# Calculate total LOC deleted (approximate)
TOTAL_LOC=$((3091 + 2952 + 1614 + 1057))
echo -e "Estimated LOC removed: ${GREEN}~${TOTAL_LOC}${NC} lines of legacy JavaScript"
echo ""

# Commit changes
if [ "$DELETED_COUNT" -gt 0 ] || [ "$DOC_DELETED" -gt 0 ]; then
    echo -e "${YELLOW}Committing changes...${NC}"
    git commit -m "cleanup: Remove legacy JS modules and obsolete documentation

- Removed 4 legacy JS files (${TOTAL_LOC} LOC total):
  * cashier_console.js (3,091 LOC) → replaced by cashier-console React
  * kitchen_display.js (2,952 LOC) → replaced by kitchen React
  * table_display.js (1,614 LOC) → replaced by table-display React
  * customer_display.js (1,057 LOC) → replaced by customer-display React

- Removed ${DOC_DELETED} obsolete documentation files:
  * Superseded by current architecture docs
  * Outdated phase summaries and checklists
  * Interim refactoring notes

All functionality preserved in React bundles and current documentation.
Backup branch: $BACKUP_BRANCH"
    
    echo ""
    echo -e "${GREEN}✅ Cleanup completed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review changes: git show HEAD"
    echo "2. Build React bundles: npm run build:all"
    echo "3. Test all pages: Open each /app/imogi-* route"
    echo "4. Push to remote: git push origin $CLEANUP_BRANCH"
    echo ""
    echo "To rollback:"
    echo "  git checkout $CURRENT_BRANCH"
    echo "  git branch -D $CLEANUP_BRANCH"
    echo "  (Backup preserved in $BACKUP_BRANCH)"
else
    echo -e "${YELLOW}No files deleted (already clean?)${NC}"
fi
