# Sprint Order

**Revised:** 2026-04-07. Previous version was stale (referenced closed Clojure-era beads).

## Architecture Context

- LG MCP server: TypeScript with `@modelcontextprotocol/sdk`
- SL sieve HTTP server: running at localhost:3333 (`POST /sieve`, `GET /screenshot`, `POST /navigate`)
- SL glossary HTTP endpoints: `POST /glossary/intents`, `GET /glossary` (built, leftglove-cms)
- TL UI v0: single HTML file, Pass 1 classification working (built, leftglove-48a)

## Execution Order (12 items)

```
Phase 1 — Foundations (parallel, no dependencies)
═══════════════════════════════════════════════════

  1. lg-tr7   Demo app — standalone login page
  2. lg-05g + lg-637   MCP server scaffold + protocol layer (one effort)

Phase 2 — Core TL UI + MCP (parallel, after Phase 1)
═════════════════════════════════════════════════════

  3. lg-r1x   Pass 2 naming mode
  4. lg-4j8   Load pre-labeled state

Phase 3 — The loop closes (after Phase 2)
═════════════════════════════════════════════════════

  5. lg-qo2   Element identity across observations    ◄ NEW
  6. lg-cuo   Sieve diff display
  7. lg-07k   Write Glossary integration (absorbs lg-xs0)

Phase 4 — Agent interface + integration (after Phase 3)
═══════════════════════════════════════════════════════

  8. lg-h34   MCP vocabulary projection — glossary to MCP tools
  9. lg-y7x   Verify sl run + strict mode against demo app

Phase 5 — Exploration + persistence
═══════════════════════════════════════════════════════

  10. lg-o4c   Observation loop — declared intent click    ◄ NEW
  11. lg-b6d   Persistence — auto-save to files            ◄ NEW

Phase 6 — Prove it
═══════════════════════════════════════════════════════

  12. lg-9m6   End-to-end demo rehearsal
```

## Dependency Graph

```
  tr7 (demo app) ─────────────────────────────────────┐
       │                                               │
       │              05g+637 (MCP scaffold+protocol)  │
       │                   │                           │
       ▼                   │                           │
  r1x (Pass 2 naming)     │                           │
  4j8 (load pre-labeled)  │                           │
       │                   │                           │
       ▼                   │                           │
  qo2 (element identity)  │                           │
       │                   │                           │
       ▼                   │                           │
  cuo (sieve diff)         │                           │
       │                   │                           │
       ▼                   │                           │
  07k (write glossary) ────┼───────────────────────────┤
       │                   │                           │
       │                   ▼                           │
       │              h34 (vocab projection)           │
       │                   │                           │
       ▼                   ▼                           │
  y7x (verify sl run + strict mode) ◄─────────────────┘
       │
       ▼
  o4c (observation loop click) ── depends on: cuo, qo2, SL click endpoint
       │
       ▼
  b6d (persistence) ── can start earlier if someone is available
       │
       ▼
  9m6 (rehearsal) ── everything above done
```

## Parallelism Notes

- **Phase 1:** `tr7` and `05g+637` have zero dependencies on each other
- **Phase 2:** `r1x` and `4j8` are independent TL UI work; both parallel with MCP
- **Phase 3:** `qo2` → `cuo` → `07k` is sequential (each builds on the previous)
- **Phase 4:** `h34` depends only on MCP scaffold; `y7x` needs demo app + glossary
- **Phase 5:** `o4c` depends on the diff/identity work; `b6d` is independent
- **Two workstreams** can run simultaneously: TL UI (3→4→5→6→7) and MCP (2→8)

## Closed / Absorbed

- `lg-v26` (diff tool) → closed, absorbed into `lg-cuo`
- `lg-xs0` (glossary generation) → closed, absorbed into `lg-07k`
- `lg-05g` + `lg-637` → effectively one task with `@modelcontextprotocol/sdk`
- Old sprint order referenced `lg-1xc`, `lg-3r4`, `lg-1km`, `lg-3d1` — all closed as stale
