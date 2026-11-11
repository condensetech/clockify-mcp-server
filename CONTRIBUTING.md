# Contributing

How to run, check and change the server. For using it, see [`README.md`](README.md); for
shipping a release, see [`RELEASING.md`](RELEASING.md).

## Develop

Needs [bun](https://bun.sh) (tested on 1.4.4). Bun is only the dev toolchain: the
published package runs on Node.

```sh
git clone https://github.com/condensetech/clockify-mcp-server.git && cd clockify-mcp-server
bun install
```

```sh
bun test          # unit tests, each tool end to end against a fake Clockify, and the Node build
bun run typecheck # tsc --noEmit
bun run fix       # biome format + lint, applies fixes
bun run ci        # biome ci: the read-only check CI runs
bun run build     # the npm package in dist/: one bundled file for Node, no dependencies
bun run start     # start the server on stdio from source (needs CLOCKIFY_API_KEY)
```

`bun install` also installs the git hooks (`prepare` → `lefthook install`), so `biome
check --write` runs on your staged files at commit time and restages what it fixed, and
`typecheck` runs on the whole project. CI runs typecheck, tests, `biome ci` and `bun
audit` on every push to `main` and every pull request, plus the Node build's smoke test on
Node 20, 22, 24 and 26. Nothing else to set up.

To point your harness at your checkout instead of the npm release:

```sh
claude mcp add clockify -s user -e CLOCKIFY_API_KEY=<key> -- bun "$PWD/src/index.ts"
```

For local runs, bun auto-loads `.env` from the repo root, so a gitignored
`CLOCKIFY_API_KEY=<key>` there saves you retyping it. That only works when the working
directory _is_ the repo, which is why the harness config passes the key explicitly.

## Contribute

1. Branch off `main` and open a pull request. Nobody pushes to `main` directly.
2. CI must be green. `bun audit` fails only on known vulnerabilities, so a red audit means
   bump or replace the dependency, not ignore it.
3. Pull requests from outside the Condense team need one approval from a team member. Team
   members can merge their own.
4. Pull requests land with a merge commit, never squashed or rebased, so every commit
   reaches `main` as is (and a release tag stays on its commit): keep them small, one
   concern each, prefixed `feat:` / `fix:` / `refactor:` / `chore:`. Commit fixes
   separately from refactors.
5. For a behaviour change, write the test first and watch it fail.
6. Use the words in [`GLOSSARY.md`](GLOSSARY.md) (Clockify's own terms) in code, tool
   descriptions and output.
7. Keep the tool set small: a new tool or input has to do something the existing ones
   can't.

Dependabot opens a weekly pull request for dependency and GitHub Actions updates; it goes
through the same checks and review.
