# Fixture Contracts — Test Data as Vocabulary

**Canonical for:** Fixture macro vocabulary, data binding, requires/establishes chains, equivalence partitions, context packs (subsumed)
**Linked from:** VISION.md § Contracts on Macros and Preconditions
**Last verified:** 2026-04-03

---

## The Problem

```gherkin
When :user/alice enters "alice@test.com" into Login.email
```

Where does `"alice@test.com"` come from? Hardcoded in the step is obviously
wrong at scale. Pulled from a config file is fragile. Invented by the test
author is inconsistent.

The deeper question: how does a test declare what world state it needs
(users exist, items exist, clocks are frozen, accounts are banned) without
coupling to the implementation of how that state gets provisioned?

---

## The Design: Fixture Macros

Fixture macros are **intent-level vocabulary** for test preconditions. They
declare WHAT must be true, not HOW to make it true. SL enforces the syntax
and contracts. Teams provide the implementation.

### Illustrative Macro Calls

```
UserExists(ref=:alice, attrs={:email "alice@test.com", :role :user, :status :active})
UserExists(ref=:pat, attrs={:email "pat@test.com", :role :admin, :status :banned})
ItemExists(ref=:targetItem, attrs={:sku "ABC", :active true, :quantity 10})
ClockFrozen(at="2026-01-18T10:00:00-06:00")
SeedDatabase(fixture=:basicInventory)
```

These are Plane 3 abstractions. They don't know about databases, API calls,
or factories. They declare intent.

### What SL Enforces

| SL's job | Team's job |
|---|---|
| Vocabulary: macro names, arg shapes | Implementation: what `UserExists` actually does |
| Contracts: requires/establishes | Plumbing: DB seeds, API calls, factories |
| Provenance: "this scenario assumes X" | Fixtures: concrete test data values |
| Validation: catch broken chains at plan time | Environment: staging URLs, credentials |
| Composition: chain macros safely | Wiring: connect macro to their infra |

The framework doesn't need to know HOW you seed data. It needs to:

1. Provide a consistent vocabulary
2. Track provenance ("this scenario assumes ItemExists")
3. Validate and compose contracts

---

## Contracts: Requires and Establishes

Every fixture macro carries a contract:

```
Macro: UserExists
  args:       {ref: :keyword, attrs: map}
  requires:   #{}
  establishes: #{:user/ref-present}

Macro: Authenticated
  args:       {actor: :keyword, mode: :keyword}
  requires:   #{:user/ref-present}
  establishes: #{:session/present}

Macro: UserHasContext
  args:       {actor: :keyword, ctx: set}
  requires:   #{:user/ref-present}
  establishes: (derived from ctx — #{:ctx/banned}, #{:ctx/over-quota}, etc.)
```

The planner walks the chain and catches broken dependencies at **planning time**,
before any test code runs:

```
✗ Authenticated(actor=:alice) — requires :user/ref-present but nothing establishes it
  → Fix: add UserExists(ref=:alice, ...) before Authenticated
```

### Chain Example — Full Precondition Setup

```gherkin
# Fixture chain for "admin who is banned tries to access dashboard"
Given SeedDatabase(fixture=:basicInventory) +
And UserExists(ref=:pat, attrs={:role :admin, :status :active}) +
And UserHasContext(actor=:pat, ctx=#{:banned}) +
And Authenticated(actor=:pat, mode=:password) +

# Contract chain:
#   SeedDatabase    requires: {}           establishes: {:db/seeded}
#   UserExists      requires: {}           establishes: {:user/ref-present}
#   UserHasContext   requires: {:user/ref-present}  establishes: {:ctx/banned}
#   Authenticated   requires: {:user/ref-present}   establishes: {:session/present}
#
# Planner validates: all requires satisfied. ✓

# Main scenario
When :admin/pat navigates to the dashboard
Then :admin/pat should see "Account suspended"
```

### Chain Example — Missing Precondition

```gherkin
# Forgot to seed the user
Given Authenticated(actor=:alice, mode=:password) +

# Planner:
#   Authenticated requires :user/ref-present
#   Nothing in this scenario establishes :user/ref-present
#   → PLANNING ERROR (exit 2, before execution)
```

---

## The Attrs Map Is the Data Source

The attrs on a fixture macro ARE the test data. They solve the data binding
problem:

```
UserExists(ref=:alice, attrs={:email "alice@test.com", :password "secret"})
```

When the `Authenticated` macro expands into interface-level steps, it knows
Alice's credentials because `UserExists` established them. The expansion
can reference the attrs:

```
# Macro expansion of Authenticated(actor=:alice, mode=:password):
When :user/alice opens browser to '/login'
And :user/alice enters [alice.email] into Login.email      # → "alice@test.com"
And :user/alice enters [alice.password] into Login.password # → "secret"
And :user/alice clicks Login.submit
Then :user/alice should see Dashboard.welcome
```

The `[alice.email]` notation is theoretical — the exact resolution syntax is
open. But the principle is: the fixture macro established the data, the
expansion references it, no hardcoded strings in steps.

---

## Equivalence Partitions via Attrs

You don't care about every possible email. You care about the **partitions**:

```
# Valid user — happy path
UserExists(ref=:alice, attrs={:role :user, :status :active})

# Banned user — tests access denial
UserExists(ref=:alice, attrs={:role :user, :status :banned})

# Admin — tests elevated permissions
UserExists(ref=:alice, attrs={:role :admin, :status :active})

# Over quota — tests resource limits
UserExists(ref=:alice, attrs={:role :user, :quota :exceeded})
```

The attrs map IS the equivalence class specification. Each unique combination
of attrs represents a partition of the state space. The test author chooses
which partition to exercise by choosing which attrs to set.

For exhaustive input validation (password too short, password no special chars,
email invalid format), you'd use a different mechanism — probably Scenario
Outlines with a data table of invalid inputs. The fixture macros handle
**identity and state partitions**, not input-level fuzzing.

---

## Context Packs Are Subsumed

The "context packs" concept from the subject-types-and-instances design
(deferred, never built) is a special case of fixture macros:

```
# Context pack (original concept):
Given :user/alice has-context :banned

# What this actually is:
UserHasContext(actor=:alice, ctx=#{:banned})

# Which is just a fixture macro with contract:
#   requires: :user/ref-present
#   establishes: :ctx/banned
```

Context packs don't need their own mechanism. The fixture macro vocabulary
handles them. Multiple contexts compose naturally:

```
# An admin who is banned AND over quota:
UserExists(ref=:pat, attrs={:role :admin})
UserHasContext(actor=:pat, ctx=#{:banned})
UserHasContext(actor=:pat, ctx=#{:over-quota})

# Each UserHasContext requires :user/ref-present (satisfied by UserExists)
# Each establishes its own context fact
# The planner validates the full chain
```

The composable approach avoids combinatorial explosion. You don't need named
bundles for every combination of `:banned × :over-quota × :2fa-enabled × :onboarded`.
You compose atomic context facts.

---

## Connection to the Graph

Fixture macros map to the graph's contracted nodes and their requires/establishes
contracts:

- A fixture macro IS a contracted subgraph (implementation is hidden behind
  the macro boundary)
- `requires` points to state facts — which are the `establishes` of some
  prior contraction
- `establishes` declares state facts consumed by later contractions
- The chain of requires/establishes IS the dependency graph between contractions

At the contracted level, the graph is a DAG of macro-level nodes linked by
state dependencies. At the expanded level, each node unfolds into interface-level
sieve observations and actions.

---

## Connection to the Sieve / Toddler Loop

The sieve discovers what's on the page. Fixture macros declare what SHOULD be
on the page (or what state the world should be in). The gap between these is
a misfit:

```
Fixture says: ItemExists(ref=:targetItem, attrs={:sku "ABC", :active true})
Sieve says:   No element matching "ABC" found on the product listing page

→ Misfit: the fixture claims the item exists, but the sieve can't find it
→ Either the fixture seeding failed, or the UI doesn't show it, or the
  sieve can't classify it
```

This is a `3v` check — verifying the design plane against the artifact plane.
The fixture contract says what should be true. The sieve says what IS true.
Discrepancies are first-class misfits.

---

## Implementation Approaches (Team-Provided)

SL defines the vocabulary. Teams wire the implementation. Common approaches:

| Approach | When to use | Example |
|---|---|---|
| **DB seeding** | Direct database access | INSERT INTO users ... |
| **Admin API** | App has admin endpoints | POST /admin/users |
| **Test factories** | App has factory pattern | `(create-user! {:email "..." :role :admin})` |
| **Config-driven fixture server** | SL's GP.004 approach | `{:users {"alice" "secret"}}` |
| **External service stubs** | Third-party integrations | Mock SMS gateway, mock payment |
| **Environment variables** | Static config | `TEST_ADMIN_EMAIL=alice@test.com` |

The fixture macro vocabulary is the same regardless of implementation. A team
can start with hardcoded values and graduate to a proper fixture system without
changing any test specifications.

---

## Open Questions

- **Resolution syntax:** How does a macro expansion reference data from a
  prior fixture? `[alice.email]`? `(:attrs :alice :email)`? Placeholder
  substitution? This is a notation question, not an architecture question.
- **Fixture ordering:** Macros with no dependency between them — can they
  run in parallel? Probably yes, since they're just setup.
- **Fixture teardown:** Do macros need a cleanup/teardown contract? Probably
  not for v1 — scenario isolation handles this (each scenario gets fresh state).
- **Shared fixtures across scenarios:** Can a fixture established in a
  Background be shared? Yes — Background steps run before each scenario,
  so the contract chain re-evaluates per scenario.
- **Fixture libraries:** Will teams build reusable fixture macro libraries?
  Probably. "Our standard user setup macro" that every test imports. The
  vocabulary supports this naturally.
