# clockify-mcp-server

[![M8ven Score](https://m8ven.ai/badge/mcp/condensetech-clockify-mcp-server-02xjra)](https://m8ven.ai/mcp/condensetech-clockify-mcp-server-02xjra?s=readme)

Log time to your Clockify projects by asking your agent, instead of clicking through the
UI.

> "add 4h on ACME every morning this week and 4h on Evil Corp every afternoon"
>
> → one `log_time` call, 10 entries created, 40h total.

A local stdio MCP server. Run it with your own API key, nothing is shared or hosted. It
ships as a single file with no dependencies, so `npx` starts it in a moment.

| Tool                  | What it does                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `list_projects`       | Active projects you can log time to                                                                                            |
| `log_time`            | Create entries in bulk, project by **name** (and client if names repeat), `date` + `start`/`end` in your **profile time zone** |
| `list_time_entries`   | Your time entries between two dates                                                                                            |
| `delete_time_entries` | Delete entries                                                                                                                 |

**Times are in your Clockify profile time zone**. You say `09:00`, the server reads
`settings.timeZone` from your Clockify profile and converts to UTC.

**Approval prompts come from your agent, not from this server**. Whether you are asked
before each call is up to your harness and its permission settings. The server marks the
`list_*` tools **read-only** and `delete_time_entries` **destructive**, but these are
treated as hints: the server enforces no authorization of its own. **Anything your API key
can do, the tools can too**.

---

## Use it

Everything you need if you just want to log time. Takes about two minutes.

**1. Have [Node](https://nodejs.org) 20 or later**. Check with `node --version`.

**2. Get your Clockify API key**:

Clockify → your avatar → Preferences → **ADVANCED** tab → Manage API keys → **GENERATE NEW**

**3. Register the server with your agent**:

<details>
<summary><b>Claude Code</b></summary>

```sh
claude mcp add clockify -s user -e CLOCKIFY_API_KEY=<key> -- npx -y @condensetech/clockify-mcp-server@1
```

`-s user` writes it to your personal config so it loads in **every** project (the default
scope, `local`, would bind it to the current directory).

</details>

<details>
<summary><b>Other harnesses</b> (Cursor, VS Code, Zed, Claude Desktop…)</summary>

Add this to its MCP config:

```json
{
  "mcpServers": {
    "clockify": {
      "command": "npx",
      "args": ["-y", "@condensetech/clockify-mcp-server@1"],
      "env": { "CLOCKIFY_API_KEY": "<key>" }
    }
  }
}
```

</details>

**Updates are automatic**: each time your harness starts the server, `npx` fetches the
latest `1.x` release. `@1` also means a breaking `2.0` never reaches you unannounced.

**4. Check it** in a fresh session:

```
list my clockify projects
log 2 hours on <project> today from 09:00 to 11:00, description test
show my clockify entries for this week
delete that entry
```

Open the Clockify UI after the second prompt and confirm the entry reads **09:00–11:00**.
If it shows a different time, your Clockify profile time zone is not what you think it is,
fix it in Clockify preferences.

### Environment

| Variable            | Required | Notes                                                                                          |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `CLOCKIFY_API_KEY`  | yes      | Preferences → Advanced → Manage API keys                                                       |
| `CLOCKIFY_API_BASE` | no       | Regional hosts: `https://euc1.clockify.me/api/v1` (EU), `euw2` (UK), `use2` (US), `apse2` (AU) |

Time is logged to your active workspace: the one selected in Clockify. To use another,
switch to it in Clockify.

### If something goes wrong

- `CLOCKIFY_API_KEY is not set` — the key did not reach the server process. Put it in the
  harness config's `env`, not in your shell.
- `Ambiguous project "x". Candidates: …` — deliberate. The server refuses to guess; use
  one of the listed names. Projects with the same name under different clients are listed
  as `Name (Client)`: name the client too, or pass the project id from `list_projects`.
- **404s on every call** — your workspace is on a regional host. Set `CLOCKIFY_API_BASE`.
- **Entries land at the wrong hour** — check your Clockify profile time zone (see step 4
  of "Use it").

---

## Develop it

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

Releases and security updates: see [`RELEASING.md`](RELEASING.md).

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
