# The Toddler Loop

**Canonical for:** Toddler loop pipeline, two-pass UI, shared vocabulary, sieve diff classification, interaction medium
**Linked from:** VISION.md § Key Concepts — The Toddler Loop
**Last verified:** 2026-04-03

---

## What It Is

The toddler loop is a human-in-the-loop pipeline for teaching the system what
things are and how they behave. The sieve looks at the world, makes guesses,
and asks the human when it's unsure. The human's answers become the system's
vocabulary — glossary entries, behavioral classifications, intent region
definitions.

The name is literal: this is how a toddler learns. Point at thing, guess name,
adult corrects, repeat. Except the toddler has perfect memory and never forgets
what it learned.

```
observe → guess → ask human → record answer → graduate to SL artifact
```

**Key design principle:** The toddler loop decouples from the graph. It can work
early by dumping to flat files or EDN, with graph persistence wired in later.
This removes a blocking dependency and lets the most human-visible piece work
first.

---

## Live vs Async

The toddler loop can run **live** (connected to a running browser, sieving in
real time) or **async** (processing sieve output files after the fact).

**Async is easier and is capstone scope.** Someone (human or agent) runs the
sieve, dumps output files (inventory + screenshot). The toddler loop UI
processes the files. No live browser connection required.

**Live is the full vision.** Agent explores autonomously — clicking links,
re-sieving, classifying diffs. Human intervenes to label and correct. The agent
drives exploration, the human provides meaning. Periodically bounce the
environment and reset state so the agent explores from different entry points.

Build async first. Live is a progression, not a prerequisite.

---

## The Ideal Workflow (Working Backwards)

**End-state vision:**

1. Agent puts on the left glove (LG as MCP server)
2. Point it at a starting URL → sieve runs → initial inventory + screenshot saved
3. Two things happen in parallel:
   - **Human** classifies and labels elements on the current page (toddler loop)
   - **Agent** explores autonomously — clicking links, re-sieving, identifying
     new pages vs widgets vs state changes via diffs
4. Agent wanders down paths, discovers the app's topology
5. Periodically: bounce the environment, reset state, explore from a fresh angle
6. Human intervenes whenever — label things, correct classifications, redirect

**Capstone scope:** Just the async labeling UI against sieve output files. The
autonomous exploration loop is vision, not v1.

---

## The Two-Pass UI

**Breadth-first, then depth. Not configurable.** The breadth-first pass is so
cheap and so valuable that letting users skip it is a false economy.

### Pass 1 — Classify (Breadth-First, Rapid-Fire)

Go through every element the sieve found. One classification per element. No
typing. No naming. Just "what kind of thing is this?"

**Five categories:**

| Category | Meaning | Key | What the sieve looks for |
|---|---|---|---|
| **clickable** | You click/tap it, something happens | `c` | buttons, links, toggles, checkboxes, radios, tabs, cards — anything you click |
| **typable** | You type text into it | `t` | inputs, textareas, contenteditable |
| **readable** | The system shows you information | `r` | headings, labels, status text, prices, counts, alerts |
| **chrome** | Structural, decorative, layout | `x` | nav containers, footers, wrappers, dividers |
| **custom** | Interactable but doesn't fit the above | `u` | canvas interactables, draggables, game pieces, weird widgets |

**Two actions:**

| Action | Meaning | Key |
|---|---|---|
| **split** | This box is wrong — it's actually multiple things | `/` |
| **skip** | Don't care about this element, move on | `.` |

**The UI for Pass 1:**

```
[Full-page screenshot with element #17 of 47 highlighted]

  tag: input | type: email | label: "Email address"
  region: main > login-form

  [ c ] [ t ] [ r ] [ x ] [ u ]  |  [ / split ] [ . skip ]
                                     ← →  #17/47
```

One keystroke per element. Immediately advance to next. At the end:

```
Classification complete: 47 elements
  12 clickable
   4 typable
   6 readable
  23 chrome
   1 custom
   1 flagged for split

Ready to label? [Enter]
```

**Why NOT sub-classify in Pass 1:** Don't distinguish button from dropdown from
toggle from link. They're all `clickable`. The distinction (what KIND of
clickable) is behavioral — it depends on what happens when you click, which is
a Pass 2 / diff concern. Pass 1 is pure structure: can I interact with it, and
how (click/type/other)?

**Why NOT `selectable` as a category:** A dropdown trigger is clickable. The
options inside are also clickable. The "select a value from a list" behavior
is discovered via the diff (click trigger → options appear → pick one → value
changes). That's behavioral classification, not structural.

### Pass 2 — Label (Depth, Prioritized)

Show only non-chrome elements, grouped by region. Interactables first.

```
[Screenshot zoomed to region: main > login-form]

  Region: main > login-form
  Category: typable (input, email)
  Sieve label: "Email address"
  Locators: id=email, name=email, testid=login-email

  Your name: [ Login.email_____________ ]

  [ accept sieve label ] [ skip for now ] [ merge with adjacent ]
```

Now the human is naming things with full-page context from Pass 1. They know
this is one of 3 form fields in a login form because they already classified
the whole page.

**Merge (the lump function):** Complement to split. "These three elements are
actually one semantic unit — group them." Use case: a button with an icon and
text that the sieve split into 3 elements, or a set of related paragraphs that
are semantically one block.

**Sub-classification (optional in Pass 2):** The human can refine if they want —
"that clickable is specifically a dropdown trigger" — but for capstone, just the
name is enough. The sieve already captured the HTML tag and ARIA role. The human
adds semantic meaning, not structural description.

### Split Handling

When the human flags an element for split in Pass 1:

**V1 approach:** Re-sieve just that region at finer granularity. Run the same
sieve JS but scoped to the flagged element's bounding box, with more aggressive
element detection (lower thresholds for "is this a distinct element?"). Then
run Pass 1 again on just the new sub-elements.

If re-sieving chews up too much time, fall back: flag the split, skip it, move
on. Fix it in a later session. Don't block the classification pass.

---

## The Shared Vocabulary

The sieve and the human speak the **same vocabulary**. Pattern names aren't
internal sieve categories — they're the shared language at every level.

```
Sieve detects: "click caused overlay with options → dropdown_open"
Human overrides: "no, that's actually a modal"
Both use the same terms. The system records the same way either way.
```

This vocabulary flows through everything:

- **Sieve** proposes element classifications and behavioral patterns
- **Toddler loop** asks the human to confirm, correct, or manually classify
- **Graph** stores classifications on nodes (element type) and edges (action type)
- **Glossary** uses these as structural metadata on intent region elements
- **Test generation** uses behavioral patterns to know what assertions make sense

### Behavioral Vocabulary (Level 2 — What HAPPENED Between Observations)

These are classified from the diff between successive sieve outputs.

**Click outcomes — three categories plus none:**

**1. Navigation** — where you are changes

| Subtype | What the diff shows |
|---|---|
| Full page load | URL changed, most elements replaced |
| SPA route change | URL/hash changed, partial element swap |
| Scroll to anchor | Same page, viewport moved, hash may update |
| New tab/window | Current page unchanged, new context opened |

**2. Reveal/conceal** — elements appear or disappear

| Subtype | What the diff shows |
|---|---|
| Widget expand | Same page, new elements in a localized region |
| Widget collapse | Elements gone from a region |
| Dropdown open | Overlay appeared with option elements |
| Modal open | Full overlay with new content |
| Modal/dropdown close | Overlay elements disappeared |
| Tab switch | Elements swapped in same region |
| Sidebar/drawer | Large region appeared/disappeared at page edge |
| Inline edit | Text element replaced by input (or reverse) |
| Async content | Loading placeholder → real content after delay |

**3. State mutation** — existing elements change without appearing/disappearing

| Subtype | What the diff shows |
|---|---|
| Toggle | Checkbox/radio/switch state changed |
| Value change | Counter incremented, selection updated |
| Sort/reorder | Same elements, different order |
| Visual feedback | Icon filled, badge updated |
| Validation | Error classes/messages on existing elements |

**4. No visible effect** — nothing the sieve can detect

Disabled element, non-visual action (analytics, clipboard), or broken.

**Compound effects:** A single click can produce multiple categories. "Add to
Cart" → badge updates (state mutation) AND toast appears (reveal). The sieve
reports all diffs, each classified independently.

### Non-Click Interactions

| Interaction | Typical outcome | v1 support |
|---|---|---|
| Type/enter text | Autocomplete (reveal), validation (mutation) | Yes |
| Select option | Dropdown closes (conceal), value changes (mutation) | Yes |
| Hover | Tooltip appears (reveal) | Stretch |
| Scroll | Lazy content loads (reveal) | Stretch |
| Drag and drop | Element repositioned (mutation) | No — v2 |
| Keyboard shortcut | Any of the above | No — v2 |

---

## Three Modes of Operation

### Mode 1: Sieve Is Confident

The sieve classifies automatically. Human confirms with "yep" or silence.

```
Sieve: "I clicked this button. 5 elements appeared in the same region.
        The button changed state to :expanded. Classification: widget_expand."
Human: "yep" (or silence = accept)
```

Fast path for well-structured modern apps with good ARIA and semantic HTML.

### Mode 2: Sieve Is Uncertain

Shows before/after with diff highlighted. Asks.

```
Sieve: "Something changed but I'm not sure if this is a dropdown, a widget,
        or new page content. What is this?"
Human: "That's a dropdown. Those are the options."
```

Recorded with `:source :human` and `:confidence 1.0`.

### Mode 3: Sieve Is Useless

Old jQuery, tables-for-layout, no ARIA, everything is a `<div>`. Human
classifies from the screenshot manually.

```
Human: "That div is a dropdown trigger. Those hidden list items are options."
```

Same data structure whether automatic or manual. No model difference.

### Graceful Degradation

Fully automatic → fully manual without changing the data model. Effort scales
with the app's structural quality, not the system's limitations.

---

## Interaction Medium

### Screenshots + SVG Overlay (Not In-Browser Overlay)

The toddler loop UI works on **screenshots with SVG overlays**, not in-browser
DOM overlays. This is a deliberate design decision.

**Why not in-browser overlay:**

- Z-index wars with the app's own CSS (modals at z-index 9999, stacking contexts)
- Pointer event conflicts (overlay blocks clicks on underlying elements)
- Position drift when the page scrolls or reflows
- Injected DOM nodes cause reflows that change what you're observing
- CSS containment (`overflow: hidden`, `contain: paint`) clips overlays
- If React DevTools can't get overlays right 100%, a general tool won't either
- Easy to get 85%. The last 15% is a tarpit that can consume a capstone.

**Why screenshots + SVG works 100%:**

- The screenshot is a frozen image. It can't reflow, scroll, or fight back.
- The sieve captures absolute coordinates (`:rect`) for every element.
- SVG rectangles at those coordinates are trivially correct.
- The target app is completely undisturbed. No injected CSS, no DOM mutations.
- Works for any page, any framework, any complexity.

```svg
<!-- One element overlay — that's it -->
<rect x="660" y="300" width="600" height="44"
      fill="none" stroke="#22d3ee" stroke-width="2" opacity="0.8"/>
<text x="660" y="295" fill="#22d3ee" font-size="12">
  typable: "Email address"
</text>
```

**Overlapping elements:** Handled naturally. Overlapping sieve rects produce
overlapping SVG boxes. The screenshot shows what's visually on top. The UI
presents elements in z-order for classification.

### Browser Size and Screenshots

**Force a specific viewport.** The sieve run accepts a viewport size parameter
(default 1920x1080). The browser is sized BEFORE the sieve runs. Both
Playwright and WebDriver support this.

**Full-page screenshots.** Playwright: `page.screenshot({fullPage: true})`.
CDP: `Page.captureScreenshot` with `captureBeyondViewport`. Captures the entire
scrollable page, not just the viewport.

**Absolute coordinates.** The sieve JS must use absolute page coordinates, not
viewport-relative:

```javascript
const rect = element.getBoundingClientRect();
const absRect = {
  x: rect.x + window.scrollX,
  y: rect.y + window.scrollY,
  w: rect.width,
  h: rect.height
};
```

The SVG overlay uses these same absolute coordinates on the full-page screenshot.
The toddler loop UI displays the image at full dimensions with browser scroll.
Coordinates match perfectly.

**Lazy-loaded content below the fold:** The sieve may need to scroll first to
trigger lazy loads, then re-capture. Or accept this as a v2 concern. For a
demo app we control, we can avoid lazy loading.

### Console Log Capture

**Capture and store alongside sieve output. Don't surface in the toddler loop
by default.**

```clojure
{:console [{:level :error :message "Uncaught TypeError: ..." :source "app.js:142"}
           {:level :warn :message "Deprecation: ..." :source "vendor.js:88"}]
 ;; ... rest of sieve output
 }
```

Cheap to capture (Playwright and CDP have console listeners). Diagnostic, not
operational — if the sieve output looks weird, the console log explains why.
The toddler loop UI might show a small indicator ("3 console errors") that
expands on click, but it doesn't interrupt the classification flow.

For brownfield sites, console errors are expected and usually not actionable.
The sieve works on the DOM as-is.

### V1 Implementation

Localhost web application. Technologies: anything that renders HTML + SVG.
Reads sieve output files (JSON/EDN + screenshot PNG). Displays screenshot with
SVG overlay. Captures human input via keyboard shortcuts and text fields.
Writes labeled output back to files.

**Aspiration:** Voice-first via speech-to-text. "yep, BuyBox.add-to-cart" /
"skip" / "chrome" — 50 elements in 5 minutes. But typed input works for v1.

---

## The Observation Loop (Level 2)

The sieve works through a sequence of observations. This is the autonomous
exploration loop — capstone-deferred, but the design drives Level 1.

```
1. Sieve → S1 (baseline inventory + screenshot)
2. Act (click, type, select)
3. Wait for quiescence (DOM stops mutating meaningfully)
4. Sieve → S2 (new inventory + screenshot)
5. Diff S1 vs S2
6. Classify the change (auto or ask human)
7. Record observation, action, and classification
8. Repeat
```

### Quiescence Detection

After an action, wait for the DOM to settle. "Settled" means no meaningful
mutations for N milliseconds. "Meaningful" excludes CSS transitions, cursor
blinks, animation frames. Implementation: MutationObserver with debounced
timeout. Start conservative, tune later.

### Diff Classification Heuristics

| Signal | Classification |
|---|---|
| URL changed + >50% elements replaced | `navigation` |
| URL unchanged, elements appeared in one region | `reveal` |
| URL unchanged, elements disappeared from one region | `conceal` |
| Elements appeared as overlay (fixed/absolute, high z-index) | `reveal` (modal/dropdown) |
| No new/removed elements, `:state` fields changed | `state_mutation` |
| No meaningful diff | `no_effect` |

Where the change happened matters: new elements in `main > product > reviews` =
widget expansion. Everything under `main` changed while `nav`/`footer` stayed =
SPA navigation.

### Discovery Examples

**Widget:**

```
S1: Button "Reviews (12)" in product-detail. No review content.
→ Click → quiescence
S2: Same URL. NEW: 5 elements in product-detail > reviews. Button: :expanded true.
    Classification: widget_expand. Button controls this region.
→ Click again → quiescence
S3: Review elements gone. Button: :expanded false.
    Classification: widget_collapse. Confirmed toggle.
→ Toddler loop: "Toggle widget, 'Reviews (12)'. What do you call this?"
→ Human: "ProductDetail.reviews-widget"
```

**Dropdown:**

```
S1: Button "Sort by: Relevance"
→ Click → quiescence
S2: Overlay appeared with options. Classification: dropdown_open.
→ Click "Price: Low to High" → quiescence
S3: Overlay gone. Button text changed. List reordered.
    Classification: selection_made + content_reorder.
```

---

## Glossary Building (Primary Use Case)

### Exhaustive Scan Approach

Start with everything, label until useful.

```
1. Sieve the whole page → all elements in inventory as orphans
2. Pass 1: classify everything (rapid-fire)
3. Pass 2: label the non-chrome elements
4. What's left unlabeled is a product audit
```

### Drift Detection

Re-sieve after deploys. Diff against glossary:

```
REMOVED: ProductPage.old-share-button (locator gone)
CHANGED: ProductPage.add-to-cart (label "Add to Cart" → "Add to Basket")
NEW: 3 elements in BuyBox — orphans, need labeling
```

---

## What Graduates to SL

Observations graduate into SL artifacts when the human approves:

- **Element labels** → glossary entries (intent region elements with locators)
- **Behavioral patterns** → step definition candidates
- **Widget structures** → intent region definitions
- **Navigation patterns** → intent region transitions

Graduation is explicit. The toddler loop is a staging area, not a direct pipeline.

---

## The Progressive Demo App

The demo app starts simple and gets crazier to demonstrate sieve capabilities:

| Stage | What it tests | Elements |
|---|---|---|
| 1: Basics | Static text, heading, button, link | clickable, readable, chrome |
| 2: Forms | Text inputs, password, submit, labels | typable, form groups |
| 3: Dropdowns | Select element, custom dropdown | clickable → reveal behavior |
| 4: Widgets | Accordion, tabs, expandable section | clickable → expand/collapse |
| 5: Overlapping | Modal, toast, hover menu | z-layered elements |
| 6: Dynamic | Lazy-loaded list, AJAX update, spinner | quiescence, async reveal |
| 7: Weird (stretch) | Draggable, canvas, contenteditable | custom classification |
| 8: Real site (stretch) | Something we don't control | full acid test |

Each stage is a story. The demo walks through stages until time runs out.
Whatever stage you reach IS the demo.

---

## UI Layout

### Bottom Panel (Not Modal, Not Second Window)

```
┌──────────────────────────────────────────────────┐
│                                                  │
│           Screenshot + SVG overlays              │
│           (scrollable, full-page image)           │
│                                                  │
│     [current element: cyan highlight]             │
│     [classified: colored borders by category]     │
│     [unclassified: dim outline]                  │
│                                                  │
├──────────────────────────────────────────────────┤
│  ┌──────────────────┐ ┌───────────────────────┐  │
│  │ Element info:     │ │ [ c ] [ t ] [ r ]    │  │
│  │ input, email      │ │ [ x ] [ u ]          │  │
│  │ "Email address"   │ │ [ / split ] [ . skip]│  │
│  │ main > login-form │ │                      │  │
│  │ id=email          │ │ #17 / 47   ← →      │  │
│  └──────────────────┘ └───────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**Why bottom panel:**

- Most web content is top-to-center. Bottom panel obscures the footer — the
  least important part of any page.
- Predictable. Always there, same place. No dragging, no finding, no managing.
- Universal muscle memory: VS Code terminal, Premiere timeline, Chrome DevTools.
- Trivial to implement: CSS flexbox, fixed-height bottom panel.
- Resizable (drag handle) is nice-to-have. Fixed 200-250px works for v1.

**Why NOT modal/palette:** Text-heavy draggable palette = "another thing you
have to fucking move." Every time you want to see the element behind it, you
drag. Photoshop can do this because their tools are tiny icons. Ours is text.

**Why NOT second window:** Great on dual monitors, terrible on a laptop,
terrible in a demo on a projector. postMessage communication adds complexity.

**No agent-generated UI.** The agent provides DATA (sieve output, suggested
classifications). The UI renders deterministically. The agent can fail at
classification (human corrects). The agent cannot fail at rendering (because
it doesn't do it). Make deterministic shit deterministic.

### Panel Contents Per Mode

| Mode | Left side | Right side |
|---|---|---|
| **Pass 1** | Tag, type, sieve label, region | Category keys (c/t/r/x/u), split/skip, progress |
| **Pass 2** | Full element detail + locators | Name input, accept/skip/merge, sieve suggestion |
| **Review** | Filter controls, summary stats | Export/save, "label unlabeled" action |

### Overlay Modes

**Pass 1:** One element highlighted at a time. Everything else dimmed or
faintly outlined. As you classify, elements get colored borders.

**Pass 2:** All classified elements visible with color coding. Current
element highlighted brightly. Full-page context.

**Review:** Filter by category (only clickables, only unlabeled, specific
region). Summary stats visible.

---

## Data Pipeline

### The Flow

```
Raw sieve output (JSON/EDN + screenshot PNG)
        │
        ▼
Toddler loop adds classifications (Pass 1) + labels (Pass 2)
        │
        ▼
Labeled intermediate format (THE ARTIFACT — portable, resumable)
        │                    │
        ▼                    ▼
SL glossary              Asami graph (eventually)
(derived, always          (someone reads intermediate +
 current — regenerated     glossary and feeds both in)
 on every label change)
```

**The intermediate format is the source of truth.** The glossary and graph
are derived views. You can always regenerate the glossary from the
intermediate. You can always rebuild the graph from the intermediate.

**The glossary floats with the artifact.** As labels are added, the SL
glossary is continuously re-derived. At any point you can export the current
glossary state. When handed off for review, the glossary comes along. When
corrections are made, the glossary updates. When done, merge — you get a
glossary diff alongside code changes.

### Intermediate Format (Rough Shape)

```clojure
{:sieve-version "1.0"
 :source {:url "https://demo.app/login"
          :viewport {:w 1920 :h 1080}
          :timestamp #inst "2026-04-03T14:30:00Z"
          :screenshot "login-2026-04-03.png"}

 :elements
 [{:sieve-id "el-001"
   :category :typable                     ;; from Pass 1
   :category-source :human                ;; :sieve or :human
   :tag "input" :element-type "email"
   :label "Email address"                 ;; sieve-derived label
   :locators {:id "email" :name "email" :testid "login-email"}
   :state {:visible true :disabled false}
   :rect {:x 660 :y 300 :w 600 :h 44}
   :region "main > login-form"
   :form "login-form"
   :aria-role "textbox"

   ;; Toddler loop additions (Pass 2)
   :glossary-name "Login.email"           ;; human-assigned, nil if unlabeled
   :glossary-source :human
   :notes nil}
  ;; ...
  ]

 :console []
 :pass-1-complete? true
 :pass-2-progress 12}
```

### Session Lifecycle

| Scenario | How it works |
|---|---|
| **Fresh dump** | New sieve output, no labels. Start Pass 1. |
| **Resume** | Open intermediate file. Pass 1 partially done. Continue. |
| **Review loop** | PM classifies → saves → dev opens, corrects 3 labels → saves. Glossary updates. |
| **Re-sieve after code change** | New sieve for same page. Diff against previous intermediate. New/changed/removed elements flagged. Existing labels preserved for unchanged elements. |
| **Export glossary** | Generate SL glossary EDN from current labels. Always available, always current. |

---

## Manual Element Addition

The sieve will miss things. Canvas content, elements hidden behind specific
state, elements the sieve misclassified as noise. The human needs to be able
to **add elements that the sieve didn't capture.**

### Through the Toddler Loop UI (Primary Path)

The UI needs an "add element" affordance:

1. Human clicks on the screenshot (or drags a box)
2. Enters classification, label, and optional locator
3. Creates a human-sourced element record in the intermediate format:

```clojure
{:category :clickable
 :category-source :human
 :label "Hidden admin menu"
 :rect {:x 50 :y 50 :w 200 :h 30}    ;; human-drawn on screenshot
 :locators {}                          ;; human may type a locator, or not
 :glossary-name "Admin.hidden-menu"
 :notes "Only appears after triple-clicking the logo. Not in DOM until triggered."
 }
```

The glossary derives from the intermediate as usual. No sync problem —
everything flows through the same data pipeline.

### Direct Glossary Editing (Escape Hatch)

Power users may edit `glossary/intents/*.edn` by hand. The next sieve run
compares glossary against inventory: "Admin.hidden-menu is in the glossary
but not in the sieve output." That's surfaced as a finding — either the
element is genuinely missing (bug), or the sieve can't find it (hidden,
conditional, state-dependent), or it was manually added for a reason.

Both paths work. The reconciliation catches mismatches either way.

---

## Arbitrary Notes on Elements

Any element can carry free-text notes:

```clojure
{:glossary-name "Login.submit"
 :notes "Becomes disabled after 3 failed attempts. Re-enables after 30 sec
         timeout. Dev team says intentional but undocumented."}
```

**Where notes surface:**

- **Toddler loop UI:** Visible when reviewing an element in Pass 2 or
  review mode. Text area below the name field. Optional — most elements
  won't have notes.
- **Graph:** Stored as annotation metadata if the element is persisted.
- **Agent context:** When the agent queries an element via MCP, notes come
  along. The agent reads "only appears after triple-clicking the logo" and
  adjusts its exploration.
- **Glossary:** Probably NOT exported to SL glossary EDN. Notes are
  toddler-loop context, not test infrastructure. But they travel with
  the intermediate format.

The UI affordance is simple: a text area in the Pass 2 panel. The value is
disproportionate — some notes will save someone hours of confusion.

---

## Demo Integration

See **[notes/demo-script.md](notes/demo-script.md)** for the full capstone
demo sequence. The toddler loop's demo moment:

1. Sieve the demo app → screenshot with overlays
2. Rapid-fire classify 3-5 elements (show the speed)
3. Load pre-labeled state (skip to the good part)
4. Agent makes a code change → re-sieve → detect new element
5. Agent writes a test using glossary vocabulary
6. `sl run` passes → remove the element → `sl run` fails
7. "The spec caught the drift. Automatically."

---

## Open Questions

- **Community detection:** Elements that always co-occur should be recognized as
  groups. "These five elements are your login form." How? Compare across
  multiple observations? Structural proximity in the region tree?
- **Cross-page element identity:** The same nav on every page — does the sieve
  recognize it? By locator match? Structural similarity? Composite key?
  (See sieve-contract.md — shared open question.)
- **Confidence thresholds:** At what confidence does the sieve auto-accept vs
  ask? Configurable per project?
- **Batch vs interactive Pass 1:** Rapid-fire one-at-a-time (described above) vs
  "show me the whole page, let me click on elements to classify them"? Probably
  both eventually. One-at-a-time for v1 — forces completeness.
- **Sieve location:** Does the sieve live in SL (as a deterministic plugin) or
  LG (as part of the MCP server)? Leaning SL — it's infrastructure, should be
  pluggable with defaults. But SL is Clojure, limiting who can touch the
  orchestration. The sieve JS itself is language-agnostic. Not decided.
