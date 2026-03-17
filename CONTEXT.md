# LeftGlove — Project Context

## Situation

- MCP server wrapping ShiftLefter — agent and human interface for exploration, cataloging, and testing web applications
- <!-- TODO: Add timeline, stage, goals -->

## Constraints

- **Solo + agents.** One person coordinating multiple Claude Code instances.
- **Cost-aware.** Agent sessions should be purposeful, not exploratory sprawl.
- <!-- TODO: Add project-specific constraints -->

## Roles

- **Chair** — the human. Coordinates agents, merges branches, makes final calls.
- **Tower** — planning/architecture agent. Reads requirements, designs stack, produces plans and interface code. See prompts/tower.md.
- **Trench** — coding agent(s). Receives a task, writes code on a feature branch. Multiple can run in parallel. See prompts/trench.md.
- **Herald** — communications agent. Writing, messaging, brand voice, content creation. See prompts/herald.md.
- **Warden** — quality defense agent. Audits changes, hunts risk, enforces readiness before merges/releases. See prompts/warden.md.

## Defaults

- **Always monorepo.** One repo, one issue database, one CLAUDE.md.
- **Git init is Chair's job.** Repo is initialized before Tower/Scout starts.
- **Chair may be voice-transcribing.** Expect conversational style with filler words.
  Parse for intent, not exact phrasing.
- **Issue tracking: beads (`br`).** Tower creates issues, Trench claims and closes.
  See `beads-agent-guide.md` for full command reference.
- **Chair merges** — agents commit to task branches, Chair spot-checks and merges.

## Workflow

- **Issue tracking** via beads (br) for work breakdown and status
- **CLAUDE.md per project** so agents have shared context
- **Frequent integration** — short-lived branches, merge to main often
- **Chair merges** — agents commit to task branches, Chair spot-checks and merges
