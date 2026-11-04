## How to work here

- `bun test`, `bun run typecheck`, `bun run fix` — all three must pass; the pre-commit hook runs
  biome and typecheck.
- `src/server.test.ts` stubs `fetch` with a fake Clockify (user in Europe/Rome, 201 projects and
  201 tasks — the named ones sit on page 2). The lookups in `src/clockify.ts` are memoised for the
  process, so **the fake world must not change between tests**; vary only `calls` / `entryPages` /
  `nextId`. Run a new test on its own too (`bun test -t "<name>"`), since earlier tests warm the caches.
- Write tests first for behaviour changes and watch them fail; commit fixes separately from refactors.
