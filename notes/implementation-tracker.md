# LeftGlove — Implementation Tracker

## Progress

- [x] **b6d-a** — Intermediate format definition
- [x] **r1x** — Pass 2 naming mode
- [ ] **4j8** — Load pre-labeled state
- [ ] **h34** — MCP vocabulary projection
- [ ] **qo2** — Element identity across observations
- [ ] **cuo** — Sieve diff display
- [ ] **07k** — Write glossary integration
- [ ] **y7x** — Verify `sl run` + strict mode
- [ ] **o4c** — Observation loop click
- [ ] **b6d-b** — Auto-save wiring
- [ ] **9m6** — End-to-end demo rehearsal

---

## The Final Product (What All of This Builds Toward)

LeftGlove is an MCP server that lets an AI agent (or human) point at any web app and:
1. **Perceive** it (the sieve scans the page, returns structured element inventory)
2. **Classify** elements (human rapid-fire categorizes: clickable/typable/readable/chrome/custom)
3. **Name** elements (human gives semantic names: "Login.email", "Dashboard.logout")
4. **Export** that vocabulary as SL glossary files (EDN)
5. **Project** the glossary as MCP tools the agent can call ("click Login.submit")
6. **Test** with ShiftLefter: the glossary powers Gherkin feature files that SL executes
7. **Explore** by clicking elements, auto-observing what changed, building a graph

Right now only step 1 and part of step 2 work. Each item below builds toward completing this pipeline.

---

## Item Details

---

### b6d-a — Intermediate Format Definition

**Phase:** 2 (first thing to build)

**Goal:** Define THE canonical data shape that every other component reads and writes. Currently the TL UI saves ad-hoc state to localStorage. This formalizes it into a documented, validated, round-trippable JSON format.

**Relation to final product:** This is the intermediate format described in the architecture — the artifact that sits between raw sieve output and SL glossary. It's the save file, the load file, the export format, and the data contract between the TL UI and the MCP server. Every subsequent item either produces or consumes this format.

**Prerequisites:** None. Phase 1 complete.

**What gets built:**
- `toIntermediate(state)` function — serializes current TL UI state to the canonical shape
- `fromIntermediate(data)` function — deserializes back to TL UI state
- `validateIntermediate(data)` function — checks shape validity, returns errors

**Where:** Functions added to `leftglove/toddler/index.html` script block

**Key data shape:**
```json
{
  "sieve-version": "1.0",
  "source": {
    "url": "http://localhost:3000/login",
    "viewport": { "w": 1920, "h": 1080 },
    "timestamp": "2026-04-08T14:30:00Z",
    "screenshot": "data:image/png;base64,..."
  },
  "elements": [
    {
      "sieve-id": "el-001",
      "category": "typable",
      "category-source": "human",
      "tag": "input",
      "element-type": "email",
      "label": "Email address",
      "locators": { "id": "email", "testid": "login-email" },
      "state": { "visible": true, "disabled": false },
      "rect": { "x": 660, "y": 300, "w": 600, "h": 44 },
      "region": "main > login-form",
      "form": "login-form",
      "aria-role": "textbox",
      "glossary-name": null,
      "glossary-source": null,
      "notes": null
    }
  ],
  "metadata": { "cookies": [], "storage": { "localStorage": [], "sessionStorage": [] }, "tabs": 1 },
  "pass-1-complete": false,
  "pass-2-progress": 0
}
```

**Acceptance criteria:**
- [ ] `toIntermediate(state)` produces valid JSON matching the documented shape
- [ ] `fromIntermediate(toIntermediate(state))` round-trips: UI state is identical after serialize/deserialize
- [ ] `validateIntermediate(badData)` returns meaningful error messages for missing/wrong fields
- [ ] Existing export button uses `toIntermediate()` instead of the current ad-hoc format
- [ ] Screenshot is embedded as base64 data URL in the format

---

### r1x — Pass 2 Naming Mode

**Phase:** 2 (parallel with h34, after b6d-a)

**Goal:** After the human finishes classifying every element in Pass 1, they enter Pass 2 where they assign semantic names. This is where "input #3" becomes "Login.email" — the name that will appear in the glossary and become an MCP tool.

**Relation to final product:** Without names, the glossary can't be generated (07k), MCP tools can't be projected (h34), and Gherkin features can't reference elements (y7x). Pass 2 is where raw sieve data becomes vocabulary. This is the human judgment step that makes everything downstream possible.

**Prerequisites:** b6d-a (intermediate format, for state shape agreement)

**What gets built:**
1. **State machine:** `state.mode` field ('pass1' | 'pass2' | 'review'). "Start Pass 2" button appears when all Pass 1 classifications are done.
2. **Pass 2 element list:** Filters to non-chrome, non-skip elements, groups by region, interactables first.
3. **Name proposal heuristic:** `proposeName(el)` — suggests a name from testid > id > name > label. Human accepts, edits, or types fresh.
4. **Intent derivation:** `deriveIntentName(region)` — "main > login-form" becomes "Login". Combined with element name: "Login.email".
5. **Bottom panel for Pass 2:** Name input (pre-filled), intent input, accept/skip buttons, notes textarea.
6. **SVG overlay updates:** Named elements show their glossary name above the rect. Named = green, unnamed = yellow, current = bright highlight.
7. **Keyboard shortcuts:** Enter = accept name + advance. Tab = skip. Escape = back to review.
8. **State storage:** `state.glossaryNames = { [index]: { name, intent, source, notes } }`

**Where:** `leftglove/toddler/index.html`

**Acceptance criteria:**
- [ ] After completing all Pass 1 classifications, a "Start Pass 2" button appears
- [ ] Pass 2 shows only non-chrome, non-skip elements
- [ ] Elements are grouped by region in the navigation order
- [ ] Name input is pre-filled with a reasonable proposal from locators/label
- [ ] Intent field is pre-filled from region path
- [ ] Enter accepts name and advances to next unnamed element
- [ ] Tab skips without naming
- [ ] Named elements show "Intent.name" label above their SVG rect
- [ ] Progress counter shows "X of Y named"
- [ ] Names persist in localStorage across page reloads
- [ ] Escape returns to Pass 1 review mode
- [ ] New testids added: `mode-indicator`, `btn-start-pass2`, `name-input`, `intent-input`, `btn-accept-name`, `btn-skip-name`, `pass2-progress`

---

### 4j8 — Load Pre-Labeled State

**Phase:** 2 (parallel with r1x, after b6d-a)

**Goal:** Load a previously saved intermediate format JSON file to resume a session or skip to a demo-ready state. Essential for demos ("skip the boring part") and for real usage (resume where you left off).

**Relation to final product:** Without save/load, every session starts from scratch. The intermediate format is the portable artifact — you can sieve on Monday, load it Tuesday, finish naming, export glossary Wednesday. Also critical for the demo: pre-baked fixture files let you jump to any pipeline stage.

**Prerequisites:** b6d-a (intermediate format definition)

**What gets built:**
1. **Load button** in toolbar with file picker (accepts .json)
2. **State hydration:** `fromIntermediate(data)` restores everything — inventory, screenshot, classifications, names, mode, progress
3. **Export upgrade:** Existing export button now emits full intermediate format (round-trippable)
4. **Fixture file:** Pre-labeled demo app login page saved as `leftglove/toddler/fixtures/demo-login-labeled.json`

**Where:** `leftglove/toddler/index.html` + new fixture file

**Acceptance criteria:**
- [ ] "Load" button appears in toolbar (`data-testid="btn-load"`)
- [ ] Clicking Load opens a file picker filtered to .json
- [ ] Loading a valid intermediate file restores: screenshot, element inventory, classifications, glossary names, current mode, progress counters
- [ ] Loading an invalid file shows a clear error (not a silent failure)
- [ ] Export -> Load round-trips perfectly (export a session, close tab, reopen, load — identical state)
- [ ] Pre-labeled fixture file exists and loads correctly
- [ ] After loading, all UI panels (overlay, detail, progress) reflect the loaded state

---

### h34 — MCP Vocabulary Projection

**Phase:** 2 (independent MCP track, parallel with TL UI work)

**Goal:** Make the MCP server actually useful. Read SL glossary EDN files from disk, project them as dynamic MCP tools. An agent connecting to LeftGlove sees tools like `click_Login_submit` and `fill_Login_email` — derived from whatever glossary files exist in the project.

**Relation to final product:** This is the agent-facing interface. The whole point of LeftGlove as an MCP server is that agents get typed, documented tools for interacting with a web app. Without vocabulary projection, the MCP server is just an echo tool. With it, the agent can drive the app using the same vocabulary that the human created in the toddler loop.

**Prerequisites:** MCP scaffold (done). Does NOT depend on TL UI work.

**What gets built:**
1. **EDN parser** (`src/edn/parser.ts`) — parse the subset of EDN used in glossary files (maps, vectors, keywords, strings, booleans, nil). Or use an npm package.
2. **Glossary reader** (`src/bridge/glossary.ts`) — reads subjects.edn, verbs-web.edn, intents/*.edn from `config.slProjectDir`, returns typed Glossary object.
3. **Observe tool** (`src/tools/observe.ts`) — static tool, always available. POSTs to sieve server, returns structured inventory.
4. **Vocabulary tools** (`src/tools/vocabulary.ts`) — for each intent region element, registers:
   - `click_{Intent}_{element}` (for clickable elements)
   - `fill_{Intent}_{element}` with `text` param (for typable elements)
   - `see_{Intent}_{element}` (for readable/visibility assertions)
5. **Refresh tool** — `refresh_vocabulary` re-reads glossary and re-registers tools
6. **Tool registry update** (`src/tools/index.ts`) — wires everything together

**Where:** `leftglove/mcp-server/src/` — 4 new files, 2 modified files

**Reference for EDN format:** `leftglove/toddler/sl-project/glossary/intents/toddler-loop.edn`

**Acceptance criteria:**
- [ ] `npm run build` succeeds with no errors
- [ ] MCP inspector (`npx @modelcontextprotocol/inspector node dist/index.js`) shows `observe` tool
- [ ] With `SL_PROJECT_DIR` pointing at `leftglove/toddler/sl-project/`, inspector shows tools derived from toddler-loop.edn (e.g., `click_ToddlerLoop_sieve`, `fill_ToddlerLoop_url-input`)
- [ ] `observe` tool returns sieve inventory JSON when sieve server is running
- [ ] Each projected tool has a meaningful description including element desc and locator info
- [ ] `refresh_vocabulary` tool re-reads glossary and updates tool list
- [ ] Graceful handling when glossary files don't exist (zero vocabulary tools, observe still works)
- [ ] Graceful handling when sieve server is down (observe returns error, vocabulary tools still listed)

---

### qo2 — Element Identity Across Observations

**Phase:** 3 (after Phase 2)

**Goal:** When you sieve the same page twice (or navigate and sieve a new page), determine which elements in the new inventory are "the same" as elements in the old one. This enables carrying classifications and names forward automatically — you don't re-label everything after every page change.

**Relation to final product:** Identity matching is the foundation for the diff (cuo), the observation loop (o4c), and ultimately the graph. Without it, each sieve is isolated. With it, the system understands continuity: "this submit button is the same submit button I named earlier."

**Prerequisites:** Phase 2 complete (needs sieve inventory shape from b6d-a, names from r1x to propagate)

**What gets built:**
1. **Composite key function:** `elementKey(el)` — priority: testid > stable id > name > region+tag+label
2. **Dynamic ID detector:** `isDynamicId(id)` — filters UUIDs, numeric sequences, framework-generated IDs
3. **Match function:** `matchElements(elemsA, elemsB)` returns `{ matched, added, removed, ambiguous }`
4. **Name propagation:** `propagateNames(matchResult, namesA)` — carries forward classifications and glossary names to matched elements
5. **TL UI integration:** On re-sieve, automatically match and propagate. Show match status in UI.

**Where:** `leftglove/toddler/index.html` (pure functions, designed to be extractable later)

**Acceptance criteria:**
- [ ] Sieve the demo login page, classify + name elements, sieve again — all names carry forward automatically
- [ ] Navigate to dashboard, sieve — new elements flagged as "added", login-specific elements flagged as "removed"
- [ ] Elements with `data-testid` always match correctly across sieves (testid is the strongest key)
- [ ] Elements without stable IDs match by region+tag+label composite key
- [ ] Dynamic IDs (UUIDs, framework-generated) are ignored in matching
- [ ] Ambiguous matches (multiple elements with same key) are flagged, not silently dropped
- [ ] Match result is visible somewhere in the UI (count of matched/added/removed)

---

### cuo — Sieve Diff Display

**Phase:** 3 (after qo2)

**Goal:** Visually show what changed between two observations. When you sieve page A, then navigate or click something and sieve page B, the diff view shows: what appeared, what disappeared, what moved, what changed state. Also classifies the overall transition: navigation, reveal, conceal, state mutation, no effect.

**Relation to final product:** The diff is how the system understands behavior. A button click that causes 80% of elements to change is "navigation." A click that adds 3 elements is "reveal." This classification feeds the graph (action edges carry diff classification) and is the basis for behavioral discovery — Level 2 of the sieve contract.

**Prerequisites:** qo2 (element identity / match function)

**What gets built:**
1. **Diff computation:** `computeDiff(inventoryA, inventoryB, matchResult)` — categorizes each element as added/removed/changed/unchanged, describes what changed per element
2. **Diff classification:** `classifyDiff(diff, urlA, urlB)` — 'navigation' | 'reveal' | 'conceal' | 'state-mutation' | 'no-effect' | 'compound'
3. **Diff overlay rendering:** Green dashed rects = added, red dashed = removed, yellow = changed, dimmed gray = unchanged
4. **Diff panel:** Bottom panel shows classification summary, counts, clickable change list
5. **"Accept diff" flow:** Accept new inventory with propagated names, exit diff view
6. **View mode management:** `state.viewMode` toggles between 'classify', 'diff', 'pass2'

**Where:** `leftglove/toddler/index.html`

**Acceptance criteria:**
- [ ] Sieve login page, navigate to dashboard, sieve again — diff view appears automatically
- [ ] Added elements shown in green with "NEW" label
- [ ] Removed elements shown in red with "REMOVED" label
- [ ] Changed elements (state/position/label changes) shown in yellow with change description
- [ ] Unchanged elements dimmed
- [ ] Classification banner shows correct type (e.g., "navigation — URL changed from /login to /dashboard")
- [ ] Summary counts: "5 added, 7 removed, 0 changed, 2 unchanged"
- [ ] Clicking a change in the list highlights that element in the overlay
- [ ] "Accept" commits the new inventory with propagated names and returns to classify mode
- [ ] New testids: `diff-summary`, `diff-added-count`, `diff-removed-count`, `diff-changed-count`, `btn-accept-diff`

---

### 07k — Write Glossary Integration

**Phase:** 3 (after r1x, benefits from cuo)

**Goal:** Transform named elements from the toddler loop into SL glossary EDN files. This is where human classifications graduate into ShiftLefter vocabulary — the elements become referenceable in Gherkin feature files and available as MCP tools.

**Relation to final product:** This closes the loop between human perception (toddler loop) and machine execution (SL tests, MCP tools). Without glossary export, names stay trapped in the TL UI. With it, the vocabulary flows into the testing and agent infrastructure.

**Prerequisites:** r1x (needs glossary names from Pass 2). Also benefits from cuo (multi-observation data), but works from a single labeled observation.

**What gets built:**
1. **Intermediate-to-glossary transformer:** `toGlossaryIntents(data)` — groups elements by intent prefix ("Login.email" -> intent "Login", element "email"), picks best locator binding per element
2. **EDN serializer:** `toEdn(intentObj)` — converts JS intent objects to SL-compatible EDN strings
3. **HTTP export:** POST each intent to `{API}/glossary/intents` (the SL glossary endpoint)
4. **Fallback file download:** If glossary endpoint unavailable, download EDN files directly
5. **"Export Glossary" button** alongside existing "Export JSON"

**Where:** `leftglove/toddler/index.html`

**Reference format:** `leftglove/toddler/sl-project/glossary/intents/toddler-loop.edn`

**Acceptance criteria:**
- [ ] "Export Glossary" button appears (`data-testid="btn-export-glossary"`) when Pass 2 has named elements
- [ ] Generated EDN matches SL's expected format (structurally identical to toddler-loop.edn)
- [ ] Elements grouped correctly by intent prefix (e.g., all "Login.*" elements in one intent file)
- [ ] Best locator selected per element: testid preferred, then id, then name, then CSS
- [ ] If SL glossary endpoint is reachable, POSTs successfully
- [ ] If endpoint is unreachable, falls back to file download with clear message
- [ ] Downloaded EDN is valid — `sl run --dry-run` can parse it without errors

---

### y7x — Verify `sl run` + Strict Mode Against Demo App

**Phase:** 4 (convergence point)

**Goal:** Prove the full pipeline works: glossary generated from toddler loop -> Gherkin features reference that glossary -> ShiftLefter executes those features against the live demo app and they pass.

**Relation to final product:** This is the first end-to-end validation. If this works, it proves that human perception (sieve + classify + name) flows through to machine execution (SL running browser tests). Everything before this is building pieces; this is the first time the pieces connect.

**Prerequisites:** 07k (glossary export), h34 (MCP tools use same glossary format), demo app (done)

**What gets built:**
1. **Demo app SL project:** New `leftglove/demo-app/sl-project/` with shiftlefter.edn, glossary (Login.edn, Dashboard.edn from 07k output or hand-written), subjects, verbs
2. **Feature files:** At least 2 Gherkin scenarios — successful login, failed login with error message
3. **Integration test script:** Extension to `bin/dogfood-test` or new `bin/demo-test`
4. **Strict mode validation:** `sl run --dry-run --strict` verifies all glossary refs resolve

**Where:** New `leftglove/demo-app/sl-project/` directory + test scripts

**Acceptance criteria:**
- [ ] `sl run --dry-run --strict features/` exits 0 (all glossary references resolve)
- [ ] `sl run features/login.feature` passes (successful login scenario)
- [ ] `sl run features/login.feature` passes (failed login scenario — error message visible)
- [ ] Glossary EDN in demo-app/sl-project/ matches what 07k would generate from a toddler loop session on the demo app
- [ ] Test script starts demo app + sieve server, runs SL, reports pass/fail
- [ ] Demo app credentials (alice@example.com / password1) confirmed working in features

---

### o4c — Observation Loop Click

**Phase:** 5 (after qo2, cuo)

**Goal:** Close the interactive loop: human clicks an element in the SVG overlay, the system clicks it on the live page, auto-re-sieves, and shows the diff. This is "daddy tells the toddler to click the button and we watch what happens."

**Relation to final product:** This is the exploration primitive. The agent (or human) can now drive the app through the toddler loop UI and see exactly how each click changes the page. Combined with identity matching and diff classification, each click produces a typed graph edge: "click Login.submit -> navigation to /dashboard."

**Prerequisites:** qo2 (element identity), cuo (sieve diff display)

**External blocker:** The SL sieve server may not have a `POST /click` or `POST /action` endpoint. Need to verify or add fallback.

**What gets built:**
1. **Explore mode toggle:** Toolbar button switches between "classify mode" (clicking selects element) and "explore mode" (clicking dispatches action on live page)
2. **Click dispatch:** Sends click action to sieve server, waits for response
3. **Auto-observe sequence:** After click completes -> auto sieve -> match -> diff -> show diff view
4. **Observation log:** `state.observationLog[]` records each observation + the action that preceded it

**Where:** `leftglove/toddler/index.html`

**Acceptance criteria:**
- [ ] "Explore mode" toggle button in toolbar (`data-testid="btn-explore-mode"`)
- [ ] In explore mode, clicking Login.submit in overlay dispatches a real click on the live page
- [ ] After click, automatic re-sieve fires
- [ ] Diff view shows the transition (e.g., navigation from /login to /dashboard)
- [ ] Observation log records: observation 1 (login page) -> action (click submit) -> observation 2 (dashboard)
- [ ] Works for at least: button clicks, link clicks
- [ ] Graceful error if sieve server doesn't support click (clear message, not crash)

---

### b6d-b — Auto-Save Wiring

**Phase:** 5 (after b6d-a)

**Goal:** Auto-save the intermediate format to disk after every classification or naming action. Currently state lives only in localStorage (browser-only, lost if you clear storage). Disk persistence makes sessions durable.

**Relation to final product:** Real usage requires durable sessions. A human might sieve dozens of pages over multiple days. Auto-save to disk files means sessions survive browser restarts, can be shared between people, and can be loaded into the MCP server.

**Prerequisites:** b6d-a (intermediate format)

**What gets built:**
1. **Small Node.js server** (`leftglove/toddler/server.js`) — serves index.html AND provides `POST /save` endpoint
2. **Auto-save hook:** After every classify/name action, debounced POST to `/save`
3. **Session files:** Saved to `leftglove/toddler/sessions/{url-slug}-{timestamp}.json`

**Where:** New `leftglove/toddler/server.js` + modifications to `leftglove/toddler/index.html`

**Acceptance criteria:**
- [ ] `node server.js` serves the TL UI on port 8080
- [ ] Every classification action auto-saves to `sessions/` within 2 seconds
- [ ] Every naming action auto-saves
- [ ] Session files are valid intermediate format JSON (loadable via 4j8)
- [ ] Multiple sessions (different URLs) produce separate files
- [ ] Server handles concurrent saves gracefully

---

### 9m6 — End-to-End Demo Rehearsal

**Phase:** 6 (everything done)

**Goal:** Rehearse the complete demo from cold start. Prove every piece works together. Identify timing, failure modes, and fallback plans.

**Relation to final product:** This IS the product demonstration. If this works smoothly, the project is demo-ready.

**Prerequisites:** Everything above.

**What gets built:**
1. **Updated demo script** (`notes/demo-script.md`) — exact sequence, timing, talking points
2. **Fixture files** for each demo stage (skip-ahead capability)
3. **Demo runner script** (`bin/demo-run`) — starts all services, reports readiness
4. **Rehearsal log** — timing notes from 3+ run-throughs

**Acceptance criteria:**
- [ ] Full demo completes in under 10 minutes from cold start
- [ ] Each pipeline stage has a pre-baked fixture file for skip-ahead
- [ ] `bin/demo-run` starts all services (demo app, sieve, TL UI, MCP server) and reports when ready
- [ ] At least 3 successful rehearsal runs logged
- [ ] Fallback plan documented for each stage that could fail live
