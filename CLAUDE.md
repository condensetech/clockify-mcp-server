## How to work here

Rule for this server: keep a small set of tools the agent can combine. A new tool or input
has to do something the existing ones can't.

- `bun test`, `bun run typecheck`, `bun run fix` — all three must pass; the pre-commit
  hook runs biome and typecheck.
- `src/server.test.ts` stubs `fetch` with a fake Clockify (user in Europe/Rome, 203
  projects and 201 tasks — the named ones sit on page 2).
- `GLOSSARY.md` is the shared vocabulary (Clockify's own terms). Use those words in code,
  tool descriptions, output and conversation; avoid the synonyms it lists.
- Clockify's API reference is https://docs.clockify.me, a single page. Before changing a
  call, search it for the endpoint (e.g. `curl -sL https://docs.clockify.me | grep …`);
  don't work from memory. Where the live API behaves differently, write a comment next to
  the code that relies on it and cover it with a test in the fake Clockify.
- Write tests first for behaviour changes and watch them fail; commit fixes separately
  from refactors.
