# LeftGlove — Architecture

**Status:** Pre-MVP, approved architecture
**Last updated:** 2026-03-16

---

## Stack

**Clojure on the JVM.** Same-JVM as ShiftLefter — direct function calls, shared
Asami instance, no serialization boundary. The alternative (Python/TypeScript MCP
SDKs) would force SL into a subprocess with IPC overhead and duplicated state.

**Key dependencies:**

- **ShiftLefter** — embedded as a library via `deps.edn` git dep or local root.
  Browser management, step definitions, SVOI, Gherkin, Asami.
- **Asami** — graph database, already on classpath via SL. LG writes directly.
- **No MCP SDK.** MCP is JSON-RPC over stdio. Hand-rolled — the protocol is small
  enough that a dependency isn't worth the coupling.

**Transport:** stdio (MCP client spawns LG as subprocess). Streamable HTTP is a
future extension point for remote/cloud deployment — same protocol layer, different
I/O wrapper. Not an architectural concern now.

---

## Directory Structure

```
leftglove/
  deps.edn
  src/
    leftglove/
      main.clj              # Entry point, stdio loop, MCP lifecycle
      mcp/
        protocol.clj        # JSON-RPC parsing, message framing, error codes
        server.clj           # Tool registry, request dispatch, capability negotiation
        schema.clj           # MCP tool schema generation (from tool defs and SL steps)
      tools/
        observe.clj          # observe tool — run sieve, return inventory
        navigate.clj         # click, enter_text, follow_link — browser actions
        graph.clj            # query_graph tool — Datalog over accumulated observations
        annotate.clj         # annotate tool — write semantic labels
      sieve/
        core.clj             # Sieve orchestration — inject JS, parse results
        js.clj               # Sieve JS function source (string or resource)
        taxonomy.clj         # Element classification rules, region path derivation
      bridge/
        shiftlefter.clj      # SL integration — browser lifecycle, step registry access
        browser.clj          # Thin wrapper over SL's IBrowser for LG's needs
      graph/
        writes.clj           # Observation/action persistence to Asami
        schema.clj           # Graph schema — node types, edge types, attribute specs
        query.clj            # Canned queries and query helpers
  test/
    leftglove/
      ...                    # Mirrors src structure
  resources/
    sieve.js                 # The sieve JavaScript (if kept as resource file)
  prompts/                   # Agent role prompts (existing)
```

---

## Data Model

### Sieve Output

The sieve is a deterministic JavaScript function executed in the browser context
via SL's `execute-script`. It returns a structured inventory of the current page.

**Element record:**

```clojure
{:category    ; :interactable | :output | :structural | :image
 :tag         ; "button", "input", "a", "h1", etc.
 :element-type ; "submit", "text", "checkbox" (for inputs), nil otherwise
 :label       ; Resolved label (innerText, aria-label, placeholder, etc.)
 :locators    ; {:id "..." :name "..." :testid "..." :href "..."}
 :state       ; {:disabled false :visible true :checked nil :expanded nil ...}
 :rect        ; {:x 340 :y 500 :w 80 :h 32}
 :region      ; "main-content > user-table > row-actions" (semantic path)
 :form        ; Form group id or nil
 :aria-role   ; "button", "link", "tab", etc.
 }
```

**Page inventory (full sieve return):**

```clojure
{:url         ; Current URL (metadata, not identity)
 :title       ; Page title
 :viewport    ; {:w 1920 :h 1080}
 :elements    ; Vector of element records
 :forms       ; [{:id "login-form" :elements [...]}]
 :regions     ; Semantic region tree
 :meta        ; {:description "..." :other "..."}
 :timestamp   ; Instant
 }
```

### Graph Nodes and Edges

Every observation and action persists to Asami automatically.

**Observation node:**

```clojure
{:observation/id        ; UUID
 :observation/inventory ; Sieve output (stored as EDN)
 :observation/url       ; URL at time of observation
 :observation/subject   ; Which role/session produced this
 :observation/timestamp ; Instant
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
 :action/subject        ; Which role/session
 :action/timestamp      ; Instant
 }
```

**Annotation:**

```clojure
{:annotation/id         ; UUID
 :annotation/target     ; Element locator or observation ID
 :annotation/label      ; Semantic label ("login-form", "nav-primary")
 :annotation/source     ; :human | :agent
 :annotation/confidence ; 0.0-1.0 (agent guesses) or nil (human)
 :annotation/timestamp  ; Instant
 }
```

### Data Lifecycle States

```
raw → labeled → compiled → validated
```

- **Raw:** Sieve output, stored as observation node. No interpretation.
- **Labeled:** Human or agent has annotated elements with semantic meaning.
- **Compiled:** Labels have been graduated to SVOI definitions / feature file fragments.
- **Validated:** Compiled artifacts have been run through SL's validation (`sl verify`).

LG operates in the raw→labeled space. Compilation and validation are SL's domain.

---

## Tool Surface

### Two Tool Sources

**1. LG-native tools** — capabilities that don't exist in SL:

| Tool | Purpose |
|------|---------|
| `observe` | Run the sieve, return structured page inventory |
| `query_graph` | Datalog query over accumulated observations |
| `annotate` | Write semantic label to an element or observation |

These are static — always available, defined in LG code.

**2. SVOI-derived tools** — projected from SL's loaded vocabulary:

LG reads SL's loaded state and advertises the agent's available "palette":

- **Subjects** — from the subject glossary (types + instances)
- **Verbs** — from verb glossaries, one bag per interface
- **Objects** — from loaded intent regions, one bag of bindings per interface
- **Interfaces** — what's loaded (`:web`, potentially others)

The agent composes SVOI tuples from these primitives. Browser actions (click,
type, navigate) are verbs attached to an interface, not hardcoded LG tools.
Feature files are not involved — LG works with the raw SVOI vocabulary.

These are dynamic — they reflect whatever glossaries, interfaces, and intent
regions are loaded. As the vocabulary grows, the tool surface grows.

### SVOI Execution Path

SL does not currently have a public "front door" for raw SVOI tuple execution.
The machinery exists (extraction, validation, event emission) but dispatch goes
through step text → regex match → stepdef invocation.

**MVP approach:** LG composes step text from SVOI components and dispatches
through SL's existing step/REPL functions (`step`, `as`). This works today.

**Target approach:** A raw SVOI execution path in SL — `(execute-svoi {:subject
:alice :verb :click :object "the button" :interface :web})` — that dispatches
directly from the tuple. This is an SL enhancement, not urgent for MVP.

### Auto-Observe

Every SVOI action auto-triggers `observe` on completion, returning the
post-action sieve inventory. The agent always sees the state transition.

### Progressive Disclosure

On cold start (no glossaries, no intent regions), the agent has only `observe`.
As vocabulary loads — subjects, verbs, objects — the action tools appear. The
tool catalog is a live projection of SL's current SVOI state.

### Future LG-Native Tools (Not MVP)

- `diff` — structural delta between two observations
- Progressive disclosure orchestration (LG controls which derived tools are
  advertised based on session state)

---

## Key Abstractions

A fresh Trench agent needs to understand these five concepts:

1. **The Sieve** — A deterministic JavaScript function that inventories a web page.
   Runs in the browser via SL's `execute-script`. Returns structured data. Burns
   zero agent tokens on perception. The sieve is LG's core new capability that SL
   doesn't have.

2. **The Bridge** — LG's integration layer with SL. Since both run in the same JVM,
   this is direct Clojure function calls into SL's namespaces. The bridge isolates
   LG code from SL internal details so that when SL refactors, only the bridge
   module breaks. See the Bridge section below for initialization details.

3. **The Graph** — Asami-backed knowledge base of observations, actions, and
   annotations. Every `observe` and every action automatically persists. The graph
   is the shared artifact that agents and humans co-construct through exploration.

4. **SVOI** — Subject, Verb, Object, bound Interface. SL's behavioral grammar.
   Every graph edge maps to an SVOI tuple. Every exploration action is
   self-documenting in a grammar that maps directly to test cases. LG doesn't own
   SVOI — SL does — but LG produces raw material that gets compiled into SVOI.

5. **The Toddler Loop** — A HITL pipeline: observe → guess → ask human → record
   answer → graduate to SL artifact. Deterministic at its core (no agent required),
   enhanced by agent intelligence. The human teaches the system what things mean.

---

## The Bridge — SL Integration

LG embeds SL as a library. SL's internals are already well-separated: config
loading is orthogonal to CLI parsing, browser provisioning is lazy, and execution
is callable programmatically. LG doesn't need to "unwrap" the CLI — it calls the
same functions the CLI calls.

### What LG Calls in SL

**Config** (`shiftlefter.runner.config`):

```clojure
(config/load-config-safe {:config-path "/path/to/project/shiftlefter.edn"})
;=> {:status :ok :config {:parser {...} :runner {...} :interfaces {...} ...}}
```

The config is a plain EDN file specifying browser adapter, step paths, glossary
paths, etc. LG passes the path; SL returns a merged config map. No CLI involved.

**Step registry** (`shiftlefter.stepengine.registry`):

```clojure
;; Load step definitions from configured paths
(step-loader/load-step-paths! step-paths)

;; Read the registry
(registry/all-stepdefs)
;=> seq of {:pattern "..." :fn f :arity n :source {:file "..." :line n} :metadata {:svo {...}}}
```

The registry is a global atom (`defonce`), cleared and reloaded per run. The
`defstep` macro registers steps as their files are evaluated. LG reads the
registry for the step-to-tool-schema transform.

**Browser protocol** (`shiftlefter.browser` / `IBrowser`):

Browsers are **not** created at init. SL's config says *how* to create them
(adapter type, headless flag, profile). Provisioning happens on demand via the
adapter registry. LG provisions browsers the same way SL's executor does:

```clojure
;; Adapter factory creates a browser instance
;; Returns an IBrowser implementation (31 protocol methods)
;; Including execute-script — which is how LG runs the sieve
```

Multiple browsers with separate profiles can run simultaneously. Each subject
(role) gets its own browser instance, keyed by subject name.

**Graph** (`shiftlefter.graph`):

```clojure
(graph/init-db! {})             ;; Create + connect
(graph/transact! conn entities) ;; Write
(graph/query conn datalog)      ;; Read
```

Asami plumbing — init, transact, query. Already on classpath. LG writes
observations and actions directly.

**Execution** (`shiftlefter.runner.core`):

```clojure
(runner/execute! {:paths ["features/"] :step-paths ["steps/"] ...})
;=> {:exit-code 0 :status :passed :counts {...}}
```

For test execution mode — LG can run feature files programmatically without the CLI.

### Bridge Initialization Sequence

```
1. Accept path to project under test (where shiftlefter.edn lives)
2. Load SL config via config/load-config-safe
3. Load step definitions via step-loader/load-step-paths!
4. Initialize Asami graph via graph/init-db!
5. Browsers provisioned lazily on first observe/act call
```

### CWD Consideration

SL's bash wrapper captures the user's CWD in `SL_USER_CWD` for path resolution.
When LG embeds SL, there's no bash wrapper. LG resolves this by passing absolute
paths in the config map. All paths LG hands to SL are absolute.

### Isolation Boundary

The bridge module (`leftglove.bridge.*`) is the **only** LG code that imports SL
namespaces. All other LG code interacts with SL through the bridge. When SL
refactors, only bridge files break. This is enforced by convention, not tooling.

---

## Process Model

**One LG process** embedding SL as a library. Within that process:

- **Multiple browser instances.** SL drives many browsers with separate profiles,
  potentially mixing Playwright and WebDriver simultaneously. Multi-browser is
  essential for comparative/permission discovery (Subject A in one browser,
  Subject B in another).
- **One Asami instance**, single writer. File-backed, one store per project directory.
- **One agent or one human** per LG session, but that agent/human works across all
  browser instances.

| Scenario | Process | Notes |
|----------|---------|-------|
| Agent exploration | LG as MCP server (embeds SL) | Long-running, stdio transport |
| Developer exploration | LG (embeds SL) | Long-running, browser open |
| CI test execution | `sl run` (SL only) | Stateless, writes graph, exits |
| Ad-hoc graph query | `sl graph query` (SL only) | Read-only, exits |

---

## Invariants

- **SL does not know LG exists.** Dependency flows one way: LG → SL. Never the reverse.
- **No unvalidated external data reaches core functions.** Boundary validation at
  MCP message ingress and sieve output parsing.
- **Every observation persists.** No fire-and-forget. If the sieve ran, the result
  is in the graph.
- **The sieve is deterministic.** Same DOM, same output. No randomness, no
  network calls, no token-burning inference.
- **One writer per graph store.** No concurrent Asami writes from separate processes.
- **Graph data has lifecycle state.** Raw observations are not conflated with
  validated SVOI artifacts.

---

## Glossary

| Term | Definition | Not |
|------|------------|-----|
| **Sieve** | Deterministic JS function that inventories a page's DOM into structured data | Not an agent or LLM — pure JavaScript, zero tokens |
| **Bridge** | LG's integration module for calling into SL | Not an IPC layer — same JVM, direct function calls |
| **Observation** | A timestamped sieve output stored as a graph node | Not a page — observations are snapshots, page identity is a query-time concern |
| **Action** | A browser interaction (click, type, navigate) stored as a graph edge | Not an MCP tool — actions are domain events, tools are protocol surface |
| **Annotation** | A semantic label attached to an element or observation | Not SVOI — annotations are pre-authored, SVOI is compiled/validated |
| **Toddler Loop** | HITL pipeline: observe → guess → ask → record → graduate | Not agent-dependent — works without AI, enhanced by it |
| **SVOI** | Subject, Verb, Object, bound Interface — SL's behavioral grammar | Not owned by LG — SL's domain. LG produces raw material for it |
| **Region** | Semantic breadcrumb path for an element's conceptual location | Not a DOM path — derived from landmarks, ARIA, headings |
| **Misfit** | A discrepancy between expected and observed behavior | Not a test failure — misfits carry plane attribution, not pass/fail |
| **Resolution** | Abstraction level for tool operations (intent vs. interface) | Not image resolution — intent-level is portable, interface-level is web-specific |

---

## Open Design: IR Resolution via Sieve Matching

**Problem:** Intent regions are deliberately not bound to URLs (avoids page object
brittleness, handles SPAs, handles shared components). But this means there's no
static lookup to answer "which IRs are relevant to what the agent is looking at
right now?"

**Direction:** The sieve output provides the answer at runtime. For each loaded IR,
check which of its element bindings resolve against the current sieve inventory.
IR relevance becomes a computed query, not a static mapping:

```
sieve_output × IR_bindings → {ir-name: {present: [:email :submit], absent: [:forgot-password]}}
```

**Properties of this approach:**

- **No URL binding needed.** Same IR lights up wherever its elements appear. Nav
  IR is active on every page. Login IR is active only when those fields exist.
- **SPAs work naturally.** Same URL, different sieve output, different active IRs.
- **Partial presence is signal.** An IR that's 3/5 present suggests state
  variation, permission-hidden elements, or breakage — exactly what the misfit
  layer cares about.
- **Unknowns are explicit.** Sieve elements that match no IR are unrecognized
  objects — direct input to the toddler loop.

**Progressive disclosure maps cleanly:**

- **Fully mapped:** Every sieve element matches a known IR → agent has full vocabulary
- **Partially mapped:** Some match, some unknown → agent acts on known, asks about rest
- **Unmapped:** No IRs or novel page → raw exploration, everything is unknown

**Open question: the matching function.** Simple cases (id, name, testid) are
straightforward — IR binding `{:css "#email"}` matches sieve element `{:id
"email"}`. Complex CSS selectors are harder to match without running them in the
browser. Likely approach is hybrid: sieve for fast coarse matching on locator
candidates, then verify ambiguous matches by asking SL to resolve the actual
locator against the live DOM. Doesn't need to be perfect — coarse matching covers
most real-world IRs, and ambiguous cases are where agent judgment adds value.

**Ownership:** This is LG's problem — "given what I see, what do I know about it?"
No SL changes required. Can be built incrementally: start with exact locator
match, add fuzzy/semantic matching later.

---

## Extension Points

- **Streamable HTTP transport** — for remote/cloud deployment. Same protocol, different I/O.
- **SVOI-to-tool projection** — SL step definitions become MCP tools automatically.
- **Progressive disclosure** — tool surface grows as session matures.
- **Multi-interface adapters** — mobile accessibility tree, SMS, API (beyond web).
- **Declared graph** — source code analysis layer.
- **Usage graph** — telemetry / session recording layer.
