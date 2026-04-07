# Feature Vision — LeftGlove

**Status:** Brainstorm, not committed. Captured Apr 6-7 2026 during roadmap session.

---

## What This Is

Software development is converging on AI agents that write code. The missing
piece isn't code generation — it's behavioral accountability. Agents generate
code and hope for the best. There's no shared language between what a human
wants, what a spec says, and what the system does.

**ShiftLefter (SL)** is a Clojure test engine that executes behavioral specs
written in Gherkin. It manages browsers, runs tests, and enforces a validated
vocabulary — if a test references an element that doesn't exist in the
glossary, it fails before it runs. SL is infrastructure. You give it specs and
glossaries, it executes and validates.

**LeftGlove (LG)** is the discovery and authoring layer. It helps humans and
agents build the vocabulary that ShiftLefter enforces. Point it at a web app →
the sieve inventories every meaningful element → the toddler loop walks you
through classifying and naming them → those names graduate to glossary files →
SL enforces them going forward. When a code change removes an element, the
glossary catches it.

The name "toddler loop" is literal. Toddlers point and ask "what's that?",
then crawl around to find more things, then toddle between rooms with
increasing purpose. The system follows the same progression: classify elements
on a page → crawl the application autonomously → navigate between states and
build a map of the whole thing.

**One-line summary:** SL enforces what you know. LG helps you learn it.

---

## Key Concepts

| Term | What it is |
|------|-----------|
| **Web sieve** | Deterministic JS function that inventories a web page — filters ~90% of DOM noise, returns structured data on the ~10% that matters (elements with types, labels, locators, positions). Zero tokens, no LLM. Runs in SL's browser, consumed by LG over HTTP. |
| **Sieve** | A sieve is an interface-specific inventory function. The web sieve is the first implementation, but sieves can be written for any interface SL exposes — Android (accessibility tree), iOS, SMS, email, API/GraphQL. SL ships default sieves per interface; users can provide custom ones. A sieve extracts objects and meaningful structural data from its interface to feed the toddler loop. Sieves don't extract verbs — those come from SL's glossary. |
| **Toddler loop** | Human-in-the-loop pipeline: observe → classify → name → record → graduate to SL artifact. Pass 1 is rapid-fire classification (clickable/typable/readable/chrome/custom). Pass 2 is naming elements for the glossary. |
| **Observation** | A timestamped sieve snapshot — everything visible at a moment in time. Graph nodes are observations. Not "pages" — SPAs change content without changing URLs. |
| **Intent region** | A named cluster of related elements that form a semantic unit (e.g., "Login" contains email, password, submit). Cross-interface — same intent, different bindings per platform. If you've seen page objects in Selenium, intent regions serve the same purpose (named group of elements with locators) but aren't bound to pages or URLs, work across interfaces (web, mobile, API), and carry transition/contract metadata. |
| **Glossary** | EDN files defining the validated vocabulary: subjects (who can act), verbs (what they can do), intent regions (what they act on). SL enforces these — unknown references fail. |
| **Graduation** | When toddler loop classifications and names become official glossary entries. In practice: a PR that adds/modifies glossary files. |
| **SVOI** | Subject, Verb, Object, Interface — SL's behavioral grammar. `:user/alice clicks Login.submit` on `:web`. Every action is a tuple. |
| **MCP** | Model Context Protocol — how AI agents connect to tools. LG will project SL's vocabulary as MCP tools so agents see what's available. |
| **Gherkin** | The spec language SL executes. `Given/When/Then` steps that reference glossary vocabulary. |

---

## What Exists Today

- **SL sieve HTTP server** running at localhost:3333. `POST /sieve` returns
  JSON inventory, `GET /screenshot` returns PNG, `POST /navigate` drives the
  browser. Tested on real sites — 409 elements from Slashdot in <1s.
- **Toddler loop UI v0** — single HTML file (`leftglove/toddler/index.html`).
  Screenshot + SVG overlay, keyboard classification (c/t/r/x/u), click-to-select
  elements, localStorage persistence, JSON export. Pass 1 fully functional.
- **SL test engine** — 18K LOC, 1029 tests, zero failures. Gherkin parsing,
  multi-actor browser sessions, glossary enforcement (strict mode), REPL.
- **Test page** — `sieve-test-pages/01-basics.html` with 13 known elements.
  Classified successfully end-to-end.

**Not yet built:** Pass 2 naming, MCP server, glossary generation pipeline,
observation loop (click → re-sieve → diff), autonomous crawling, graph
persistence, application visualization.

---

## Core Boundary

- **SL:** holds interfaces, runs sieve, runs tests, enforces vocabulary, provides REPL. Deterministic. Does not discover vocabulary or write tests.
- **LG:** consumes sieve output, classifies, names, builds graph, projects vocabulary as MCP tools, generates SL artifacts. The learning layer.

---

## Time Budget (Capstone)

23 man-days (Chair 10 + Steven 13), 10-12 hour days, 1-3 agents each. ~240
agent-assisted hours. Calendar constraint: 10 real days (synchronization,
Chair out Apr 8-10). Demo Apr 20, everything done by Apr 19.

---

## Feature Groups

### Foundation

These must exist for anything else to work.

#### Persistence (was F)

- Current: localStorage + manual JSON download
- Need: auto-save the **intermediate file** (toddler loop working state —
  classifications, names, screenshots) to a known location
- Naming convention for multiple sieve dumps
- Multiple people working on same app need to share state
- The export JSON is close to the intermediate format already

**Revised model:** The intermediate format is working state / scratch paper.
The glossary files in git are the source of truth. The intermediate format
doesn't need to be a permanent artifact — it's useful during a classification
session but the output that matters is the glossary.

#### Graduation — PR-Based Glossary Merging (was G)

**Kill the "graduation ceremony" as a separate concept.** The flow is:

1. Sieve → classify → name (in toddler loop, on a branch)
2. Human clicks "Export" in TL UI → TL sends named elements to SL via
   `POST /glossary/intents` → SL writes the glossary EDN files (SL knows
   where they live, handles EDN serialization and merge logic)
3. `git diff main -- glossary/` IS the proposal
4. Human reviews the diff, merges or adjusts
5. The glossary in git is the source of truth

No ceremony, just a merge. Uses infrastructure everyone already knows (git +
PRs). A PM or QA runs the sieve, the toddler loop produces a proposed glossary
fragment, and it goes around in the PR.

**Alternative (even simpler):** Write straight to the glossary on the branch.
The diff between branch and main's glossary is the proposal. No intermediate
format needed in the repo.

#### Observation Loop (was C) — Near-Term Priority

**Declared Intent via TL UI:**

- Human clicks element in SVG overlay → toddler mimics the click on SL's live DOM
- This IS declared intent: you know what's being clicked because the human chose it
- Both browsers have same viewport (assumption: DOM hasn't changed since last sieve)
- Alternatively: "what happens if you click #17?" — programmatic exploration
- After click: wait for quiescence → re-sieve → diff
- "Daddy tells the toddler to click #17" — the human directs, the toddler executes,
  the system records the intent + outcome

**Element Identity Across Observations:**

- Two inventories now exist (before-click, after-click)
- Must reapply semantic names from first to second
- Easy (most apps): stable locators (id, testid, name) → automatic match
- Medium: region + tag + label composite key → high confidence match
- Hard: dynamic IDs, virtualized lists, SPAs with full content swap → flag for human
- Persistent elements (nav, footer) carry names forward automatically
- New elements go through toddler loop
- The 80/20 applies: composite key handles most cases, human reviews the rest

**Diff Display:**

- Show what appeared, disappeared, changed between two sieve outputs
- New elements: distinct highlight color
- Removed elements: phantom outlines
- Changed elements: flagged

---

### Core UX

The human interface to the toddler loop.

#### Element Naming — Pass 2 (was A)

- Human names elements in TL UI (not just classifies)
- Agent can name them too (same capability, different actor)
- Eventually voice input, initially typed
- Names shown on SVG overlay (not just current element)
- Alphabetic list/palette of named elements (collapsible sidebar or dropdown)
- Principle: anything agent does, human can correct. Anything human does, agent
  could eventually do. Same data model either way.

**The Naming UX Problem:**

The sieve proposes labels (from aria-label, innerText, etc.). The glossary
needs semantic names. These are different things — "Email address" (what the
user sees on the page) vs "email" (what the developer references in tests).
The transformation is where judgment lives.

**The tension:** When the sieve is right, you want one-click accept. When it's
wrong, one-click accept produces trash names — think `mat-form-field-28`,
`ng-c3847`, or `div_wrapper_inner_2`. You can't know which case you're in
beforehand.

**Approach: propose a transformed name, not the raw label.**

The system derives a name candidate from the best available locator
(testid > id > name > label-transform). Clean data → obviously good proposal.
Garbage data → obviously bad proposal (or empty field). The human evaluates
whether the transformation makes sense.

```
Sieve: "Email address" (input, email)     Name: [email___________]
       id=email, testid=login-email
```

The pre-fill heuristic:

1. If `testid` exists → use it (lowercased, hyphenated)
2. If `id` exists and isn't dynamic-looking → use it
3. If `name` exists → use it
4. If label exists → transform (lowercase, strip common words, hyphenate)
5. Otherwise → empty field, human must type

This means well-structured apps get good proposals and legacy apps get visibly
bad ones, which is exactly the right behavior.

#### Display Improvements (was D)

- Colored rects by category: DONE
- Click to select element: DONE
- Names on overlay: NOT DONE
- Element list/palette (alphabetic, filterable): NOT DONE
- Show timing metrics ("409 elements in 127ms"): NOT DONE

#### Intent Region Discovery (was H)

**Near-term:** Derive from the sieve's `region` field. `main > login-form` →
Intent "Login". Human confirms or adjusts. Simple, gets 80% right on
well-structured apps.

**Real answer (deferred):** Community detection on the graph. Elements that
co-occur on the same pages, that are interacted with in sequence, that
appear/disappear together — those form natural communities. Graph algorithms
(Louvain, label propagation) propose intent region boundaries. Requires the
graph to exist first.

**Expectation:** Elements WILL get moved between intent regions as
understanding evolves. The system should make this cheap, not prevent it.

#### Undo/Rename Flow (was I)

- Rename Login.email → Auth.email
- Gherkin tests referencing old name should break (feature, not bug)
- Glossary enforcement catches vocabulary drift in both directions

---

### Exploration

The toddler gets smarter.

#### Autonomous Toddler Exploration (was K)

- Sieve is fast enough (~50ms for 409 elements) for multi-state crawl
- Toddler follows links, sieves each state, builds cross-state inventory
- State isolation needed (unauthenticated-only, separate contexts, turn-based)
- Bead exists: leftglove-8fv

#### Crawl Path Review (was N)

The toddler crawling produces a graph: observations (application states) as
nodes, actions (clicks, submissions) as edges. The human needs to review not
just individual states but the **topology** — how states connect, what
transitions exist, what the toddler found but couldn't understand.

**Important: "state" not "page."** SPAs change content without changing URLs.
Widget expand/collapse changes the observable surface without navigation. The
graph nodes are sieve observations — snapshots of what's visible — not pages.
Two kinds of edges:

- **Navigation transitions:** you're in a different intent area (Login →
  Dashboard). URL may or may not change (SPA route vs full navigation).
- **State mutations:** same intent area, different state (accordion expanded,
  modal opened, dropdown revealed, widget collapsed). Not a transition — a
  modification of the current observation.

Both are edges in the graph, both need human review, but they mean different
things. "Where can you GO" vs "what can you REVEAL here."

**Review tasks:**

- Confirm/correct transitions ("clicking X in state A leads to state B")
- Explain unknowns ("this form submission did something I can't interpret")
- Identify cross-state element identity ("these states share the same nav")
- Recognize structure ("this is a dead end / this loops back")
- Name subgraphs as domain flows ("these transitions = the login flow")
- Distinguish navigation from state mutation ("this opened a widget, not a page")

**TL UI: tree sidebar mode.** Collapsible tree of discovered states. Click a
node → see screenshot + elements. Click an edge → see transition details.
Bottom panel shows transition info in path mode, element info in state mode.

**Intermediate format expands** from per-observation to per-session:

```json
{
  "session": {"role": "admin", "startUrl": "/login"},
  "observations": [
    {"id": "obs-001", "url": "/login", "inventory": {}, "screenshot": "obs-001.png"},
    {"id": "obs-002", "url": "/dashboard", "inventory": {}, "screenshot": "obs-002.png"}
  ],
  "transitions": [
    {"from": "obs-001", "to": "obs-002", "action": "click",
     "element": "Login.submit", "outcome": "navigation"}
  ],
  "mutations": [
    {"observation": "obs-002", "action": "click",
     "element": "Dashboard.reviews-toggle", "outcome": "reveal",
     "elementsAdded": 5, "elementsRemoved": 0}
  ]
}
```

This IS the graph, serialized. Graduates to SL as IR transition definitions
(EP-035 — SL's planned intent region completion: arrival points, transitions
between regions, and contracts. Designed but not built):

```clojure
{:intent "Login"
 :transitions
 {:submit-success {:target "Dashboard" :via "Login.submit"}
  :forgot-password {:target "ForgotPassword" :via "Login.forgot-password"}}}
```

The crawl data populates EP-035. Toddler discovers transitions empirically.
Human confirms which matter. SL enforces going forward.

#### Subject/Role Discovery via Credential-Gated Crawling (was M)

**Core insight:** The diff between surfaces reachable by different credentials
IS the permission model. Nobody documents it — the system derives it.

**Human provides:** "This form is authentication" + credential tuples:

```
(nil,              :guest)    — no login, crawl what's reachable
(user/123456,      :user)     — log in with these, crawl
(admin/123456,     :admin)    — log in with these, crawl
```

**System derives:**

```
Guest surface:  {/login, /about, /public}
User surface:   {/login, /about, /public, /dashboard, /profile}
Admin surface:  {all of the above + /admin, /settings}
```

**Output:** Auto-generated subject definitions with reachability. Permission
tests are mechanical from the diff — "guest navigates to /dashboard → should
see login form." This is the heckling concept: run admin paths as guest, verify
they fail.

**The logout problem:** The toddler crawling as `:admin` will eventually click
logout. Rather than requiring the human to configure exit gates ("don't click
this element"), the toddler discovers the boundary itself via cookie/storage
monitoring: before each action, snapshot cookie keys. After re-sieve, compare.
If the session cookie disappeared, the last action was a role exit — record it,
stop crawling as this role.

```
{:role    :admin
 :enter   {:intent "Login" :credentials {:email "admin" :password "123456"}}
 :verify  {:cookie "session_id"}}  ;; monitor: if this disappears, role lost
```

The system discovers exit gates instead of being told them. Optional: power
users can still provide explicit exit gates to prevent the toddler from even
attempting logout (avoids the wasted click + re-login cost).

**Post-demo fallbacks:** Some apps don't delete cookies on logout (server-side
invalidation → redirect). Some SPAs clear localStorage instead. Those need
fallback detection (login form re-appeared, URL changed to /login). Cookie
disappearance covers the 80% case.

**Gate pairs ARE fixture contracts.** "Login with creds = enter role" is the
fixture precondition. "Logout = exit role" is the teardown. Discovering these
empirically via crawling is discovering the fixture contracts that SL will
enforce. This connects directly to SL's fixture macro system.

SL's `subjects.edn` doesn't change (who + desc + instances). Gate info lives
in the fixture/intent layer — how to become/stop being a subject. Different
artifact from the subject definition itself.

**Dependencies:** Autonomous crawling + auth form identification + multi-session
comparison + surface diff + gate exclusion. SL already handles multi-actor with
separate browser sessions. The crawling, gates, and diff are the new parts.

**Demo potential:** Design the demo app to support this (3-4 pages, login form,
role-gated content). Even manual version is a killer demo moment.

#### Subgraph → Domain Verb (was B)

- A recorded sequence of actions = a domain verb (e.g., "login")
- Maps directly to SL macros (fixture macros, step compositions)
- Example: enter email + enter password + maybe check remember-me + click submit = "login"
- Whether credentials were correct matters for some apps (attempted login vs successful login)
- Simplest version: human explores, says "that was login," system records the action sequence
- Stretch: agent derives domain verbs automatically from repeated patterns
- Requires intelligence for auto-derivation, but the manual version is pure recording + naming

---

### Infrastructure

System capabilities that enable features above.

#### Agent MCP Equivalents (was J)

- Everything human does in TL UI, agent does via MCP tools
- Observe, classify, name, explore, declare intent
- Some exist in backlog (observe, annotate), some don't (explore, name)

#### Sieve Metadata Expansion (was P)

The sieve should capture ambient state that helps detect action side-effects:

**Tab/window count:**

```clojure
:tabs 2    ;; did the last action open a new tab?
```

Detect: "clicking that link opened a new tab instead of navigating." The
toddler needs to know whether the current context changed or a new one spawned.

**Cookie keys (not values):**

```clojure
:cookies ["session_id" "csrf_token" "_ga"]  ;; top-level keys only
```

Detect: session appeared (login worked), session disappeared (logout or
timeout), tracking cookies present. Values excluded — could contain tokens/PII.

**localStorage/sessionStorage keys:**

```clojure
:storage {:localStorage ["cart" "user_prefs" "theme"]
          :sessionStorage ["auth_token"]}
```

Detect: what the app persists client-side. Useful for knowing if state
survives page refresh. Key names only, not content.

**Why capture preemptively:** We will almost always start with clean sessions
(no cookies, no localStorage). So any cookies/storage that appear were SET by
the app during the session. This is free metadata that enables:

- Session verification for role-gated crawling (verify check)
- Detecting state that persists vs state that doesn't
- Knowing when an action had invisible side-effects (cookie set, storage written)

This is SL-side sieve work — expand the sieve JS return value.

#### Multi-Interface (was L)

- LG should work with any interface SL exposes
- Web today, iOS emulator, Android, API, GraphQL eventually
- LG processes structured sieve output regardless of source
- Each interface gets its own sieve implementation (SL's concern)
- LG's toddler loop, graph, naming all work the same way

---

### Visualization

Seeing the whole picture.

#### Application Visualization (was O)

Graph visualization is bigger than crawl path review — it's the visual
interface to the entire application model. Even a 3-page app benefits from
seeing the topology.

**What to visualize:**

- States as nodes, transitions as edges (the application graph)
- Intent regions as labeled clusters (Login cluster, Dashboard cluster)
- Domain verbs as subgraph highlights ("this is the login flow")
- Entry and exit points per role (guest sees these nodes, admin sees all)
- Scattered functionality ("account management touches 6 different areas")
- Coverage: which states/transitions have been explored vs unvisited

**Depends on:** the graph existing. But visualization and graph construction
will likely co-evolve — you want to SEE what you're building as you build it.

**Ideal owner:** A frontend-oriented person. Self-contained, visual, uses
standard graph viz libraries (d3-force, cytoscape.js, elk). Natural standalone
workstream for a teammate.

#### Graph Navigation in TL UI (was E)

- Navigate between sieved states (click Submit → Dashboard state)
- View the graph of states/transitions
- Navigate the graph visually
- Deep dependency: exploration → graph → navigation UI
- Deferred until graph exists

---

## Unsketched Problems

- Graph storage during crawling (in-memory? files? SQLite?)
- Crawl strategy (breadth-first per state, depth-first across states?)
- Cycle detection ("I've been here before" via element identity)
- Review UX for large graphs (50+ states needs filtering/search) — ties into
  application visualization
- Agent review of crawl paths (MCP graph queries — gets really interesting
  but out of scope for capstone)

---

## Priority Order

1. **Persistence + auto-save** — make working state real
2. **Graduation pipeline** — TL export → glossary EDN → git diff
3. **Observation loop** — declared intent click → re-sieve → diff → carry names
4. **Pass 2 naming UX** — name input with smart pre-fill
5. **Intent region grouping** — derive from `region` field, human confirms
6. **Graph** — observation/action persistence, enables everything downstream
7. **Agent MCP equivalents** — observe, classify, name, explore tools
8. **Autonomous exploration** — multi-state crawl with state isolation

---

## Appendix A: SL Glossary Format Reference

### subjects.edn

```clojure
{:subjects
 {:user {:desc "Standard user"
         :instances [:alice :bob]}
  :admin {:desc "Administrative user"
          :instances [:pat]}
  :guest {:desc "Unauthenticated visitor"}}}
```

- Top-level `:subjects` map required
- Each type: keyword → map with `:desc` (required), `:instances` (optional vector of keywords)
- Types with `:instances` = type/instance pairs (`:user/alice`)
- Types without = singletons (`:guest`)
- Instance collision detection: no instance can appear in multiple types

### verbs-web.edn

```clojure
{:type :web
 :verbs
 {:click {:desc "Click element"}
  :fill {:desc "Enter text into input"}
  :see {:desc "Assert element visible"}}}
```

- `:type` required (`:web`, `:api`, etc.)
- `:verbs` required — map of verb keyword → info map with `:desc`
- SL ships defaults for web (click, fill, see, navigate, submit, etc.)
- Project glossaries extend defaults; set `:override-defaults true` to replace
- Projects can add domain verbs: `:login`, `:search`, `:filter`

### glossary/intents/Login.edn

```clojure
{:intent "Login"
 :description "User authentication flow"
 :elements
 {:email {:description "Email input field"
          :bindings {:web {:css "#email-input"}
                     :mobile {:accessibility-id "email-field"}}}
  :password {:bindings {:web {:css "#password-input"}}}
  :submit {:bindings {:web {:css "button.login-submit"}}}
  :remember-me {:bindings {:web {:id "remember-me"}}
                :collection false}}}
```

- `:intent` required — PascalCase string
- `:elements` required — map of element keyword → element definition
- Element keys: lowercase with hyphens/underscores
- Each element needs `:bindings` — non-empty map of interface → locator
- Locator types: `:css`, `:xpath`, `:id`, `:accessibility-id`
- Optional: `:description`, `:collection` (boolean, for elements matching multiple)

### Intent References in Gherkin

Pattern: `IntentName.element-name[optional-index]`

- `Login.email` — single element
- `Login.submit[1]` — nth match (positive index)
- `Login.submit[-1]` — last match (negative index)
- `Login.submit[*]` — all matches (for counting)

### Strict Mode Enforcement

In `shiftlefter.edn`:

```clojure
{:svo
 {:unknown-subject :warn    ; or :error
  :unknown-verb :warn       ; or :error
  :unknown-object :strict}} ; :strict = raw locators disallowed, intents must be valid
```

### Minimum Bar for Graduation

An element can graduate to the glossary when it has:

1. A **name** (lowercase, hyphenated): `email`, `submit-btn`, `remember-me`
2. A **parent intent region** (PascalCase): `Login`, `Dashboard`
3. At least one **locator binding**: `{:web {:css "#email"}}` or `{:web {:id "email"}}`

The sieve already provides the locator. The human provides the name and
confirms the region grouping.

---

## Appendix B: Open Questions

- Naming convention for sieve dumps (URL-based? timestamp? both?)
- How does graduation handle partial glossaries (some elements named, not all)?
- When agent names things, what confidence threshold triggers human review?
- Cross-state element identity: name once in state A, auto-propagate to state B?
- Intent region community detection: what graph structure do we need first?
- The sieve can propose names, but should the default be "accept" or "must type"?
  Current thinking: pre-fill from best locator, visibly bad on garbage data.
