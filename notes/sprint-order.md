# Sprint Order

**Note:** beads `dep add` has a bug (false cycle detection on all pairs).
Dependencies documented here until fixed.

## MVP — Sequential Order

```
1. lg-1xc  Project skeleton and SL dependency
   │
   ├──→ 2. lg-637  MCP protocol layer and dummy tool
   │
   └──→ 3. lg-3r4  Bridge — SL config loading and browser provisioning
              │
              └──→ 4. lg-1km  The Sieve — JS DOM inventory function
                        │
    ┌───────────────────┘
    │         │
    ▼         ▼
5. lg-3d1  observe tool with graph persistence
    │       (depends on: lg-637 MCP server + lg-1km sieve)
    │
    ├──→ 6. lg-1oq  SVOI vocabulary projection as MCP tools
    │                 (depends on: lg-3d1 observe + lg-3r4 bridge)
    │
    └──→ 7. lg-3da  query_graph and annotate tools
                      (depends on: lg-3d1 observe/graph)
```

**Tasks 2 and 3 can run in parallel** after task 1.
**Tasks 6 and 7 can run in parallel** after task 5.

## Post-MVP — Unordered

- lg-26i  IR resolution via sieve matching
- lg-v26  diff tool — structural delta between observations
- lg-1zl  Progressive tool disclosure
- lg-7uz  Raw SVOI execution path in SL (SL change, not LG)
