# clockify-mcp-server

[![M8ven Score](https://m8ven.ai/badge/mcp/condensetech-clockify-mcp-server-02xjra?v=40fa14233279dc9af7289e3d44d963ff)](https://m8ven.ai/mcp/condensetech-clockify-mcp-server-02xjra)

Log your project hours in Clockify by asking your agent, instead of clicking through the web UI.

> "add 4h on ACME every morning this week and 4h on Evil Corp every afternoon"
>
> → one approval prompt, 10 entries created, 40h total.

A local stdio MCP server. Each person runs it themselves with their own API key — nothing is
shared or hosted.

| Tool                  | What it does                                                                           |
| --------------------- | -------------------------------------------------------------------------------------- |
| `list_projects`       | Active projects in your workspace                                                      |
| `log_time`            | Create entries in bulk — project by **name**, `date` + `start`/`end` in **local time** |
| `list_time_entries`   | Your entries between two dates                                                         |
| `delete_time_entries` | Delete entries                                                                         |

**Times are always local to your Clockify profile timezone.** You say `09:00`, the server reads
`settings.timeZone` from your Clockify profile and converts to UTC. You never deal with UTC, and
neither does the agent.

Not supported yet: tags, clients, running timers (start/stop), editing existing entries, reports.

---

## Use it

Everything you need if you just want to log time. Takes about two minutes.

**1. Install [bun](https://bun.sh)** (tested on 1.3.14) and the dependencies:

```sh
curl -fsSL https://bun.sh/install | bash # install bun if needed
git clone <this-repo> && cd clockify-mcp-server
bun install
```

There is no build step — bun runs the TypeScript directly.

**2. Get your Clockify API key:**

- Clockify → your avatar → Preferences → **ADVANCED** tab → Manage API keys → **GENERATE NEW**

**3. Register the server with your agent.**

Claude Code — copy this as-is, from the repo root you just cloned into:

```sh
claude mcp add clockify -s user -e CLOCKIFY_API_KEY=<key> -- bun "$PWD/src/index.ts"
```

`-s user` writes it to your personal config so it loads in **every** project, not just this one
(the default scope, `local`, would bind it to this directory). `$PWD` is expanded by your shell
before `claude` sees it, so the stored path is absolute.

Any other harness (Cursor, VS Code, Zed, Claude Desktop…) — same three things in its MCP config.
Print the path to paste:

```sh
echo "$PWD/src/index.ts"
```

```json
{
  "mcpServers": {
    "clockify": {
      "command": "bun",
      "args": ["<paste the absolute path here>"],
      "env": { "CLOCKIFY_API_KEY": "<key>" }
    }
  }
}
```

**The path must be absolute**: your agent starts the server from whatever directory it happens to be
working in, not from this repo.

**4. Check it** — in a fresh session:

```
list my clockify projects
log 2 hours on <project> today from 09:00 to 11:00, description test
show my clockify entries for this week
delete that entry
```

Open the Clockify web UI after the second prompt and confirm the entry reads **09:00–11:00**. If it
shows a different time, your Clockify profile timezone is not what you think it is — fix it in
Clockify preferences, everything here follows from it.

### Environment

| Variable                | Required | Notes                                                                                          |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `CLOCKIFY_API_KEY`      | yes      | Preferences → Advanced → Manage API keys                                                       |
| `CLOCKIFY_WORKSPACE_ID` | no       | Defaults to your active workspace — only needed if you are in several                          |
| `CLOCKIFY_API_BASE`     | no       | Regional hosts: `https://euc1.clockify.me/api/v1` (EU), `euw2` (UK), `use2` (US), `apse2` (AU) |

### If something goes wrong

- **`CLOCKIFY_API_KEY is not set`** — the key did not reach the server process. Put it in the
  harness config's `env`, not in your shell.
- **`Ambiguous project "x". Candidates: …`** — deliberate. The server refuses to guess an id; use
  one of the listed names.
- **404s on every call** — your workspace is on a regional host. Set `CLOCKIFY_API_BASE`.
- **Entries land at the wrong hour** — check your Clockify profile timezone (see step 4).

---

## Develop it

None of this is needed to just use the server.

```sh
bun test      # unit tests, no network
bun run check # biome format + lint, applies fixes
bun run start # start the server on stdio (needs CLOCKIFY_API_KEY)
```

`bun install` also installs the git hooks (`prepare` → `lefthook install`), so `biome check --write`
runs on your staged files at commit time and restages what it fixed. Nothing else to set up.

For local runs, bun auto-loads `.env` from the repo root, so a gitignored
`CLOCKIFY_API_KEY=<key>` there saves you retyping it. That only works when the working directory
_is_ the repo, which is why the harness config above passes the key explicitly.

### Layout

```
src/clockify.ts      # API client, memoised user/project/task lookups, timezone conversion
src/index.ts         # McpServer + the four tools + stdio wiring
src/clockify.test.ts # the parts worth testing: DST conversion, name resolution, payload building
docs/                # Clockify API request/response samples
plans/               # what was built and what was deliberately left out
```

The interesting code is `localToUtc` / `interval` in `src/clockify.ts` — a stdlib
`Intl.DateTimeFormat` round-trip, no date library. Change it and run `bun test`; the DST cases are
the ones that catch mistakes.

Shipping to someone without bun: `bun build --compile --outfile clockify-mcp src/index.ts` produces
one self-contained binary to point the harness at instead.
