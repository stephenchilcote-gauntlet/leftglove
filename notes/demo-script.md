# Capstone Demo Script

**Canonical for:** Demo sequence, demo app requirements, what must work for the demo
**Linked from:** VISION.md § Open Questions (capstone scope)
**Last verified:** 2026-04-03

---

## The Pitch Line

> "Every other capstone is building an app.
> We're building the thing that makes apps accountable."

Open with this. No planes philosophy on stage — link to a separate video for
that. The demo IS the argument.

---

## The Demo (4-5 Minutes)

### Act 1: The Sieve Sees Everything (~60 seconds)

```
[Show the demo app — a login page with email, password, submit,
 forgot-password link, nav, footer]

"This is a web application. We're going to show you what our system
 sees when it looks at it."

[Run the sieve. Screenshot appears with colored SVG overlays on
 every classified element]

"47 DOM nodes on this page. The sieve filtered out the noise and
 found 7 meaningful elements. Classified in under a second.
 No screenshots sent to an LLM. No tokens burned. Deterministic."

[Rapid-fire classify 3-5 elements live in the toddler loop UI]

"Typable. Typable. Clickable. Chrome. Skip."

[5 seconds of rapid-fire to show the speed]

"A human can classify an entire page in under a minute."

[Load pre-labeled version — swap to fully classified state]

"Here's what the full classification looks like. Every element
 named, located, typed. This becomes the glossary — the
 vocabulary that agents and tests are bound to."
```

**What must work:** Sieve produces inventory. Screenshot + SVG overlay renders.
Toddler loop UI shows elements one at a time. Pre-labeled state loads.

### Act 2: The Agent Has Vocabulary (~45 seconds)

```
[Switch to Claude / agent terminal]

"Now watch what happens when an agent connects to this application
 through our MCP server. It doesn't see HTML. It sees the glossary."

[Show the MCP tool surface — the vocabulary projection]

"The agent knows: Login.email is a typable field. Login.submit is
 a clickable button. Login.forgot-password is a link. It can only
 reference things that actually exist. Try to reference something
 that isn't in the glossary? The system rejects it."
```

**What must work:** MCP tool listing shows glossary-derived vocabulary.
Agent can reference Login.email, Login.submit by name.

### Act 3: The Code Change (~45 seconds)

```
[Still in agent terminal]

"Let's add a feature. 'Add a Remember Me checkbox to the login form.'"

[Agent makes the code change — adds checkbox to the demo app]

"The agent wrote 3 lines of code. Now let's see what the sieve
 thinks about the new version."

[Re-sieve the modified page. New screenshot with overlays.]

"The sieve found a new element. One new checkbox that wasn't there
 before. Everything else is unchanged — the existing labels are
 preserved."

[Show the diff — side by side or highlighted]

"Glossary diff: +1 entry. Login.remember-me. Clickable, checkbox.
 This is what changed in what users can do."
```

**What must work:** Agent can modify the demo app code. Re-sieve produces
new inventory. Diff between old and new inventory shows the new element.
Glossary diff shows +1 entry.

### Act 4: The Test Writes Itself (~45 seconds)

```
"Now the agent writes a test for the new feature. Not from
 screenshots. Not from guessed selectors. From the validated
 glossary that the sieve proved exists."

[Agent writes Gherkin test]

  Scenario: Remember Me checkbox persists session
    Given :user/alice navigates to the login page
    When :user/alice clicks Login.remember-me
    And :user/alice enters credentials
    And :user/alice clicks Login.submit
    Then :user/alice should be logged in
    # ... further steps verifying session persistence

"Every element in this test — Login.remember-me, Login.submit —
 is validated against the glossary. Reference something that
 doesn't exist? The test fails at planning time, before it
 even runs."

[sl run — test passes]

"Green. The test passes. The feature works."
```

**What must work:** Agent writes valid Gherkin using glossary names.
`sl run` executes the test against the demo app. Test passes.

### Act 5: The Killer Ending (~45 seconds)

```
"Now watch what happens when someone breaks something."

[Delete the Remember Me checkbox from the code. Redeploy.]

[Re-sieve]

"The sieve ran again. Login.remember-me is gone.
 Glossary diff: -1 entry. The system detected the removal."

[sl run — same test]

"The test fails. Not because of a flaky selector. Not because
 someone forgot to update the page objects. The glossary says
 Login.remember-me should exist. The sieve says it doesn't.
 Misfit detected."

  ✗ Login.remember-me: unknown object (strict mode)

"That's behavioral accountability. The spec caught the drift.
 Automatically. No human had to notice."
```

**What must work:** Removing the element from code → re-sieve shows it's
gone → `sl run` fails with glossary enforcement error. This is already
built — SL's `unknown-object :strict` mode (GP.001g).

### Close (~15 seconds)

```
"The sieve does for E2E testing what unit test frameworks did
 for functions — makes it so cheap and structured that there's
 no excuse not to do it."

[Slide: project name, GitHub URL, team names]
```

---

## What Must Be Built for This Demo

| Piece | Status | Who | Effort |
|---|---|---|---|
| Web sieve (JS DOM inventory) | Not built | Chair | The hard part |
| Sieve → screenshot + SVG overlay | Not built | Anyone (JS/HTML) | Small |
| Toddler loop UI (Pass 1 classify) | Not built | Anyone (web) | Medium |
| Pre-labeled state (prepared offline) | N/A | Chair | Prep work |
| Demo app (login page + extensible) | Partially exists (SL fixture server) | Anyone | Small-Medium |
| MCP server (vocabulary projection) | Not built | Chair (Clojure) | Medium |
| Sieve diff (compare two inventories) | Not built | Anyone | Small |
| Glossary generation from labels | Not built | Chair (Clojure) | Small |
| Agent writes Gherkin test | Claude does this | N/A | Zero — it's Claude |
| `sl run` executes test | Already works | N/A | Zero |
| Glossary enforcement (strict mode) | Already works (GP.001g) | N/A | Zero |

**Critical path:** Sieve → toddler loop UI → MCP vocabulary projection →
glossary generation. Everything else is either already built or trivial.

**The demo can be partially staged.** The pre-labeled version is prepared
in advance. The "add a checkbox" code change can be practiced. The test
can be pre-written and shown as "the agent wrote this." What matters is
that the LOOP is real — sieve, diff, glossary, enforcement all actually work.

---

## Demo App Requirements

The demo app must be:

- **Simple enough to sieve cleanly** — semantic HTML, stable IDs, no framework
  chaos. We control it, so we make it sieve-friendly.
- **Complex enough to be interesting** — login form, at least two element types,
  enough elements to show classification is non-trivial.
- **Modifiable during the demo** — adding a checkbox must be a 3-line code change
  that the agent can do live (or appear to do live).
- **Runnable by SL** — `sl run` can execute Gherkin tests against it. Step
  definitions exist for the standard browser interactions.

The SL fixture server (GP.004, exists in `/test/`) is a starting point but
may need expansion. Or build a standalone demo app — any language, any framework.
The only requirement is clean HTML that the sieve handles well.

### Progressive Complexity (Development Stages)

The demo app doubles as the sieve test harness:

| Stage | What it adds | Sieve challenge |
|---|---|---|
| 1: Static page | Heading, text, a link | Basics — classify readable vs clickable |
| 2: Login form | Email, password, submit, label associations | Form groups, typable, label resolution |
| 3: Navigation | Multiple pages, nav bar, links between pages | Page nav detection, chrome classification |
| 4: Dynamic | Dropdown, accordion, expandable widget | Reveal/conceal diff classification |
| 5: Multi-user | Alice and Bob with separate sessions | Subject handling, session isolation |
| 6: The demo feature | "Add Remember Me checkbox" — the capstone demo moment | Diff detection, glossary update |

Stages 1-3 are the minimum for the demo. Stages 4-5 make it more impressive.
Stage 6 is the demo itself.

---

## What Can Be Prepared in Advance

- The demo app, fully built and tested
- The full toddler loop classification (pre-labeled state)
- The Gherkin test for the Remember Me feature
- The "delete the checkbox" code change (practiced, ready to execute)
- The presentation slides (pitch line, project info, team credits)
- A separate "philosophy" video covering the planes model (linked, not presented)

**What must be live:**

- Running the sieve (or appearing to — could show a pre-captured sieve run)
- The 3-5 element rapid-fire classification (shows the toddler loop is real)
- `sl run` actually executing and passing/failing (the enforcement is real)
- The diff display (can be pre-rendered but must show real data)

---

## Fallback: Minimum Viable Demo

If things go wrong and not everything is ready:

**Fallback A (no live sieve):** Show pre-captured sieve output. "We ran the
sieve on this page. Here's what it found." Skip the live classification.
Show the pre-labeled state. Still do the code change + diff + test + enforcement
loop. Still compelling.

**Fallback B (no MCP):** Skip the "agent has vocabulary" step. Show the
glossary directly. "This is what the agent would see." Still do the test +
enforcement loop.

**Fallback C (no live test):** Show pre-recorded `sl run` output. "Here's
what happens when we run the test." Less dramatic but still shows the point.

**Absolute minimum:** Pre-captured sieve output + pre-labeled glossary +
show the glossary diff when code changes + show `sl run` failing on removed
element. That's the core argument in ~2 minutes, even without live anything.

---

## Automated Video Pipeline

The demo video is generated automatically — no manual rehearsals needed.

**Quick start:**

```bash
# Start services
bin/demo-run --no-sieve   # (start sieve from REPL separately)

# Terminal segments only (fast, no services needed)
make demo-quick

# Full pipeline: browser + terminal + TTS narration
make demo-final

# Re-render audio only (after editing demo-script.json narration)
make demo-rebuild
```

**Architecture:**

- **Browser segments** — Playwright records TL UI interactions (Acts 1, 3a, 5a)
- **Terminal segments** — asciinema `.cast` files rendered to MP4 (Acts 2, 3b, 4, 5b)
- **Narration** — Fish Speech TTS generates WAV clips from `demo-script.json`
- **Assembly** — FFmpeg concatenates video segments, mixes narration audio

**Files:**

| File | Purpose |
|------|---------|
| `leftglove/toddler/demo/browser-tour.spec.ts` | Playwright choreography |
| `leftglove/toddler/demo/terminal-segments.py` | Generates `.cast` files |
| `leftglove/toddler/demo/demo-script.json` | Narration text (15 clips) |
| `leftglove/toddler/demo/gen-demo-audio.py` | Fish Speech TTS |
| `leftglove/toddler/demo/assemble.sh` | FFmpeg concat + audio mix |
| `leftglove/toddler/demo/cast-to-mp4.py` | Renders `.cast` → MP4 via pyte |
| `Makefile` | Top-level targets |

**Iteration:** Edit `demo-script.json` for narration, `terminal-segments.py`
for terminal content, `browser-tour.spec.ts` for browser choreography. Use
`make demo-rebuild` for audio-only changes, `make demo-quick` for terminal-only
previews.

---

## The Demo Is Not Settled

The script above is **one option** — the current best guess. It's contingent
on what teammates contribute, how fast we move, and what ideas people bring.

**Alternative demo: Self-driving presentation.** SL drives a browser while
an 11Labs voice clone of Chair narrates. The presentation explains what it's
doing while doing it — opening a browser, following a script, showing the
output. Voice-as-interface demonstrates cross-interface capability. The
presentation gives itself and explains how it works simultaneously.

**If we get further than expected:** Some teammates have strong software
factories and can take a PRD and ship big chunks in hours. The hard design
work is largely done (these docs). If someone with a good factory takes the
toddler loop UI or the demo app, they might be done in a day. If that
happens, we may get much further than the current demo calls for — maybe
into live graph queries, live exploration, or multi-interface demos.

**If someone has a better idea:** We'll do that. The demo serves the pitch,
not the other way around.

---

## Anti-Goals

- Do NOT try to sieve a real production website during the demo. Too many
  variables. If it breaks on stage, the demo is dead.
- Do NOT show the graph queries or cross-plane analysis unless we actually
  get there. Not needed for the pitch.
- Do NOT explain the planes model on stage. Link to the video. The demo
  speaks for itself.
- Do NOT show the full toddler loop (50 elements). Show 3-5 elements to
  prove it works, then load the pre-labeled state.
- Do NOT let the agent generate the UI or do anything unpredictable during
  the demo. Practice every agent interaction. Know what it will say.
