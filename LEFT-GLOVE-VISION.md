# Left Glove — Vision Document

**Project:** Left Glove
**Relationship:** MCP server wrapping ShiftLefter — "a glove for driving ShiftLefter"
**Author:** Gabriel Wilkins
**Date:** March 2026
**Status:** Pre-MVP, vision and architecture

---

## What Is This?

Left Glove is an MCP (Model Context Protocol) server that allows an AI agent (primarily Claude, but agent-agnostic) to drive ShiftLefter's browser engine for the purpose of **exploring, cataloging, and testing web applications**. It turns ShiftLefter's deterministic browser capabilities into tools an agent can call, and adds an exploratory perception layer that ShiftLefter doesn't currently have.

The agent can operate in multiple modes: raw exploration of an unknown application, execution of known tests, or a mixed mode where it validates existing specifications while discovering new behavior. The result is a **semantic graph** of the application — what's there, what it does, who can do what, and where reality diverges from expectation.

---

## Core Concept

### The Engine Loop

**Observe → Catalog → Act → Observe Delta → Build Graph**

The agent sits in a browser context (via ShiftLefter), scans the DOM for a taxonomy of elements (interactables, outputs, structural), records their identity and spatial layout, and builds a growing semantic graph. Nodes are UI elements and pages. Edges are actions that transition between states. Two exploration modes feed the graph in parallel:

- **User-directed:** The user tells the agent what things are, what to try, what matters.
- **Autonomous:** The agent follows links, tries interactions, records what happens.

It is **guided cartography**, not exhaustive crawling. The user provides intent, the agent provides exploration labor, and the graph is the shared artifact they co-construct.

### SVOI as the Grammar

ShiftLefter uses SVOI (Subject, Verb, Object, bound Interface) as its behavioral specification grammar. This maps directly onto Left Glove's concerns:

- **Subject (S):** The actor/role — admin, support-level-1, anonymous user. Semantic, not DOM-visible. Maintained through separate browser sessions per subject (ShiftLefter's multi-actor capability from v0.3.5).
- **Verb (V):** The action — derivable from element types and attributes (button → click/activate, input → enter/type, link → follow/navigate).
- **Object (O):** The target — the DOM element, field, or widget being acted upon.
- **Interface (I):** The surface — web browser for MVP, but the grammar is designed to extend to mobile, SMS, watch, API, etc.

Every graph edge is an SVOI tuple. Every exploration action is self-documenting in a grammar that maps directly to test cases. **The exploration artifact and the test suite are the same thing.**

### Step Definitions Are Tool Schemas

ShiftLefter's Cucumber step definitions (e.g., `When I click the {button}`) are simultaneously:

- The test specification
- The MCP tool catalog
- The documentation of what the app can do

A transform layer reads ShiftLefter's step registry and emits MCP tool definitions. As users edit feature files, they are automatically extending the MCP server's tool surface. As the agent discovers new interactions, it proposes them back as feature file steps. The graph and the spec co-evolve.

---

## Operating Modes

### Mode 1: Raw Exploration (No Prior SVOI)

The agent boots with only `observe` and low-level browser primitives. No feature files, no glossary, no prior knowledge. It scans pages, catalogs elements, follows links, builds the graph from scratch. This is the cold-start mode for pointing at a completely unknown application.

### Mode 2: Test Execution (Full SVOI + Feature Files)

ShiftLefter has a hard-coded SVOI and feature files. The agent invokes ShiftLefter to run these deterministically. This is traditional test execution — if the test fails, it's a finding. The agent can also drive tests line-by-line through the REPL for debugging, inspecting the live DOM at the point of failure.

### Mode 3: Mixed / Validation

The agent has existing SVOI and some feature files but is performing further exploration or validation. It can:

- Run existing tests to establish a baseline
- Explore beyond what the tests cover
- Compare observed behavior against specified behavior
- Propose new SVOI definitions and feature files for discovered capabilities
- Validate that new code/features haven't broken existing behavior

### Mode 4: Comparative / Permission Discovery

The agent maintains multiple subject contexts (separate browser sessions with different credentials). It performs the same action sequences as Subject A and Subject B, diffs the results, and the delta **is** the permission model. RBAC is reverse-engineered empirically from observed behavior, not from documentation.

---

## The Perception Layer (The "Sieve")

The core new capability that doesn't exist in ShiftLefter today. A deterministic JavaScript function that runs in the browser context and returns a structured inventory of everything on the page.

### What the Sieve Captures

**Interactable elements** — found via tag name and attribute scan:

- `button`, `a`, `input`, `select`, `textarea`
- Elements with `[role="button"]`, `[role="link"]`, `[role="tab"]`
- Elements with `[onclick]`, `[draggable]`, event listeners

For each interactable:

- Tag and type (input type, button type)
- Label: `innerText`, `aria-label`, `aria-labelledby`, `placeholder`, `title`, `alt`, associated `<label>`
- Locator candidates: `id`, `name`, `data-testid`
- ARIA role
- State: `disabled`, `readonly`, `checked`, `selected`, `hidden`, `visibility`, `aria-expanded`, `aria-hidden`
- Bounding rect (x, y, width, height)
- Form membership (nearest ancestor `<form>` or `<fieldset>`)
- Href (if link)
- Viewport visibility

**Output elements** — visible text not inside interactables:

- Labels, headings, static content
- Bounding rects and hierarchy level (h1–h6, p, span)

**Images:**

- Alt text, src, dimensions, role

**Page metadata:**

- URL (as metadata/tag, NOT as page identity), title, meta description, viewport dimensions

**Grouping:**

- Form groups (elements sharing a form ancestor)
- Nav regions (elements inside nav, header, sidebar)
- Main content vs. chrome

### Output Shape Per Element

```
{ category: "interactable" | "output" | "structural"
  tag: "button"
  label: "Delete User"
  locators: {id: "btn-delete", testid: "delete-btn"}
  state: {disabled: false, visible: true}
  rect: {x: 340, y: 500, w: 80, h: 32}
  region: "main-content > user-table > row-actions"
  form: null }
```

The `region` path is a semantic breadcrumb derived from landmarks, ARIA regions, headings, and form groupings — NOT the raw DOM path. "Main content area, inside what looks like a user table, in the row actions." This is what the agent needs to understand *where* something is conceptually.

### Design Principle: Don't Make Claude Do Deterministic Work

The sieve is pure JavaScript. No tokens burned on perception. Claude only comes in where judgment is needed:

- "These three fields and this button are probably a login form"
- "This nav pattern suggests an admin panel"
- "The state change after clicking X implies Y"

You're not paying for perception. You're paying for reasoning.

---

## Tool Surface

The MCP server exposes a small, stable set of tools. These are interface-agnostic at the top level, with interface-specific adapters underneath.

### Core Tools

| Tool | Purpose | Resolution |
|------|---------|------------|
| `observe` | What's here right now | High: full sieve inventory. Low: intent-level summary. |
| `act` | Do a thing (parameterized by SVO) | High: `click button#delete`. Low: `activate destructive-action`. |
| `diff` | What changed since last observation | Structural delta between two sieve outputs. |
| `query` | Ask the graph something | Datalog queries over accumulated observations. |
| `annotate` | User tells you what something means | Writes semantic labels to the graph. |

### Resolution Parameter

Each tool accepts a resolution that determines the abstraction level:

- **Intent level:** "There's a destructive action available." Portable across interfaces.
- **Interface level:** "There's a red button labeled Delete at coordinates 340,500." Web-specific.

Claude chooses resolution based on what it's doing. Mapping use cases → stay high. Debugging a specific interaction → go low. Comparing across interfaces → high for comparison, low for execution.

### Progressive Disclosure

The MCP server can hold back tools until they're relevant. On cold start, advertise only `observe` and basic navigation. As the session matures and the SVOI populates, more specialized tools become available.

### SVOI-Derived Tools

When ShiftLefter has a populated step registry, the MCP server projects those step definitions as additional tools. Each `When I click the {button}` becomes a callable tool. The feature file IS the tool catalog.

---

## The Graph

### What Gets Stored

Every `observe` and every `act` automatically persists to the graph (Asami, already bolted onto ShiftLefter) as a side effect. The agent doesn't need explicit graph-write tools. It explores and the graph accumulates.

### Graph Layers (Multiple Graphs)

Different perspectives on the same application, stored as separate but cross-referenced graphs:

| Graph | Source | What It Captures |
|-------|--------|-----------------|
| **Observed** | Agent exploration (black box) | What the deployed app actually does. Ground truth of reality. |
| **Specified** | SVOI + feature files | What we think it should do. The behavioral spec. |
| **Declared** | Source code analysis (white box) | What the code says should exist — Express routes, controller mappings, middleware chains, DB models. |
| **Usage** | Telemetry / user session recording | What real humans actually do. Captures desire and real-world navigation paths. |

The graphs don't need identical schemas. They need **overlapping keys** — a route, an element identifier, an action verb — enough shared vocabulary to join across them. Misfits between any pair of graphs are findings.

### Observation Nodes

Each observation is stored as its own node with edges to the action that preceded it. The graph is a raw timeline: "I was here, I did this, then I saw that."

**Stored per observation:**

- Sieve output (structured, queryable, diffable) — the primary record
- Screenshot reference (path to file in flat directory, timestamped) — for human adjudication of misfit reports
- URL (as metadata tag, not as page identity)
- Timestamp
- Subject context (which role/session)

**Not stored:**

- Raw DOM (massive, noisy, can't diff meaningfully)
- Full computed DOM (same problem)
- Page source (pre-render, less useful than post-render sieve)

Computed CSS properties on interactable elements ARE stored as part of the sieve output (e.g., `visibility: hidden` matters).

### Page Identity

Deferred for MVP. Page identity is a query-time problem, not a write-time problem. Every observation is its own node. "Are these two observations the same page?" is answered later by computing structural similarity between sieve outputs. Claude handles the fuzzy judgment of whether a delta constitutes a state change vs. a different page.

This sidesteps the SPA problem entirely. No need to determine at capture time whether a URL change represents a new page or a state transition. Just record what happened. Structure emerges from querying the graph.

---

## The Four Planes of Misfit

Left Glove is the Four Planes framework made operational.

### Plane Mapping

| Plane | Layer | In Left Glove |
|-------|-------|----------------|
| **Plane 1: Understanding** | What do we actually need? | Usage graph — what real users do, what they want |
| **Plane 2: Evaluation** | Are our requirements right? | The graph query layer — coverage analysis, gap detection |
| **Plane 3: Strategy** | Is our spec correct? | SVOI + feature files — the behavioral specification |
| **Plane 4: Implementation** | Does the system work? | Observed graph — what the deployed app actually does |

### Misfit as First-Class Object

When an observation doesn't match an expectation, traditional testing says "fail." Left Glove says: **which planes are in tension?**

- **Plane 4 is wrong:** The app has a bug. Classic test failure.
- **Plane 3 is wrong:** The feature file specifies behavior that was never intended. Bad test.
- **Plane 2 is wrong:** The requirements are flawed. The design was wrong.
- **Ambiguous:** The discrepancy exists but the source cannot be determined without human adjudication.

Mismatch is stored as a **misfit node** in the graph — a first-class entity carrying metadata about which planes are involved and what upstream information would resolve it.

The agent's output isn't pass/fail. It's a **misfit report**: here's the discrepancy, here's which planes are in tension, here's the question a human needs to answer to resolve it. The agent does exploration labor. The human does adjudication.

Over time, as users make adjudication calls, those decisions feed back into the graph. The agent learns the pattern — "when plane 3 and plane 4 disagree about permissions, this team usually sides with plane 4 and updates the spec."

### Testing as Perception

Traditional testing: assert this equals that. Pass or fail. Binary. You must know the answer before you ask the question.

Left Glove: the agent builds a model of what the app *is*, continuously, and notices when reality deviates from the model. It doesn't need to know the "right" answer. It knows what it saw yesterday. Today something is different. It raises its hand.

"Daddy, is that building supposed to be on fire?"

The false positives where the user says "yes, that's a controlled burn" cost almost nothing. The true positive where nobody else noticed is worth everything.

---

## The Annotation / Tutorial Loop

The agent observes a page, makes guesses about what things are, and presents those guesses to the user for confirmation or correction:

1. Agent calls `observe`, gets structured inventory
2. Agent infers: "These three fields and this button look like a login form"
3. Agent proposes this as a Cucumber step / SVOI definition
4. User confirms, corrects, or elaborates
5. Annotation is written to the graph as a semantic label
6. If it's a new capability, it can be written back as a new SVOI definition and/or feature file

This is Claude drafting Cucumber. A correction to the feature file simultaneously corrects the tool, the test, and the graph semantics.

The UI for this is TBD. MVP: Claude in a chat session asking questions. Future: real-time collaborative UI with voice/click annotation.

---

## Architecture

### Dependency Flow

```
Agent (Claude)
    ↓ MCP protocol
Left Glove (MCP Server)
    ↓ function calls
ShiftLefter (browser engine + step registry + Asami)
    ↓ WebDriver/Playwright
Browser
    ↓
Application Under Test
```

### What Lives Where

**ShiftLefter (existing, no new code during Gauntlet):**

- Browser session management (launch, navigate, multi-actor)
- WebDriver/Playwright interface
- Step definition registry (Cucumber SVOI)
- Feature file execution
- SVOI validation (dry run — subjects in glossary, verbs on interfaces)
- Asami graph database (already bolted on, pre-Gauntlet prior art)
- **NEW (pre-existing capability to extend):** Introspection/inventory layer — broader DOM query functions beyond locator-based observe. `querySelectorAll`-style scans returning structured inventories. This belongs in ShiftLefter because it's a browser operation and ShiftLefter owns the browser.

**Left Glove (new repo, new during Gauntlet):**

- MCP server implementation and protocol handling
- Tool-schema-from-step-definition transform (reads ShiftLefter's step registry, emits MCP tool definitions)
- The sieve function (JavaScript executed in ShiftLefter's browser context)
- Graph schema for application modeling
- Graph write side effects (every observe/act persists to Asami)
- Prompt engineering for agent exploration behavior
- Misfit detection and reporting logic

**Agent (Claude or other):**

- Semantic interpretation ("this looks like a login form")
- Exploration planning ("I should try logging in as admin next")
- Annotation and tutorial interaction with user
- Feature file / SVOI authoring
- Misfit adjudication prompting

### IP Boundary

ShiftLefter is prior art, timestamped, open source. Left Glove is a new repo that consumes ShiftLefter as a dependency — same as any downstream consumer of an open-source library. ShiftLefter doesn't know Left Glove exists. Clear dependency boundary, clean git histories.

### Agent-Driven Development Loop

The agent can use Left Glove for iterative development:

1. Write new feature files and SVOI definitions
2. Hot-load them into ShiftLefter (or spin up a new instance)
3. Run tests statically through ShiftLefter (equivalent to running unit tests, but slower)
4. On failure, drive ShiftLefter line-by-line through the REPL
5. Inspect the live DOM at the point of failure
6. Iterate on the code/spec
7. Once working in the REPL, commit to concrete feature files

This gives the agent repo-driven development — it doesn't always start from scratch.

---

## MVP Scope

### Step 0: Prove the Pipe

Stand up a bare MCP server in Clojure. Expose one dummy tool. Confirm an agent can call it and get a response. Pure plumbing validation. A couple hours.

### Step 1: `observe`

The MCP server launches a ShiftLefter browser session, navigates to a provided URL, runs the sieve, returns structured element inventory. This is the foundation.

**Test:** Point at three different sites — something RESTful, something SPA, something with a login page. See what the sieve actually returns. Learn what's useful, what's noise, what's missing.

### Step 2: Basic Navigation

`click_element`, `enter_text`, `follow_link` — thin wrappers around ShiftLefter actions via the MCP server. Each action automatically triggers `observe` on the result so the agent always sees the state transition.

### Step 3: Graph Writes

Every observation and action-transition persists to Asami as a side effect. Pages are nodes, actions are edges, elements are properties.

### Step 4: `query_graph`

Let the agent ask questions about accumulated observations via Datalog. "What pages have login forms?" "What elements appear on page A but not page B?"

### Step 5: The Tutorial Loop

Agent examines `observe` output, makes guesses, asks the user to confirm or correct. Annotations written to graph as semantic labels.

### What Is NOT MVP

- Multiple interface support (mobile, SMS, watch)
- Source code analysis (declared graph)
- Usage telemetry (usage graph)
- Misfit reports with full plane attribution
- Rich collaborative annotation UI
- Playwright migration (use whatever browser driver works today)
- SVOI-to-tool projection (build tools from step registry)
- Progressive tool disclosure
- Page identity / SPA state resolution
- Screenshot capture
- Comparative permission discovery (multi-subject)
- Feature file write-back from annotations

---

## Open Questions

1. **Browser driver:** Did Playwright get fully working in ShiftLefter? If not, use whatever WebDriver setup works today. Not a blocker.
2. **ShiftLefter introspection API:** What new functions need to be exposed in ShiftLefter to support the sieve? Currently, observe is locator-based. We need broader scan capabilities. This may be the one area where ShiftLefter gets minor new code.
3. **SVOI conflict sets:** Can ShiftLefter hold multiple conflicting SVOI sets simultaneously? Useful for agent-driven development where the agent is proposing new definitions alongside existing ones.
4. **Graph schema details:** Exact Asami schema for observation nodes, action edges, annotation labels. To be designed after seeing real sieve output from MVP Step 1.
5. **Interface-agnostic tool design:** The tools use `observe`/`act`/`diff`/`query`/`annotate` as interface-agnostic verbs. Web is the first and only interface adapter. But the tool API should not be torqued out of shape by web-specific assumptions, so that future adapters (mobile accessibility tree, SMS parsing, etc.) can slot in.

---

## Naming and Philosophy

### Left Glove

It's a glove. You wear it to drive ShiftLefter. You put on the glove, you grip the tool.

### Walking the Left Hand Path

*"Walking the left hand path through your application."*

Traditional testing is the **right-hand path** — orthodox, prescriptive, received doctrine. You define correctness up front and assert against it. You know the answer before you ask the question. Every framework works this way: write the expected outcome, run the code, compare. It is fundamentally conservative — it can only confirm what you already believe.

Left Glove walks the **left-hand path** — heterodox, empirical, knowledge through direct experience. You don't start with "what should be." You start with "what is." The agent observes the application as it actually exists, builds a model from lived reality, and discovers truth through exploration rather than prescription. Correctness is not assumed. It is derived.

This isn't a rejection of the right-hand path. ShiftLefter's deterministic test execution is still there — it's still the orthodox foundation. Left Glove is the esoteric complement. One confirms belief. The other discovers reality. You need both.

### The Danzig Lineage

ShiftLefter's philosophical foundation is the **Four Planes of Misfit** — quality defined as the absence of misfit. Glenn Danzig's trajectory from the Misfits traces a path that maps onto the evolution of this tooling ecosystem:

- **Misfits** → ShiftLefter. The foundation. Misfit as the core concept.
- **Samhain** → The death-and-rebirth cycle of continuous observation. The application dies and is reborn with every deploy. The graph persists across those cycles, tracking what changes and what endures. A future tool in the ecosystem concerned with deployment-aware observation and temporal analysis.
- **Danzig** → The fully autonomous form. The agent that doesn't need direction, that walks the left hand path on its own, that understands the application deeply enough to find what no one thought to look for.

Left Glove sits at the transition point — the hand that reaches from the Misfits toward Samhain.
