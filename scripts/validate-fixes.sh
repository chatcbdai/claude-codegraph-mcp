#!/bin/bash

echo "🔍 CodeGraph Fix Validation Script"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILURES=0

# Test 1: Check embedding system
echo -e "\n${YELLOW}Test 1: Embedding System${NC}"
if npm test -- tests/embedding-fix-validation.test.ts 2>&1 | grep -q "PASS"; then
    echo -e "${GREEN}✓ Embedding system working${NC}"
else
    echo -e "${RED}✗ Embedding system failed${NC}"
    ((FAILURES++))
fi

# Test 2: Check tree-sitter
echo -e "\n${YELLOW}Test 2: Tree-Sitter Parser${NC}"
if npm test -- tests/treesitter-validation.test.ts 2>&1 | grep -q "PASS"; then
    echo -e "${GREEN}✓ Tree-sitter parsing working${NC}"
else
    echo -e "${RED}✗ Tree-sitter parsing failed${NC}"
    ((FAILURES++))
fi

# Test 3: Check for Float32Array errors
echo -e "\n${YELLOW}Test 3: Float32Array Errors${NC}"
if npm test 2>&1 | grep -q "Float32Array"; then
    echo -e "${RED}✗ Float32Array errors still present${NC}"
    ((FAILURES++))
else
    echo -e "${GREEN}✓ No Float32Array errors${NC}"
fi

# Test 4: Check memory usage
echo -e "\n${YELLOW}Test 4: Memory Usage${NC}"
node -e "
const before = process.memoryUsage().heapUsed;
// Run indexing
const after = process.memoryUsage().heapUsed;
const mb = (after - before) / 1024 / 1024;
console.log(\`Memory used: \${mb.toFixed(2)} MB\`);
if (mb > 500) process.exit(1);
" && echo -e "${GREEN}✓ Memory usage acceptable${NC}" || {
    echo -e "${RED}✗ Excessive memory usage${NC}"
    ((FAILURES++))
}

# Test 5: Check all tests pass
echo -e "\n${YELLOW}Test 5: Full Test Suite${NC}"
if npm test 2>&1 | grep -q "failed"; then
    echo -e "${RED}✗ Some tests failed${NC}"
    ((FAILURES++))
else
    echo -e "${GREEN}✓ All tests passing${NC}"
fi

# Test 6: Type checking
echo -e "\n${YELLOW}Test 6: TypeScript Types${NC}"
if npm run typecheck 2>&1 | grep -q "error"; then
    echo -e "${RED}✗ TypeScript errors${NC}"
    ((FAILURES++))
else
    echo -e "${GREEN}✓ No TypeScript errors${NC}"
fi

# Summary
echo -e "\n=================================="
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✅ ALL VALIDATIONS PASSED${NC}"
    echo "Safe to proceed with deployment"
else
    echo -e "${RED}❌ $FAILURES VALIDATIONS FAILED${NC}"
    echo "DO NOT DEPLOY - Fix issues first"
    exit 1
fi