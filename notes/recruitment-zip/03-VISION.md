# ShiftLefter + LeftGlove — Unified Vision

**A framework for spec-driven autonomous software development.**

**Status:** Pre-capstone, architecture approved, code not started (LG), modernizing (SL)
**Last updated:** 2026-04-01
**Supersedes:** ROADMAP.md, cartographer.md, notes/ecosystem-projects.md

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

## The Planes

### Users, Misfit, Systems

A **user** is something with agency — a person, organization, or other system —
that has goals and seeks homeostasis. We call them users when they're at the
boundary of a system. A **stakeholder** cares about the system's outcomes but
doesn't interact at the boundary. Regulators, executives, the dev team itself.

**Misfit** is the gap between what a user wants and what the world provides. The
world pushes back.

A **system** is a set of forms and processes that bridge that misfit. That is
their entire purpose. And this definition composes — a microservice is a system,
the app stitching ten microservices together is a system, the company's entire
output is a system. The boundary moves; the definition holds.

Quality isn't "tests pass." Quality is the absence of misfit — the system
successfully bridges the gap between what users want and what the world provides.

### Five Layers of Any System

| Plane | Name | In a phrase |
|-------|------|-------------|
| **0** | **Reality** | The world |
| **1** | **Observation** | What we know |
| **2** | **Orientation** | What we care about |
| **3** | **Design** | How we'll fix it |
| **4** | **Artifact** | The thing itself |

The planes map to OODA (Observe-Orient-Decide-Act) and the scientific method
(Observation → Hypothesis → Experiment Design → Experiment).

**Plane 0 — Reality.** You cannot directly mutate Plane 0. When you want to
create ripples on a pond, you can't point at the pond and say "create ripple."
You pick up a stone, learn to throw it, aim, chuck it, and see what happens.
All your interactions with the world are experiments. It's a credit to our
built models that we so easily forget that.

**Plane 1 — Observation.** The plane of infinite facts. Literally infinite.
Inexhaustible. No point in even trying to catalogue it all. Every fact ideally
has provenance, scope, and duration. Facts can be superseded by later facts.
Anything you know is represented here, and it's always partial. Regulations,
technical limitations, human nature, market conditions, usage traces — every
trace emitted from a deployed system lives here.

**Plane 2 — Orientation.** Which misfits, for which users, will we solve? We
take our sampling of Plane 1 and draw a hypothesis. We may have sampled the
wrong facts. We may have miscalculated what users want, or how hard it already
is for them. But this is our working hypothesis. **This is the only thing you
actually care about.** Everything else — every metric, every process, every
tool — is derivative of this. If you can't at least budge this, your system
is a ghost town.

**Plane 3 — Design.** The abstract workflow. The blueprint. Architecture, data
model, user flows on a whiteboard. An experimental design for what we'll build
to address the Plane 2 misfits. Not the experiment itself — you're deciding
what to build, and in what shape.

**Plane 4 — Artifact.** The built thing. Code on a server, an app in someone's
hand. Where most people think the work happens — but it's the narrowest kind.
The kind an LLM does more of every week. The interesting decisions were made
above.

**Not always top-down.** You often start at Plane 4 and backfill upward —
looking for gaps, contradictions, redundancies. Checking whether what you have
is actually supported by what's above it. This model isn't just a build
sequence. It's a diagnostic tool for whatever you're standing in front of
right now.

### Examples Across Planes

- **Plane 1:** "HIPAA requires encryption at rest." "60% of traffic is mobile."
  "Users abandon checkout after 3 clicks." "A competitor just launched same-day
  delivery." "Users keep trying to use the search bar as navigation."
- **Plane 2:** "Checkout abandonment is our biggest revenue leak — simplify it."
  "Users expect same-day delivery now." "The search bar should also work as
  navigation." "We need mobile support."
- **Plane 3:** "Checkout should be: cart → shipping → payment → confirm."
  "Login supports password, token, and biometric." `:user | checkout | cart | :web`.
  Intent region definitions, feature files, macro contracts.
- **Plane 4:** Code compiles. Tests pass. The button is where the spec says.
  Admin can't see guest-only content.

### Bugs Have Planes Too

| Plane | The bug | What it looks like |
|-------|---------|--------------------|
| **4** | It doesn't work | Good idea, I want to use it, but I physically can't. Broken. |
| **3** | It's stupid | It works, but makes you jump through hoops. The workflow is dumb. People make desire paths through your software because the paved ones don't go where they need. |
| **2** | Nobody cares | It works fine. Nobody wants it. Big feature, big fanfare, no adoption. |
| **1** | Wrong from the start | Shows up as a 2, 3, or 4 bug. The observations were wrong. Everything downstream inherited the error. |

Traditional testing only covers Plane 4 ("does it work?"). Misfits between
Planes 1-3 — bad requirements, wrong specs, unmet user needs — are invisible
until someone notices by accident.

### The Loop — Synthesis and Verification

This is not a simple 1→2→3→4→1 sequence. It's a **clock** with 8 stations.

**Synthesis** descends the left side (stations 1-4): gathering facts, identifying
misfits, designing solutions, building the artifact.

**Verification** ascends the right side (stations 5-8): checking whether what you
built matches what you intended, all the way back up.

| Notation | Plane | Direction | Question |
|----------|-------|-----------|----------|
| `1s` | Observation | Synthesis ↓ | What's true about the world? |
| `2s` | Orientation | Synthesis ↓ | What misfits will we solve? |
| `3s` | Design | Synthesis ↓ | What shape will the solution take? |
| `4s` | Artifact | Synthesis ↓ | Build the thing |
| `4v` | Artifact | Verification ↑ | Did we build it right? |
| `3v` | Design | Verification ↑ | Was the plan right? |
| `2v` | Orientation | Verification ↑ | Did we pick the right problems? |
| `1v` | Observation | Verification ↑ | Do we still know what we think we know? |

`1v` feeds back to `1s` — new observations from the deployed system become
Plane 1 facts for the next cycle. A greenhouse, not a factory. You're not just
verifying the old build. You're feeding the next one.

**The opportunity:** If we separate the planes cleanly, we can put proper agents
at each of the eight stations. Purpose-built, specialized agents at and between
every node in the circle. This is a — if not the — way to get to self-correcting,
continually improving, dynamically built software.

**The reality:** Most organizations mash Planes 1, 2, and 3 into a single PRD.
Even the best teams squish them together. Some bigger orgs can verify Plane 2
and 3 assumptions, but it's rarely regular or properly segregated.

### Misfit as First-Class Object

A discrepancy between any two planes is a first-class object: a misfit with
attribution (which planes disagree?) and a resolution path (what human decision
would resolve it?). Misfit isn't only discovered — it can be **created by context
change**. If a competitor delivers the same thing faster, the world changed but
your system didn't, and what was fit is now misfit.

Quality defined as absence of misfit means:

- **Agent desire vs world fact** — the primary misfit shape
- **Agent desire vs agent desire** — multi-stakeholder conflict
- Not "world vs world" — without a user, there's no quality-relevant complaint

### Generative-Source Warning

If the spec becomes the source from which both the application and its tests are
derived, a new failure mode appears: the system can become self-consistent without
being reality-consistent. "Tests passing" can degenerate into "the generator
respected itself." The framework must preserve grounding signals not derived from
the spec itself — Plane 1 traces, incidents, stakeholder decisions — and treat
the spec as a continuously challenged hypothesis, not an epistemic authority.

---

## SVOI — Subject, Verb, Object, Interface

### What It Is

Every action in a system can be expressed as an SVOI tuple:


| subject | verb | object | interface|
|--|--|--|--|
| :admin  | clicks | login-button | :web|
| :user/alice | enters | email-field "test@example.com" | :web|
| :system/cron | triggers | nightly-report | :api|


This explicitness cascades into several capabilities:

### Triples Form a Graph — Shape TBD

SVOI tuples are the atomic behavioral unit. They form a graph — but the exact
topology is an open design question. The naive formulation ("each S, V, O is a
node, each edge is an assertion") is one possible projection, but probably not
the right one.

**Contractions:** Interface-level actions (type username, type password, click
submit) contract into domain-level concepts ("login"). The contracted node lives
at a different resolution than its constituents. The graph is likely
multi-resolution — interface actions at one level, domain verbs at another, use
cases at another.

**Sequences matter:** Three triples on the same page aren't independent — they're
ordered, and the ordering changes what's possible next. The graph needs temporal
structure, not just a bag of triples.

**State:** `admin | clicks | delete-button` means different things depending on
what page you're on, what's selected, what preceded it. Triples alone don't
carry enough context.

Getting this graph shape right is one of the hardest problems in the project and
will require multiple passes. The queries we want to answer (reachability,
coverage, permission analysis) will drive the schema.

### The Intent Surface

Whatever shape the graph takes, it represents the boundary where users interact
with the application — the **intent surface**. This is a computable,
deterministic surface. You can compute:

- **Reachability:** Can user X get from page A to action B?
- **Distance:** How many clicks from dashboard to issue detail?
- **Permissions:** Are admin paths blocked for guests?
- **Coverage:** Are all intent surfaces tested?
- **Mutation testing (heckling):** Flip admin → guest on all paths, verify they fail.

### Domain Verbs vs Interface Verbs

The graph has two layers:

- **Concrete:** `user | enters | email-field`, `user | clicks | submit-button`
- **Projection:** `user | login` (a domain verb composed of concrete actions)

Domain verbs remain unconstrained human language. Interface verbs are the
enforceable primitive layer. Each interface (web, iOS, Android, SMS, IVR, email,
API) has a finite set of verbs — a web browser can click, enter, navigate, select,
hover, scroll. An API can GET, POST, PUT, DELETE. These are the primitives.

### Subjects Are Validated Against Glossaries

Subjects must exist in the glossary — DDD's ubiquitous language, instantiated
and tied from code to tests. New subjects require explicit glossary entries.

**Subject types and instances:** Subjects have a two-level hierarchy. Types are
roles (`:user`, `:admin`, `:guest`). Instances are session handles
(`:user/alice`, `:user/bob`). The canonical Gherkin form is `:user/alice`.
Singletons (`:guest`) use the type keyword directly.

```clojure
{:subjects
 {:user  {:desc "Standard application user"
          :instances [:alice :bob :carol]}
  :admin {:desc "Administrative user with elevated privileges"
          :instances [:pat :admin-banned :admin-no-disk]}
  :guest {:desc "Unauthenticated visitor"}}}
```

Type is grouping, not equivalence. Instances of a type may or may not be
interchangeable. Subject identity is fixed for a scenario — it's a session
handle, not a permission level.

**Why instances exist — multi-user in a single test:**

```gherkin
When :user/alice draws a rectangle at 100, 200
Then :user/bob should see the rectangle
When :admin/pat tries to delete the rectangle
Then :admin/pat should see "Account suspended"
```

Each instance gets its own browser session. Alice and Bob are both `:user` type
but are separate session handles — separate cookies, separate state, separate
browser windows. This makes multi-actor scenarios (collaboration, permissions,
real-time sync) trivial to express.

### SVO Is a Representation, Not an Ontology

SVO is powerful where it fits. It does NOT claim universal coverage. Domains
dominated by time, concurrency, modality, uncertainty, or continuous control
strain the model. Guardrail: when SVO strains, shift to complementary
representations rather than forcing it. Keep SVO as the default backbone where
it's clean; avoid making it a universal choke point.

### Every PR Gets a Graph Diff

For every code change, you get not just a code diff but:

- **Glossary diff:** New subjects, verbs, objects, interfaces, intent regions
- **Graph diff:** New paths, removed paths, changed reachability
- **Intent surface diff:** What users can now do that they couldn't, and vice versa

This is deterministically computable, not a manual click-through.

### Heckling — Subject Perturbation

Once you have the graph, you can systematically rerun tests with altered
subjects. Run admin tests as guest. Run admin tests as deactivated admin.

The framework doesn't prescribe what "appropriate failure" looks like — that's
app-specific. It packages ambiguous outcomes for human or LLM review. If a
machine can do 80% and leave 20% to humans, that's still valuable.

---

## Intent Regions and Intent Surfaces

### The Problem

Page objects are the wrong universal. Mobile doesn't map cleanly to pages. APIs
don't map to pages. Even SPAs increasingly don't. We need a cross-interface
"place" concept.

### Intent Region (shorthand: intent)

A cross-interface semantic region of interaction space: a named cluster that
packages:

- (a) the relevant nouns/verbs and their contracts
- (b) admissible entry/arrival mechanisms
- (c) transitions to other regions
- (d) verification points

### Intent Surface (subset)

The affordance set of an Intent Region — nouns/verbs + contracts exposed at that
region, independent of how any interface realizes them.

Rule of thumb: if you mean *where you are / how you get there / where you can go
next* → Region. If you mean *what you can do here / what contracts apply* →
Surface.

### Web-Only Onboarding Equivalence

For a web-only app, an Intent Region is effectively a **page object++**: the same
locator-driven interaction bundle, plus explicit arrival/verification/transitions
and a stable semantic name. The payoff is forward compatibility — when you add a
second interface, you add a new interface and its bindings to the *same* Intent
Region, not a new page object.

### Current Implementation State

**Flat intent regions work in SL.** Loader, resolver, state management. `Login.submit`
resolves to `{:css "#login-btn"}` per interface. Enforcement modes (strict/warn/off)
for unknown objects.

**Not yet built:** Arrival points, transitions, verification points, contracts
(`requires`/`establishes`). This is EP-035 in the SL backlog.

### Objects Move from Interface to Intent

Semantic objects belong to the intent region; interfaces supply bindings. This is
the key separation from page objects:

```edn
{:intent/id :intent/auth-session
 :intent/surface
 {:objects
  {:username {:role :input}
   :password {:role :secret-input}
   :submit   {:role :action}
   :forgot-password {:role :navigation}}
  :actions #{:authenticate :request-password-reset :logout}}

 :interfaces
 {{:type :web :name :main}
  {:bindings {:username {:css "#username"}
              :password {:css "#password"}
              :submit   {:css "#login-btn"}}}

  {:type :api :name :v1}
  {:bindings {:login-endpoint {:endpoint "/v1/login"}
              :token-path     {:json-pointer "/token"}}}

  {:type :mobile :name :ios}
  {:bindings {:username {:accessibility-id "username"}
              :password {:accessibility-id "password"}
              :biometric {:system-affordance :face-id}}}}}
```

### Realization Paths

A single intent (goal) can be realized via multiple valid routes. These variants
matter because they change session state, permission context, caching, and UI
lifecycle. A **realization path** is a sequence over cross-interface primitives:

- **Arrival point:** the region you land in
- **Entry path:** the mechanism and route used to arrive
- **Transition:** movement from one intent region to another
- **Verification point:** an externally observable assertion

Realization paths become routes through intent regions, using specific entry
mechanisms and transitions, producing verification evidence along the way.

**Example — three paths to the same place:**

A user wants to edit their profile settings.

1. **Normal navigation:** Home → click avatar → click "Settings" → edit.
   Session is warm, nav state is populated, breadcrumbs exist.
2. **Deep link:** Paste `app.com/settings/profile` directly. No nav state,
   no breadcrumbs, possibly cold cache. Does the page still work?
3. **Auth redirect:** Paste the deep link while logged out. Login handler
   catches it, redirects to login, then redirects back to settings after
   auth. Does the original destination survive the redirect? Is session
   state correct?

Same intent region (`:intent/profile-settings`), same goal, three different
entry paths — and each one exercises different initialization, state, and
lifecycle code. Bugs routinely hide in paths 2 and 3 because developers only
test path 1.

### Desire Paths

In physical environments, people carve shortcuts through grass. In software, users
can only do what we allowed them to do. **Desire paths** are observed emergent
behavior — workarounds users invent. **Insertion points** are explicitly designed
affordances that allow emergence safely.

Plane 3 testing becomes: detect where the world is too rigid, and where
user-invented paths are begging to be legitimized. This bridges desire paths
(observations) and realization paths (designed variants).

### Contracts on Macros and Preconditions

Macros (domain-level abstractions that expand into interface-specific steps) can
carry contracts:

- `:requires` — what must already be true
- `:establishes` — what becomes true after execution

This enables composable preconditions, interface capability gating (biometric auth
only on mobile), and early detection of missing prerequisites.

**Guardrail:** Contracts describe test-harness facts and externally observable state,
not internal authorization logic. They must not become a shadow SUT.

**Example — composable login precondition:**

```
Macro: Authenticated
  args:    {actor: :keyword, interface: :keyword, mode: :keyword}
  requires:  #{}
  establishes: #{:session/present}
  establishes-by-mode:
    :password   #{:authn/mode.password}
    :biometric  #{:authn/mode.biometric}
    :token      #{:authn/mode.token}
```

Now a use case can declare `Authenticated(actor=:staff, mode=:biometric)` as a
precondition. The system checks which interface realizations can satisfy
`:authn/mode.biometric` — only iOS and Android advertise that capability, so the
use case is automatically excluded from `:web`. No hardcoded "skip this on web"
logic. The contract makes it structural.

A later macro like `TransferFunds(amount=500)` might declare
`requires: #{:session/present, :authn/mode.biometric}` — funds transfer demands
biometric auth. The system knows at planning time whether the precondition chain
is satisfiable for a given interface, before any test code runs.

### Fixture Contracts — Test Data as Vocabulary

The same contract mechanism solves the test data problem. Fixture macros like
`UserExists(ref=:alice, attrs={:email "alice@test.com", :role :user})` declare
what world state a test needs. SL enforces the vocabulary and contracts — teams
provide the implementation (DB seeds, API calls, factories). The attrs map IS
the test data: the fixture established it, the macro expansion references it,
no hardcoded strings in steps.

Equivalence partitions fall out naturally — `{:status :active}` vs
`{:status :banned}` vs `{:quota :exceeded}` are different attrs on the same
macro, each representing a partition of the state space.

Context packs (the deferred concept from subject-types-and-instances) are
subsumed: `UserHasContext(actor=:pat, ctx=#{:banned})` is just a fixture macro
that requires `:user/ref-present` and establishes `:ctx/banned`. Multiple
contexts compose without combinatorial explosion.

**See [notes/fixture-contracts.md](notes/fixture-contracts.md)** for the full
design, contract chain examples, equivalence partitions, and connection to
the graph.

### Cross-Interface Use Cases

Some use cases must span multiple interfaces to succeed:

- Password reset: web request → SMS OTP → web submit
- Device pairing: TV shows QR → mobile scans → TV authenticates

These are single Plane 3 use cases whose steps cross channels. Modeled via
channel handoffs and out-of-band artifacts (OTP codes, pairing tokens) using the
same contract mechanism.

**Why SVOI makes this tractable:**

```gherkin
# A password reset that crosses web and SMS.
# Today, the interface is IMPLICIT — determined by which stepdef matches,
# not stated in the Gherkin. Each stepdef declares its interface in metadata.
# The runner routes to the right adapter automatically.

When :user/alice requests a password reset        # matches a :web stepdef → browser
Then :system sends an OTP to :user/alice          # matches an :sms stepdef → SMS harness
When :user/alice reads the OTP                    # matches an :sms stepdef → SMS harness
And :user/alice submits the OTP and new password  # matches a :web stepdef → browser
Then :user/alice should be logged in              # matches a :web stepdef → browser
```

The interface is a first-class dimension of every SVOI tuple — the machinery
to route steps to the right adapter (browser, API client, SMS harness) already
exists. Each stepdef declares its interface in metadata, and the runner
provisions the correct capability per interface.

**Open design tension:** The interface is currently implicit. This works well
when you're in one interface (overwhelmingly web), but in cross-channel
scenarios like the above, a reader has to know which stepdef matches to know
which interface is active. SL's philosophy is explicitness, and implied
interfaces bend that. Whether the interface should become explicit in the step
text (e.g., `on :sms`), remain implicit, or use some hybrid is an unsettled
question. But the underlying model already carries the interface — the SVOI
tuple always has that column, even if the syntax doesn't surface it yet. The
question is notation, not architecture.

---

## What Exists Today

### ShiftLefter (the engine)

Clojure. ~18K LOC. 1029 tests, zero failures. MIT licensed.

| Component | Status |
|---|---|
| 100% Cucumber-compatible Gherkin parser | Working |
| SVOI extraction and validation | Working |
| Browser automation — dual adapter (Etaoin + Playwright) | Working (both registered, sequential) |
| Multi-actor with separate browser profiles per subject | Working |
| Subject types/instances (`:user/alice`) | Working |
| Intent regions — flat, with per-interface bindings | Working |
| Asami graph database — lifecycle plumbing | Working (init/transact/query, not wired to CLI) |
| Bundled nREPL | Working |
| CLI (`sl`) — parse, validate, execute, format, fuzz, debug | Working |
| Test fixture server (login, dashboard, multi-user) | Exists in `/test/`, needs verification |
| `sl compile` (read project → populate graph) | **Not built** — research doc only |
| Parallel multi-config execution | **Not built** — researched, designed |
| Full intent regions (arrival, transitions, contracts) | **Not built** — EP-035 |
| `sl agent-prompt` (project-specific LLM context) | **Not built** — GP.005 |

ShiftLefter is deterministic. It does exactly what you tell it, precisely and
repeatably. It is the foundation everything else builds on.

### LeftGlove (the perception layer)

Clojure. Greenfield. Architecture approved, MVP task breakdown complete, zero code.

- **MCP server** that communicates with ShiftLefter (via files, CLI, and nREPL)
- **The sieve** — deterministic JavaScript DOM inventory (zero tokens on perception)
- **SVOI vocabulary projection** — SL's loaded glossaries/interfaces/intents become
  MCP tools dynamically
- **Graph persistence** — every observation and action writes to Asami automatically
- **The toddler loop** — HITL pipeline: observe → guess → ask human → record →
  graduate to SL artifact

LeftGlove is the interface layer. It lets different hands — agent, human — grip
the same machine.

**Example — vocabulary projection in practice:**

SL has a project loaded with subjects `:user/alice` and `:user/bob`, the `:web`
interface with verbs `clicks`, `enters`, `reads`, and an intent region `Login`
with elements `email`, `password`, `submit`. LG reads this vocabulary and
dynamically generates MCP tools that an agent can call:

```
Tools available:
  observe()                          — run the sieve, see what's on the page
  act(subject, verb, object)         — e.g. act(:user/alice, :clicks, Login.submit)
  query_graph(datalog)               — query accumulated observations
  annotate(target, label)            — write semantic label

Vocabulary (from SL glossaries):
  subjects: [:user/alice, :user/bob]
  verbs:    [:clicks, :enters, :reads]  (on :web)
  objects:  [Login.email, Login.password, Login.submit]
```

The agent sees a constrained, validated palette — not raw HTML, not free-text
commands. It can only reference subjects, verbs, and objects that exist in the
glossary. If the project loads more vocabulary (new intent regions, new
interfaces), the tool surface grows automatically. The agent's available actions
are a live projection of what SL knows about.

---

## Key Concepts

### The Sieve

A deterministic function that inventories a surface into structured data. Runs in
the target environment (browser JS for web), returns everything the agent needs to
know about what's there — elements, labels, state, positions, semantic regions.
Burns zero agent tokens on perception.

**The sieve is a protocol, not just a JS function.** Each interface gets its own
sieve implementation. The web sieve inventories the DOM. An Android sieve would
inventory the accessibility tree. An API sieve might return available endpoints.
The abstraction is: "given an interface, produce a structured inventory of what's
there."

The web sieve is the first and hardest implementation. It's also the most useful.

**See [notes/sieve-contract.md](notes/sieve-contract.md)** for the full output
contract, element taxonomy, example data, and observe() return shape.

### The Bridge

LG's integration layer with SL. LG communicates with SL as a separate process —
file reads for glossaries, CLI calls for test execution, nREPL for programmatic
access. The bridge isolates LG code from SL's details — when SL changes, only
bridge code updates. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full
integration model.

### The Graph

Asami-backed knowledge base of observations, actions, and annotations. Every
`observe` and every action automatically persists. The graph is the shared
artifact that agents and humans co-construct through exploration.

The graph is also the riskiest piece. We can store things, but the schema will
need multiple passes before it supports interesting queries (cross-plane analysis,
permission discovery, use case derivation). This is inherently iterative.

SL already has Asami plumbing (`init-db!`, `transact!`, `query`). LG builds on
top of it.

### The Toddler Loop

A HITL pipeline: observe → guess → ask human → record answer → graduate to SL
artifact. Deterministic at its core (no agent required), enhanced by agent
intelligence. The human teaches the system what things mean.

The sieve and the human speak the **same vocabulary** — pattern names like
`dropdown`, `widget_expand`, `modal_open` aren't internal sieve categories,
they're the shared language at every level. The sieve proposes classifications,
the human confirms or overrides, the system records both the same way. This
means the system degrades gracefully from "fully automatic" (well-structured
modern app) to "fully manual" (cantankerous legacy app) without changing the
data model. The effort scales with the app's quality, not the system's
limitations.

The toddler loop decouples from the graph — it can work early by dumping to flat
files, with graph persistence wired in later. Glossary building is the primary
use case: sieve the page, auto-classify what's obvious, ask the human about the
rest, record everything to the glossary.

**See [notes/toddler-loop.md](notes/toddler-loop.md)** for the full pipeline,
shared vocabulary tables, observation loop, diff-based classification, interaction
medium, and glossary building workflow.

### SVOI

Subject, Verb, Object, bound Interface. SL's behavioral grammar. Every graph edge
maps to an SVOI tuple. Every exploration action is self-documenting in a grammar
that maps directly to test cases. LG doesn't own SVOI — SL does — but LG produces
raw material that gets compiled into SVOI.

---

## ShiftLefter as Oracle

ShiftLefter is not a single agent role — it's **infrastructure that multiple roles
query.** The intent surface graph is a source of truth.

| Role | How it uses ShiftLefter |
|---|---|
| **Explorer (LG)** | Continuous observation of the deployed application |
| **Architect** | Plans features — graph diff shows what intent surfaces a new feature requires |
| **Developer** | Checks while building — "your changes alter the intent surface in these ways" |
| **Validator (SL)** | Deterministic verification, the ground truth |
| **Monitor** | Watches for behavioral drift between deploys |
| **User Advocate** | Evaluates completeness — "are all journeys navigable in under N clicks?" |

### Maintaining the Oracle

Someone needs to build and maintain the graph:

- Extract triples from existing tests/code (the sieve)
- Maintain the glossary (ubiquitous language)
- Validate new triples against the glossary
- Compute graph diffs
- Run the sieve on brownfield apps
- Keep the intent surface in sync with the evolving codebase

This is the **Cartographer** role — maps the territory of user intent. Creates
the charts that all other agents navigate by.

### The Naming Chain

- **Scout** surveys the land
- **Cartographer** maps it
- **Tower** plans routes across the map
- **Trench** builds the roads
- **Warden** patrols them
- **The user advocate** walks them as a newcomer would (name TBD — Steward, Curator, or Docent)
- **Herald** writes the travel guide

The user advocate role is distinct from Warden (code integrity) and Herald
(outward-facing voice). It asks "is this usable and complete?" not "is this secure
and correct?" or "how do we present this?"

---

## The Screenplay Critique

The Screenplay pattern (Serenity BDD) is the closest prior art to what SL does
with actors and composition. It solves a real problem — Page Object god-classes —
but solves it at the wrong layer.

**Screenplay's approach:** Five Java abstractions (Actor, Ability, Task,
Interaction, Question), a class per workflow, bytecode instrumentation. The
composition lives entirely in test code. The BA writing Gherkin never sees it.

**SL's approach:** Composition lives at the Gherkin layer, in data. SVOI makes
actors explicit in the spec, not buried in Java classes. Intent regions replace
page objects with cross-interface semantic regions. The test file IS the
behavioral specification — no parallel class hierarchy needed.

The distinction: Screenplay builds a shadow SUT in test code. SL keeps the
validated vocabulary grounded in declared glossaries + interfaces, not a parallel
model of the application.

---

## Relationship to Model-Based Testing

Traditional MBT builds a formal model upfront (state machines, transition
systems) and generates tests from it. SL+LG inverts this: observe the system,
build the model incrementally through exploration, graduate observations into
specs.

The SVOI graph IS a behavioral model — observations are states, actions are
transitions, intent regions are named state clusters. But the model emerges
bottom-up from agent-assisted exploration rather than being designed top-down
by an expert.

Same destination, opposite starting point. MBT assumes you already understand
the system. This system builds understanding by looking at the thing.

---

## The Core Roadmap

See `notes/roadmap-diagram.html` for the visual diagram.

### The Trunk — Happens Regardless

The core build path for LeftGlove. Each piece is progressive — v1 is minimal and
functional, later passes fill in.

```
Sieve protocol + web implementation
  │
  ├── MCP server (parallel with sieve)
  │
  └── Bridge (connects sieve to SL, provisions browsers)
        │
        └── Toddler loop v1 (observe → guess → ask → record, flat storage)
              │
              └── Graph persistence (move toddler loop data into Asami)
                    │
                    └── SVOI vocabulary projection (SL glossaries → MCP tools)
```

### SL Work — Modernize and Finish

- Apply GitLab patches to GitHub (small delta, enables teammates)
- Verify fixture server works (exists in `/test/`, needs confirmation)
- `sl agent-prompt` GP.005 (makes SL agent-friendly for teammates' Claudes)
- Intent regions EP-035 (finish: arrival, transitions, verification, contracts;
  note what's blocked on undecided design questions)

### Branch Roads — The Menu

These are independently ownable workstreams. Each plugs into the trunk at a
defined point. Each has a minimum viable version. People browse, get excited
about something, and go. Or they come up with something we haven't thought of.

**Branch A: Graph Depth** — Iterative schema rework, cross-plane query design,
use case derivation. The "make it purr" work. Open-ended, iterative.
*Forks from:* graph persistence.

**Branch B: Non-Web Sieves** — The sieve is a protocol, not a single
implementation. Each interface gets its own sieve and its own adapter.
Writing a sieve for a new interface is a **standalone project** anyone can
own end-to-end in any language:

- Android accessibility tree sieve
- iOS sieve
- REST API sieve (endpoints, methods, response shapes)
- GraphQL sieve (schema introspection, queries, mutations)
- SMS sieve (available commands, response patterns)
- IVR / phone tree sieve (menu options, DTMF paths)
- Email sieve (templates, dynamic fields, link targets)

Each is self-contained: define what "inventory this interface" means, write
the sieve function, define the output shape. Doesn't require Clojure.
*Forks from:* sieve protocol defined.

**Branch C: Ecosystem Projects**

- **Demo videos from specs** — Run SL tests as scripted browser sessions, capture
  video, narrate with AI voice. The spec IS the script. When the product changes,
  demos update automatically. Any language.
- **Use case ↔ feature file mapping** — Bidirectional mapping between business
  use cases and executable specs. Agent reads use cases, proposes feature files.
  Gaps between use cases and specs are misfits (Plane 2 ↔ 3). Any language.
- **SVOI observability stubs** — Generate instrumentation that tracks user behavior
  at the SVOI semantic level, not DOM level. Production monitoring speaks the same
  vocabulary as tests. Any language.
- **Cross-interface compatibility matrix** — Falls out of use case mapping. Once
  features are mapped to SVOI tuples bound to interfaces, you get a feature ×
  interface matrix for free.

*Forks from:* SVOI vocabulary accessible.

**Branch D: SL Enhancements** — Raw SVOI execution path (dispatch from tuples,
not step text), public vocabulary API, `sl agent-prompt`. Clojure, benefits from
SL knowledge. *Forks from:* bridge (SL callable).

**Branch E: Capstone Deliverable** — Philosophy, narrative, demo script,
presentation deck. The four planes, the screenplay critique, the SVOI thesis —
there's enough intellectual material for a compelling presentation. Depends on
everything else being far enough to demo. *Forks from:* system working.

**Branch F: `sl compile` + Graph Visualization** — Build the compile orchestrator
(read glossaries/stepdefs → Asami), export to SQLite, visualize. Greenfield —
spike exists in docs only. Dashboard/visualization layer can be any language
reading SQLite. A WebGL graph walker of your application is in play here.
*Forks from:* Asami plumbing.

**Branch G: Dual-Browser Demo** — Two browsers (Playwright + WebDriver) executing
the same feature simultaneously. Pre-req: isolated step registry via `with-registry`
dynamic var (Clojure). Visually compelling. Well-researched and designed.
*Forks from:* both adapters working (already true).

**Branch I: Demo App Expansion** — Expand SL's fixture server into a richer
demo target. More pages, CRUD, permission boundaries. Any language. Good for
someone who wants to build a web app that the whole system tests against.
*Forks from:* fixture server verified.

### What Can Be Built in Any Language

The philosophy is the interface, not the implementation language. SL and LG are
Clojure because of the integration model (shared ecosystem, nREPL access). But agents
and tools that interact through specs and the MCP protocol can be anything:

| Component | Language constraint | Why |
|---|---|---|
| ShiftLefter core | Clojure | Existing codebase, JVM interop |
| LeftGlove MCP server | Clojure | Same-JVM with SL, shared Asami |
| The sieve (web) | JavaScript | Runs in the browser |
| Non-web sieves | Any | Per-interface implementation |
| Research/monitoring agents | Any | Read usage data, propose hypotheses |
| Development agents | Any | Call SL for validation, read/write specs |
| Graph visualization | Any | Read Asami or SQLite export |
| Ecosystem projects | Any | Interact via MCP protocol or graph |
| Demo app | Any | SL tests against it |

Team members don't need to know Clojure to contribute meaningfully.

---

## Horizons

### Horizon 1: Exploration and Cataloging (Current MVP)

An agent can observe, navigate, and build a knowledge graph of a web application.

Point LeftGlove at a URL. The agent runs the sieve, sees what's on the page,
takes actions, sees the result, builds a graph. A human can annotate — "that's a
login form," "that button is admin-only" — and the annotations graduate into SVOI
definitions.

**Key deliverables:** MCP server with observe/navigate/query/annotate. The sieve.
Graph persistence. SVOI-derived tool surface. Basic toddler loop.

### Horizon 2: Behavioral Contracts as Guardrails

An agent develops software against behavioral specifications, with ShiftLefter
as the validator.

The feature file isn't documentation. It's a contract. A development agent
receives a task, reads the existing specs, writes code, and validates against SL
continuously. The spec constrains the solution space. When the agent needs to
change the spec, that change is explicit, reviewable, and separated from the code
change.

**Key deliverables:** Raw SVOI execution path in SL. Public vocabulary API.
Development agent harness. Spec-change proposals. Continuous validation loop.

### Horizon 3: Hypothesis-Driven Development

The system proposes what to build, not just how to build it.

A research agent generates Plane 1 facts: what do users actually do? What paths
do they take that the spec doesn't cover? These become hypotheses that feed into
spec authoring.

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

### Horizon 4: The Software Factory

A self-improving development system where behavioral specs are the lingua franca
between specialized agents. Multiple agents, each owning a plane or a concern.
The specs are the shared language. The system evolves through observation,
hypothesis, specification, implementation, and validation.

ShiftLefter and the SVOI spec layer are the prime differentiator. Without
behavioral accountability, you just have agents generating code. With it, you have
agents that can be trusted, audited, and corrected.

---

## LLM-Powered Glossary Generation

A future (but near-term) capability: using an LLM with browser access to
automatically generate, validate, and maintain glossaries.

### Capabilities

- **Element discovery** — Query DOM for all interactable elements, extract tags,
  labels, selectors, positions, hierarchy
- **Glossary gap analysis** — Compare discovered elements against existing glossary,
  report what's missing
- **Drift detection** — Run periodically, detect when the page changes vs glossary
- **Coverage analysis** — What percentage of the page is glossaried? What elements
  exist in glossary but are never tested?
- **DOM hierarchy → nesting** — DOM tree directly maps to widget/collection
  structures. LLM detects repeated patterns ("this structure appears 8 times")

### The Interactive Walkthrough

The killer UX of the toddler loop applied to glossary building:

1. LLM visits URL, discovers all elements via sieve
2. Adds to glossary with orphan prefix
3. For each orphan: highlights in browser, shows best guess, human speaks the name
4. "yes, yes, that's the cart button, yes, skip" — 50 elements in 5 minutes

The glossary is **persistent semantic memory**. Every future LLM session reads it
and immediately understands the application. You're not just testing — you're
building a knowledge base.

### The Format Almost Doesn't Matter

The LLM is both primary producer and primary consumer of the glossary. If flat
gets verbose, the LLM doesn't care. If nesting would be cleaner, the LLM can
generate and maintain it. Human role: teach semantic meaning. LLM role: everything
structural.

### Analytics-Driven Test Generation

Production analytics events are behavioral recordings. Mine them for common user
flows, map events to glossary elements, generate Gherkin scenarios that mirror
real usage. Tests that match what users actually do, not what devs imagine.

When a bug hits production, reconstruct the behavioral sequence from logs, map to
glossary, generate a regression test automatically. Every production bug becomes
a regression test.

---

## SVO Graph Querying

With explicit subjects, infrastructure steps are labeled (`:system waits 3
seconds` instead of `I wait 3 seconds`). This enables querying:

- "Show me all steps where subject is `:system`" — find infrastructure overhead
- "What objects does `:test-harness` touch?" — impact analysis
- "Which scenarios have the most `:system` steps?" — flakiness smell
- "All `:api` vs `:web` steps" — coverage by interface

The triples become a queryable dataset for test suite analysis.

---

## Infrastructure and Deployment

### Process Model

LG and SL run as **separate processes** (revised from the original same-JVM
design — see [ARCHITECTURE.md](ARCHITECTURE.md) for rationale). The boundary
is deliberately malleable; tighter integration is a post-capstone option.

- **LG MCP server** — manages browsers via Playwright, runs the sieve, serves
  vocabulary to agents
- **LG toddler loop UI** — localhost web app for human classification
- **SL** — consumed via glossary files, CLI (`sl run`), and nREPL
- Multiple browser instances with separate profiles per subject

### Transport

Stdio for MCP (client spawns LG as subprocess). Streamable HTTP is a future
extension point for remote/cloud deployment — same protocol, different I/O.

### Docker Compose Stack (Future)

Researched but not built. Services: SL dev container, Chrome (WebDriver + noVNC),
test target app, RVBBIT data board, 11ty test plan runner. Shared SQLite volume
between SL and RVBBIT for graph visualization.

### Multi-Repo Structure

For the capstone team: SL stays in its repo, LG stays in its repo, each tie-in
project gets its own repo. People consume tagged versions of SL/LG. Less
coordination overhead, clearer ownership.

---

## Capstone Demo

The demo is the full loop in ~4 minutes: sieve → classify → agent has
vocabulary → code change → re-sieve → glossary diff → agent writes test →
SL enforces → remove element → test catches the drift automatically.

**See [notes/demo-script.md](notes/demo-script.md)** for the full demo
sequence, what must be built, fallback options, and anti-goals.

---

## Open Questions

- **Graph schema:** How many passes will it take to make queries interesting?
  What's the minimum schema that teaches us something?
- **Intent region completion:** How far can EP-035 go without resolving the
  open design questions (arrival mechanism representation, transition data model)?
- **Team composition:** Who brings what skills? Shapes which branches are feasible.
- **User advocate role name:** Steward, Curator, or Docent? Decision pending.
- **Parallel execution:** The isolated step registry design is clear but
  unimplemented. Is this capstone scope or deferred?

---

## Invariants

- **SL does not know LG exists.** Dependency flows one way: LG → SL. Never reverse.
- **No unvalidated external data reaches core functions.** Boundary validation at
  MCP message ingress and sieve output parsing.
- **Every observation persists.** No fire-and-forget. If the sieve ran, the result
  is in the graph.
- **The sieve is deterministic.** Same DOM, same output. No randomness, no network
  calls, no token-burning inference.
- **One writer per graph store.** No concurrent Asami writes from separate processes.
- **Graph data has lifecycle state.** Raw observations are not conflated with
  validated SVOI artifacts.

---

## Glossary

| Term | Definition | Not |
|------|------------|-----|
| **Sieve** | Deterministic function that inventories an interface's surface into structured data | Not an agent or LLM — pure function, zero tokens |
| **Bridge** | LG's integration module for communicating with SL | File reads, CLI calls, nREPL — separate processes |
| **Observation** | A timestamped sieve output stored as a graph node | Not a page — observations are snapshots |
| **Action** | A browser/interface interaction stored as a graph edge | Not an MCP tool — actions are domain events |
| **Annotation** | A semantic label attached to an element or observation | Not SVOI — annotations are pre-authored, SVOI is compiled |
| **Toddler Loop** | HITL pipeline: observe → guess → ask → record → graduate | Not agent-dependent — works without AI, enhanced by it |
| **SVOI** | Subject, Verb, Object, bound Interface — SL's behavioral grammar | Not owned by LG — SL's domain |
| **Intent Region** | Cross-interface semantic region of interaction space | Not a page object — no URL binding, no class hierarchy |
| **Intent Surface** | The affordance subset of an Intent Region | Not the full region — just what you can do here |
| **Region** | Semantic breadcrumb path for an element's conceptual location | Not a DOM path — derived from landmarks, ARIA, headings |
| **Misfit** | A discrepancy between planes with attribution | Not a test failure — misfits carry plane attribution |
| **Heckling** | Rerunning tests with altered subjects | Not chaos testing — systematic subject perturbation |
| **Realization Path** | A specific route through intent regions to achieve a goal | Not a test case — a behavioral trajectory |
| **Desire Path** | Observed emergent user behavior outside designed workflows | Not a bug — evidence the world is too rigid |
| **Insertion Point** | A designed affordance that allows safe emergence | Not a feature request — a structural accommodation |
| **Cartographer** | The role that builds and maintains the behavioral graph | Not an agent — a role any agent or human can fill |
| **Plane** | One of four layers: observation, orientation, decision, action | Not hierarchical — linked by down-and-up verification |

---

*This document is the unified vision for the ShiftLefter + LeftGlove ecosystem.
It supersedes ROADMAP.md, cartographer.md, and notes/ecosystem-projects.md.
Detail docs for specific topics (intent regions, SVO design, component boundaries)
live in the ShiftLefter repo under `_docs/canon/`.*
