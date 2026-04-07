# AGENT.md — LLM Agent Instructions for ShiftLefter

This document helps LLM agents (Claude, GPT, Copilot, etc.) work effectively with ShiftLefter projects.

---

## What Is ShiftLefter?

ShiftLefter is a Gherkin test framework written in Clojure. It parses `.feature` files, binds steps to Clojure functions, and executes scenarios. The parser is 100% Cucumber-compatible. The differentiator is **SVO validation** — optional type-checking that validates subjects, verbs, and objects against project glossaries before execution begins.

---

## CLI Commands

```bash
sl run features/ --step-paths steps/    # Execute tests
sl run features/ --dry-run              # Bind steps without executing
sl fmt --check path/                    # Validate formatting
sl fmt --write path/                    # Format in place
sl verify                               # Run validator checks
sl repl                                 # Interactive REPL
sl repl --nrepl --port 7888             # nREPL server for IDE
```

---

## Project Structure

```
my-project/
├── shiftlefter.edn              # Config file (required)
├── features/                    # Gherkin feature files
│   └── login.feature
├── steps/                       # Step definitions (Clojure)
│   └── login_steps.clj
└── glossary/                    # Optional: SVO glossaries
    ├── subjects.edn
    └── verbs-web.edn
```

**shiftlefter.edn** (minimal):

```clojure
{:step-paths ["steps/"]}
```

**shiftlefter.edn** (with browser + SVO):

```clojure
{:step-paths ["steps/"]
 :interfaces {:web {:type :web :adapter :etaoin}}
 :glossaries {:subjects "glossary/subjects.edn"}
 :svo {:unknown-subject :warn}}
```

---

## The SVO Model

**Subjects are actors, not domain objects.**

In ShiftLefter's model:

- **Subject** = who performs the action (`:user/alice`, `:admin`, `:api-client`)
- **Verb** = what they do (`:click`, `:fill`, `:see`)
- **Object** = what they act on (`Login.submit`, `{:css "#email"}`)
- **Interface** = how they do it (`:web`, `:api`)

```gherkin
# CORRECT — subject is the actor
When :user/alice clicks Login.submit
Then :user/alice should see 'Welcome!'

# WRONG — subject is not a domain object
When :login-form submits credentials    # NO: form is not an actor
When :database stores the user          # NO: database is not an actor
```

### Subject Types and Instances

Subjects use `:type/instance` syntax:

- `:user/alice` — type is `:user`, instance is `:alice`
- `:admin` — singleton type (no instance)

The **type** groups actors by role. The **instance** is the session key — `:user/alice` and `:user/bob` get separate browser sessions.

**glossary/subjects.edn:**

```clojure
{:subjects
 {:user  {:desc "Standard user"
          :instances [:alice :bob]}
  :admin {:desc "Administrator"}
  :guest {:desc "Unauthenticated visitor"}}}
```

---

## Writing Feature Files

### Vanilla Mode (no SVO)

Standard Cucumber-style Gherkin:

```gherkin
Feature: Cucumber counting

  Scenario: Eating cucumbers
    Given I have 12 cucumbers
    When I eat 5 cucumbers
    Then I should have 7 cucumbers
```

### Shifted Mode (with SVO)

Subject-prefixed steps with typed actors:

```gherkin
Feature: User login

  Scenario: Successful login
    When :user/alice opens the browser to 'https://example.com/login'
    And :user/alice fills {:id "email"} with 'alice@example.com'
    And :user/alice fills {:id "password"} with 'secret123'
    And :user/alice clicks {:css "button[type='submit']"}
    Then :user/alice should see 'Welcome, Alice!'
```

### Built-in Browser Steps

ShiftLefter includes browser steps for common operations:

```gherkin
:subject opens the browser to 'URL'
:subject fills {locator} with 'value'
:subject clicks {locator}
:subject should see 'text'
:subject should be on 'path'
pause for N seconds
```

Locators are EDN maps: `{:id "foo"}`, `{:css ".bar"}`, `{:xpath "//div"}`.

Or intent references if configured: `Login.submit`, `Dashboard.settings-link`.
See the Intent References section below.

### Multi-User Scenarios

When you use different subject instances, ShiftLefter automatically provisions
**separate browser sessions** — separate cookies, separate auth state, separate
windows. No setup code needed. The instance name IS the session key.

```gherkin
Feature: Multi-user collaboration

  Scenario: Alice and Bob have separate sessions
    When :user/alice opens the browser to 'https://app.example.com/login'
    And :user/alice fills {:id "email"} with 'alice@example.com'
    And :user/alice fills {:id "password"} with 'secret'
    And :user/alice clicks {:css "button[type='submit']"}
    Then :user/alice should see 'Welcome, Alice!'

    When :user/bob opens the browser to 'https://app.example.com/login'
    And :user/bob fills {:id "email"} with 'bob@example.com'
    And :user/bob fills {:id "password"} with 'secret'
    And :user/bob clicks {:css "button[type='submit']"}
    Then :user/bob should see 'Welcome, Bob!'

    # Alice and Bob are now logged in with separate sessions.
    # Alice's actions don't affect Bob's browser and vice versa.
    When :user/alice clicks {:css ".new-post-button"}
    Then :user/bob should see 'Alice posted something'
```

Each `:user/alice` and `:user/bob` step routes to its own browser instance.
This works for any number of concurrent actors — three users, ten users,
a mix of `:admin` and `:user` types. The browser lifecycle is managed per
subject instance automatically.

### Dual Browser Adapters

ShiftLefter supports both **Playwright** and **Etaoin (WebDriver)**. The
adapter is selected in config:

```clojure
;; shiftlefter.edn — Playwright
{:interfaces {:web {:type :web :adapter :playwright}}}

;; shiftlefter.edn — Etaoin (WebDriver/Chrome)
{:interfaces {:web {:type :web :adapter :etaoin}}}
```

Both adapters implement the same 31-method browser protocol. Same feature
files, same step definitions, same behavior — different backend. Switch
adapters by changing one config line.

### Intent References

When intent regions are configured, you can reference elements by semantic
name instead of raw locators:

```gherkin
# With raw locators
When :user/alice fills {:id "email"} with 'alice@example.com'
When :user/alice clicks {:css "button[type='submit']"}

# With intent references
When :user/alice fills Login.email with 'alice@example.com'
When :user/alice clicks Login.submit
```

Intent references resolve to concrete locators per interface. The mapping
lives in `glossary/intents/`:

```clojure
;; glossary/intents/login.edn
{:intent "Login"
 :elements
 {:email    {:bindings {:web {:css "#email"}}}
  :password {:bindings {:web {:css "#password"}}}
  :submit   {:bindings {:web {:css "button[type='submit']"}}}}}
```

Enforcement modes (in `shiftlefter.edn`):

```clojure
{:svo {:unknown-object :strict}}  ;; Unknown intent ref → error (test fails)
{:svo {:unknown-object :warn}}    ;; Unknown intent ref → warning, continues
{:svo {:unknown-object :off}}     ;; No checking
```

---

## Writing Step Definitions

### The defstep Macro

```clojure
(ns steps.my-steps
  (:require [shiftlefter.stepengine.registry :refer [defstep]]))

(defstep #"I have (\d+) cucumbers"
  [ctx n]
  (assoc ctx :cucumbers (parse-long n)))
```

**Key points:**
1. First argument is always `ctx` (the scenario context map)
2. Subsequent arguments are regex capture groups (as strings)
3. **Must return ctx** (or updated ctx) — forgetting this breaks the chain
4. Throw an exception to fail the step

### Context Flow

```clojure
;; Step 1: Add data
(defstep #"I have (\d+) cucumbers"
  [ctx n]
  (assoc ctx :cucumbers (parse-long n)))

;; Step 2: Update data
(defstep #"I eat (\d+) cucumbers"
  [ctx n]
  (update ctx :cucumbers - (parse-long n)))

;; Step 3: Assert
(defstep #"I should have (\d+) cucumbers"
  [ctx n]
  (let [expected (parse-long n)]
    (assert (= expected (:cucumbers ctx))
            (str "Expected " expected ", got " (:cucumbers ctx)))
    ctx))  ; <-- Don't forget to return ctx!
```

### With SVO Metadata

```clojure
(defstep #"^:(\S+) clicks (\S+)$"
  {:interface :web
   :svo {:subject :$1 :verb :click :object :$2}}
  [ctx subject locator-str]
  ;; Implementation using step-meta for interface context
  ...)
```

The `:$1`, `:$2` placeholders reference capture groups.

---

## What to Ask the Human

Before writing ShiftLefter code, gather this information:

1. **What subjects exist?** Ask for the glossary or actor list. Who are the actors in this system?

2. **What interfaces are configured?** Check `shiftlefter.edn` for `:interfaces`. Is this `:web`, `:api`, something custom?

3. **What step definitions already exist?** Run `sl run --dry-run` or check `steps/` to avoid duplicating patterns.

4. **What's the locator strategy?** Are they using raw EDN locators (`{:css "..."}`) or intent references (`Login.submit`)?

5. **Vanilla or shifted mode?** Check if there's a glossary and SVO config. This determines step syntax.

---

## Common Mistakes

### DO / DON'T

| DON'T | DO |
|-------|-----|
| `(defstep #"..." [n] ...)` | `(defstep #"..." [ctx n] ...)` — ctx is always first |
| Forget to return ctx | Always return `ctx` or `(assoc ctx ...)` |
| `When :login-form clicks submit` | `When :user/alice clicks Login.submit` — subjects are actors |
| `{:css "#foo"}` in shifted mode | Use intent refs: `Login.submit` (if intents are configured) |
| Parse captures inline | `(parse-long n)` — captures are always strings |
| Hardcode test data | Use ctx to pass data between steps |

### Regex Gotchas

```clojure
;; DON'T: Ambiguous patterns
(defstep #"I click (.+)" ...)      ; Too greedy, matches everything
(defstep #"I click the (.+)" ...)  ; Conflicts with above

;; DO: Specific patterns
(defstep #"I click the '([^']+)' button" ...)
(defstep #"I click \{([^}]+)\}" ...)  ; For locator syntax
```

### SVO Validation Errors

```
ERROR: Unknown subject :user/alcie in step "When :user/alcie clicks..."
       Did you mean: :user/alice?
```

Fix: Check spelling, or add the subject to `glossary/subjects.edn`.

```
ERROR: Unknown verb :smash for interface :web
       Known verbs: :click, :fill, :see, :navigate
```

Fix: Use a known verb, or add it to `glossary/verbs-web.edn`.

---

## Quick Reference

### Step Definition Template

```clojure
(ns steps.feature-name
  (:require [shiftlefter.stepengine.registry :refer [defstep]]))

(defstep #"pattern with (captures)"
  [ctx capture1 capture2]
  ;; Do something
  (assoc ctx :key value))  ; Return ctx!
```

### Browser Step with SVO

```clojure
(defstep #"^:(\S+) does something to (\S+)$"
  {:interface :web
   :svo {:subject :$1 :verb :do-something :object :$2}}
  [ctx subject target]
  ;; step-meta is available here with :interface
  ctx)
```

### Config Template

```clojure
;; shiftlefter.edn
{:step-paths ["steps/"]

 :interfaces
 {:web {:type :web
        :adapter :etaoin
        :config {:headless true}}}

 :glossaries
 {:subjects "glossary/subjects.edn"
  :verbs {:web "glossary/verbs-web.edn"}}

 :svo
 {:unknown-subject :warn
  :unknown-verb :warn
  :unknown-interface :error}}
```

---

## Debugging Tips

1. **Dry run first:** `sl run features/ --dry-run` shows binding without execution
2. **Check step patterns:** Binding errors show which steps didn't match
3. **REPL for exploration:** `sl repl` lets you test Clojure expressions
4. **Context inspection:** Add `(println ctx)` in step bodies to see state
5. **Verbose mode:** `sl run -v` for detailed output

---

## Files You'll Commonly Edit

| File | Purpose |
|------|---------|
| `features/*.feature` | Gherkin scenarios |
| `steps/*.clj` | Step definitions |
| `shiftlefter.edn` | Project config |
| `glossary/subjects.edn` | Actor definitions (shifted mode) |
| `glossary/verbs-*.edn` | Verb definitions per interface |
| `glossary/intents/*.edn` | Intent/locator mappings (if using intent refs) |
