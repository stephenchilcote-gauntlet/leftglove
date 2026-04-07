# Feature Vision — LeftGlove

**Status:** Brainstorm, not committed. Captured Apr 6 2026 during roadmap session.

---

## Core Boundary

**SL enforces what you know. LG helps you learn it.**

- SL: holds interfaces, runs sieve, runs tests, enforces vocabulary, provides REPL
- LG: consumes sieve output, classifies, names, builds graph, projects vocabulary as MCP tools, generates SL artifacts

---

## Time Budget (Capstone)

23 man-days (Chair 10 + Steven 13), 10-12 hour days, 1-3 agents each. ~240
agent-assisted hours. Pre-LLM equivalent of ~12 work weeks. Calendar
constraint: 10 real days (synchronization, Chair out Apr 8-10). Demo Apr 20,
everything done by Apr 19.

---

## Feature Clusters

### A. Element Naming (Pass 2)

- Human names elements in TL UI (not just classifies)
- Agent can name them too (same capability, different actor)
- Eventually voice input, initially typed
- Names shown on SVG overlay (not just current element)
- Alphabetic list/palette of named elements (collapsible sidebar or dropdown)
- Principle: anything agent does, human can correct. Anything human does, agent could eventually do. Same data model either way.

#### The Naming UX Problem

The sieve proposes labels (from aria-label, innerText, etc.). The glossary
needs semantic names. These are different things — "Email address" (label) vs
"email" (glossary name). The transformation is where judgment lives.

**The tension:** When the sieve is right, you want one-click accept. When it's
wrong, one-click accept produces trash names. You can't know which case you're
in beforehand.

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

### B. Subgraph → Domain Verb

- A recorded sequence of actions = a domain verb (e.g., "login")
- Maps directly to SL macros (fixture macros, step compositions)
- Example: enter email + enter password + maybe check remember-me + click submit = "login"
- Whether credentials were correct matters for some apps (attempted login vs successful login)
- Simplest version: human explores, says "that was login," system records the action sequence
- Stretch: agent derives domain verbs automatically from repeated patterns
- Requires intelligence for auto-derivation, but the manual version is pure recording + naming

### C. Observation Loop (Near-Term Priority)

#### Declared Intent via TL UI

- Human clicks element in SVG overlay → toddler mimics the click on SL's live DOM
- This IS declared intent: you know what's being clicked because the human chose it
- Both browsers have same viewport (assumption: DOM hasn't changed since last sieve)
- Alternatively: "what happens if you click #17?" — programmatic exploration
- After click: wait for quiescence → re-sieve → diff
- "Daddy tells the toddler to click #17" — the human directs, the toddler executes,
  the system records the intent + outcome

#### Element Identity Across Observations

- Two inventories now exist (before-click, after-click)
- Must reapply semantic names from first to second
- Easy (most apps): stable locators (id, testid, name) → automatic match
- Medium: region + tag + label composite key → high confidence match
- Hard: dynamic IDs, virtualized lists, SPAs with full content swap → flag for human
- Persistent elements (nav, footer) carry names forward automatically
- New elements go through toddler loop
- The 80/20 applies: composite key handles most cases, human reviews the rest

#### Diff Display

- Show what appeared, disappeared, changed between two sieve outputs
- New elements: distinct highlight color
- Removed elements: phantom outlines
- Changed elements: flagged

### D. Display Improvements

- Colored rects by category: DONE
- Click to select element: DONE
- Names on overlay: NOT DONE
- Element list/palette (alphabetic, filterable): NOT DONE
- Show timing metrics ("409 elements in 127ms"): NOT DONE

### E. Graph Navigation in TL UI

- Navigate between sieved pages (click Submit → page B)
- View the graph of pages/transitions
- Navigate the graph visually
- Deep dependency: exploration → graph → navigation UI
- Deferred until graph exists

### F. Persistence

- Current: localStorage + manual JSON download
- Need: auto-save to known location (where SL/LG launched from)
- Naming convention for multiple sieve dumps
- Multiple people working on same app need to share state
- The export JSON is close to the intermediate format already

**Revised model:** The intermediate format (toddler loop state) is working
state / scratch paper. The glossary files in git are the source of truth. The
intermediate format doesn't need to be a permanent artifact — it's useful
during a classification session but the output that matters is the glossary.

### G. Graduation — PR-Based Glossary Merging

**Kill the "graduation ceremony" as a separate concept.** The flow is:

1. Sieve → classify → name (in toddler loop, on a branch)
2. Export writes directly to glossary EDN files in the repo
3. `git diff main -- glossary/` IS the proposal
4. Human reviews the diff, merges or adjusts
5. The glossary in git is the source of truth

No ceremony, just a merge. Uses infrastructure everyone already knows (git +
PRs). A PM or QA runs the sieve, the toddler loop produces a proposed glossary
fragment, and it goes around in the PR.

**Alternative (even simpler):** Write straight to the glossary on the branch.
The diff between branch and main's glossary is the proposal. No intermediate
format needed in the repo.

### H. Intent Region Discovery

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

### I. Undo/Rename Flow

- Rename Login.email → Auth.email
- Gherkin tests referencing old name should break (feature, not bug)
- Glossary enforcement catches vocabulary drift in both directions

### J. Agent MCP Equivalents

- Everything human does in TL UI, agent does via MCP tools
- Observe, classify, name, explore, declare intent
- Some exist in backlog (observe, annotate), some don't (explore, name)

### K. Autonomous Toddler Exploration

- Sieve is fast enough (~50ms for 409 elements) for multi-page crawl
- Toddler follows links, sieves each page, builds cross-page inventory
- State isolation needed (unauthenticated-only, separate contexts, turn-based)
- Bead exists: leftglove-8fv

### L. Multi-Interface

- LG should work with any interface SL exposes
- Web today, iOS emulator, Android, API, GraphQL eventually
- LG processes structured sieve output regardless of source
- Each interface gets its own sieve implementation (SL's concern)
- LG's toddler loop, graph, naming all work the same way

---

## SL Glossary Format Reference

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

## Open Questions

- Naming convention for sieve dumps (URL-based? timestamp? both?)
- How does graduation handle partial glossaries (some elements named, not all)?
- When agent names things, what confidence threshold triggers human review?
- Cross-page element identity: name once on page A, auto-propagate to page B?
- Intent region community detection: what graph structure do we need first?
- The sieve can propose names, but should the default be "accept" or "must type"?
  Current thinking: pre-fill from best locator, visibly bad on garbage data.

---

## M. Subject/Role Discovery via Credential-Gated Crawling

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
see login form." This is the heckling concept from VISION.md: run admin paths
as guest, verify they fail.

**The logout problem:** The toddler crawling as `:admin` must not click logout.
Credential tuples need exit gates alongside entry gates:

```
{:role    :admin
 :enter   {:intent "Login" :credentials {:email "admin" :password "123456"}}
 :exit    ["Nav.logout"]     ;; never click these while crawling as this role
 :verify  {:cookie "session_id"}}  ;; safety net: detect if session died
```

The toddler skips exit gate elements. The verify check is a safety net — after
each action, check if session cookie still exists. If it vanished (timeout, JS,
accidental navigation), crawl-as-this-role stops.

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

---

## N. Crawl Path Review

The toddler crawling produces a graph: observations (page states) as nodes,
actions (clicks, submissions) as edges. The human needs to review not just
individual pages but the **topology** — how pages connect, what transitions
exist, what the toddler found but couldn't understand.

**Review tasks:**

- Confirm/correct transitions ("clicking X on page A leads to page B")
- Explain unknowns ("this form submission did something I can't interpret")
- Identify cross-page element identity ("these pages share the same nav")
- Recognize structure ("this is a dead end / this loops back")
- Name subgraphs as domain flows ("these transitions = the login flow")

**TL UI: tree sidebar mode.** Collapsible tree of discovered pages. Click a
node → see screenshot + elements. Click an edge → see transition details.
Bottom panel shows transition info in path mode, element info in page mode.

**Intermediate format expands** from per-page to per-session:

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
  ]
}
```

This IS the graph, serialized. Graduates to SL as IR transition definitions
(EP-035, designed but not built):

```clojure
{:intent "Login"
 :transitions
 {:submit-success {:target "Dashboard" :via "Login.submit"}
  :forgot-password {:target "ForgotPassword" :via "Login.forgot-password"}}}
```

The crawl data populates EP-035. Toddler discovers transitions empirically.
Human confirms which matter. SL enforces going forward.

**Unsketched problems:**

- Graph storage during crawling (in-memory? files? SQLite?)
- Crawl strategy (breadth-first per page, depth-first across pages?)
- Cycle detection ("I've been here before" via element identity)
- Review UX for large graphs (50+ pages needs filtering/search)
- Agent review of crawl paths (MCP graph queries — out of scope)

---

## Priority Order

1. **Persistence + auto-save** — make working state real
2. **Graduation pipeline** — TL export → glossary EDN → git diff
3. **Observation loop** — declared intent click → re-sieve → diff → carry names
4. **Pass 2 naming UX** — name input with smart pre-fill
5. **Intent region grouping** — derive from `region` field, human confirms
6. **Graph** — observation/action persistence, enables everything downstream
7. **Agent MCP equivalents** — observe, classify, name, explore tools
8. **Autonomous exploration** — multi-page crawl with state isolation
