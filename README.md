# LeftGlove

**Make any website usable by AI agents.**

Point an LLM at a web page and it sees 10,000 DOM nodes — nested divs,
ARIA wrappers, SVG icons, tracking pixels. It burns tokens parsing noise,
hallucinates selectors, and clicks the wrong thing. LeftGlove fixes this.

LeftGlove is an [MCP server](https://modelcontextprotocol.io) that gives
your agent a **structured, validated view of any web page** — only the
elements that matter, with stable locators and human-readable labels.
90% of the DOM noise disappears. What's left is a clean inventory your
agent can actually act on.

```
Agent: "What can I do on this page?"

LeftGlove (observe tool):
  clickable:
    - "Search" button          [data-testid=search-btn]
    - "Add to Cart"            [data-testid=add-cart]
    - "Next Page" link         [data-testid=pagination-next]
  typable:
    - "Search products" input  [data-testid=search-input]
    - "Zip code" input         [data-testid=zip-field]
  readable:
    - "$29.99"                 [data-testid=price]
    - "In Stock"               [data-testid=availability]
```

No more guessing. No more `document.querySelector` roulette.

## How It Works

**Sieve** — A deterministic function injected into the browser page. It
walks the DOM, filters structural noise, and returns a typed inventory of
every interactive and readable element with its locator, label, bounding
box, and element type. Zero LLM calls, zero tokens, pure static analysis.

**Toddler Loop** — A web UI where a human reviews what the sieve found
and classifies elements: what matters, what's chrome, what to skip. The
output is a glossary that maps intent to concrete page elements. Optional
auto-classify via Claude Haiku for bulk labeling.

**MCP Server** — Exposes the sieve and glossary as tools over the
[Model Context Protocol](https://modelcontextprotocol.io). Any MCP
client — Claude Desktop, Claude Code, OpenClaw, your own agent — calls
`observe` and gets back structured page state instead of raw HTML.

## Quick Start

### Docker (recommended)

```bash
docker run -p 8080:8080 ghcr.io/stephenchilcote-gauntlet/leftglove
```

### Claude Desktop / Claude Code

Add to your MCP config:

```json
{
  "mcpServers": {
    "leftglove": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/stephenchilcote-gauntlet/leftglove"]
    }
  }
}
```

### From source

```bash
git clone https://github.com/stephenchilcote-gauntlet/leftglove.git
cd leftglove

# Install dependencies
(cd leftglove/mcp-server && npm install && npm run build)
(cd leftglove/toddler && npm install)
(cd leftglove/demo-app && npm install)

# Start all services (demo app :3000, toddler UI :8080, sieve :3333)
bin/demo-run
```

## MCP Tools

| Tool | Description |
|---|---|
| `observe` | Run the sieve on the current page. Returns a structured inventory of interactive elements — clickable, typable, readable — with locators and labels. |
| `list_vocabulary` | List the glossary: intent regions, their elements, applicable verbs (click/fill/see), and testid locators. |
| `refresh_vocabulary` | Reload glossary files from disk after edits. |

## Why Not Just Feed the HTML to the LLM?

| | Raw HTML | LeftGlove |
|---|---|---|
| **Tokens** | 50k-200k per page | 500-2k |
| **Accuracy** | LLM guesses selectors | Validated locators |
| **Cost** | $0.10-0.50 per page view | ~$0.005 |
| **Reliability** | Hallucinated clicks | Deterministic inventory |

## Repository Layout

| Path | What |
|---|---|
| `leftglove/mcp-server/` | TypeScript MCP server (stdio transport) |
| `leftglove/toddler/` | Toddler loop UI — Node.js web app for human classification |
| `leftglove/demo-app/` | Demo web app for testing and development |
| `bin/` | `demo-run` — starts all services; `demo-test` — runs e2e tests |

## Tech Stack

- **MCP Server:** TypeScript, `@modelcontextprotocol/sdk`, Zod
- **Sieve:** Vanilla JavaScript, runs in-browser via Playwright
- **Toddler UI:** Node.js, vanilla JS/HTML/CSS
- **Testing:** Playwright, fast-check (property-based testing)

## Status

Pre-release. The sieve, toddler loop, and MCP server work end-to-end.
We're actively building toward a packaged release.

## License

[MIT](LICENSE)
