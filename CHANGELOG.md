# Changelog

Versions follow [semver](https://semver.org). Adopters run `@1`, so a new major is the
only release that doesn't reach them on its own. It's kept for what the agent can't adapt
to: see [what counts as breaking](RELEASING.md#what-counts-as-breaking).

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
