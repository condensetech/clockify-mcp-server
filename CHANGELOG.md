# Changelog

Versions follow [semver](https://semver.org). Adopters run `@1`, so a new major is the
only release that doesn't reach them on its own. It's kept for what the agent can't adapt
to: see [what counts as breaking](RELEASING.md#what-counts-as-breaking).

## [1.0.2](https://github.com/condensetech/clockify-mcp-server/compare/v1.0.1...v1.0.2) (2026-11-11)

Back to a minified bundle, reverting 1.0.1. Unminified, the bundle doubled to 985 kB
without becoming readable: 98% of it is the bundled dependencies (the MCP SDK, zod and a
Temporal polyfill), not this server. To see what `npx` runs, read `src/`: npm provenance
ties the published file to the commit that built it.

### Bug Fixes

- publish minified bundle again ([fe4922a](https://github.com/condensetech/clockify-mcp-server/commit/fe4922ae7d916dc3d02032c7e72b74a5450f61db))

## [1.0.1](https://github.com/condensetech/clockify-mcp-server/compare/v1.0.0...v1.0.1) (2026-11-06)

### Bug Fixes

- publish unminified bundle ([c1623eb](https://github.com/condensetech/clockify-mcp-server/commit/c1623eb2580b48d13494b814c5c089d66e3887d7))

## [1.0.0](https://github.com/condensetech/clockify-mcp-server/compare/v0.1.0...v1.0.0) (2026-11-06)

No code changes, just the official stable version to set the `@1` floor. If you registered
the MCP with `@0` at the end, you should now change it to receive any following minor and
patch updates:

- `claude mcp remove clockify`
- `claude mcp add clockify -s user -e CLOCKIFY_API_KEY=<key> -- npx -y @condensetech/clockify-mcp-server@1`

## 0.1.0 — 2026-11-05

First npm release: `npx -y @condensetech/clockify-mcp-server@0` runs the server on Node 20
or later, with no bun and no clone.

- `list_projects`, `log_time`, `list_time_entries`, `delete_time_entries`.
