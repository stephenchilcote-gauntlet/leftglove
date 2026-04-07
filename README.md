# LeftGlove

MCP server and human interface for [ShiftLefter](https://github.com/ShiftLefter) —
agent-driven exploration, cataloging, and testing of web applications.

LeftGlove provides the perception and labeling layer: a deterministic sieve
inventories web pages, a toddler loop lets humans classify what the sieve
finds, and an MCP server projects the resulting vocabulary as tools that
agents can use to interact with applications through validated references.

## What's in the Repo

| Path | What |
|---|---|
| `leftglove/demo-app/` | [Target web app](leftglove/demo-app/README.md) for sieve testing and demos |
| `leftglove/toddler/` | Toddler loop UI — human classification interface (includes sieve metadata display: cookies, storage, tabs) |
| `ARCHITECTURE.md` | System design, data model, integration points |
| `VISION.md` | Project vision and design philosophy |
| `CONTEXT.md` | Project constraints and roles |
| `notes/` | Design docs, sprint planning, demo script |

## Status

Pre-MVP. See `notes/sprint-order.md` for the current execution plan.
