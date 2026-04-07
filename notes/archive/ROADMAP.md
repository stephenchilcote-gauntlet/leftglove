# ShiftLefter + LeftGlove — Roadmap

**A framework for spec-driven autonomous software development.**

---

## The Thesis

Software development is converging on AI agents that write code. The missing
piece isn't code generation — it's **behavioral accountability**. Today's agents
generate code and hope for the best. There's no shared language between what a
human wants, what a spec says, what the system does, and what users need. When
these diverge, nobody notices until production breaks.

ShiftLefter + LeftGlove solve this by making **behavioral specifications the
control plane** for the entire development lifecycle. The spec isn't just a test.
It's the source of truth that agents develop against, explore against, validate
against, and are held accountable to.

The spec language is **SVOI** — Subject, Verb, Object, bound Interface. It maps
directly to who can do what on which surface. Every agent action, every test
assertion, every user story, every permission boundary is expressible as an SVOI
tuple. The same grammar drives exploration, testing, development, and monitoring.

---

## The Four Planes of Misfit

Quality isn't "tests pass." Quality is the absence of **misfit** — tension
between what different layers of the system believe to be true.

| Plane | Question | What Lives Here |
|-------|----------|----------------|
| **1: Understanding** | What do users actually need? | Usage data, research findings, desire paths |
| **2: Evaluation** | Are our requirements right? | Coverage analysis, gap detection, requirement validation |
| **3: Strategy** | Is our spec correct? | SVOI definitions, feature files, behavioral contracts |
| **4: Implementation** | Does the system work? | Running code, deployed behavior, test results |

Traditional testing only covers Plane 4 ("does it work?"). Misfits between
Planes 1-3 — bad requirements, wrong specs, unmet user needs — are invisible
until someone notices by accident.

This system makes **every plane observable, queryable, and agent-assisted.** A
discrepancy between any two planes is a first-class object: a misfit with
attribution (which planes disagree?) and a resolution path (what human decision
would resolve it?).

---

## What Exists Today

### ShiftLefter (the engine)

Clojure. ~18K LOC. 1029 tests, zero failures. MIT licensed.

- **100% Cucumber-compatible Gherkin parser** with lossless roundtrip
- **SVOI extraction and validation** — step definitions carry behavioral metadata,
  validated against glossaries (subjects, verbs, interfaces)
- **Browser automation** — dual adapter (Etaoin + Playwright), 31-method protocol,
  multi-actor with separate browser profiles per subject
- **Intent system** — named element groups with per-interface bindings (not page
  objects — interface-agnostic, URL-unbound)
- **Asami graph database** — plumbing in place, waiting for schema
- **Bundled nREPL** — REPL-driven exploratory testing from the uberjar
- **CLI** (`sl`) — parse, validate, execute, format, fuzz, debug

ShiftLefter is deterministic. It does exactly what you tell it, precisely and
repeatably. It is the foundation everything else builds on.

### LeftGlove (the perception layer)

Clojure. Greenfield. Architecture approved, MVP task breakdown in progress.

- **MCP server** embedding ShiftLefter (same JVM, direct function calls)
- **The sieve** — deterministic JavaScript DOM inventory (zero tokens on perception)
- **SVOI vocabulary projection** — SL's loaded glossaries/interfaces/intents become
  MCP tools dynamically
- **Graph persistence** — every observation and action writes to Asami automatically
- **The toddler loop** — HITL pipeline: observe → guess → ask → record → graduate

LeftGlove is the interface layer. It lets different hands — agent, human — grip
the same machine.

---

## Horizons

### Horizon 1: Exploration and Cataloging (Current MVP)

**An agent can observe, navigate, and build a knowledge graph of a web
application.**

Point LeftGlove at a URL. The agent runs the sieve, sees what's on the page,
takes actions, sees the result, builds a graph. A human can annotate — "that's a
login form," "that button is admin-only" — and the annotations graduate into SVOI
definitions.

This is the foundation. Without perception and a shared knowledge base, nothing
else works.

**Key deliverables:**

- MCP server with observe, navigate, query, annotate
- The sieve (JS DOM inventory)
- Graph persistence (observations, actions, annotations)
- SVOI-derived tool surface
- Basic toddler loop (agent + human co-construct the graph)

### Horizon 2: Behavioral Contracts as Guardrails

**An agent develops software against behavioral specifications, with ShiftLefter
as the validator.**

The feature file isn't documentation. It's a contract. A development agent
receives a task ("add password reset"), reads the existing behavioral specs to
understand what the system does today, writes code, and validates against
ShiftLefter continuously. The spec is the guardrail — the agent can't ship
something that violates it.

This is fundamentally different from "write code, run tests, fix failures."
The agent operates **within** the spec. The spec constrains the solution space.
When the agent needs to change the spec (new feature, new behavior), that change
is explicit, reviewable, and separated from the code change.

**Key deliverables:**

- Raw SVOI execution path in SL (dispatch from tuples, not step text)
- Public vocabulary API in SL (read glossaries, interfaces, IRs)
- Development agent harness — reads specs, writes code, validates via SL
- Spec-change proposals — agent proposes SVOI additions, human approves
- Continuous validation loop (agent runs SL after every change)

### Horizon 3: Hypothesis-Driven Development

**The system proposes what to build, not just how to build it.**

A research agent generates Plane 1 facts: what do users actually do? What do
they try and fail? What paths do they take that the spec doesn't cover? These
become hypotheses: "users are trying to do X, but the system doesn't support it."

The hypothesis feeds into spec authoring: a proposed SVOI extension ("Subject
:user should be able to Verb :reset-password on Object :account via Interface
:web"). A human approves or rejects the hypothesis. If approved, it becomes a
spec. The spec becomes a development task. The development agent builds it.
ShiftLefter validates it. LeftGlove observes the deployed result and confirms
reality matches the spec.

**The full loop:**

```
Observe users (Plane 1)
  → Hypothesize need (Plane 2)
    → Propose spec (Plane 3)
      → Build implementation (Plane 4)
        → Validate against spec (SL)
          → Observe deployed behavior (LG)
            → Compare to user need (misfit detection)
```

Every step is auditable, every decision is traceable, every misfit is
attributable to a specific plane.

**Key deliverables:**

- Plane 1 data ingestion (usage telemetry, session recording, analytics)
- Research agent — pattern detection, hypothesis generation
- Hypothesis → spec proposal pipeline
- Full-loop integration (all four planes connected)
- Misfit reports with plane attribution and resolution paths

### Horizon 4: The Software Factory

**A self-improving development system where behavioral specs are the lingua
franca between specialized agents.**

Multiple agents, each owning a plane or a concern:

- **Explorer** (LeftGlove) — continuous observation of the deployed application
- **Researcher** — continuous analysis of user behavior and needs
- **Architect** — proposes structural changes based on misfit patterns
- **Developer** — builds against specs, held to behavioral contracts
- **Validator** (ShiftLefter) — deterministic verification, the ground truth
- **Monitor** — watches for behavioral drift between deploys

The specs are the shared language. Every agent reads them. Some agents propose
changes to them. Humans approve changes. The system evolves through a cycle of
observation, hypothesis, specification, implementation, and validation.

ShiftLefter and the SVOI spec layer are the **prime differentiator**. Without
behavioral accountability, you just have agents generating code. With it, you
have agents that can be trusted, audited, and corrected — because their work is
always grounded in a reviewable, executable specification.

---

## What Can Be Built in Any Language

The philosophy is the interface, not the implementation language. ShiftLefter and
LeftGlove are Clojure because of the integration model (same JVM, shared Asami).
But agents and tools that interact through specs and the MCP protocol can be
anything:

| Component | Language constraint | Why |
|---|---|---|
| ShiftLefter core | Clojure | Existing codebase, JVM interop with LG |
| LeftGlove MCP server | Clojure | Same-JVM with SL, shared Asami |
| The sieve | JavaScript | Runs in the browser, deterministic |
| Research agent | Any | Reads usage data, proposes hypotheses |
| Development agent | Any | Calls SL for validation, reads/writes specs |
| Monitoring agent | Any | Observes via LG's MCP tools |
| Analysis/visualization | Any | Reads the graph, produces reports |
| Plane 1 data pipeline | Any | ETL from analytics into the graph |

Team members don't need to know Clojure to contribute meaningfully. The spec
formats (Gherkin, SVOI, EDN glossaries) and the MCP protocol are the integration
points.

---

## Capstone Scope

The capstone is **Horizons 1 and 2**, with a working demo of the full loop:

1. **LeftGlove explores a web application** — agent observes, navigates, builds
   the graph
2. **Human annotates and co-constructs specs** — toddler loop, SVOI definitions
3. **Development agent builds a feature against the spec** — behavioral contracts
   as guardrails
4. **ShiftLefter validates** — deterministic verification that reality matches spec
5. **LeftGlove confirms** — re-observes the deployed application, detects drift
   or success

That's the minimum viable loop. Horizon 3 (hypothesis-driven) and Horizon 4
(software factory) are the long-term vision, but even sketching them in the
capstone presentation shows where this goes.

**Workstreams for a 3-5 person team:**

| Workstream | People | Clojure? | Notes |
|---|---|---|---|
| SL modernization + APIs | 1 | Yes | Clean the codebase, add SVOI execution path |
| LG core (MCP, bridge, graph) | 1 | Yes | The MCP server and SL integration |
| The sieve | 1 | No (JS) | DOM inventory, taxonomy, region paths |
| Agent behavior + prompts | 1 | Minimal | Exploration strategy, dev agent guardrails |
| Philosophy, docs, demo | Shared | No | Deck, onboarding, capstone presentation |

---

## Open Questions

- **Plane 1 data sources:** What usage data is available for the demo? Real
  analytics, synthetic, or simulated?
- **Development agent scope:** For the capstone demo, what does "build a feature"
  look like? Full feature or constrained example?
- **Graph federation:** Multiple agents writing to the same graph, or separate
  graphs with merge?
- **Team composition:** Who brings what skills? Shapes which workstreams are
  feasible.
- **Demo application:** What app do we point this at for the capstone demo? A
  purpose-built toy app, or something real?

---

## See Also

- [notes/ecosystem-projects.md](notes/ecosystem-projects.md) — Standalone
  projects that use ShiftLefter as a foundation. Good candidates for team members
  who want to own something end-to-end in any language.
