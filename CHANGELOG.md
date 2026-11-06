# Changelog

Versions follow [semver](https://semver.org). Adopters run `@1`, so a new major is the
only release that doesn't reach them on its own. It's kept for what the agent can't adapt
to: see [what counts as breaking](RELEASING.md#what-counts-as-breaking).

## 0.1.0 — 2026-11-05

First npm release: `npx -y @condensetech/clockify-mcp-server@0` runs the server on Node 20
or later, with no bun and no clone.

- `list_projects`, `log_time`, `list_time_entries`, `delete_time_entries`.
