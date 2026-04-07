# Ecosystem Projects

Potential projects that use ShiftLefter as a foundation. These can be built in
any language by team members who may not know Clojure. Each stands on its own
but gains leverage from SVOI and the behavioral spec layer.

---

## 1. Scriptable Demo Videos from Behavioral Specs

Run a test without asserts — that's a demo. The same SVOI grammar that drives
test execution drives a scripted browser session narrated by AI voice.

**How it works:**

- Take existing feature files (or write demo-specific ones)
- Execute via ShiftLefter, driving a real browser
- 11Labs (or similar) as its own interface — voice narration is an SVOI verb
  ("Narrator says 'Now the admin creates a new user'")
- Screen capture during execution → fully scripted video
- Can be regenerated automatically from a changelog — "what changed? Re-record
  the affected demos"

**Extends to:** Marketing materials, onboarding walkthroughs, release notes with
video, accessibility narration of application workflows.

**Why it's interesting:** The spec IS the script. No separate demo authoring.
When the product changes, the demos update automatically.

---

## 2. Use Case ↔ Feature File Mapping and Expansion

Bidirectional mapping between business use cases (natural language, user stories,
PRDs) and executable behavioral specs (Gherkin feature files with SVOI).

Partially described in the ShiftLefter vision. A development agent reads use
cases, proposes feature files. A review agent reads feature files, validates
they cover the stated use cases. Gaps between use cases and specs are misfits
(Plane 2 ↔ Plane 3).

**Why it's interesting:** Closes the loop between "what we said we'd build" and
"what we actually specified." Most teams have a pile of Jira tickets that don't
map cleanly to their test suite. This makes the mapping explicit and auditable.

---

## 3. SVOI-Level Observability Stubs

Generate instrumentation stubs that track user behavior at the **semantic SVOI
level** rather than the DOM/implementation level.

**The problem:** Traditional analytics track Plane 4 actions — "user clicked
button-7," "user entered text into field-13." This is useful for debugging but
useless for understanding intent.

**The solution:** Generate stubs from SVOI definitions that track at Plane 3 —
"user logs in," "admin creates account," "support agent escalates ticket." The
agent inserts these stubs directly into the application code. Now your
observability data speaks the same language as your specs.

**Why it's interesting:** When Plane 1 data (what users actually do) arrives in
SVOI vocabulary, you can directly compare it to Plane 3 (what the spec says
they should be able to do). No translation layer. Misfits between observed
usage and specified behavior are immediately detectable — "users keep trying to
do X, but X isn't in the spec."

This is the Plane 1 data source problem solved at the right abstraction level.
