## How to work here

Follow @CONTRIBUTING.md: the checks, the commit and pull request rules, test-first, the
small tool set and the glossary all live there. On top of it:

- `bun test`, `bun run typecheck`, `bun run fix` — all three must pass before you commit.
- `src/server.test.ts` stubs `fetch` with a fake Clockify (user in Europe/Rome, 203
  projects and 201 tasks — the named ones sit on page 2).
- `GLOSSARY.md` words apply to conversation too; avoid the synonyms it lists.
- Clockify's API reference is https://docs.clockify.me, a single page. Before changing a
  call, search it for the endpoint (e.g. `curl -sL https://docs.clockify.me | grep …`);
  don't work from memory. Where the live API behaves differently, write a comment next to
  the code that relies on it and cover it with a test in the fake Clockify.
