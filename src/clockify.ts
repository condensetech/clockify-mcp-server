const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

class ClockifyError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type User = { id: string; activeWorkspace: string; settings?: { timeZone?: string } };
type Project = { id: string; name: string; clientName?: string; archived: boolean };
type Task = { id: string; name: string };
type HydratedEntry = {
  id: string;
  description?: string;
  project?: { name: string; clientName?: string } | null;
  task?: { name: string } | null;
  timeInterval: { start: string; end: string | null };
};

type NewTimeEntry = {
  project: string;
  client?: string;
  task?: string;
  date: string;
  start: string;
  end: string;
  description?: string;
  billable?: boolean;
};

type LoggedTime =
  | { entry: NewTimeEntry; id: string; project: string; client: string | null; hours: number }
  | { entry: NewTimeEntry; error: string };

export const PAGE_SIZE = 200;

function memoSuccesses<V>(load: (key: string) => Promise<V>) {
  const cache = new Map<string, Promise<V>>();
  return (key = ""): Promise<V> => {
    let p = cache.get(key);
    if (!p) {
      p = load(key).catch((e) => {
        cache.delete(key);
        throw e;
      });
      cache.set(key, p);
    }
    return p;
  };
}

export type ClockifySettings = {
  apiKey?: string;
  apiBase?: string;
  fetch?: typeof globalThis.fetch;
};

export function clockify({
  apiKey,
  apiBase = "https://api.clockify.me/api/v1",
  fetch = globalThis.fetch,
}: ClockifySettings) {
  async function request(path: string, init?: RequestInit): Promise<Response> {
    if (!apiKey) throw new Error("CLOCKIFY_API_KEY is not set");
    const res = await fetch(apiBase + path, {
      ...init,
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok)
      throw new ClockifyError(
        res.status,
        `Clockify ${init?.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`,
      );
    return res;
  }

  async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const res = await request(path, init);
    return (res.status === 204 ? null : await res.json()) as T;
  }

  async function all<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    const sep = path.includes("?") ? "&" : "?";
    for (let page = 1; ; page++) {
      // Clockify silently ignores `pageSize`, the name its own docs give, and returns 50 per page.
      const res = await request(`${path}${sep}page-size=${PAGE_SIZE}&page=${page}`);
      items.push(...((await res.json()) as T[]));
      if (res.headers.get("Last-Page") !== "false") return items;
    }
  }

  const user = memoSuccesses(() => api<User>("/user"));

  async function workspaceId() {
    return (await user()).activeWorkspace;
  }

  async function timeZone() {
    const tz = (await user()).settings?.timeZone;
    if (!tz)
      throw new Error(
        "No time zone on your Clockify profile — set it in Clockify → Preferences before logging time.",
      );
    return tz;
  }

  const projects = memoSuccesses(async () =>
    all<Project>(`/workspaces/${await workspaceId()}/projects?archived=false`),
  );

  const tasks = memoSuccesses(async (projectId) =>
    all<Task>(`/workspaces/${await workspaceId()}/projects/${projectId}/tasks`),
  );

  async function logTime(entries: NewTimeEntry[]): Promise<LoggedTime[]> {
    const [ws, tz] = await Promise.all([workspaceId(), timeZone()]);
    const outcomes: LoggedTime[] = [];
    for (const entry of entries) {
      try {
        const project = await resolveProject(entry.project, entry.client);
        const taskId = entry.task ? (await resolveTask(project.id, entry.task)).id : undefined;
        const { start, end, hours } = interval(entry.date, entry.start, entry.end, tz);
        const { id } = await api<{ id: string }>(`/workspaces/${ws}/time-entries`, {
          method: "POST",
          body: JSON.stringify({
            start,
            end,
            projectId: project.id,
            taskId,
            description: entry.description,
            billable: entry.billable,
          }),
        });
        outcomes.push({
          entry,
          id,
          project: project.name,
          client: project.clientName || null,
          hours,
        });
      } catch (err) {
        outcomes.push({ entry, error: message(err) });
      }
    }
    return outcomes;
  }

  async function timeEntries(from: string, to: string) {
    const [ws, tz, { id: userId }] = await Promise.all([workspaceId(), timeZone(), user()]);
    // Clockify shifts this window back by the profile time zone's offset, so ask for a day more on
    // each side and keep only the entries whose entry date is in range.
    const day = (date: string, days: number) => Temporal.PlainDate.from(date).add({ days });
    const start = isoZ(profileTimeToUtc(`${day(from, -1)}T00:00`, tz));
    const end = isoZ(profileTimeToUtc(`${day(to, 2)}T00:00`, tz));
    const raw = await all<HydratedEntry>(
      `/workspaces/${ws}/user/${userId}/time-entries?start=${start}&end=${end}&hydrated=true`,
    );
    const entries = raw.map((e) => {
      const { start, end } = e.timeInterval;
      const s = utcToProfileTime(start, tz);
      return {
        id: e.id,
        project: e.project?.name ?? null,
        client: e.project?.clientName || null,
        task: e.task?.name ?? null,
        description: e.description ?? "",
        date: s.date,
        start: s.time,
        end: end ? utcToProfileTime(end, tz).time : null,
        hours: end ? hoursBetween(start, end) : null,
      };
    });
    return entries.filter((e) => e.date >= from && e.date <= to);
  }

  async function deleteTimeEntries(ids: string[]) {
    const [ws, { id: userId }] = await Promise.all([workspaceId(), user()]);
    const deleted: string[] = [];
    const failed: { id: string; error: string }[] = [];
    try {
      const list = ids.map(encodeURIComponent).join(",");
      await api(`/workspaces/${ws}/user/${userId}/time-entries?time-entry-ids=${list}`, {
        method: "DELETE",
      });
      deleted.push(...ids);
    } catch (err) {
      if (!(err instanceof ClockifyError && err.status === 400)) throw err;
      // Clockify's bulk delete is all-or-nothing: one bad id fails the batch and deletes
      // nothing (docs/bulk-delete-time-entries.md).
      for (const id of ids) {
        try {
          await api(`/workspaces/${ws}/time-entries/${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          deleted.push(id);
        } catch (err) {
          failed.push({ id, error: message(err) });
        }
      }
    }
    return { deleted, failed };
  }

  async function resolveProject(name: string, client?: string) {
    let list = await projects();
    if (client) {
      const clients = [...new Set(list.flatMap((p) => (p.clientName ? [p.clientName] : [])))];
      const { name: clientName } = pick(
        "client",
        client,
        clients.map((name) => ({ name })),
      );
      list = list.filter((p) => p.clientName === clientName);
    }
    return pick("project", name, list, (p) => projectLabel(p.name, p.clientName));
  }
  const resolveTask = async (projectId: string, name: string) =>
    pick("task", name, await tasks(projectId));

  return {
    projects,
    timeEntries,
    logTime,
    deleteTimeEntries,
  };
}

export const projectLabel = (name: string, client?: string | null) =>
  client ? `${name} (${client})` : name;

export function pick<T extends { name: string }>(
  kind: string,
  name: string,
  items: T[],
  label = (item: T) => item.name,
): T {
  const n = name.trim().toLowerCase();
  const exact = items.filter((i) => i.name.toLowerCase() === n);
  const hits = exact.length ? exact : items.filter((i) => i.name.toLowerCase().includes(n));
  if (hits.length === 1) return hits[0];
  const candidates = (hits.length ? hits : items).map(label).join(", ");
  throw new Error(
    `${hits.length ? "Ambiguous" : "Unknown"} ${kind} "${name}". Candidates: ${candidates || "(none)"}`,
  );
}

export function profileTimeToUtc(dateTime: string, tz: string): Temporal.Instant {
  let wall: Temporal.PlainDateTime;
  try {
    wall = Temporal.PlainDateTime.from(dateTime);
  } catch {
    throw new Error(`Invalid date and time "${dateTime}" (expected YYYY-MM-DDTHH:MM)`);
  }
  return wall.toZonedDateTime(tz).toInstant();
}

export function utcToProfileTime(iso: string, tz: string) {
  const zoned = Temporal.Instant.from(iso).toZonedDateTimeISO(tz);
  return {
    date: zoned.toPlainDate().toString(),
    time: zoned.toPlainTime().toString({ smallestUnit: "minute" }),
  };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

type InstantLike = Temporal.Instant | string;

const hoursBetween = (start: InstantLike, end: InstantLike) =>
  round2(Temporal.Instant.from(start).until(end).total("hours"));

const isoZ = (i: Temporal.Instant) => i.toString({ smallestUnit: "second" });

export function interval(date: string, start: string, end: string, tz: string) {
  if (end === start)
    throw new Error(`Start and end are both "${start}" on ${date} — a zero-length entry.`);
  const s = profileTimeToUtc(`${date}T${start}`, tz);
  const endDate = end < start ? Temporal.PlainDate.from(date).add({ days: 1 }).toString() : date;
  const e = profileTimeToUtc(`${endDate}T${end}`, tz);
  return { start: isoZ(s), end: isoZ(e), hours: hoursBetween(s, e) };
}
