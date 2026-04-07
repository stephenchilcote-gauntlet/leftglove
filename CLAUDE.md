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
# TODO: Scout/Tower fills in project commands during cold-start
```

## Conventions

- **Commits:** Imperative mood, include issue ID: `Add feature (lg-a1b2)`
- **Branches:** `task/{id}-{slug}` (e.g., `task/abc1-timer-widget`)
- **Markdown formatting:** Always leave a blank line between a heading (or bold line)
  and the first list item, table, or code block below it.

## Pointers

- Read `ARCHITECTURE.md` for system design.
- Run `br ready --json` for your task.
- See `beads-agent-guide.md` for br commands.
