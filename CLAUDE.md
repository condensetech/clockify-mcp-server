## How to work here

- `bun test`, `bun run typecheck`, `bun run fix` — all three must pass; the pre-commit hook runs
  biome and typecheck.
- `src/server.test.ts` stubs `fetch` with a fake Clockify (user in Europe/Rome, 203 projects and
  201 tasks — the named ones sit on page 2).
- `GLOSSARY.md` is the shared vocabulary (Clockify's own terms). Use those words in code, tool
  descriptions, output and conversation; avoid the synonyms it lists.
- Write tests first for behaviour changes and watch them fail; commit fixes separately from refactors.
