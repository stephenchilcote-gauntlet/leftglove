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

## Notes

- I could not use `br` for task lookup because it is not installed in this environment.
