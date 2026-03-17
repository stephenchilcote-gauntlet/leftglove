# LeftGlove — Architecture Conversation

**Date:** 2026-03-16
**Participants:** Chair (Gabriel Wilkins), Navigator (Claude)

Record of the architectural conversation that established LeftGlove's scope,
its relationship to ShiftLefter, and the operational model.

---

## Starting Point

LeftGlove has a vision document (`LEFT-GLOVE-VISION.md`) describing an MCP server
that wraps ShiftLefter for agent-driven exploration, cataloging, and testing of
web applications. The vision is clear on *what* but several foundational questions
were open:

- What language? (Vision doc says Clojure in Step 0, but not decided)
- Where does the boundary fall between SL and LG?
- Who owns the graph?
- What's the operational/process model?

---

## ShiftLefter's Current State

Surveyed from `shiftlefter-gherkin` on main (last touched Feb 11, 2026):

- **100% Clojure.** ~18K LOC, 55 source files, 78 test files, 1029 tests, zero failures.
- **Both Etaoin and Playwright work.** Playwright experimental but all 31 `IBrowser`
  protocol methods implemented.
- **Asami is on main** — merged Feb 10. Plumbing only: init/reset/transact/query
  wrappers. Not wired into CLI or test execution. Sitting there waiting for exactly
  what LeftGlove describes.
- **SVOI extraction and validation works.** Step definitions carry `:svo` metadata.
  Subject typing (`:user/alice`) recently added.
- **Clean browser protocol abstraction** (`IBrowser`, 31 methods). 36 step definitions.
- **Bundled nREPL** in the uberjar (`sl repl`).
- **Step registry exists but may not be publicly queryable.** The registry is created
  and used internally, but exposing it for external consumers (like LG's
  step-to-tool-schema transform) may require SL changes.

---

## The Language Question

**Clojure wins** because of the integration model:

- SL is 100% Clojure. Same-JVM means LG uses SL as a library — direct function
  calls, shared Asami instance, no serialization boundary.
- The sieve (JS function) executes through SL's browser adapter, which already
  supports `execute-script`.
- Asami is already on the classpath via SL's dependencies.
- The alternative (Python/TypeScript) has better MCP SDK support but forces SL into
  a subprocess with IPC overhead. Every call crosses a process boundary. The graph
  lives in SL's process, so LG either queries through CLI or duplicates it.
- MCP is just JSON-RPC over stdio. Hand-rolling it in Clojure isn't much work.

---

## The Boundary: Three Layers, Two Projects

### The Three Layers

Emerged from working through multiple use cases:

1. **SL the engine** — parse, validate, execute, format. Browser management.
   Deterministic. Owns intent regions, glossaries, SVOI, feature files, step
   definitions. Start and end of every pipeline.

2. **The graph / knowledge base** — Asami-backed knowledge about applications
   under test. Stores observations, actions, labels, SVOI tuples, test results,
   misfits. Multiple writers, multiple readers. Data has lifecycle states:
   raw → labeled → compiled → validated.

3. **LG the perception/interface layer** — MCP server for agents, annotation UI
   for humans. The sieve. Exploration mode orchestration. Step-to-tool-schema
   transform. Progressive tool disclosure.

### Why Two Projects, Not Three

The graph-as-separate-middle-layer would be a thin wrapper around Asami with a
schema definition — not enough meat to justify its own project. It'd exist to
satisfy an architectural diagram rather than solve a real problem.

**Decision: SL owns the graph.** Asami is already there. The ultimate consumers
of graph data are SL artifacts (intent regions, glossaries, feature files). SL's
graph module grows from a bare Asami wrapper into a proper knowledge base with
schema, data lifecycle states, and query interface.

**LG is the glove:** a thin interface layer that lets different hands (agent, human)
grip the same machine.

### The "SL Gets Huge, Tiny Glove" Model

Visualized as: a massive clockwork machine (SL) with a glowing graph database at
its reactor core, and a small leather glove (LG) on the edge with wires trailing
into the machine. The glove is organic, human-scaled. The machine is precise,
industrial. See `shiftlefter-has-the-graph.png`.

The alternative — three hermetically separated terrariums connected by copper
pipes — was considered and rejected. The pipes would need to be too thick in
practice. See `three-separate-slices.png`.

---

## What Lives Where

### ShiftLefter (the engine — grows to own the graph)

**Already exists:**

- Gherkin parser (100% Cucumber-compatible, lossless roundtrip)
- Step definition registry (`defstep` macro, pattern matching, `:svo` metadata)
- SVOI extraction and validation (glossaries, subject typing, Levenshtein suggestions)
- Browser session management (launch, navigate, multi-actor per subject)
- Browser protocol (`IBrowser`, 31 methods, Etaoin + Playwright adapters)
- Feature file execution (`sl run`)
- REPL-driven exploratory testing (`sl repl`)
- Asami graph DB lifecycle (plumbing: init/reset/transact/query)
- CLI (`sl`) — all features accessible without Clojure installed
- Intent system (regions, loaders, resolvers, state management)

**Needs to grow (not urgent — LG can work around these initially):**

- Graph schema for observations, actions, labels, misfits (formalize what LG
  prototypes in the hacky version)
- File-backed Asami store (trivial config change from `asami:local://`)
- `sl graph query` CLI command (open store read-only, run Datalog, print, exit)
- Hot reload of intents/glossaries (needed for toddler loop workflow)
- Test result persistence to graph (CI writes results, not just exit codes)
- Broader introspection API (graduate the sieve from LG-owned JS to SL-native)
- Public/queryable step registry (may be needed for LG's step-to-tool transform)

### LeftGlove (the glove — thin, interface-focused)

- **MCP server** — JSON-RPC over stdio, Clojure implementation
- **Step-to-tool-schema transform** — reads SL's step registry, emits MCP tool
  definitions. Feature files become the tool catalog.
- **The sieve** — JavaScript function definition, executed in SL's browser context.
  Deterministic DOM inventory: interactables, outputs, images, structural elements,
  page metadata, grouping. Returns structured data, burns zero tokens on perception.
- **Exploration mode orchestration** — raw exploration, test execution, mixed
  validation, comparative/permission discovery
- **Progressive tool disclosure** — advertise only relevant tools based on session
  maturity
- **The toddler loop / annotation UI** — HITL interface for labeling graph data.
  Present unlabeled elements, capture human decisions, write labels to graph,
  graduate labeled data to SL artifacts. Works without an agent (deterministic
  select → present → ask → record → graduate pipeline), enhanced by agent
  (smart guesses, grouping, pattern matching).
- **Misfit detection and reporting** — which planes are in tension, what needs
  human adjudication
- **Graph writes** — initially LG writes directly to Asami (same JVM, same
  classpath). Long-term, the schema migrates into SL's graph module.

---

## Operational Model

### Process Architecture

In almost every scenario, one process runs, and it embeds SL:

| Scenario | Process | What's running |
|----------|---------|---------------|
| CI test execution | `sl run` | SL only, writes graph to file store, exits |
| Developer exploration | LG (embeds SL) | Long-running, browser open, graph in-process |
| Agent exploration | LG as MCP server (embeds SL) | Long-running, agent connects via stdio |
| Ad-hoc graph query | `sl graph query` | SL only, opens file store read-only, exits |
| Dev test execution | `sl run` within LG session, or separate | Depends on whether results go in same graph |

### Graph Storage

- **Always local, always file-backed, always Asami.** No server, no network, no
  federation.
- **One store per project directory** (`.shiftlefter/graph/` or similar).
- Different processes can read it; one at a time for writes.
- CI and developer stores are separate instances. Merging/federation is a later
  problem (and the Fluree argument, when/if it comes).

### Instance Model

- **CI:** One SL instance per run. Stateless. Writes results to graph, exits.
- **Developer session:** One long-running LG process (embedding SL). One browser
  (or multiple for multi-actor). One Asami instance in-process, file-backed.
  Annotation UI and agent MCP tools connect to this same process.
- **No concurrent writes from separate processes.** Developer runs toddler loop
  OR agent runs exploration, both through the same LG instance.

### Hot Reload

When the toddler loop generates new SL artifacts (intent regions, glossary entries),
they need to be available in the running session without restart. SL needs reload
functions for intents/glossaries — either file-watching or explicit
`(reload-intents!)` via the REPL.

---

## Key Use Case: Behavioral Contracts for Development

Analyzed the scenario where a development agent uses feature files as behavioral
contracts when building new features. Revealed that the agent needs SL far more
than LG for this workflow:

1. **Read contracts** — read `.feature` files from disk. No tool needed.
2. **Query contracts structurally** — "what can admin do?" Needs SL's compiled
   SVOI, exposed as CLI command or library call.
3. **Write new code** — standard dev work.
4. **Write new contracts** — author `.feature` files.
5. **Validate** — `sl verify`, SVOI validation. Pure SL.
6. **Run tests** — `sl run`. Pure SL.
7. **Explore running app** — only step that needs LG.

For development workflows, the agent mostly uses SL directly. LG adds value for
exploration, perception, and the toddler loop — different activities than feature
development.

---

## Key Use Case: The Toddler Loop

An agent (or dumb crawler) walks an app, graphs unlabeled observations. Then
presents to the user: "what's that? what does that do?"

### What This Revealed

- **The graph must hold unlabeled/draft data.** SL's current world is entirely
  validated. The graph introduces a pre-authored state: observed but uninterpreted.
  A button exists, it says "Delete User," but we don't know the SVOI semantics,
  the subject constraints, or the intent region it belongs to.

- **The toddler loop is fundamentally a HITL pipeline, not an agent feature.**
  The core loop (select unlabeled thing → present with context → ask human →
  record answer → repeat) is deterministic. An agent enhances it (makes guesses,
  reduces questions) but isn't required.

- **The data lifecycle is:** raw → labeled → compiled → executable. Observation →
  annotation → SVOI definition → feature file/test. The graph is the staging area.
  SL is the start (browser) and end (tests). LG/annotation is the middle.

- **LG as "the glove" covers both hands:** MCP tools for agents, annotation UI
  for humans. Both are interfaces to the same exploration/labeling pipeline.
  Both write to SL's graph. Both produce SL artifacts.

---

## Implementation Strategy

### What LG Can Do Without Touching SL

Since LG embeds SL as a library (same JVM), LG can reach into SL's internals
directly:

1. MCP server skeleton (JSON-RPC over stdio, dummy tools) — pure LG
2. Connect to SL as library dependency — add to `deps.edn`
3. Expose existing SL browser ops as MCP tools — call `IBrowser` methods directly
4. The sieve — LG defines the JS, executes via SL's `execute-script`
5. Graph writes — LG writes directly to Asami (on classpath via SL)
6. Read step registry — if publicly accessible; **may need SL changes here**

### What SL Needs (When Ready)

- Public/queryable step registry (may be the first SL change needed)
- Graph schema formalization (take what LG prototyped, make it canonical)
- File-backed Asami config
- `sl graph query` CLI
- Hot reload for intents/glossaries
- Test result graph persistence

### Sequencing

Start LG now. Build the hacky version. When gauntlet load allows, come back to SL
with concrete knowledge of what it needs to expose, based on what was awkward or
impossible from LG's side.

---

## Deferred Decisions

- **Fluree vs. Asami long-term:** Asami is good enough to prove the concept.
  Get the data model right first. Migration to Fluree (if wanted for query
  federation, SHACL validation, immutable ledger) is a schema port, not an
  architecture change.
- **Page identity:** Deferred per vision doc. Every observation is its own node.
  "Are these the same page?" is a query-time problem.
- **Annotation UI form factor:** TBD. MVP is conversational (agent or CLI).
  Future could be a real-time collaborative UI.
- **Multi-interface support:** Web only for MVP. The tool API is designed to not
  be torqued by web-specific assumptions.

---

## Open Risks

- **Step registry accessibility.** If SL's step registry isn't publicly queryable,
  this is likely the first SL change needed. Without it, LG can't do the
  step-to-tool-schema transform that makes feature files into tool catalogs.
- **Asami concurrent access.** File-backed Asami with single-writer is fine for
  now but limits workflows where CI and dev might want to write simultaneously.
- **SL's internal API stability.** LG reaching into SL's internals means LG
  breaks when SL refactors. Acceptable for now since both are solo-maintained,
  but creates coupling.
