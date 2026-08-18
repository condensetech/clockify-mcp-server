# clockify-mcp-server

Local stdio MCP server that logs your project hours in Clockify from a Claude session:

> "add 4h on Sinelec every morning this week and 4h every afternoon"

Four tools: `list_projects`, `log_time`, `list_time_entries`, `delete_time_entries`.
Dates and times are always **local to your Clockify profile timezone** — the server reads
`settings.timeZone` from `GET /user` and converts to UTC.

## Setup

Requires [bun](https://bun.sh) (tested on 1.3.14). No build step — bun runs the TypeScript.

```sh
bun install
```

Get an API key: Clockify → your avatar → **Preferences** → **ADVANCED** → **Manage API keys** -> **GENERATE NEW**
(If your workspace is on a subdomain, generate the key while on that subdomain.)

```sh
claude mcp add clockify -e CLOCKIFY_API_KEY=<key> -- bun $(pwd)/src/index.ts
```

Then ask Claude to "list my clockify projects".

### Environment

| Variable                | Required | Notes                                                                                          |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `CLOCKIFY_API_KEY`      | yes      | Profile settings → API                                                                         |
| `CLOCKIFY_WORKSPACE_ID` | no       | Defaults to your active workspace                                                              |
| `CLOCKIFY_API_BASE`     | no       | Regional hosts: `https://euc1.clockify.me/api/v1` (EU), `euw2` (UK), `use2` (US), `apse2` (AU) |

## Development

```sh
bun test
CLOCKIFY_API_KEY=<key> bun src/index.ts   # starts, logs to stderr, waits on stdin
```

Rolling out to someone without bun: `bun build --compile --outfile clockify-mcp src/index.ts`.

Out of scope for now: tags, clients, running timers, editing entries, reports.
