import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import pkg from "../package.json";
import {
  api,
  hoursBetween,
  interval,
  isoZ,
  localToUtc,
  me,
  PAGE_SIZE,
  projects,
  resolveProject,
  resolveTask,
  round2,
  timeZone,
  utcToLocal,
  workspaceId,
} from "./clockify.ts";

/** The schema argument is there for the compiler: structuredContent must match what the tool declares. */
const ok = <S extends z.ZodType<Record<string, unknown>>>(
  _schema: S,
  text: string,
  structuredContent: z.infer<S>,
) => ({
  content: [{ type: "text" as const, text }],
  structuredContent,
});
// A handler that throws needs no catch: the SDK returns the message as an isError result.
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const ListProjectsOutput = z.object({
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      // nullish: Clockify omits it, empty-strings it, or nulls it depending on the host
      clientName: z.string().nullish(),
    }),
  ),
});

const LOCAL = "local to the user's Clockify profile timezone";
const Day = (what: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe(`${what}, YYYY-MM-DD, ${LOCAL}`);
const Clock = (what: string) =>
  z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .describe(`${what}, HH:MM, ${LOCAL}`);

/** log_time's input entry — reused in its output so a failed entry echoes what was asked for. */
const LogEntry = z.object({
  project: z.string().describe('Project name, case-insensitive (e.g. "acme")'),
  task: z.string().optional().describe("Task name within the project, case-insensitive"),
  date: Day("Day"),
  start: Clock("Start time"),
  end: Clock("End time"),
  description: z.string().optional(),
  billable: z.boolean().optional().describe("Omit to use the project default"),
});

const LogTimeOutput = z.object({
  created: z.array(
    z.object({
      id: z.string(),
      project: z.string(),
      date: z.string(),
      start: z.string(),
      end: z.string(),
      hours: z.number(),
    }),
  ),
  failed: z.array(LogEntry.extend({ error: z.string() })),
  totalHours: z.number(),
});
type LogTimeOutput = z.infer<typeof LogTimeOutput>;

/** `hydrated=true` inlines the project and task objects instead of returning bare ids. */
type HydratedEntry = {
  id: string;
  description?: string;
  project?: { name: string } | null;
  task?: { name: string } | null;
  timeInterval: { start: string; end: string | null };
};

const ListTimeEntriesOutput = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      project: z.string().nullable(),
      task: z.string().nullable(),
      description: z.string(),
      date: z.string(),
      start: z.string(),
      // null on a running timer, which has no end yet
      end: z.string().nullable(),
      hours: z.number().nullable(),
    }),
  ),
  totalHours: z.number(),
});

const DeleteTimeEntriesOutput = z.object({
  deleted: z.array(z.string()),
  failed: z.array(z.object({ id: z.string(), error: z.string() })),
});
type DeleteTimeEntriesOutput = z.infer<typeof DeleteTimeEntriesOutput>;

/** A fresh server with the four tools registered; index.ts wires it to stdio, tests to memory. */
export function createServer() {
  const server = new McpServer({ name: "clockify", version: pkg.version });

  server.registerTool(
    "list_projects",
    {
      title: "List Clockify projects",
      description:
        "Active projects in the user's Clockify workspace, with the ids and names log_time accepts.",
      outputSchema: ListProjectsOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      const list = (await projects()).map((p) => ({
        id: p.id,
        name: p.name,
        clientName: p.clientName,
      }));
      return ok(
        ListProjectsOutput,
        list.map((p) => `${p.name}${p.clientName ? ` (${p.clientName})` : ""}`).join("\n"),
        { projects: list },
      );
    },
  );

  server.registerTool(
    "log_time",
    {
      title: "Log time entries",
      description:
        `Create one or more Clockify time entries. Pass every entry in a single call — one call for a whole week. ` +
        `Dates and times are ${LOCAL}; the server converts them to UTC. You compute the dates.`,
      inputSchema: z.object({ entries: z.array(LogEntry).min(1) }),
      outputSchema: LogTimeOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ entries }) => {
      const [ws, tz] = await Promise.all([workspaceId(), timeZone()]);
      const created: LogTimeOutput["created"] = [];
      const failed: LogTimeOutput["failed"] = [];
      const lines: string[] = [];
      let totalHours = 0;

      // ponytail: sequential; add a 5-way pool if anyone logs >50 entries at once
      for (const e of entries) {
        try {
          const project = await resolveProject(e.project);
          const taskId = e.task ? (await resolveTask(project.id, e.task)).id : undefined;
          const { start, end, hours } = interval(e.date, e.start, e.end, tz);
          const res = await api<{ id: string }>(`/workspaces/${ws}/time-entries`, {
            method: "POST",
            body: JSON.stringify({
              start,
              end,
              projectId: project.id,
              taskId,
              // undefined fields drop out of the JSON, so Clockify applies its own defaults
              description: e.description,
              billable: e.billable,
            }),
          });
          created.push({
            id: res.id,
            project: project.name,
            date: e.date,
            start: e.start,
            end: e.end,
            hours,
          });
          totalHours += hours;
          lines.push(
            `${project.name} — ${utcToLocal(start, tz).weekday} ${e.date} ${e.start}–${e.end} (${hours}h)`,
          );
        } catch (err) {
          const error = message(err);
          failed.push({ ...e, error });
          lines.push(`FAILED ${e.project} ${e.date} ${e.start}–${e.end}: ${error}`);
        }
      }
      const total = round2(totalHours);
      lines.push(`${created.length} created, ${failed.length} failed, ${total}h total`);
      return ok(LogTimeOutput, lines.join("\n"), { created, failed, totalHours: total });
    },
  );

  server.registerTool(
    "list_time_entries",
    {
      title: "List time entries",
      description: `List the user's Clockify time entries between two dates (inclusive), ${LOCAL}. Returns entry ids for delete_time_entries.`,
      inputSchema: z.object({
        from: Day("First day"),
        to: Day("Last day, inclusive"),
      }),
      outputSchema: ListTimeEntriesOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ from, to }) => {
      const [ws, tz] = await Promise.all([workspaceId(), timeZone()]);
      const { id: userId } = await me();
      const start = isoZ(localToUtc(`${from}T00:00`, tz));
      const end = isoZ(localToUtc(`${to}T23:59:59`, tz));
      // Page until a short page comes back, so a wide date range reports a real total instead of
      // the first 200 entries and a number that is quietly too low. Clockify's `Last-Page` header
      // would mean plumbing response headers out of api(); a short page is the same signal.
      // ponytail: 50 pages = 10k entries, a ceiling no timesheet reaches — bounded so a
      // misbehaving API cannot spin forever
      const raw: HydratedEntry[] = [];
      for (let page = 1; page <= 50; page++) {
        const batch = await api<HydratedEntry[]>(
          `/workspaces/${ws}/user/${userId}/time-entries?start=${start}&end=${end}&hydrated=true&page-size=${PAGE_SIZE}&page=${page}`,
        );
        raw.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }

      const entries = raw.map((e) => {
        const s = utcToLocal(e.timeInterval.start, tz);
        const stop = e.timeInterval.end ? utcToLocal(e.timeInterval.end, tz) : undefined;
        return {
          id: e.id,
          project: e.project?.name ?? null,
          task: e.task?.name ?? null,
          description: e.description ?? "",
          date: s.date,
          start: s.time,
          end: stop?.time ?? null,
          hours: e.timeInterval.end ? hoursBetween(e.timeInterval.start, e.timeInterval.end) : null,
        };
      });
      const total = entries.reduce((n, e) => n + (e.hours ?? 0), 0);
      const text =
        entries
          .map(
            (e) =>
              `${e.date} ${e.start}–${e.end ?? "running"} ${e.project ?? "no project"}${
                e.description ? ` — ${e.description}` : ""
              } (${e.hours ?? "?"}h) [${e.id}]`,
          )
          .join("\n") || "No entries.";
      return ok(ListTimeEntriesOutput, `${text}\n${round2(total)}h total`, {
        entries,
        totalHours: round2(total),
      });
    },
  );

  server.registerTool(
    "delete_time_entries",
    {
      title: "Delete time entries",
      description:
        "Permanently delete Clockify time entries by id. Get ids from list_time_entries or log_time.",
      inputSchema: z.object({ ids: z.array(z.string()).min(1).describe("Time entry ids") }),
      outputSchema: DeleteTimeEntriesOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ ids }) => {
      const ws = await workspaceId();
      const deleted: DeleteTimeEntriesOutput["deleted"] = [];
      const failed: DeleteTimeEntriesOutput["failed"] = [];
      for (const id of ids) {
        try {
          await api(`/workspaces/${ws}/time-entries/${id}`, { method: "DELETE" });
          deleted.push(id);
        } catch (err) {
          failed.push({ id, error: message(err) });
        }
      }
      return ok(DeleteTimeEntriesOutput, `Deleted ${deleted.length}, failed ${failed.length}`, {
        deleted,
        failed,
      });
    },
  );

  return server;
}
