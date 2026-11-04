import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import pkg from "../package.json";
import { type ClockifySettings, clockify, projectLabel, round2 } from "./clockify.ts";

const ok = <T extends Record<string, unknown>>(text: string, structuredContent: NoInfer<T>) => ({
  content: [{ type: "text" as const, text }],
  structuredContent,
});

const ListProjectsOutput = z.object({
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      clientName: z.string().nullish(),
    }),
  ),
});
type ListProjectsOutput = z.infer<typeof ListProjectsOutput>;

const IN_PROFILE_TIME_ZONE = "in the user's Clockify profile time zone";
const Day = (what: string) => z.iso.date().describe(`${what}, YYYY-MM-DD, ${IN_PROFILE_TIME_ZONE}`);
const Clock = (what: string) =>
  z.iso.time({ precision: -1 }).describe(`${what}, HH:MM, ${IN_PROFILE_TIME_ZONE}`);

const NewTimeEntry = z.object({
  project: z
    .string()
    .describe('Project name, case-insensitive (e.g. "acme"), or its id from list_projects'),
  client: z
    .string()
    .optional()
    .describe("Client name, case-insensitive; needed when several projects share the name"),
  task: z.string().optional().describe("Task name within the project, case-insensitive"),
  date: Day("Entry date: the day the entry starts"),
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
      client: z.string().nullable(),
      date: z.string(),
      start: z.string(),
      end: z.string(),
      hours: z.number(),
    }),
  ),
  failed: z.array(NewTimeEntry.extend({ error: z.string() })),
  totalHours: z.number(),
});
type LogTimeOutput = z.infer<typeof LogTimeOutput>;

const ListTimeEntriesOutput = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      project: z.string().nullable(),
      client: z.string().nullable(),
      task: z.string().nullable(),
      description: z.string(),
      date: z.string(),
      start: z.string(),
      end: z.string().nullable(),
      hours: z.number().nullable(),
    }),
  ),
  totalHours: z.number(),
});
type ListTimeEntriesOutput = z.infer<typeof ListTimeEntriesOutput>;

const DeleteTimeEntriesOutput = z.object({
  deleted: z.array(z.string()),
  failed: z.array(z.object({ id: z.string(), error: z.string() })),
});
type DeleteTimeEntriesOutput = z.infer<typeof DeleteTimeEntriesOutput>;

export function createServer(settings: ClockifySettings) {
  const server = new McpServer({ name: "clockify", version: pkg.version });
  const { projects, logTime, timeEntries, deleteTimeEntries } = clockify(settings);

  server.registerTool(
    "list_projects",
    {
      title: "List Clockify projects",
      description:
        "Active projects the user can log time to in their Clockify workspace, with the ids and names log_time accepts.",
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
      return ok<ListProjectsOutput>(
        list.map((p) => projectLabel(p.name, p.clientName)).join("\n"),
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
        `Dates and times are ${IN_PROFILE_TIME_ZONE}; the server converts them to UTC. You compute the dates.`,
      inputSchema: z.object({ entries: z.array(NewTimeEntry).min(1) }),
      outputSchema: LogTimeOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ entries }) => {
      const created: LogTimeOutput["created"] = [];
      const failed: LogTimeOutput["failed"] = [];
      const lines: string[] = [];
      let totalHours = 0;

      for (const outcome of await logTime(entries)) {
        const e = outcome.entry;
        if ("error" in outcome) {
          failed.push({ ...e, error: outcome.error });
          lines.push(
            `FAILED ${projectLabel(e.project, e.client)} ${e.date} ${e.start}–${e.end}: ${outcome.error}`,
          );
          continue;
        }
        const { id, project, client, hours } = outcome;
        created.push({ id, project, client, date: e.date, start: e.start, end: e.end, hours });
        totalHours += hours;
        const weekday = Temporal.PlainDate.from(e.date).toLocaleString("en-US", {
          weekday: "short",
        });
        lines.push(
          `${projectLabel(project, client)} — ${weekday} ${e.date} ${e.start}–${e.end} (${hours}h)`,
        );
      }
      const total = round2(totalHours);
      lines.push(`${created.length} created, ${failed.length} failed, ${total}h total`);
      return ok<LogTimeOutput>(lines.join("\n"), { created, failed, totalHours: total });
    },
  );

  server.registerTool(
    "list_time_entries",
    {
      title: "List time entries",
      description: `List the user's Clockify time entries whose entry date falls between two dates (inclusive), ${IN_PROFILE_TIME_ZONE}. Returns entry ids for delete_time_entries.`,
      inputSchema: z.object({
        from: Day("First entry date"),
        to: Day("Last entry date, inclusive"),
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
      const entries = await timeEntries(from, to);
      const total = round2(entries.reduce((n, e) => n + (e.hours ?? 0), 0));
      const what = (e: (typeof entries)[number]) =>
        e.project
          ? `${projectLabel(e.project, e.client)}${e.task ? ` / ${e.task}` : ""}`
          : "no project";
      const text =
        entries
          .map(
            (e) =>
              `${e.date} ${e.start}–${e.end ?? "running"} ${what(e)}${
                e.description ? ` — ${e.description}` : ""
              } (${e.hours ?? "?"}h) [${e.id}]`,
          )
          .join("\n") || "No entries.";
      return ok<ListTimeEntriesOutput>(`${text}\n${total}h total`, { entries, totalHours: total });
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
      const { deleted, failed } = await deleteTimeEntries(ids);
      const text = [
        ...failed.map((f) => `FAILED ${f.id}: ${f.error}`),
        `Deleted ${deleted.length}, failed ${failed.length}`,
      ].join("\n");
      return ok<DeleteTimeEntriesOutput>(text, { deleted, failed });
    },
  );

  return server;
}
