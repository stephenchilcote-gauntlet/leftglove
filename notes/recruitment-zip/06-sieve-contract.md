# The Sieve — Output Contract (Web)

**Canonical for:** Web sieve output shape, element taxonomy, behavioral diff vocabulary, responsive testing, and observe() return format
**Linked from:** VISION.md § Key Concepts — The Sieve
**Last verified:** 2026-04-04

**Note:** This document describes the **web sieve** specifically. The sieve is a
protocol — each interface gets its own implementation. Other sieves (Android
accessibility tree, iOS, GraphQL/API) will have different output shapes tuned to
their surface. The web sieve is the first, hardest, and most useful implementation.

---

## Two Levels of Value

The sieve provides value at two levels, and the first is sufficient on its own:

**Level 1 — Static inventory (the core).** What's on this page right now?
Elements, their types, labels, locators, positions. This alone is transformative
— a structured, deterministic map that agents and tools consume. No screenshots,
no token-burning vision calls, no guessing. This is what the capstone demo needs.

**Level 2 — Behavioral diff (the progression).** What changed between two sieve
snapshots? Classifying click outcomes as navigation, reveal/conceal, state
mutation. This makes the system smarter — graph edges become meaningful, the
toddler loop can auto-classify interactions. But it's not required for basic
usefulness.

Build Level 1 first. Level 2 is where you go once the inventory works.

---

## Level 1: Static Inventory

### What Gets Through the Sieve

The sieve is a **filter**, not a mirror. The raw DOM has hundreds of nodes —
wrapper divs, empty paragraphs, CSS-only decorative elements, script tags,
hidden containers. The sieve's first job is deciding what matters.

**Passes through:**

- Anything a user can see and might interact with
- Anything a user can see and might read
- Structural landmarks that define regions (nav, main, footer, aside)
- iframe elements (with recursion into same-origin iframes — see below)
- Canvas/media elements (captured as `custom` — element exists, content opaque)

**Filtered out:**

- Hidden elements (`display: none`, `visibility: hidden`, off-screen)
- Empty containers (div wrapping div wrapping nothing meaningful)
- Script/style/meta elements
- Purely decorative elements (spacers, dividers with no semantic meaning)
- Elements with zero dimensions

The goal: if a human looking at the page would notice it or interact with it,
the sieve should capture it. If a human wouldn't notice it, the sieve should
skip it.

### Element Taxonomy

Elements that pass through get classified:

| Category | What it is | Examples | What the sieve looks for |
|---|---|---|---|
| **clickable** | Things you click/tap to cause an effect | Buttons, links, toggles, checkboxes, radios, tabs | `<button>`, `<a>`, `[role=button]`, `[onclick]`, `[role=tab]`, `[role=checkbox]`, `[role=radio]` |
| **typable** | Things you type text into | Text inputs, textareas, search fields, password fields, contenteditable | `<input type=text\|email\|password\|search\|...>`, `<textarea>`, `[contenteditable]` |
| **selectable** | Things you pick a value from | Dropdowns, multi-selects, date pickers | `<select>`, `[role=listbox]`, `[role=combobox]` |
| **readable** | Things the system shows you | Headings, labels, status text, error messages, prices, counts | `<h1-6>`, `<label>`, `<p>` with meaningful text, `[role=alert]`, `[role=status]`, `[aria-live]` |
| **chrome** | Structural landmarks — define regions, not interactions | Nav bars, footers, sidebars, main content area, section dividers | `<nav>`, `<main>`, `<footer>`, `<aside>`, `<header>`, `[role=navigation]`, `[role=banner]` |
| **custom** | Interactable but doesn't fit the above | Canvas elements, draggables, game pieces, media players, embedded widgets | `<canvas>`, `[draggable]`, `<video>`, `<audio>`, custom web components |

**Notes on the taxonomy:**

- **Chrome** elements don't need labels or locators. They define the region
  tree, not individual interactions. The sieve captures them as region markers.
- **Images** are classified by function: a product photo is readable (it has
  content), a clickable thumbnail is clickable, a decorative icon is chrome.
  No separate "image" category — classify by what it DOES, not what tag it is.
- **clickable vs selectable:** A dropdown trigger button is clickable. The
  dropdown's option list (when revealed) contains selectable items. The
  trigger and the options are separate elements.
- Some elements are **dual-role**: an image that's also a link is clickable
  (primary) with image content (secondary). Classify by primary interaction
  but **capture all applicable roles**. The element record should carry a
  `:roles` set (e.g., `#{:clickable :image}`) alongside the primary `:category`.
  This way downstream consumers (toddler loop, graph, test generation) can
  query by any role, not just the primary.
- **Custom** captures the element's existence, position, and attributes. The
  sieve can't see INSIDE a canvas or video — that's pixels, not DOM. But it
  captures the element so the toddler loop can ask the human "what's in here?"
  The screenshot shows the visual content. The human annotates.

### Element Record

Each element that passes through the sieve produces:

```clojure
{:category     ; :clickable | :typable | :selectable | :readable | :chrome | :custom
 :roles        ; #{:clickable :image} — all applicable roles, primary is :category
 :tag          ; "button", "input", "a", "h1", "nav", "canvas", etc.
 :element-type ; "submit", "email", "checkbox", "select", "canvas" — nil for readable/chrome
 :label        ; Resolved human-readable label (see Label Resolution)
 :locators     ; {:id "login-btn" :name "email" :testid "submit-button" :href "/dashboard"}
 :state        ; {:disabled false :visible true :checked nil :expanded nil :selected nil}
 :rect         ; {:x 340 :y 500 :w 80 :h 32} — bounding box, ABSOLUTE page coordinates
 :region       ; "main > login-form > actions" — semantic breadcrumb path
 :form         ; Form group id or nil
 :aria-role    ; "button", "link", "tab", "textbox", etc.
 :iframe       ; nil, or {:src "..." :same-origin true} if element is inside an iframe
 }
```

**What varies by category:**

| Field | clickable | typable | selectable | readable | chrome | custom |
|---|---|---|---|---|---|---|
| `:element-type` | "submit", "link", "toggle" | "email", "password", "text" | "select", "multi" | nil | nil | "canvas", "video", "draggable" |
| `:label` | Yes (button text, link text) | Yes (associated label) | Yes (label) | Yes (the text itself) | Optional (landmark name) | Optional (aria-label) |
| `:locators` | Yes | Yes | Yes | Usually empty | Usually empty | If available |
| `:state` | disabled, expanded | disabled, value | disabled, selected | — | — | varies |
| `:form` | If in a form | If in a form | If in a form | — | — | — |

### Label Resolution

The `:label` field is the human-readable name. Resolution order:

1. `aria-label` attribute
2. `aria-labelledby` → text of referenced element
3. Associated `<label>` element (for form controls)
4. `title` attribute
5. `placeholder` attribute (for inputs)
6. `innerText` (for buttons, links — trimmed, collapsed whitespace)
7. `alt` attribute (for images)
8. `nil` if nothing resolves

First match wins. Prioritizes explicit accessibility labels over inferred text.
A `nil` label is a signal to the toddler loop: "ask the human what this is."

### Locator Strategy

The `:locators` map contains all stable selectors the sieve can find:

| Locator | Stability | Notes |
|---|---|---|
| `data-testid` / `data-cy` | Highest | Purpose-built for testing |
| `id` | High | Watch for generated/dynamic IDs |
| `name` | High | Common on form elements |
| `href` | Medium | For links — stable if routes are stable |
| `aria-label` | Medium | Stable if accessibility is maintained |
| `css-class` | Low | Last resort — prone to change |

The sieve collects ALL available locators. The consumer picks the best one.
Chrome elements generally don't need locators — they're identified by
their role in the region tree.

**Project-level locator preference:** Many teams standardize on a locator
convention — `data-testid`, `data-cy`, `aria-label`, etc. The sieve (or the
toddler loop) should be able to detect or ask: "This project consistently
uses `data-testid`. Prefer that as the primary locator." This is a
configuration/heuristic, not hardcoded — deduce from what the sieve finds
(if 80% of interactables have `data-testid`, that's probably the convention),
or let the user declare it upfront. Avoids generating glossary entries that
reference `id` when the project's convention is `data-testid`.

### Page Inventory (Full Sieve Return)

```clojure
{:url       ; Decomposed URL (see below)
 :title     ; "Dashboard — MyApp" — document title
 :viewport  ; {:w 1920 :h 1080} — viewport dimensions at time of sieve
 :window    ; {:w 1920 :h 1200} — browser window dimensions
 :elements  ; Vector of element records (see above)
 :forms     ; [{:id "login-form" :element-refs [...ids of elements in this form...]}]
 :regions   ; Nested map derived from chrome elements — semantic region tree
 :iframes   ; [{:src "..." :same-origin true :element-count 12} ...] — iframe inventory
 :meta      ; {:description "..." :og-title "..." :canonical "..."}
 :console   ; [{:level :error :message "..." :source "app.js:142"} ...] — captured during sieve
 :timestamp ; Instant — when this snapshot was taken
 }
```

### URL Decomposition

The URL is decomposed into semantic components rather than stored as a raw
string. Computationally free (`new URL()`) and valuable for graph queries
and diff classification:

```clojure
{:url
 {:raw      "https://app.example.com:3000/settings/profile?tab=security&v=2#password"
  :origin   "https://app.example.com:3000"  ;; project identity — rarely changes
  :protocol "https"
  :hostname "app.example.com"
  :port     "3000"                           ;; nil if default for protocol
  :pathname "/settings/profile"              ;; page identity — changes per navigation
  :search   "?tab=security&v=2"             ;; page state — changes per interaction
  :params   {:tab "security" :v "2"}        ;; parsed query params
  :hash     "password"                       ;; SPA route or anchor — changes per SPA nav
  }}
```

Why this matters for diffs:

- `pathname` changed → page navigation
- `hash` changed, `pathname` didn't → SPA route change or anchor scroll
- `search` changed, `pathname` didn't → state change (filter, tab, pagination)
- `origin` changed → external navigation (left the app entirely)

### iframe Handling

**Same-origin iframes: recurse.** The sieve can access `iframe.contentDocument`
for same-origin iframes. Child elements are captured with a modified region
path (e.g., `iframe:login-widget > form > email`) and an `:iframe` field
linking them to the parent iframe element.

**Cross-origin iframes: boundary.** The browser's same-origin policy blocks
JavaScript access. The sieve captures the iframe element itself (position,
size, src URL) and flags it as a cross-origin boundary. To sieve the iframe's
contents, you'd need to navigate the browser to the iframe's URL separately.

```clojure
;; iframe inventory in the page-level output
:iframes [{:src "https://same-domain.com/widget"
           :same-origin true
           :element-count 12        ;; sieve recursed, found 12 elements
           :rect {:x 100 :y 400 :w 800 :h 300}}
          {:src "https://other-domain.com/ad"
           :same-origin false
           :element-count nil       ;; couldn't access
           :rect {:x 0 :y 900 :w 1920 :h 90}}]
```

### Console Log Capture

Captured during sieve execution. Stored alongside the inventory, not surfaced
in the toddler loop by default. Diagnostic — if the sieve output looks weird,
the console explains why.

```clojure
:console [{:level :error :message "Uncaught TypeError: ..." :source "app.js:142"}
          {:level :warn :message "Deprecation: ..." :source "vendor.js:88"}]
```

The toddler loop UI may show a small indicator ("3 console errors") that
expands on click. For brownfield sites, console errors are expected and
usually not actionable.

### What the Sieve Does NOT Capture (v1)

- **Static vs dynamic text:** "Welcome" vs "Welcome, Gabriel" — requires
  framework-specific detection (React bindings, Vue templates). Stretch goal.
- **Shadow DOM internals:** Web components hide content. Detection is possible
  (pierce shadow roots), but adds complexity. Flag as boundary for v1.
- **Canvas/WebGL content internals:** The element is captured as `:custom`.
  What's rendered inside (game pieces, drawings, WebGL scenes) is pixels,
  not DOM. The human annotates via the toddler loop using the screenshot.
- **Hover-only elements:** Things that appear only on hover (tooltips, hover
  menus) — the sieve captures the current DOM state, not potential states.
  Hover interactions are a Level 2 concern.
- **Scroll-reactive layouts:** Sites that transform content based on scroll
  position (parallax, scroll-triggered animations, virtualized lists that
  destroy off-screen DOM nodes). The full-page screenshot captures one scroll
  state, but these pages are a function of scroll position, not a static
  document. Virtualized lists (React Virtualized, TanStack Virtual) are the
  worst case — elements literally unmount as they leave the viewport. Requires
  a different strategy (viewport-sized screenshots at multiple scroll positions,
  or incremental capture). Not blocking — most apps only virtualize in specific
  places (long lists, data tables), and the demo app is ours to control.

---

## Level 2: Behavioral Diff

Once the static inventory works, the sieve can classify what happens between
observations by diffing successive inventories.

### The Observation Loop

```
1. Sieve → S1 (baseline inventory)
2. Act (click, type, select)
3. Wait for quiescence (DOM stops mutating meaningfully)
4. Sieve → S2 (new inventory)
5. Diff S1 vs S2
6. Classify the change (or ask the human via toddler loop)
```

### Click Outcomes — Three Categories + None

Every click on a clickable element produces one of these outcomes:

**1. Navigation** — where you are changes

| Subtype | What the diff shows |
|---|---|
| Full page load | URL pathname changed, most elements replaced |
| SPA route change | URL hash changed, partial element swap |
| Scroll to anchor | Same page, viewport moved, hash may update |
| New tab/window | Current page unchanged — new context opened |

**2. Reveal/conceal** — elements appear or disappear

| Subtype | What the diff shows |
|---|---|
| Widget expand | Same page, new elements in a localized region |
| Widget collapse | Same page, elements gone from a region |
| Dropdown open | Overlay appeared with option elements |
| Modal open | Full overlay with new content |
| Modal/dropdown close | Overlay elements disappeared |
| Tab switch | Elements swapped in same region |
| Sidebar/drawer | Large region appeared or disappeared at page edge |
| Inline edit | Text element replaced by input element (or reverse) |
| Async content | Loading placeholder → real content (after delay) |

**3. State mutation** — existing elements change without appearing or disappearing

| Subtype | What the diff shows |
|---|---|
| Toggle | Checkbox/radio/switch state changed |
| Value change | Counter incremented, selection updated |
| Sort/reorder | Same elements, different order |
| Visual feedback | Icon state changed (like button filled, cart badge) |
| Validation | Error classes/messages appeared on existing elements |

**4. No visible effect** — nothing the sieve can detect changed

The sieve can't tell WHY — disabled element, non-visual action (analytics,
clipboard), or genuinely broken. Just that nothing changed.

### Compound Effects

A single click can produce multiple categories:

- "Add to Cart" → badge count updates (state mutation) AND toast appears (reveal)
- "Delete item" → item disappears (conceal) AND count updates (state mutation)
- Form submit → form clears (state mutation) AND success message appears (reveal)

The sieve reports all diffs. Each is classified independently.

### Non-Click Interactions

These are separate interaction primitives, not click outcomes:

| Interaction | Typical outcome | v1 support |
|---|---|---|
| Type/enter text | Autocomplete appears (reveal), validation fires (state mutation) | Yes |
| Select option | Dropdown closes (conceal), value changes (state mutation) | Yes |
| Hover | Tooltip appears (reveal) | Stretch — requires hover before sieve |
| Scroll | Lazy content loads (reveal) | Stretch |
| Drag and drop | Element repositioned (state mutation) | No — v2 |
| Keyboard shortcut | Any of the above | No — v2 |
| Right-click | Context menu (reveal) | No — v2 |

### Diff Classification Heuristics

How the sieve decides which category a diff falls into:

| Signal | Classification |
|---|---|
| URL pathname changed + >50% of elements replaced | `navigation` |
| URL hash changed, partial element swap | `navigation` (SPA) |
| URL search params changed, content reordered | `state_mutation` (filter/sort) |
| URL unchanged, elements appeared in one region | `reveal` |
| URL unchanged, elements disappeared from one region | `conceal` |
| Elements appeared as overlay (fixed/absolute, high z-index) | `reveal` (modal/dropdown) |
| No new/removed elements, `:state` fields changed | `state_mutation` |
| No meaningful diff | `no_effect` |

The **where** matters as much as the **what**: new elements inside
`main > product-detail > reviews` is a widget expansion. Everything under
`main` changed while `nav`/`footer` stayed = SPA navigation.

### Quiescence Detection

After an action, wait for the DOM to settle. "Settled" means no meaningful
mutations for N milliseconds. "Meaningful" excludes:

- CSS transitions and animations
- Cursor blinks
- Animation frame callbacks that don't change structure

Implementation: MutationObserver with a debounced timeout. Start conservative
(longer timeout), tune later. This is a tuning problem, not a design problem.

---

## Responsive Testing (Free Capability)

The sieve captures viewport dimensions and absolute element positions. Running
the sieve at different browser sizes produces different inventories. Diffing
them is a **responsive audit for free** — no new code, same sieve, same diff.

```
1. Sieve at 1920x1080 (desktop) → Inventory A: 47 elements
2. Sieve at 375x812 (iPhone) → Inventory B: 31 elements
3. Diff A vs B → responsive findings
```

### What the Responsive Diff Catches

| Finding | What it means | Bug class |
|---|---|---|
| Elements disappeared | `display:none` at breakpoint, or pushed off-screen | Feature inaccessible on this viewport |
| Elements appeared | Mobile-only UI (hamburger, bottom nav) | Expected — verify it works |
| Elements became tiny | `rect.w < 44 \|\| rect.h < 44` on interactable | Touch target too small (WCAG failure) |
| Elements now overlap | Rects intersect that didn't before | Covered element is unclickable |
| Labels changed/truncated | Text overflow, ellipsis, different label | User can't read the element |
| Elements moved to different region | Nav collapsed into hamburger, sidebar → drawer | Region tree changed — different realization |

### Common Responsive Bugs This Detects

- **Hamburger that doesn't open.** 8 nav clickables at desktop, 1 hamburger
  at mobile. Click hamburger → re-sieve → no new elements. The nav items
  are inaccessible.
- **Overlapping elements.** At 768px, the Submit button and Cancel link rects
  intersect. The one underneath is effectively dead.
- **Off-screen elements.** Sidebar panel has `left: -300px` at mobile. Element
  exists in DOM but rect is outside viewport bounds.
- **Touch targets too small.** Interactable element with `w: 30, h: 12` on
  mobile. Below Apple HIG (44pt) and WCAG enhanced (44px) minimums.

### Connection to Cross-Interface Testing

Web at 1920px and web at 375px are arguably different **interface realizations**
with different affordances. The same intent region (Login) should be accessible
on both, but elements and layout may differ. The responsive sieve diff IS a
cross-interface compatibility check within the web interface family.

The glossary can carry this: "Login.submit exists on desktop and mobile.
Login.social-panel exists on desktop but not mobile." Finding — intentional
(mobile doesn't support social login) or bug (panel doesn't fit, was hidden)?

### For the Demo App

Slots into the progressive stages:

```
Stage 3.5: Responsive
  - Add CSS media queries to the demo app
  - Sieve at desktop → sieve at mobile → show the diff
  - "These 3 elements disappeared on mobile. Is that intentional?"
```

---

## observe() MCP Return Shape

When an agent calls `observe()` via MCP, it gets the page inventory wrapped
in observation metadata:

```clojure
{:observation/id        ; UUID — unique to this observation
 :observation/inventory ; The page inventory (Level 1 output)
 :observation/url       ; Decomposed URL at time of observation
 :observation/subject   ; Which subject triggered this (e.g., :user/alice)
 :observation/timestamp ; Instant
 }
```

This is also what gets persisted to the graph as an observation node.

If a prior observation exists (re-sieve after an action), the response
may also include:

```clojure
{:observation/diff      ; Summary of what changed from previous observation
 :observation/prior-id  ; UUID of the previous observation
 }
```

The diff is Level 2 — included when available, not required.

---

## Example: Login Page Inventory

```clojure
{:url {:raw "https://demo.app/login"
       :origin "https://demo.app"
       :protocol "https"
       :hostname "demo.app"
       :port nil
       :pathname "/login"
       :search nil
       :params {}
       :hash nil}
 :title "Login — DemoApp"
 :viewport {:w 1920 :h 1080}
 :window {:w 1920 :h 1200}
 :elements
 [{:category :chrome
   :roles #{:chrome}
   :tag "nav"
   :label "Main Navigation"
   :locators {}
   :state {:visible true}
   :rect {:x 0 :y 0 :w 1920 :h 60}
   :region "nav"
   :aria-role "navigation"}

  {:category :readable
   :roles #{:readable}
   :tag "h1"
   :label "Welcome back"
   :locators {}
   :state {:visible true}
   :rect {:x 660 :y 240 :w 600 :h 40}
   :region "main > login-form"
   :aria-role "heading"}

  {:category :typable
   :roles #{:typable}
   :tag "input"
   :element-type "email"
   :label "Email address"
   :locators {:id "email" :name "email" :testid "login-email"}
   :state {:visible true :disabled false}
   :rect {:x 660 :y 300 :w 600 :h 44}
   :region "main > login-form"
   :form "login-form"
   :aria-role "textbox"}

  {:category :typable
   :roles #{:typable}
   :tag "input"
   :element-type "password"
   :label "Password"
   :locators {:id "password" :name "password" :testid "login-password"}
   :state {:visible true :disabled false}
   :rect {:x 660 :y 360 :w 600 :h 44}
   :region "main > login-form"
   :form "login-form"
   :aria-role "textbox"}

  {:category :clickable
   :roles #{:clickable}
   :tag "button"
   :element-type "submit"
   :label "Sign In"
   :locators {:id "login-submit" :testid "login-submit"}
   :state {:visible true :disabled false}
   :rect {:x 660 :y 420 :w 600 :h 44}
   :region "main > login-form"
   :form "login-form"
   :aria-role "button"}

  {:category :clickable
   :roles #{:clickable}
   :tag "a"
   :element-type nil
   :label "Forgot password?"
   :locators {:href "/forgot-password"}
   :state {:visible true}
   :rect {:x 660 :y 475 :w 150 :h 20}
   :region "main > login-form"
   :aria-role "link"}

  {:category :chrome
   :roles #{:chrome}
   :tag "footer"
   :label nil
   :locators {}
   :state {:visible true}
   :rect {:x 0 :y 1040 :w 1920 :h 40}
   :region "footer"
   :aria-role "contentinfo"}]

 :forms
 [{:id "login-form"
   :element-refs ["email" "password" "login-submit"]}]

 :regions
 {:nav {}
  :main {:login-form {}}
  :footer {}}

 :iframes []

 :meta
 {:description "Sign in to your DemoApp account"}

 :console []

 :timestamp #inst "2026-04-04T10:30:00Z"}
```

7 elements survived the sieve. A typical login page DOM has 50-100+ nodes.
The sieve filtered 90%+ as noise.

---

## The 98% / 2% Line

The static inventory (Level 1) handles 98% of web application surfaces.
The behavioral diff (Level 2) handles 98% of interaction outcomes.

**Known limitations (the 2%):**

| Limitation | Why | Strategy |
|---|---|---|
| Canvas / WebGL content | Not DOM-based — pixels | Capture element as `:custom`, human annotates content via screenshot |
| Video/audio content | Media API internals | Capture element as `:custom` |
| Drag and drop | Multi-step, not click-based | Skip for v1, document |
| Keyboard shortcuts | Non-visual trigger | Skip for v1 |
| Hover-only elements | Require hover to exist in DOM | Stretch goal |
| Complex animations | State in CSS/JS, not DOM | May misclassify |
| Shadow DOM internals | Web component boundary | Flag as boundary, pierce later |
| Cross-origin iframes | Browser security boundary | Flag, capture iframe element, note src URL |
| Scroll-reactive layouts | Page is function of scroll position | Incremental capture strategy needed |

---

## Element Identity Across Observations (Open)

If the sieve runs twice on the same page, how do we know element A in
observation 1 is "the same" element A in observation 2?

**Candidates:**

- **By locator match:** Same `id` or `testid` → same element. Works for
  well-structured apps with stable IDs. Fails for generated IDs.
- **By position + type:** Same category, same region, similar rect → probably
  same element. Fuzzy but works when IDs are absent.
- **By label + type:** Same label, same category, same region → likely same.
  Fails if labels change.
- **Composite key:** Combine available locators + region + category. Best
  available match.

This is an open design question. The answer determines:

- How the graph links elements across observations
- How the toddler loop knows "I already asked about this"
- How drift detection works ("this element changed")
- How glossary entries map to live elements

V1 approach: composite key with fallback. Use the strongest available locator
(testid > id > name), combined with region path. Accept that some elements
will fail to match across observations and flag those for human review.

---

## Region Derivation (Open)

The `:region` field is a semantic breadcrumb path. How to derive it:

**V1 approach:** Walk up the DOM from each element, collecting landmark
ancestors:

- `<nav>`, `<main>`, `<footer>`, `<aside>`, `<header>` → landmark names
- `<section>` / `<div>` with `aria-label` → labeled region
- `<form>` with `id` or `aria-label` → form name
- Stop at the nearest landmark

**Example:** An email input inside `<main><form id="login-form"><div class="actions">` → region = `"main > login-form"`

**For iframes:** Prefix with `iframe:src-identifier`, e.g.,
`iframe:login-widget > form > email`.

**Future:** Refine with heading-based subdivision, ARIA role nesting, and
heuristics for unnamed structural containers. But v1 "nearest landmark
ancestor" covers the common case.
