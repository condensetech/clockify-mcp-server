#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import {
  api,
  interval,
  isoZ,
  localToUtc,
  me,
  projects,
  resolveProject,
  resolveTask,
  round2,
  timeZone,
  utcToLocal,
  workspaceId,
} from "./clockify.ts";

const server = new McpServer({ name: "clockify", version: "0.1.0" });

const ok = (text: string, structuredContent: object) => ({
  content: [{ type: "text" as const, text }],
  structuredContent,
});
const fail = (e: unknown) => ({
  content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
  isError: true,
});

server.registerTool(
  "list_projects",
  {
    title: "List Clockify projects",
    description:
      "Active projects in the user's Clockify workspace, with the ids and names log_time accepts.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async () => {
    try {
      const list = (await projects()).map((p) => ({
        id: p.id,
        name: p.name,
        clientName: p.clientName,
      }));
      return ok(
        list.map((p) => `${p.name}${p.clientName ? ` (${p.clientName})` : ""}`).join("\n"),
        {
          projects: list,
        },
      );
    } catch (e) {
      return fail(e);
    }
  },
);

const LOCAL = "local to the user's Clockify profile timezone";
const PAGE_SIZE = 200;

server.registerTool(
  "log_time",
  {
    title: "Log time entries",
    description:
      `Create one or more Clockify time entries. Pass every entry in a single call — one call for a whole week. ` +
      `Dates and times are ${LOCAL}; the server converts them to UTC. You compute the dates.`,
    inputSchema: z.object({
      entries: z
        .array(
          z.object({
            project: z.string().describe('Project name, case-insensitive (e.g. "sinelec")'),
            task: z.string().optional().describe("Task name within the project, case-insensitive"),
            date: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .describe(`Day, YYYY-MM-DD, ${LOCAL}`),
            start: z
              .string()
              .regex(/^\d{2}:\d{2}$/)
              .describe(`Start time, HH:MM, ${LOCAL}`),
            end: z
              .string()
              .regex(/^\d{2}:\d{2}$/)
              .describe(`End time, HH:MM, ${LOCAL}`),
            description: z.string().optional(),
            billable: z.boolean().optional().describe("Omit to use the project default"),
          }),
        )
        .min(1),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ entries }) => {
    try {
      const [ws, tz] = await Promise.all([workspaceId(), timeZone()]);
      const created: object[] = [];
      const failed: object[] = [];
      const lines: string[] = [];
      let totalHours = 0;

      // ponytail: sequential; add a 5-way pool if anyone logs >50 entries at once
      for (const e of entries) {
        try {
          const project = await resolveProject(e.project);
          const taskId = e.task ? (await resolveTask(project.id, e.task)).id : undefined;
          const { start, end, hours } = interval(e.date, e.start, e.end, tz);
          const res = (await api(`/workspaces/${ws}/time-entries`, {
            method: "POST",
            body: JSON.stringify({
              start,
              end,
              projectId: project.id,
              taskId,
              description: e.description,
              ...(e.billable === undefined ? {} : { billable: e.billable }),
            }),
          })) as { id: string };
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
          failed.push({ ...e, error: err instanceof Error ? err.message : String(err) });
          lines.push(
            `FAILED ${e.project} ${e.date} ${e.start}–${e.end}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      const total = round2(totalHours);
      lines.push(`${created.length} created, ${failed.length} failed, ${total}h total`);
      return ok(lines.join("\n"), { created, failed, totalHours: total });
    } catch (e) {
      return fail(e);
    }
  },
);

/** `hydrated=true` inlines the project and task objects instead of returning bare ids. */
type HydratedEntry = {
  id: string;
  description?: string;
  project?: { name: string } | null;
  task?: { name: string } | null;
  timeInterval: { start: string; end: string | null };
};

server.registerTool(
  "list_time_entries",
  {
    title: "List time entries",
    description: `List the user's Clockify time entries between two dates (inclusive), ${LOCAL}. Returns entry ids for delete_time_entries.`,
    inputSchema: z.object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe(`First day, YYYY-MM-DD, ${LOCAL}`),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe(`Last day, inclusive, YYYY-MM-DD, ${LOCAL}`),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ from, to }) => {
    try {
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
        const batch = (await api(
          `/workspaces/${ws}/user/${userId}/time-entries?start=${start}&end=${end}&hydrated=true&page-size=${PAGE_SIZE}&page=${page}`,
        )) as HydratedEntry[];
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
          hours: e.timeInterval.end
            ? round2(
                (new Date(e.timeInterval.end).getTime() -
                  new Date(e.timeInterval.start).getTime()) /
                  3600000,
              )
            : null,
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
      return ok(`${text}\n${round2(total)}h total`, { entries, totalHours: round2(total) });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "delete_time_entries",
  {
    title: "Delete time entries",
    description:
      "Permanently delete Clockify time entries by id. Get ids from list_time_entries or log_time.",
    inputSchema: z.object({ ids: z.array(z.string()).min(1).describe("Time entry ids") }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ ids }) => {
    try {
      const ws = await workspaceId();
      const deleted: string[] = [];
      const failed: object[] = [];
      for (const id of ids) {
        try {
          await api(`/workspaces/${ws}/time-entries/${id}`, { method: "DELETE" });
          deleted.push(id);
        } catch (err) {
          failed.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return ok(`Deleted ${deleted.length}, failed ${failed.length}`, { deleted, failed });
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
console.error("clockify mcp server ready");
