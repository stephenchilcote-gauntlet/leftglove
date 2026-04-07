# LeftGlove — Architecture

**Status:** Pre-MVP, revised architecture (separate processes)
**Last updated:** 2026-04-03

---

## Stack

**Language-flexible.** LG is a separate process from ShiftLefter. The MCP
protocol is JSON-RPC over stdio — language-agnostic by design. The sieve JS
runs in the browser regardless. The toddler loop UI is web tech. LG can be
written in any language that can read files, spawn browsers, and speak
JSON-RPC.

**Preferred path (if Chair builds alone):** ClojureScript via shadow-cljs —
two compilation targets sharing code via `.cljc`:

- `:node-script` — MCP server over stdio, Playwright integration, file I/O
- `:browser` — Toddler loop UI with re-frame (Reagent + React)

**Alternative (if teammates build):** Any language. Node.js/TypeScript,
Python, Go, whatever the builder is fast in. The interfaces between LG and
SL are language-agnostic.

**The boundary between SL and LG is deliberately malleable.** For capstone,
they're separate processes because that unblocks the team. Post-capstone, LG
might become a plugin to SL (same JVM, direct calls, shared Asami) — or it
might stay separate. The architecture supports both because the interfaces
are clean: files, CLI, nREPL, or direct function calls are all viable, and
refactoring between them is mechanical.

This malleability is a feature, not indecision. It means other people can
write plugins, MCP servers, or UIs in different frameworks and languages.
The sieve JS runs in the browser regardless. The MCP protocol is JSON-RPC.
The glossary is EDN on disk. Nothing is locked to one integration model.

**Where things ideally land post-capstone:**

- **The sieve** belongs in ShiftLefter. It's deterministic infrastructure,
  not an LG concern. SL should ship default sieves with a plugin architecture
  for custom ones.
- **The MCP server** doesn't particularly care what it's written in. Nothing
  special about it yet — it reads vocabulary from SL and projects tools.
  Could be a thin SL plugin, could be standalone.
- **The toddler loop UI** ideally becomes a re-frame ClojureScript app.
  Chair's preferred stack, philosophically aligned (the project's loop model
  was derived from re-frame's 6 dominoes).
- **The graph** wants to be close to SL (shared Asami, same process).
  Strongest argument for eventual same-JVM integration.

### How LG Talks to SL

LG does not embed SL. LG communicates with SL via:

| Channel | What it provides | How |
|---|---|---|
| **File reads** | Glossary definitions, intent regions, config | Read SL's EDN files from disk |
| **CLI calls** | Test execution, glossary validation | Shell out to `sl run`, `sl validate` |
| **nREPL** | Programmatic access to SL's loaded state | Connect to SL's bundled nREPL (`.nrepl-port`) |
| **Future: `sl glossary export --json`** | Machine-readable glossary dump | Not built yet — small SL addition |

The invariant holds: **SL does not know LG exists.** Dependency flows one way.
SL exposes CLI commands and nREPL. It doesn't know or care who's calling them.

### Key Dependencies

- **Playwright** (or WebDriver) — Browser automation. Used directly by LG,
  not through SL. Playwright has bindings in Node.js, Python, Java, .NET, Go.
- **ShiftLefter** — Consumed via files + CLI + nREPL. Not embedded.
- **MCP protocol** — JSON-RPC over stdio. Hand-rolled or via library
  (metosin/mcp-toolkit for CLJS, or any MCP SDK for other languages).
- **Graph storage** — SQLite or flat files for capstone. Asami via SL's
  nREPL if needed. The graph store is a capstone-scoped decision, not a
  permanent architectural commitment.

**Transport:** stdio (MCP client spawns LG as subprocess). Streamable HTTP
is a future extension point for remote/cloud deployment.

---

## Directory Structure

Structure depends on language choice. For the CLJS path:

```
leftglove/
  shadow-cljs.edn            # Build config: :mcp-server + :ui targets
  package.json                # Node.js dependencies (Playwright, etc.)
  deps.edn                    # Clojure/CLJS dependencies
  src/
    shared/                   # .cljc files — compile to both targets
      leftglove/
        sieve/
          contract.cljc       # Sieve output parsing, element taxonomy
          diff.cljc           # Diff between sieve outputs, classification
        glossary.cljc         # Glossary generation from labeled elements
        taxonomy.cljc         # Element/behavioral vocabulary definitions
    server/                   # :node-script target
      leftglove/
        mcp/
          server.cljs         # MCP JSON-RPC over stdio
          tools.cljs          # Tool registry, dispatch
        bridge/
          files.cljs          # Read SL glossary/config files
          cli.cljs            # Shell out to sl run, sl validate
          nrepl.cljs          # nREPL client (optional)
        sieve/
          browser.cljs        # Playwright integration, inject sieve JS
          screenshot.cljs     # Screenshot capture
        main.cljs             # Entry point
    ui/                       # :browser target
      leftglove/
        app/
          core.cljs           # re-frame app init
          db.cljs             # app-db schema
          events.cljs         # Event handlers (classify, label, navigate)
          subs.cljs           # Subscriptions (current element, progress)
          views.cljs          # Hiccup components
          panels.cljs         # Bottom panel layout
          overlay.cljs        # SVG overlay on screenshot
  resources/
    sieve.js                  # The sieve JavaScript
    public/                   # Static assets for UI
  prompts/                    # Agent role prompts (existing)
  notes/                      # Design docs (existing)
```

For a non-CLJS path, the structure would follow that language's conventions.
The interfaces remain the same: sieve JS as a resource, MCP over stdio,
UI as a localhost web app.

---

## Data Model

### Sieve Output

> **Canonical source:** [notes/sieve-contract.md](notes/sieve-contract.md) for
> full taxonomy, example data, and observe() return shape.

The sieve is a deterministic JavaScript function executed in the browser.
It returns a structured inventory of the current page — elements classified
as clickable/typable/readable/chrome/custom, with labels, locators, state,
position, and region paths.

The sieve is a **filter**: it discards the ~90% of DOM nodes that are
structural noise and retains the ~10% that a human would notice or interact
with. See the sieve contract for the full taxonomy and example output.

### Toddler Loop Intermediate Format

> **Canonical source:** [notes/toddler-loop.md](notes/toddler-loop.md) for
> the full data pipeline and session lifecycle.

The intermediate format is the **source of truth** for labeled sieve output.
It carries both sieve data (deterministic) and human-added classifications
and labels. The SL glossary and the graph are derived views.

```
Raw sieve output → Toddler loop adds labels → Intermediate format
                                                    ↓            ↓
                                              SL glossary    Graph (eventually)
```

### Graph Nodes and Edges

Every observation and action persists. The graph schema is an open design
question (see VISION.md § "Triples Form a Graph — Shape TBD") and will
require multiple iteration passes.

**Observation node:**

```clojure
{:observation/id        ; UUID
 :observation/inventory ; Sieve output
 :observation/url       ; URL at time of observation
 :observation/subject   ; Which role/session produced this
 :observation/timestamp ; Instant
 :observation/diff      ; Summary of what changed from prior observation (if any)
 }
```

**Action edge:**

```clojure
{:action/id             ; UUID
 :action/type           ; :click | :enter-text | :follow-link | :navigate
 :action/target         ; Element locator or URL
 :action/params         ; Additional params (text entered, etc.)
 :action/from           ; Observation ID (before)
 :action/to             ; Observation ID (after)
 :action/classification ; :navigation | :reveal | :conceal | :state_mutation | :no_effect
 :action/subject        ; Which role/session
 :action/timestamp      ; Instant
 }
```

**Annotation:**

```clojure
{:annotation/id         ; UUID
 :annotation/target     ; Element locator or observation ID
 :annotation/label      ; Semantic label ("login-form", "nav-primary")
 :annotation/source     ; :human | :agent | :sieve
 :annotation/confidence ; 0.0-1.0 (agent/sieve guesses) or nil (human)
 :annotation/timestamp  ; Instant
 }
```

### Data Lifecycle States

```
raw → labeled → compiled → validated
```

- **Raw:** Sieve output, stored as observation. No interpretation.
- **Labeled:** Human or agent has classified and named elements (toddler loop).
- **Compiled:** Labels graduated to SL glossary entries / intent region definitions.
- **Validated:** Compiled artifacts validated by SL (`sl run --strict`).

LG operates in the raw→labeled space. Compilation is a glossary export.
Validation is SL's domain.

---

## Tool Surface

### Two Tool Sources

**1. LG-native tools** — capabilities that don't exist in SL:

| Tool | Purpose |
|------|---------|
| `observe` | Run the sieve, return structured page inventory |
| `query_graph` | Query over accumulated observations |
| `annotate` | Write semantic label to an element or observation |

These are static — always available, defined in LG code.

**2. SVOI-derived tools** — projected from SL's vocabulary:

LG reads SL's glossary files (subjects, verbs, interfaces, intent regions)
and projects them as dynamic MCP tools. The agent sees available subjects,
verbs per interface, objects per intent region.

> **See VISION.md** § "Vocabulary projection in practice" for a concrete
> example of how glossary data becomes MCP tools.

These are dynamic — they reflect whatever glossaries and intent regions are
loaded from SL's project files.

### SVOI Execution Path

**MVP approach:** LG composes step text from SVOI components and dispatches
through SL via CLI or nREPL: `sl run` with a dynamically generated feature
file, or `(repl/as :alice "clicks Login.submit")` via nREPL.

**Target approach:** A raw SVOI execution path in SL — dispatches directly
from tuples. This is an SL enhancement (post-MVP).

### Auto-Observe

Every action auto-triggers `observe` on completion, returning the post-action
sieve inventory. The agent always sees the state transition.

### Progressive Disclosure

On cold start (no glossaries, no intent regions), the agent has only `observe`.
As vocabulary loads from SL's project files, action tools appear. The tool
catalog is a live projection of SL's current SVOI state.

---

## Key Abstractions

A fresh developer needs to understand these five concepts:

1. **The Sieve** — A deterministic JavaScript function that inventories a page.
   Runs in the browser via Playwright's `evaluate`. Returns structured data.
   Burns zero agent tokens on perception. See [notes/sieve-contract.md](notes/sieve-contract.md).

2. **The Bridge** — LG's integration layer with SL. Since they're separate
   processes, this is file reads + CLI calls + nREPL, not direct function calls.
   The bridge isolates LG code from SL internals. When SL changes, only bridge
   code updates.

3. **The Graph** — Knowledge base of observations, actions, and annotations.
   Every `observe` and every action persists. Storage is a capstone-scoped
   decision (SQLite, flat files, or Asami via nREPL). The graph is the shared
   artifact that agents and humans co-construct through exploration.

4. **SVOI** — Subject, Verb, Object, bound Interface. SL's behavioral grammar.
   LG doesn't own SVOI — SL does — but LG produces raw material (sieve
   observations, toddler loop labels) that gets compiled into SVOI glossary
   entries.

5. **The Toddler Loop** — A HITL pipeline: observe → guess → ask human →
   record → graduate to SL artifact. See [notes/toddler-loop.md](notes/toddler-loop.md)
   for the full design, two-pass UI, and data pipeline.

---

## The Bridge — SL Integration

LG communicates with SL as a **separate process**. SL is infrastructure that
LG queries, not a library LG embeds.

### What LG Reads from SL

**Glossary files** (direct file read, no SL process needed):

```
project-under-test/
  glossaries/
    subjects.edn       → subject types and instances
    verbs/
      web.edn          → web interface verbs
      api.edn          → API interface verbs
  glossary/
    intents/
      login.edn        → Login intent region with element bindings
      dashboard.edn    → Dashboard intent region
  shiftlefter.edn      → project config (interfaces, step paths, etc.)
```

LG reads these files directly. They're EDN — parseable in any language.
The glossary data drives vocabulary projection (which MCP tools to advertise).

### What LG Calls on SL

**Test execution:**

```bash
sl run features/login.feature --config /abs/path/to/shiftlefter.edn
# Exit 0 = passed, 1 = failed, 2 = planning error (undefined/ambiguous steps)
```

**Glossary validation:**

```bash
sl run --dry-run --strict features/
# Validates glossary references without executing. Exit 2 if unknown objects.
```

**REPL access (optional, for richer integration):**

```clojure
;; Connect to SL's nREPL on the port in .nrepl-port
;; Execute steps programmatically
(repl/as :alice "clicks Login.submit")
;; Read registry
(registry/all-stepdefs)
```

### Bridge Initialization Sequence

```
1. Accept path to project under test (where shiftlefter.edn lives)
2. Read SL config file (EDN parse)
3. Read glossary files (subjects, verbs, intents)
4. Build vocabulary projection (glossary → MCP tool schemas)
5. Start Playwright browser (lazy, on first observe/act)
6. Optionally connect to SL nREPL for programmatic access
```

### Isolation Boundary

The bridge module is the **only** LG code that reads SL files or calls SL
commands. All other LG code interacts with SL through the bridge's abstractions.
When SL's file formats change, only bridge code updates.

---

## Process Model

**Two processes** (or more):

- **LG MCP server** — Long-running. Speaks MCP over stdio. Manages browsers
  via Playwright. Runs the sieve. Serves vocabulary to agents.
- **LG toddler loop UI** — Localhost web app. Reads sieve output files.
  Displays screenshots with SVG overlays. Captures human classifications
  and labels. Communicates with MCP server via localhost HTTP/WebSocket.

Optionally:

- **SL nREPL** — If LG needs programmatic SL access. Long-running.
- **SL CLI** — For test execution and validation. Stateless, invoked per command.

| Scenario | What runs | Notes |
|----------|-----------|-------|
| Agent exploration | LG MCP server + Playwright | Long-running, stdio transport |
| Human classification | LG toddler loop UI | Localhost web app, reads sieve dumps |
| Test execution | `sl run` (SL CLI) | Stateless, validates + executes |
| Glossary validation | `sl run --dry-run` (SL CLI) | Stateless, validates only |

**Multiple browser instances** can run simultaneously. Each subject (role)
gets its own browser instance via Playwright, keyed by subject name.

---

## Invariants

- **SL does not know LG exists.** Dependency flows one way: LG → SL. Never reverse.
- **No unvalidated external data reaches core functions.** Boundary validation at
  MCP message ingress and sieve output parsing.
- **Every observation persists.** No fire-and-forget. If the sieve ran, the result
  is stored.
- **The sieve is deterministic.** Same DOM, same output. No randomness, no
  network calls, no token-burning inference.
- **Graph data has lifecycle state.** Raw observations are not conflated with
  validated SVOI artifacts.
- **The toddler loop intermediate format is the source of truth.** Glossary and
  graph are derived views.

---

## Glossary

| Term | Definition | Not |
|------|------------|-----|
| **Sieve** | Deterministic JS function that inventories a page into structured data | Not an LLM — pure JavaScript, zero tokens |
| **Bridge** | LG's integration module for communicating with SL | Not same-JVM — file reads, CLI calls, nREPL |
| **Observation** | A timestamped sieve output stored in the graph | Not a page — observations are snapshots |
| **Action** | A browser interaction stored as a graph edge | Not an MCP tool — actions are domain events |
| **Annotation** | A semantic label attached to an element or observation | Not SVOI — annotations are pre-authored |
| **Toddler Loop** | HITL pipeline: observe → classify → label → graduate | See notes/toddler-loop.md |
| **SVOI** | Subject, Verb, Object, bound Interface — SL's grammar | Not owned by LG — SL's domain |
| **Region** | Semantic breadcrumb path for an element's location | Not a DOM path — derived from landmarks |
| **Misfit** | A discrepancy between planes with attribution | Not a test failure — carries plane info |

---

## Open Design: IR Resolution via Sieve Matching

**Problem:** Intent regions are not bound to URLs. How does LG know which IRs
are relevant to what the agent sees right now?

**Direction:** The sieve output answers this at runtime. For each loaded IR,
check which element bindings resolve against the current sieve inventory:

```
sieve_output × IR_bindings → {ir-name: {present: [:email :submit], absent: [:forgot-password]}}
```

- No URL binding needed. Same IR lights up wherever its elements appear.
- SPAs work naturally. Same URL, different sieve output, different active IRs.
- Partial presence is signal (state variation, permissions, breakage).
- Unknowns are explicit — sieve elements matching no IR feed the toddler loop.

**Matching function:** Start with exact locator match (id, name, testid).
Add fuzzy/semantic matching later. Coarse matching covers most real-world IRs.

---

## Extension Points

- **Streamable HTTP transport** — for remote/cloud deployment
- **SVOI-to-tool projection** — SL step definitions become MCP tools automatically
- **Progressive disclosure** — tool surface grows as session matures
- **Multi-interface sieves** — mobile accessibility tree, SMS, API, GraphQL
- **Same-JVM mode** — tighten integration post-capstone if performance demands it
- **Re-frame rewrite** — toddler loop UI in CLJS + re-frame (Chair's preferred stack)
