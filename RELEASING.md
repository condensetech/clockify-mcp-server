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
   `package.json`, **stages** `./dist` on npm through trusted publishing (with
   provenance, no stored token) and creates a draft GitHub release.
4. Approve the staged version, with 2FA: `npm stage list`, check it with
   `npm stage view <stage-id>` (or `npm stage download <stage-id>`), then
   `npm stage approve <stage-id>`. Or use the Staged Packages tab on npmjs.com.
   Only then is it public.
5. Publish the draft GitHub release.

The trusted publisher is allowed to stage only, not to `npm publish` or change
dist-tags, so a compromised release job can't put a version in front of
adopters without your approval.

Check the package before tagging with `bun run build && npm pack --dry-run ./dist`:
it should list only `index.js`, `package.json`, `README.md` and `LICENSE`.

## Security updates

The deciding question: **is the affected package in the production tree?**
`bun audit --production` follows transitive dependencies, so it also covers
`@modelcontextprotocol/core`, which we don't install directly. The build fails
if it bundles anything outside that tree, so "production tree" and "what ships"
are the same thing.

| Signal                                                                                          | Meaning                                          | Action                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CI step "Audit shipped code" (`bun audit --production`) fails, or a `runtime-security` PR opens | The vulnerable code is in the published bundle   | Merge, bump the patch version, add a CHANGELOG entry naming the advisory, push the tag, approve the staged version. Adopters on `@0` get it the next time their harness starts the server. |
| Only "Audit dev only" (`bun audit`) fails, or a `dev-security` PR opens                         | Only the maintainer's machine and CI are exposed | Merge, no release.                                                                                                                                                                         |

CI runs weekly as well as on pushes, so an advisory published against an
unchanged lockfile still turns it red.

**Exception: tools that run during the build or publish** can reach adopters
even though they are dev dependencies. Bun does the bundling, so its version
stays pinned in CI. The release job installs with `--ignore-scripts`, because
it can stage versions on npm through OIDC; Biome, TypeScript and lefthook don't
run there.
