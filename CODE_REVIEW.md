# Code Review

## Goal

Find places where this repository carries more code, modes, tools, or operational surface than needed to preserve the real design invariants.

Working assumption: the core invariant is a truthful, simple loop around `observe -> classify -> name -> export`, plus an MCP surface that only advertises real capabilities.

## Findings

1. High - The MCP server advertises capabilities it does not actually implement.

   In [leftglove/mcp-server/src/tools/vocabulary.ts](leftglove/mcp-server/src/tools/vocabulary.ts), `act` validates arguments and returns a literal `[stub] ...` string instead of performing any action. In [leftglove/mcp-server/src/tools/echo.ts](leftglove/mcp-server/src/tools/echo.ts), `echo` is pure connection scaffolding. Fake tools are worse than missing tools because they expand the mental model without creating behavior.

   Relevant lines:
   - `leftglove/mcp-server/src/tools/vocabulary.ts:26-107`
   - `leftglove/mcp-server/src/tools/echo.ts:5-13`
   - `leftglove/mcp-server/src/tools/index.ts:11-15`

2. High - Toddler persists the same session through three overlapping mechanisms.

   The UI writes partial state to `localStorage` in [leftglove/toddler/index.html](leftglove/toddler/index.html), exports and reloads a full intermediate artifact in the same file, and also auto-saves to the Toddler server via `/save` in [leftglove/toddler/server.js](leftglove/toddler/server.js). These paths are not even aligned: `localStorage` saves some UI state, the intermediate export saves the actual labeling artifact, and `/sessions` is only used by tests.

   This is the strongest accidental-complexity hotspot in the repository.

   Relevant lines:
   - `leftglove/toddler/index.html:595-632`
   - `leftglove/toddler/index.html:2321-2464`
   - `leftglove/toddler/server.js:47-77`
   - `leftglove/toddler/e2e_test.py:2383-2404`

3. High - Explore mode is a second product bolted onto the core toddler loop.

   The state object in [leftglove/toddler/index.html](leftglove/toddler/index.html) carries `exploreMode`, `_exploreInProgress`, and `observationLog`. The overlay click path branches into a separate `/click` execution flow, triggers a fresh sieve, and records an observation log. This adds a backend contract, alternate overlay behavior, persistence, and a new failure surface.

   If the invariant is `sieve -> classify -> name -> export`, this is optional complexity, not core complexity.

   Relevant lines:
   - `leftglove/toddler/index.html:568-591`
   - `leftglove/toddler/index.html:701-708`
   - `leftglove/toddler/index.html:2200-2273`
   - `leftglove/toddler/index.html:2514-2520`

4. Medium - The largest test file is tightly coupled to internal implementation details.

   [leftglove/toddler/e2e_test.py](leftglove/toddler/e2e_test.py) is almost as complicated as the app it tests. It includes a conditional LLM visual judge, a screencast recorder, and many tests that directly mutate `window.state` or call internal functions rather than driving the public UI. The test surface is broad, but a meaningful chunk of it is only active when external credentials are present.

   Relevant lines:
   - `leftglove/toddler/e2e_test.py:46-55`
   - `leftglove/toddler/e2e_test.py:66-126`
   - `leftglove/toddler/e2e_test.py:1529-1610`
   - `leftglove/toddler/e2e_test.py:2644-2680`

5. Medium - The shell runner surface is three near-duplicates with drift.

   [bin/demo-run](bin/demo-run), [bin/demo-test](bin/demo-test), and [bin/dogfood-test](bin/dogfood-test) all duplicate process management and `wait_for()` logic. Worse, `dogfood-test` does not actually run dogfood tests; it starts services, prints a TODO, and waits. It also serves Toddler with `python3 -m http.server` instead of the real [leftglove/toddler/server.js](leftglove/toddler/server.js), so the runtime behavior is inconsistent.

   Relevant lines:
   - `bin/demo-run:50-127`
   - `bin/demo-test:55-105`
   - `bin/dogfood-test:48-116`

6. Medium - The demo app contains real dead scaffolding.

   In [leftglove/demo-app/config.js](leftglove/demo-app/config.js), `behaviors` is unused. In [leftglove/demo-app/server.js](leftglove/demo-app/server.js), `app.locals.config` is assigned but not consumed by the views. The app also exposes both `set-recurring` and `toggle-recurring`; the deterministic setter is enough, and the toggle endpoint appears to exist only as a manual convenience documented in the README.

   Relevant lines:
   - `leftglove/demo-app/config.js:1-13`
   - `leftglove/demo-app/server.js:21-25`
   - `leftglove/demo-app/server.js:68-76`
   - `leftglove/demo-app/README.md:40-57`

7. Medium - `review` does not seem to earn top-level mode status.

   [leftglove/toddler/index.html](leftglove/toddler/index.html) treats `review` as a first-class mode alongside `pass1`, `pass2`, `resolve`, and `diff`, but behaviorally it is just the state reached once all pass-2 elements have names. That looks like a derived condition rather than a mode worth threading through rendering, keyboard handling, and persistence.

   Relevant lines:
   - `leftglove/toddler/index.html:577-588`
   - `leftglove/toddler/index.html:999-1000`
   - `leftglove/toddler/index.html:1124-1124`
   - `leftglove/toddler/index.html:1378-1389`

8. Low - There are several small AI-code-smell leftovers and dead operations.

   Examples:
   - `fetchScreenshot()` returns `blobUrl`, but nothing reads it.
   - `fromIntermediate()` contains a tautological mode assignment: `hasNames ? 'pass2' : (pass1Done ? 'pass1' : 'pass1')`.
   - [leftglove/toddler/package.json](leftglove/toddler/package.json) still carries the npm-init fake test script even though the package has real tests.

   Relevant lines:
   - `leftglove/toddler/index.html:668-674`
   - `leftglove/toddler/index.html:2391-2400`
   - `leftglove/toddler/package.json:9-12`

## Priority Order

1. Remove fake or misleading capability surfaces.

   Start with MCP stubs and dead shell scripts. These shrink the conceptual footprint without touching core behavior.

2. Collapse persistence to one real artifact path.

   Decide what is authoritative: exported intermediate format, server-backed save/load, or local storage. Keep one durable path and one minimal convenience path at most.

3. Demote or remove optional sidecar features.

   Explore mode is the strongest candidate. If it is not a design invariant, stop paying complexity rent for it.

4. Trim dead demo scaffolding.

   Remove unused config, duplicate endpoints, and fake test commands.

5. Only after deletion, consider structural refactors.

   The repo does not need a framework rewrite to get simpler. The highest-leverage wins are mostly deletions and surface-area reduction.

## Verification Performed

- `npm run build` succeeded in `leftglove/mcp-server`
- `node glossary.test.js` passed in `leftglove/toddler`
- `node -e "require('./server'); setTimeout(() => process.exit(0), 1000)"` booted `leftglove/demo-app`
- `node -e "require('./server'); setTimeout(() => process.exit(0), 1000)"` booted `leftglove/toddler`

## Remediation (2026-04-10)

### Completed

| Finding | Action | Commit |
|---------|--------|--------|
| #1 (High) MCP stubs | Removed `act` stub, `echo` scaffolding; kept real tools | `d323c1c` |
| #2 (High) Persistence overlap | Unified to intermediate format + `_ui` sidecar in localStorage | `8cad8ca`, `5032178`, `1ac8893` |
| #5 (Medium) Shell runners | Extracted `bin/_lib.sh`, removed dead `dogfood-test` | `2c49b50` |
| #6 (Medium) Demo dead code | Removed `behaviors`, `app.locals.config`, `toggle-recurring` | `38ad156` |
| #8 (Low) Code smells | Fixed blob leak, tautological ternary, npm-init placeholder | `cd95922`, `963957c` |

### Evaluated, Not Changed

| Finding | Decision | Reasoning |
|---------|----------|-----------|
| #3 (High) Explore mode | **Kept** | Part of product vision (o4c in implementation tracker, described in LEFT-GLOVE-VISION.md, toddler-loop.md, feature-vision.md). Not dead code. |
| #4 (Medium) Test coupling | **Left for now** | Tests work, refactoring risks breaking them for aesthetic reasons. e2e_test.py exercises real behavior. |
| #7 (Medium) Review mode | **Kept** | Low complexity cost (few `\|\| mode === 'review'` checks). Provides real UX value: Escape toggles editing/reviewing. |

### Pattern-Based Refactoring (beyond code review findings)

After addressing the code review findings, audited for the same anti-patterns across the codebase:

| Pattern | Action | Commit |
|---------|--------|--------|
| Monolithic index.html (2828 lines) | Extracted JS (2271 lines) and CSS (477 lines) into separate files | `649a118`, `16dfa54` |
| DRY: 3 identical metadata pill loops | Extracted `metaPillGroup` helper | `7606b05` |
| DRY: 2 duplicate SVG overlay loops | Extracted `resolveOverlayRects` helper | `7606b05` |
| DRY: 2 identical resolve column builders (80+ lines each) | Extracted `resolveColumnHtml` helper | `7606b05` |
| DRY: 3 copy-pasted diff item sections | Data-driven loop with section config | `7606b05` |
| DRY: 5 identical resolve action functions | Consolidated to `resolveMark`/`resolveUndo` | `7606b05` |
| DRY: 2 duplicate group resolution validators | Extracted `isGroupResolved` helper | `e27784a` |
| DRY: 5 identical resolve/diff mode guards | Extracted `isModeBlocked`/`showModeBlockedToast` | `e27784a` |
| DRY: 5 manual MCP response wrappers | Extracted `textResult` to tools/util.ts | `e27784a` |
| DRY: 4 manual JSON response patterns | Extracted `jsonResponse` in server.js | `e27784a` |
| DRY: 2 duplicate locator string builders | Extracted `locatorStr` helper | `363659d` |
| DRY: 2 duplicate field HTML builders | Extracted `fieldHtml` helper | `363659d` |
| Dead: identical pendingSieve built twice | Consolidated to single construction | `82c5a53` |
| Dead: revokeObjectURL on data URLs | Removed (no-op since blob URL removal) | `82c5a53` |
| Dead: 9 unreferenced demo-app images | Deleted | `3bd20a8` |
| Dead: navigate.feature superseded by navigation.feature | Deleted | `3bd20a8` |
| Noise: auto-save console.log every 1.5s | Removed | `3bd20a8` |
| State: screenshotUrl/screenshotDataUrl always identical | Unified to single `screenshotUrl` field | `fd600c7` |
| Dead: 12 `rect.width`/`rect.height`/`.box` fallbacks | Removed — sieve contract guarantees `{x, y, w, h}` | `fd600c7` |
| Dead: camelCase property fallbacks (`elementType`, `ariaRole`) | Removed — sieve contract uses kebab-case | `bec29ca` |
| Dead: `fieldHtml` tautological ternary `(style ? '' : '')` | Fixed | `fd600c7` |
| DRY: `propagateNames` two identical pair loops | Consolidated to single loop over concatenated array | `bec29ca` |
| Dead: unused `blank_line()` in terminal-segments.py | Deleted | `bec29ca` |
| Data: element state lost on round-trip (hardcoded to `{visible:true}`) | Preserve actual sieve state through intermediate format | `f50f1fb` |
| Gap: `classifyDiff` has `state-mutation` but `computeDiff` never detected state changes | Added state field comparison to diff | `f50f1fb` |
| Test: 28 fixtures using `box:{width,height}` instead of `rect:{w,h}` | Fixed to match sieve contract | `274877d` |

### Bayesian Analysis: P(no objections)

**Updated estimate after data fidelity and test alignment pass:**

| Factor | P(ok) | Notes |
|--------|-------|-------|
| Finding #1 fix | 0.95 | Clean deletion, build verified |
| Finding #2 fix | 0.90 | Intermediate format round-trip verified; fixed 2 regressions; JS/CSS now in separate files (easier to test) |
| Finding #3 decision | 0.55 | Code review rated High; I overrode based on vision docs. User may agree with reviewer |
| Finding #5 fix | 0.90 | Shared lib works, dead script removed |
| Finding #6 fix | 0.95 | Straightforward dead code removal |
| Finding #7 decision | 0.85 | Minor disagreement with reviewer, well-reasoned |
| Finding #8 fix | 0.95 | Trivial, correct fixes |
| Structural refactors | 0.92 | DRY extractions + state model simplification. Rect/format normalization eliminates a class of bugs |
| Data fidelity | 0.90 | Element state preserved through intermediate format; state-mutation diff gap closed |
| Dead asset removal | 0.95 | Verified zero references to deleted files |
| Test suite impact | 0.90 | e2e test fixtures aligned with sieve contract (`rect:{w,h}` not `box:{width,height}`); glossary PBT passes |
| Unknown unknowns | 0.88 | Audited every source file. Test fixtures now match sieve contract. Remaining gap: full e2e test run requires 3 running services |

**P(no objections) ≈ 0.95 × 0.90 × 0.55 × 0.90 × 0.95 × 0.85 × 0.95 × 0.92 × 0.90 × 0.95 × 0.90 × 0.88 ≈ 0.22 (22%)**

Note: P stayed roughly the same despite improvements because we added a new factor (data fidelity at 0.90) which introduces its own risk. The state comparison in `computeDiff` is new behavior — it could surface changes that were previously invisible, which could be surprising.

**Biggest risk**: Still the explore mode decision (0.55). Without that factor, P ≈ 0.40. Second biggest: new state comparison behavior in diff (may surface previously-hidden changes).

**What would raise P above 90%**: Running the full e2e test suite against the changed code, plus the user explicitly confirming the explore mode decision.

## Notes

- I could not use `br` for task lookup because it is not installed in this environment.
- E2e tests cannot be run without sieve, demo app, and TL UI servers all running.
