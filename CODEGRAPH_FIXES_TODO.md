# CodeGraph Fixes - Remaining Tasks Documentation

## 🚨 CRITICAL RULES & PROTOCOLS TO FOLLOW

### Testing Protocol (MANDATORY)
1. **NEVER** move to the next fix without fully testing the current one
2. **ALWAYS** create a test file in `/tests/` directory
3. **ALWAYS** run `npm run build` before testing
4. **ALWAYS** run the specific test and ensure it passes
5. **NEVER** mark a task complete if tests are failing
6. Test file naming: `{feature-name}.test.ts`

### Development Protocol
1. **ALWAYS** use Sequential Thinking tool for ANY and ALL tasks
2. **ALWAYS** conduct web research for obstacles (include current month/year)
3. **ALWAYS** use Playwright for developer documentation and GitHub repos
4. **ALWAYS** check for existing files before creating new ones
5. **NEVER** create summary .md files unless explicitly requested
6. **ALWAYS** create a todo list using TodoWrite tool before taking action
7. **ALWAYS** use the most concise solution that changes minimal code

### Git Protocol
1. Test thoroughly before committing
2. Use descriptive commit messages

---

## 📋 COMPLETED FIXES (1-8)

### ✅ Fixed (Fully Tested & Working)
1. **Text File Detection** - Added .txt, .md, .json, .yaml, .yml, .xml, .csv support
2. **Python Type Aliases** - Detects `Name = Type` patterns
3. **Python @overload** - Detects overloaded method decorators
4. **Python Protocol Classes** - Detects Protocol classes and marks them
5. **Python Constants/TypeVars** - Detects CONSTANT_NAME and TypeVar definitions

### ⚠️ Partially Fixed (Needs Refinement)

#### 6-8. Relationship Tracking (IMPORTS, CALLS, INHERITS_FROM)
**Status**: Core implementation complete but has issues
**Problems Found**:
1. **Foreign Key Constraint Errors** - Relationships created before nodes exist
2. **Import Resolution** - Not finding all relative imports correctly
3. **Function Call Resolution** - Not properly linking calls to definitions

**Root Cause**: The `analyzeRelationships` method tries to create relationships to nodes that may not exist yet because:
- Import resolution happens before all files are parsed
- Function resolution doesn't check if target exists before creating relationship
- No validation that both nodes exist before creating relationship

**Fix Required**:
```typescript
// In analyzeRelationships method, before creating any relationship:
1. Check if target node exists in database
2. If not, either:
   a. Create placeholder node, OR
   b. Skip the relationship, OR
   c. Queue it for later processing
3. Add try-catch around relationship creation to handle foreign key errors gracefully
```

---

## 🔧 REMAINING FIXES (9-13)

### Fix #9: Trace Execution
**Issue**: Returns "No Execution Paths Found" for all queries
**Root Cause**: CALLS relationships aren't being properly created/queried
**Current State**: The query looks for CALLS, IMPORTS, EXTENDS, IMPLEMENTS but finds none

#### Implementation Plan:
1. **Fix the CALLS relationship creation first**:
   ```typescript
   // In parser-enhanced.ts - improve function call extraction
   - Track which function each call is made from
   - Store function body bounds (startLine, endLine)
   - Only track calls within function boundaries
   ```

2. **Ensure nodes exist before relationships**:
   ```typescript
   // In indexer.ts - analyzeRelationships
   - First pass: Create all nodes
   - Second pass: Create relationships
   - Validate both nodes exist before addRelationship
   ```

3. **Fix the trace query**:
   ```typescript
   // In tools-implementation.ts - traceExecutionReal
   - Add fallback to check CONTAINS relationships
   - Improve node resolution for entry points
   - Add debugging to see what relationships actually exist
   ```

**Test Requirements**:
- Create test with known call chain (funcA -> funcB -> funcC)
- Verify trace finds the complete path
- Test with circular dependencies
- Test with missing intermediate nodes

---

### Fix #10: Impact Analysis
**Issue**: Shows only 1 dependent instead of 30+
**Root Cause**: IMPORTS relationships not being used for reverse dependency lookup
**Current State**: Only checking direct relationships, not reverse imports

#### Implementation Plan:
1. **Query reverse relationships**:
   ```typescript
   // In tools-implementation.ts - impactAnalysisReal
   SELECT DISTINCT from_node 
   FROM relationships 
   WHERE to_node = ? AND type = 'IMPORTS'
   ```

2. **Build transitive closure**:
   ```typescript
   // Find all files that import this file
   // Then find all files that import those files
   // Continue until no new dependencies found
   ```

3. **Include all relationship types**:
   - IMPORTS: Files importing this module
   - CALLS: Functions calling this function
   - INHERITS_FROM: Classes extending this class
   - CONTAINS: Parent containers affected

**Test Requirements**:
- Create multi-level import chain
- Verify all importers are found
- Test with circular imports
- Test with dynamic imports

---

### Fix #11: Implement True Semantic Search
**Issue**: Only uses SQL LIKE %query% substring matching
**Root Cause**: Not using embeddings for search
**Current State**: Embeddings are generated but not used in search

#### Implementation Plan:
1. **Store embeddings properly**:
   ```typescript
   // Verify embeddings are saved to database
   // Check embedding column exists and is populated
   ```

2. **Implement vector similarity search**:
   ```typescript
   // In findImplementationReal
   const queryEmbedding = await embeddings.embed(query);
   // Calculate cosine similarity with stored embeddings
   // Return results ordered by similarity score
   ```

3. **Hybrid approach**:
   ```typescript
   // Combine substring matching with semantic search
   // Weight exact matches higher
   // Include semantic matches above threshold
   ```

**Test Requirements**:
- Search for "bot detection" should find anti-bot code
- Search for "user authentication" should find login code
- Test with synonyms and related concepts
- Verify performance with large codebases

---

### Fix #12: Add Fuzzy Matching
**Issue**: "get random user agent" doesn't find "get_random_user_agent"
**Root Cause**: No fuzzy/flexible matching implemented
**Current State**: Exact substring match only

#### Implementation Plan:
1. **Tokenize search query**:
   ```typescript
   // Split "get random user agent" into ["get", "random", "user", "agent"]
   // Handle camelCase, snake_case, kebab-case
   ```

2. **Implement fuzzy scoring**:
   ```typescript
   function fuzzyMatch(query: string, target: string): number {
     // Tokenize both strings
     // Calculate edit distance
     // Check token overlap
     // Return similarity score 0-1
   }
   ```

3. **Integrate with search**:
   ```typescript
   // Add fuzzy matching as fallback
   // Order by: exact > fuzzy > semantic
   ```

**Test Requirements**:
- "getRandomUserAgent" matches "get_random_user_agent"
- "usr auth" matches "user_authentication"
- Test with typos and abbreviations
- Performance test with large datasets

---

### Fix #13: Git Worktree Detection
**Issue**: Worktrees counted as separate code, inflating metrics 6x
**Root Cause**: No detection or filtering of git worktrees
**Current State**: All directories treated equally

#### Implementation Plan:
1. **Detect worktrees**:
   ```typescript
   // In scanDirectory
   const worktrees = await git.raw(['worktree', 'list', '--porcelain']);
   const worktreePaths = parseWorktreePaths(worktrees);
   ```

2. **Filter during scanning**:
   ```typescript
   // Add to ignorePatterns or separate check
   if (isWorktree(fullPath, worktreePaths)) {
     return; // Skip this directory
   }
   ```

3. **Add configuration option**:
   ```typescript
   // Allow users to include/exclude worktrees
   interface IndexerConfig {
     excludeWorktrees: boolean; // default: true
   }
   ```

**Test Requirements**:
- Create repo with worktrees
- Verify only main repo is counted
- Test with nested worktrees
- Verify config option works

---

## 📝 DETAILED FOREIGN KEY FIX

### The Problem
When running `relationship-tracking.test.ts`, we get:
```
SqliteError: FOREIGN KEY constraint failed
```

### Why It Happens
1. `analyzeRelationships` creates relationships immediately
2. Target nodes might not exist yet (different file, not parsed)
3. SQLite enforces that both nodes must exist for a relationship

### Complete Solution

```typescript
// src/core/indexer.ts - Refactor analyzeRelationships

private async analyzeRelationships(file: ParsedFile): Promise<void> {
  // Phase 1: Create all nodes first
  await this.createAllNodes(file);
  
  // Phase 2: After ALL files processed, create relationships
  // This should be called from runGraphPhase after all files are parsed
}

private async createAllNodes(file: ParsedFile): Promise<void> {
  // Just create nodes, no relationships
  await this.graph.addNode({
    id: file.path,
    type: "file",
    // ... rest of node data
  });
  
  // Create function nodes
  for (const func of file.functions) {
    await this.graph.addNode({
      id: `${file.path}:${func.name}`,
      type: "function",
      // ... rest of node data
    });
  }
  
  // Similar for classes, type aliases, constants
}

private async createRelationships(): Promise<void> {
  // Called after ALL nodes exist
  for (const file of this.parsedFiles.values()) {
    // Now safe to create relationships
    await this.createFileRelationships(file);
  }
}

private async nodeExists(nodeId: string): Promise<boolean> {
  // Check if node exists in database
  try {
    const node = await this.graph.getNode(nodeId);
    return node !== null;
  } catch {
    return false;
  }
}

private async createFileRelationships(file: ParsedFile): Promise<void> {
  // Create CONTAINS relationships (always safe - both nodes exist)
  for (const func of file.functions) {
    await this.graph.addRelationship(
      file.path,
      `${file.path}:${func.name}`,
      "CONTAINS"
    );
  }
  
  // Create IMPORTS relationships (check target exists)
  for (const imp of file.imports) {
    const resolvedPath = await this.resolveImport(imp.source, file.path);
    if (resolvedPath && await this.nodeExists(resolvedPath)) {
      await this.graph.addRelationship(
        file.path,
        resolvedPath,
        "IMPORTS"
      );
    }
  }
  
  // Similar pattern for CALLS and INHERITS_FROM
}
```

---

## 🧪 TEST CREATION CHECKLIST

For each fix, create a test that:
1. Sets up minimal test environment
2. Tests the specific functionality
3. Tests edge cases
4. Tests error conditions
5. Cleans up after itself

Test template:
```typescript
describe('Feature Name', () => {
  beforeAll(async () => {
    // Setup test environment
  });
  
  afterAll(async () => {
    // Cleanup
  });
  
  test('should handle normal case', async () => {
    // Test expected behavior
  });
  
  test('should handle edge case', async () => {
    // Test boundaries
  });
  
  test('should handle errors gracefully', async () => {
    // Test error conditions
  });
});
```

---

## 🎯 NEXT CONVERSATION INSTRUCTIONS

1. Start by reading this file
2. Use TodoWrite to load remaining tasks
3. Begin with Fix #9 (but first fix the foreign key issue)
4. Follow the testing protocol strictly
5. Don't move to next task until current is fully working
6. Use Sequential Thinking for each task
7. Commit after each successful fix

### Order of Operations:
1. Fix foreign key constraint issue (refactor analyzeRelationships)
2. Test that relationship tracking works properly
3. Fix trace execution (Fix #9)
4. Fix impact analysis (Fix #10)
5. Implement semantic search (Fix #11)
6. Add fuzzy matching (Fix #12)
7. Add worktree filtering (Fix #13)
8. Run comprehensive integration tests
9. Final commit and push

---

## 📚 REFERENCES

- Original issue report: User's initial analysis identifying 7 problems
- Test files created: `text-file-detection.test.ts`, `python-type-alias.test.ts`, `relationship-tracking.test.ts`
- Modified files: `indexer.ts`, `parser-enhanced.ts`, `graph.ts`
- GitHub repo: https://github.com/chatcbdai/claude-codegraph-mcp.git

## ⚠️ IMPORTANT NOTES

1. The relationship tracking is "implemented" but not fully functional due to the foreign key issue
2. Import resolution is simplified and may not find all imports
3. Function call tracking needs scope awareness improvement
4. The embedding model initializes but search doesn't use it
5. Some tests are marked as "passing" but with expectations of ≥0 (not actual values)

**DO NOT** consider tasks 6-8 fully complete until the foreign key issue is resolved and tests pass with actual expected values, not just ≥0.

---

*Created: 2025-01-14*
*Last Updated: 2025-01-14*
*For: Future conversation to complete CodeGraph fixes*