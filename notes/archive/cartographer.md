# The Cartographer Problem: Naming the User Advocate Role

## Background: Finding the Right Name

In the Scuffy agent factory, every role has a name that carries meaning. Scout
surveys and bootstraps. Tower plans. Trench builds. Warden audits code quality.
Herald is the voice — documentation, marketing, social. Each name tells the
agent and the human exactly what the job is.

We needed a new role: the agent that evaluates the finished product from the
user's perspective. Not code quality (that's Warden). Not planning (that's
Tower). Not documentation (that's Herald). This agent is the user's advocate
inside the build process — black-box thinking about how the product acts and
affects the people who use it.

### Candidates under consideration

| Name | Metaphor | Strength | Concern |
|---|---|---|---|
| **Steward** | Caretaker managing on behalf of the true owners | Duty, care, advocacy without negativity | Almost named Light Warden this |
| **Curator** | Selects, arranges, removes what doesn't belong | Polish IS curation; experience-oriented | Might feel passive |
| **Docent** | Walks someone through as a newcomer | Most explicitly user-journey-oriented | Niche word, less immediate recognition |
| **Concierge** | Makes the guest's stay smooth | Very service-oriented, notices every friction | Too hospitality-specific? |
| **Ranger** | Patrols territory, spots hazards on the trails | About paths (user journeys), not trees (code) | Almost named Warden this |
| **Envoy** | Representative sent on behalf of the user | Diplomatic, reports findings | Good but doesn't quite land |

The key distinction from Warden: Warden guards the walls (code integrity).
This role walks the paths (user journeys). Warden asks "is this secure and
correct?" This role asks "is this usable and complete?"

Herald was initially considered for this role but is reserved for the
outward-facing voice: docs, README, marketing, social, the comparative
analysis. Herald presents what's right. The user advocate finds what's wrong
or missing — they must remain separate to avoid conflict of interest.

**Decision pending.** Sleeping on Steward, Curator, and Docent.

---

## ShiftLefter: The Intent Surface Engine

### What it is

ShiftLefter started from a specific observation about Cucumber tests: the
subject is almost always implicit. "When I click the login button" — who is
"I"? An admin? A guest? A trial user? By making every line an explicit SVO
(Subject-Verb-Object) triple, the implicit becomes concrete:

```
admin | clicks | login-button
guest | enters | email-field "test@example.com"
member | navigates-to | settings-page
```

This explicitness cascades into several realizations:

### 1. Every line is a triple, and triples form a graph

Once every test step is `subject | verb | object`, the entire test suite
becomes a graph of user interactions with the application. Each node is a
subject, verb, or object. Each edge is a behavioral assertion.

### 2. The graph is the intent surface

The graph represents the boundary where users interact with the application —
the "intent surface." This is a computable, deterministic surface (with
caveats for real-time/stateful edge cases, but good enough for most apps).

You can compute over this surface:
- **Reachability:** Can user X get from page A to action B?
- **Distance:** How many clicks from dashboard to issue detail?
- **Permissions:** Are admin paths blocked for guests?
- **Coverage:** Are all intent surfaces tested?
- **Mutation testing:** Flip admin → guest on all paths, verify they fail.

### 3. Concrete behavior projects to domain verbs

The graph has two layers:

- **Concrete:** `user | enters | email-field`, `user | enters | password-field`,
  `user | clicks | submit-button`
- **Projection:** `user | login` (a domain verb composed of concrete actions)

The projection maps interface-level actions to domain-level intent. This is
where intent regions come in — higher-order projections of page objects that
can be cross-interface. "Login" means the same thing on iOS, web, and API,
even though the locators differ.

### 4. Interfaces are bags of verbs

Each interface (web browser, iOS, Android, SMS, GraphQL) has a finite set of
verbs. A web browser can: click, enter, navigate-to, select, hover, scroll.
An API can: GET, POST, PUT, DELETE. These are the primitives that concrete
triples are built from.

### 5. Subjects are validated against glossaries

Subjects (admin, guest, trial-user, member) must exist in the glossary. This
is DDD's ubiquitous language, instantiated and tied from code to tests to the
glossary. New subjects require explicit glossary entries — no implicit actors.

### 6. Every PR gets a graph diff

For every code change, you get not just a code diff but:
- **Glossary diff:** New subjects, verbs, objects, interfaces, intent regions
- **Graph diff:** New paths, removed paths, changed reachability
- **Intent surface diff:** What users can now do that they couldn't, and vice versa

This is deterministically computable, not a manual click-through.

### Current state

| Component | Status |
|---|---|
| Cucumber engine | Working |
| ShiftedCucumber (explicit SVO) | Working |
| Subject glossaries | Working |
| Interface verb bags | Working |
| Intent regions | Partially working |
| Test building via REPL | Working |
| Playwright integration | Working |
| WebDriver integration | Working |
| Graph database wiring | Wired, not yet implemented |
| The Sieve (brownfield extractor) | Designed, not built |
| MCP server | Next |

### Capstone scope

The graph engine and the sieve as a library, CLI tool, and MCP server.
Hardening existing components. Possibly with collaborators working on
related pieces.

---

## ShiftLefter as Oracle, Not Persona

ShiftLefter is not a single agent role — it's **infrastructure that multiple
roles query.** Like how beads (`br`/`bv`) isn't a role but a tool all roles
use, the intent surface graph is a source of truth.

### How each role uses the oracle

| Role | How it uses ShiftLefter |
|---|---|
| **Scout** | Reads the graph to plan — "the BRIEF requires these user journeys, the graph shows these exist, here are the gaps" |
| **Trench** | Checks while building — "your changes alter the intent surface in these ways, here's the graph diff" |
| **Warden (Dark)** | Mutation testing — "flip admin to guest on all paths, verify they're blocked" |
| **User advocate** | Evaluates completeness — "are all BRIEF journeys navigable in under N clicks?" |
| **Herald** | Structures documentation — each navigable path is a user guide section |
| **Tower** | Plans features — the graph diff shows exactly what intent surfaces a new feature requires |

### The Cartographer role

Someone needs to BUILD and MAINTAIN the oracle:
- Extract triples from existing tests/code (the sieve)
- Maintain the glossary (DDD ubiquitous language)
- Validate new triples against the glossary
- Compute graph diffs
- Run the sieve on brownfield apps
- Keep the intent surface in sync with the evolving codebase

This maintainer-of-the-graph is a role: **Cartographer.** Maps the territory
of user intent. Creates the charts that all other agents navigate by.

### The naming chain

- **Scout** surveys the land
- **Cartographer** maps it
- **Tower** plans routes across the map
- **Trench** builds the roads
- **Warden** patrols them
- **The user advocate** walks them as a newcomer would
- **Herald** writes the travel guide

### The Docent connection

The user advocate (Docent/Steward/Curator — name TBD) walks someone through
the experience. The Cartographer's graph IS that experience, formalized. The
advocate doesn't need to click through manually — it queries the Cartographer's
intent surface graph to evaluate completeness, navigability, and coherence.

This is where ShiftLefter's graph engine becomes directly useful to the agent
factory: the user advocate's job becomes computational rather than exploratory.
Instead of "click through every screen and see what's broken," it's "query the
graph for unreachable intent surfaces and permission violations."

---

*Document created 2026-03-26 from a conversation between Chair and Trench
(Claude Opus 4.6) during Scuffy development. Context: Gauntlet Shipyard
week 2, the night before Early Submission.*
