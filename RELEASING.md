# Releasing

The npm package is `dist/`, built by `bun run build`: one bundled `index.js`
for Node, a generated `package.json` with no dependencies, README and LICENSE.
The root `package.json` is `private`, so `npm publish` from the repo root fails
on purpose.

## Cut a release

1. Bump `version` in `package.json` and move the `CHANGELOG.md` entry from
   "unreleased" to today's date. Commit as `chore: release x.y.z`.
2. Tag and push: `git tag vx.y.z && git push origin main vx.y.z`.
3. The release workflow runs CI and the Node matrix, checks the tag matches
   `package.json`, publishes `./dist` to npm through trusted publishing (with
   provenance, no stored token) and creates the GitHub release.

Check the package before tagging with `bun run build && npm pack --dry-run ./dist`:
it should list only `index.js`, `package.json`, `README.md` and `LICENSE`.

## Security updates

The deciding question: **is the affected package in the production tree?**
`bun audit --production` follows transitive dependencies, so it also covers
`@modelcontextprotocol/core`, which we don't install directly. The build fails
if it bundles anything outside that tree, so "production tree" and "what ships"
are the same thing.

| Signal                                                                                          | Meaning                                          | Action                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI step "Audit shipped code" (`bun audit --production`) fails, or a `runtime-security` PR opens | The vulnerable code is in the published bundle   | Merge, bump the patch version, add a CHANGELOG entry naming the advisory, push the tag. Adopters on `@0` get it the next time `npx` resolves the range. |
| Only "Audit dev only" (`bun audit`) fails, or a `dev-security` PR opens                         | Only the maintainer's machine and CI are exposed | Merge, no release.                                                                                                                                      |

CI runs weekly as well as on pushes, so an advisory published against an
unchanged lockfile still turns it red.

**Exception: tools that run during the build or publish** can reach adopters
even though they are dev dependencies. Bun does the bundling, so its version
stays pinned in CI. The release job installs with `--ignore-scripts`, because
it holds npm publish rights through OIDC; Biome, TypeScript and lefthook don't
run there.
