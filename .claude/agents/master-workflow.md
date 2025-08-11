---
name: master-workflow
description: Master orchestration workflow patterns and decision trees
tools:
  - mcp__sequential-thinking__sequentialthinking
---

# Master Orchestration Workflow

## Decision Tree for Request Routing

```
User Request
    |
    v
[Analyze Keywords]
    |
    ├─> Contains "social media", "post", "content"
    |   └─> Route to: sm-orchestrator
    |
    ├─> Contains "code", "implement", "fix", "refactor", "test"
    |   └─> Route to: cd-orchestrator
    |
    └─> Complex/Mixed Request
        └─> Use sequential thinking to plan multi-team coordination
```

## Workflow Patterns

### Pattern 1: Single Team Delegation
```
1. Identify team domain
2. Create comprehensive brief
3. Delegate to team orchestrator
4. Monitor progress via TodoWrite
```

### Pattern 2: Multi-Team Coordination
```
1. Break down into team-specific components
2. Identify dependencies
3. Execute in optimal sequence
4. Coordinate handoffs
```

### Pattern 3: Iterative Refinement
```
1. Initial delegation
2. Review output
3. If quality < threshold:
   - Provide feedback
   - Request iteration
4. Maximum 3 iterations
```

## Integration Points

- **TodoWrite**: Track all phases
- **Task**: Delegate to teams
- **Sequential Thinking**: Complex planning