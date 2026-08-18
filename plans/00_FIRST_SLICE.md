# Clockify MCP Server — first working slice

## Context

The team logs project hours in Clockify by hand. We want each teammate to say
_"add 4h on Sinelec every morning this week and 4h every afternoon"_ and have Claude
write the entries. This repo currently holds only `docs/` (7 markdown files of Clockify
API samples) — no code.

Outcome: a stdio MCP server each person runs locally with their own
`CLOCKIFY_API_KEY`, exposing four tools that cover create / review / undo.

Decisions already made: local stdio per user, TypeScript on **bun**, Claude computes the
dates and the server writes them, scope = create + list + delete.

## Docs status

Remaining gaps, none blocking:

- **`get-user-time-entries.md` documents no query params** — only the response array.
  The endpoint does accept `start`, `end`, `project`, `task`, `hydrated`, `in-progress`,
  `page`, `page-size` (verified against docs.clockify.me). `start`/`end` are ISO-Z instants.
- **No bulk _create_.** `bulk-edit-time-entries.md` requires an `id` per element, so it is
  update-only. N entries = N `POST`s in a loop.
- **Rate limit for `X-Api-Key` is not in `docs/`.** Real limit: **50 req/s on paid plans**,
  but **30 req/hour for newly created workspaces on the Free plan**.
- No tag or client endpoints documented, so `tagIds` can't be resolved from names using
  only `docs/`. Tags are dropped from slice 1.
- No required/optional markers anywhere; the files are sample payloads, not a schema.
  For create, only `start` is truly required (`end` omitted = running timer). Whether
  `projectId` is mandatory depends on the workspace's `forceProjects` setting.
- **Timezone semantics are unspecified.** Every sample is UTC `Z`. This is the main
  correctness risk and is handled explicitly below.

## Stack

The MCP TypeScript SDK was restructured — **do not use `@modelcontextprotocol/sdk`**:

- `@modelcontextprotocol/server` **v2.0.0** (+ `@modelcontextprotocol/core`), **zod v4**
- Spec revision **2026-07-28**
- `import { McpServer } from "@modelcontextprotocol/server"` /
  `{ StdioServerTransport } from "@modelcontextprotocol/server/stdio"`
- `server.registerTool(name, { title, description, inputSchema, outputSchema, annotations }, handler)`
  — `inputSchema` is a full `z.object({...})` in v2, not a raw shape
- Handlers return `{ content: [...], structuredContent: {...} }`; errors via `isError: true`
- No runtime deps beyond those two + zod.

**Runtime: bun 1.3.14** (installed). This removes work rather than adding it:

- **No build step and no `dist/`** — bun executes TypeScript directly, so the server runs
  as `bun src/index.ts`. `tsconfig.json` exists only for editor typechecking.
- **No test dependency** — `bun test` with `import { expect, test } from "bun:test"`.
- `fetch` and `process.env` are built in.
- Shebang `#!/usr/bin/env bun`, `bun install` for deps.
- **One thing to smoke-test before writing the tools**: that `StdioServerTransport` from
  `@modelcontextprotocol/server/stdio` speaks JSON-RPC correctly on bun's `process.stdin`.
  It normally does, but it's the only genuine bun-specific risk here — verify it with a
  hello-world tool first, before building anything on top.
- For rollout to teammates who don't have bun:
  `bun build --compile --outfile clockify-mcp src/index.ts` produces a single self-contained binary.
  Not needed for slice 1.

## The two UX decisions that matter

**1. Local wall-clock in, UTC out.** Tools take `date: "2026-08-18"` + `start: "09:00"` +
`end: "13:00"`, never ISO instants. The server reads the user's zone from
`GET /user` → `settings.timeZone` and converts. `Temporal` is not available in bun 1.3.14
(checked), so use the stdlib `Intl.DateTimeFormat` round-trip — no `date-fns-tz` dependency:

```ts
function localToUtc(local: string, tz: string): Date {
  // "2026-08-18T09:00"
  const d = new Date(local + "Z");
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return new Date(d.getTime() - (asUtc - d.getTime()));
}
```

Verified under bun: Europe/Rome `09:00` → `07:00Z` in August, `08:00Z` in January. DST correct.

**2. Bulk-by-default + name resolution.** `log_time` takes an **array** of entries, so
"every morning and afternoon this week" is _one_ tool call and _one_ approval prompt,
not ten. `project` accepts the human name ("sinelec"); the server resolves it
case-insensitively against the cached project list. Ambiguous or unknown → `isError`
listing the candidate names so Claude can ask, rather than guessing an id.

## Files

```
package.json      type: module, deps: @modelcontextprotocol/server, zod
tsconfig.json     editor typechecking only — no emit, bun runs the TS directly
src/clockify.ts   API client, lazy caches, localToUtc, resolveProject
src/index.ts      McpServer + 4 registerTool calls + stdio wiring (#!/usr/bin/env bun)
src/clockify.test.ts  bun:test
README.md         where to get the API key, the claude mcp add line
```

### `src/clockify.ts`

- `api(path, init)` — `fetch` against `process.env.CLOCKIFY_API_BASE ??
"https://api.clockify.me/api/v1"` with `X-Api-Key`. Non-2xx → throw with status + body
  text (Clockify's error bodies are undocumented, so surface them raw).
  `CLOCKIFY_API_BASE` exists because EU/UK/AU workspaces sit on regional hosts
  (`euc1`, `euw2`, `apse2`) — check where the team's workspace lives before rollout.
- `me()` — `GET /user`, memoised in a module-level variable. Yields `id`,
  `activeWorkspace`, `settings.timeZone`. `CLOCKIFY_WORKSPACE_ID` overrides
  `activeWorkspace` for anyone in multiple workspaces.
  <!-- ponytail: memoised for process lifetime, no TTL — a stdio server dies with the session -->
- `projects()` — `GET /workspaces/{id}/projects?archived=false&page-size=200`, memoised.
  Paginate only if someone actually has >200 projects.
- `resolveProject(name)` — exact case-insensitive match wins; else substring match;
  0 or >1 → throw with the candidate list.
- `localToUtc` as above.

### `src/index.ts` — four tools

| Tool                  | Annotations                                                          | Shape                                                                          |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `list_projects`       | `readOnlyHint: true`                                                 | no args → `{ projects: [{ id, name, clientName }] }`                           |
| `log_time`            | `destructiveHint: false, idempotentHint: false, openWorldHint: true` | `{ entries: [{ project, task?, date, start, end, description?, billable? }] }` |
| `list_time_entries`   | `readOnlyHint: true`                                                 | `{ from: date, to: date }` → entries with local times + hours                  |
| `delete_time_entries` | `destructiveHint: true`                                              | `{ ids: string[] }`                                                            |

`log_time` detail:

- `date` = `YYYY-MM-DD`, `start`/`end` = `HH:MM`, both **local to the Clockify profile zone**.
  Say this in the tool description and in every field's `.describe()` — it's the one thing
  the model must not get wrong.
- Resolve project once per distinct name, then `POST /workspaces/{wsId}/time-entries` with
  `{ start, end, projectId, taskId?, description, billable? }`, ISO-Z, second precision.
  Omit `billable` when not given so Clockify applies the project default.
- **Sequential loop**, collecting per-entry success/failure — a partial failure must not
  lose the entries that already landed.
  <!-- ponytail: sequential; add a 5-way pool if anyone logs >50 entries at once -->
- Returns `structuredContent: { created: [{id, date, start, end, project}], failed: [{...,error}], totalHours }`
  plus a compact text summary (`Sinelec — Mon 18 Aug 09:00–13:00 (4h)` …) so the user can
  eyeball it in the transcript.

`list_time_entries` renders times back **in the user's zone** via `Intl.DateTimeFormat`, and
returns entry `id`s — that's what makes `delete_time_entries` usable as the undo path.

**No dry-run mode.** The host already shows the full argument list before approving, and
`list_time_entries` + `delete_time_entries` cover the "I logged it twice" case.
Add duplicate detection only if it actually bites.

### Tests — `src/clockify.test.ts`

`bun test`, `bun:test`, no extra dependency. Three cases:

1. `localToUtc` across the DST boundary (Aug and Jan for Europe/Rome).
2. `resolveProject` — exact beats substring; ambiguous throws listing candidates.
3. Entry payload builder produces `Z`-suffixed second-precision ISO from date + `HH:MM`.

## Verification

0. Smoke-test stdio on bun with a hello-world tool before building the real ones.
1. `bun test` — unit checks pass with no network.
2. `CLOCKIFY_API_KEY=… bun src/index.ts` — starts, logs to stderr, doesn't exit.
3. `claude mcp add clockify -e CLOCKIFY_API_KEY=… -- bun <abs>/src/index.ts`, then in a
   session:
   - "list my clockify projects" → `list_projects` returns real names.
   - "log 2 hours on <project> today from 09:00 to 11:00, description test" → one entry.
   - Confirm in the Clockify web UI that it shows **09:00–11:00 local**, not 11:00–13:00.
     This is the timezone check; everything else is easy to fix, this one is silent.
   - "show my clockify entries for this week" → the entry with its id.
   - "delete that entry" → gone from the UI.
4. The real prompt: _"add 4 hour entries for the sinelec project for all of this week in the
   morning, and 4 hour entries for all of this week in the afternoon"_ → expect **one**
   `log_time` call with 10 entries, Mon–Fri, and a 40h total in the summary.

## Deliberately out of slice 1

Tags, clients, running timers (start/stop), updating entries, the Reports API, MCP
resources/prompts, and remote HTTP transport. Add when someone asks.
