# clockify-mcp-server

[![M8ven Score](https://m8ven.ai/badge/mcp/condensetech-clockify-mcp-server-02xjra?v=40fa14233279dc9af7289e3d44d963ff)](https://m8ven.ai/mcp/condensetech-clockify-mcp-server-02xjra)

Log your Clockify project hours by asking your agent, instead of clicking
through the UI.

> "add 4h on ACME every morning this week and 4h on Evil Corp every afternoon"
>
> → one `log_time` call, 10 entries created, 40h total.

A local stdio MCP server. Run it with your own API key, nothing is shared or
hosted.

| Tool                  | What it does                                                                          |
| --------------------- | ------------------------------------------------------------------------------------- |
| `list_projects`       | Active projects in your workspace                                                     |
| `log_time`            | Create entries in bulk, project by **name**, `date` + `start`/`end` in **local time** |
| `list_time_entries`   | Your entries between two dates                                                        |
| `delete_time_entries` | Delete entries                                                                        |

**Times are local to your Clockify profile timezone**. You say `09:00`, the
server reads `settings.timeZone` from your Clockify profile and converts to UTC.

**Approval prompts come from your agent, not from this server**. Whether you are
asked before each call is up to your harness and its permission settings. The
server marks the `list_*` tools **read-only** and `delete_time_entries`
**destructive**, but these are treated as hints: the server enforces no
authorization of its own. **Anything your API key can do, the tools can too**.

---

## Use it

Everything you need if you just want to log time. Takes about two minutes.

**1. Install [bun](https://bun.sh)** (tested on 1.4.4) and the dependencies:

```sh
curl -fsSL https://bun.sh/install | bash # install bun if needed
git clone https://github.com/condensetech/clockify-mcp-server.git && cd clockify-mcp-server
bun install
```

**2. Get your Clockify API key**:

- Clockify → your avatar → Preferences → **ADVANCED** tab → Manage API keys → **GENERATE NEW**

**3. Register the server with your agent**:

<details>
<summary><b>Claude Code</b></summary>

From the repo root you just cloned:

```sh
claude mcp add clockify -s user -e CLOCKIFY_API_KEY=<key> -- bun "$PWD/src/index.ts"
```

`-s user` writes it to your personal config so it loads in **every** project,
not just the clone (the default scope, `local`, would bind it to that
directory). `$PWD` is expanded by your shell before `claude` sees it, so the
stored path is absolute.

</details>

<details>
<summary><b>Other harnesses</b> (Cursor, VS Code, Zed, Claude Desktop…)</summary>

Same three things in its MCP config. Print the path to paste:

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

**The path must be absolute** so your harness starts the server from whatever
directory it happens to be working in.

</details>

**4. Check it** in a fresh session:

```
list my clockify projects
log 2 hours on <project> today from 09:00 to 11:00, description test
show my clockify entries for this week
delete that entry
```

Open the Clockify UI after the second prompt and confirm the entry reads
**09:00–11:00**. If it shows a different time, your Clockify profile timezone is
not what you think it is, fix it in Clockify preferences.

### Environment

| Variable                | Required | Notes                                                                                          |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `CLOCKIFY_API_KEY`      | yes      | Preferences → Advanced → Manage API keys                                                       |
| `CLOCKIFY_WORKSPACE_ID` | no       | Defaults to your active workspace — only needed if you are in several                          |
| `CLOCKIFY_API_BASE`     | no       | Regional hosts: `https://euc1.clockify.me/api/v1` (EU), `euw2` (UK), `use2` (US), `apse2` (AU) |

### If something goes wrong

- `CLOCKIFY_API_KEY is not set` — the key did not reach the server process. Put
  it in the harness config's `env`, not in your shell.
- `Ambiguous project "x". Candidates: …` — deliberate. The server refuses to
  guess an id; use one of the listed names.
- **404s on every call** — your workspace is on a regional host. Set
  `CLOCKIFY_API_BASE`.
- **Entries land at the wrong hour** — check your Clockify profile timezone (see
  step 4 of "Use it").

---

## Develop it

```sh
bun test          # unit tests + each tool end to end against a fake Clockify, no network
bun run typecheck # tsc --noEmit
bun run fix       # biome format + lint, applies fixes
bun run ci        # biome ci: the read-only check CI runs
bun run start     # start the server on stdio (needs CLOCKIFY_API_KEY)
```

`bun install` also installs the git hooks (`prepare` → `lefthook install`), so
`biome check --write` runs on your staged files at commit time and restages what
it fixed, and `typecheck` runs on the whole project. CI runs typecheck, tests
and `biome ci` on every push. Nothing else to set up.

For local runs, bun auto-loads `.env` from the repo root, so a gitignored
`CLOCKIFY_API_KEY=<key>` there saves you retyping it. That only works when the
working directory _is_ the repo, which is why the harness config above passes
the key explicitly.

## Shipping to someone without bun

`bun build --compile --outfile clockify-mcp src/index.ts` produces one
self-contained binary to point the harness at.
