---
name: cd-workflow
description: Code Development team workflow patterns and quality gates
tools:
  - mcp__sequential-thinking__sequentialthinking
---

# Code Development Team Workflow

## Development Pipeline

```
Code Request
    |
    v
[Task Analysis]
    |
    ├─> New Feature
    |   └─> cd-test-generator → cd-code-generator → cd-code-reviewer
    |
    ├─> Bug Fix
    |   └─> cd-code-generator → cd-test-generator → cd-code-reviewer
    |
    ├─> Refactoring
    |   └─> cd-code-reviewer → cd-code-generator → cd-test-generator
    |
    └─> Documentation
        └─> cd-documentation-writer
```

## Quality Gates

```
Gate 1: Syntax Check
    └─> python -m py_compile

Gate 2: Type Checking
    └─> mypy --ignore-missing-imports

Gate 3: Code Style
    └─> black --line-length=100

Gate 4: Test Coverage
    └─> pytest --cov (target: 90%+)
```

## Feedback Loop

```
1. Generate code
2. Review with cd-code-reviewer
3. If score < 90:
   - Identify issues
   - Regenerate with fixes
4. Maximum 3 iterations
```

## Output Strategy

### Existing Codebase
- Direct file edits
- Follow existing patterns
- Maintain consistency

### New Projects
```
system_output_db/code_projects/[project_name]/
├── src/
├── tests/
├── docs/
└── requirements.txt
```