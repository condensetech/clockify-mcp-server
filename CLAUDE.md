## How to work here

- `bun test`, `bun run typecheck`, `bun run fix` — all three must pass; the pre-commit hook runs
  biome and typecheck.
- `src/server.test.ts` stubs `fetch` with a fake Clockify (user in Europe/Rome, 201 projects and
  201 tasks — the named ones sit on page 2). The lookups in `src/clockify.ts` are memoised for the
  process, so **the fake world must not change between tests**; vary only `calls` / `entryPages` /
  `nextId`. Run a new test on its own too (`bun test -t "<name>"`), since earlier tests warm the caches.
- Write tests first for behaviour changes and watch them fail; commit fixes separately from refactors.

### Layout

```
src/clockify.test.ts # DST conversion, name resolution, payload building
src/clockify.ts      # API client, memoised user/project/task lookups, timezone conversion
src/index.ts         # stdio wiring — the entry point the harness runs
src/server.test.ts   # each tool end to end: MCP client ↔ server in memory, fake Clockify fetch
src/server.ts        # createServer(): McpServer + the four tools
```
