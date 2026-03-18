# LeftGlove

MCP server wrapping ShiftLefter — agent and human interface for exploration, cataloging, and testing web applications.

## Role Assignment

Your first message from Chair will be your role name.

- **TOWER** → Read `prompts/tower.md` for your full instructions.
- **SCOUT** → Read `prompts/tower.md` — Scout triggers Tower in cold-start mode (new project, no existing architecture).
- **TRENCH** → Read `prompts/trench.md`. Chair provides your task.
- **HERALD** → Read `prompts/herald.md` for your full instructions.
- **WARDEN** → Read `prompts/warden.md`. Audits before merge/release.

Read `CONTEXT.md` for constraints. Read `ARCHITECTURE.md` for system design.
Read `beads-agent-guide.md` for br commands.

## Commands

```bash
# Build/run (TBD — deps.edn not yet created)
clj -M:dev          # Start dev REPL
clj -M:test         # Run tests

# Beads
br list             # All issues
br ready --json     # Your next task
br graph --compact  # Dependency graph
```

## Conventions

- **Commits:** Imperative mood, include issue ID: `Add feature (lg-a1b2)`
- **Branches:** `task/{id}-{slug}` (e.g., `task/abc1-timer-widget`)
- **Markdown formatting:** Always leave a blank line between a heading (or bold line)
  and the first list item, table, or code block below it.

## Key Concepts

- **The Sieve** — deterministic JS function for DOM inventory. Zero tokens. See `ARCHITECTURE.md`.
- **The Bridge** — LG↔SL integration layer. Same JVM, direct function calls.
- **SVOI** — Subject/Verb/Object/Interface. SL's grammar. LG produces raw material for it.
- **Toddler Loop** — observe → guess → ask human → record → graduate to SL artifact.

## Pointers

- Read `ARCHITECTURE.md` for system design.
- Read `LEFT-GLOVE-VISION.md` for motivation and philosophy.
- Read `ARCHITECTURE-CONVERSATION.md` for decision rationale.
- Run `br ready --json` for your task.
- See `beads-agent-guide.md` for br commands.
