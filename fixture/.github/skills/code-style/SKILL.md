---
name: code-style
description: Follow the project's code style. Use before committing Kotlin or Java changes.
allowed-tools: [Read, Grep]
---

# Code style

- Four spaces, no tabs; lines up to 120 characters.
- Prefer `val` over `var`.

## Names

| What      | How          |
|-----------|--------------|
| Classes   | `PascalCase` |
| Functions | `camelCase`  |

```kotlin
val answer = 42
```

> Format with the IDE before committing; see [the checklist](checklist.md).
