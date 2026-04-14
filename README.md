# LeftGlove

MCP server and human interface for [ShiftLefter](https://github.com/ShiftLefter) —
agent-driven exploration, cataloging, and testing of web applications.

AI agents struggle with web pages. A typical page has thousands of DOM
elements, most of which are structural noise. LeftGlove solves this with
three components:

1. **Sieve** — a deterministic function that runs in the browser, inventories
   every page element, and filters out ~90% of the noise. What remains is a
   structured list of interactive and readable elements with locators,
   labels, and positions.

2. **Toddler Loop** — a web UI where a human classifies the elements the
   sieve finds: what matters, what's chrome, what to skip. Two-pass
   workflow (quick scan, then detailed review) with optional auto-classify
   via Claude Haiku. The output is a glossary that maps human intent to
   concrete page elements.

3. **MCP Server** — exposes the sieve and glossary as tools that any MCP
   client (Claude, OpenClaw, etc.) can call. Agents see pages through
   validated references instead of raw HTML.

## MCP Tools

| Tool | Description |
|---|---|
| `observe` | Run the sieve on the current page. Returns a structured inventory of interactive elements. |
| `list_vocabulary` | List the glossary: intent regions, elements, applicable verbs, and testid locators. |
| `refresh_vocabulary` | Reload glossary files from disk after edits. |

## Repository Layout

| Path | What |
|---|---|
| `leftglove/mcp-server/` | TypeScript MCP server (stdio transport) |
| `leftglove/toddler/` | Toddler loop UI — Node.js web app for human classification |
| `leftglove/demo-app/` | Target web app for sieve testing and demos |
| `bin/` | `demo-run` — starts all services; `demo-test` — runs e2e tests |
| `ARCHITECTURE.md` | System design, data model, integration points |
| `VISION.md` | Project vision and design philosophy |
| `notes/` | Design docs, sprint planning, feature roadmap |

## Quick Start

```bash
# Prerequisites: Node.js, ShiftLefter repo adjacent (for sieve server)

# Install dependencies
(cd leftglove/mcp-server && npm install && npm run build)
(cd leftglove/toddler && npm install)
(cd leftglove/demo-app && npm install)

# Start all services (demo app :3000, toddler UI :8080, sieve :3333)
bin/demo-run

# Or start without the sieve server (if running it separately)
bin/demo-run --no-sieve
```

### Using the MCP server with an agent

The MCP server communicates over stdio. Point your MCP client at it:

```json
{
  "mcpServers": {
    "leftglove": {
      "command": "node",
      "args": ["leftglove/mcp-server/dist/index.js"]
    }
  }
}
```

## Tech Stack

- **MCP Server:** TypeScript, `@modelcontextprotocol/sdk`, Zod
- **Toddler UI:** Node.js, vanilla JS/HTML/CSS
- **Demo App:** Express, EJS, cookie-session
- **Testing:** Playwright (browser automation), fast-check (property testing)
- **Integration:** Reads ShiftLefter EDN glossary files; calls SL CLI for
  test execution

## Status

Pre-MVP. The sieve, toddler loop, and MCP server are functional. The glossary
pipeline works end-to-end: sieve a page, classify elements in the toddler UI,
export to ShiftLefter glossary, and use via MCP tools.