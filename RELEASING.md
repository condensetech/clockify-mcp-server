# Releasing

Adopters run `npx …@1`: every 1.x release reaches them the next time their harness starts
the server. A new major is the only release that doesn't.

## Cut a release

The release commit reaches `main` through a pull request like any other. PRs merge with a
merge commit, so the commit keeps the tag you gave it on the branch.

**You, locally**

1. On a branch off an up-to-date `main`, `bun run bump` picks the version from the commits
   since the last tag (breaking → major, `feat:` → minor, anything else → patch), writes
   the CHANGELOG entry, commits and tags. Preview with `--dry-run`; force a version with
   `--release-as X.Y.Z`.
2. Push, open the PR and merge it:

   ```sh
   git push -u --follow-tags origin HEAD
   gh pr create --fill
   ```

   Pushing the tag starts nothing. The release starts when the merge brings the tagged
   commit onto `main`. The release commit must be the PR's last: if you push fixes after
   it, delete the tag (`git tag -d vX.Y.Z && git push origin :vX.Y.Z`), drop the commit
   and bump again.

**The release workflow, automatically**

3. Runs CI. Any failure stops the release.
4. Builds `dist/` from the tagged commit and **stages** it on npm with provenance. A
   staged version isn't public, and CI can't approve it.
5. Creates a **draft** GitHub release from the version's CHANGELOG entry.

**You, to make it public**

6. Approve on npm: `npm stage list`, `npm stage view <id>`, `npm stage approve <id>`.
7. Publish the draft GitHub release, after npm, so it never announces a version nobody can
   install.

## What counts as breaking

The agent rereads the tools each time the server starts, so it adapts to most changes.
Mark a commit as breaking (`!` or `BREAKING CHANGE:`) only when it can't:

- **Startup config changes**: env var, CLI argument, Node `engines` floor.
- **A tool is renamed**: adopters' permission allowlists, hooks and skills name it.
- **Something is removed** that the remaining tools can't do.
- **Same schema, different meaning**: e.g. `start` read in another timezone, or a
  `delete_time_entries` filter matching more time entries.

Renaming, adding or reshaping an input, rewording a description or changing an output's
format is `feat` or `fix`.

## Security updates

Ask: is the vulnerable package in the production tree, i.e. in what ships?

- **Yes**: CI's "Audit shipped code" fails, or a `runtime-security` PR opens. Merge it as
  a `fix:` commit naming the advisory, then cut a release.
- **No**: only "Audit dev only" fails, or a `dev-security` PR opens. Merge it; no release.

CI also runs weekly, so a new advisory turns it red without a push.
