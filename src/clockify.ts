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

  function timeZone(u: User) {
    const tz = u.settings?.timeZone;
    if (!tz)
      throw new Error("No time zone on your Clockify profile — set it in Clockify → Preferences.");
    return tz;
  }

  const projects = memoSuccesses(async () =>
    all<Project>(`/workspaces/${(await user()).activeWorkspace}/projects?archived=false`),
  );

  const tasks = memoSuccesses(async (projectId) =>
    all<Task>(`/workspaces/${(await user()).activeWorkspace}/projects/${projectId}/tasks`),
  );

  async function resolveProject(project: string, client?: string) {
    let list = await projects();
    const byId = list.find((p) => p.id === project.trim());
    if (byId) return byId;
    if (client) {
      const clients = [...new Set(list.flatMap((p) => (p.clientName ? [p.clientName] : [])))];
      const { name: clientName } = pick(
        "client",
        client,
        clients.map((name) => ({ name })),
        { unknown: LIST_PROJECTS },
      );
      list = list.filter((p) => p.clientName === clientName);
    }
    return pick("project", project, list, {
      label: (p) => projectLabel(p.name, p.clientName),
      ambiguous: "pass client, or the project id from list_projects",
      unknown: LIST_PROJECTS,
    });
  }

  async function logTime(entries: NewTimeEntry[]): Promise<LoggedTime[]> {
    const u = await user();
    const ws = u.activeWorkspace;
    const tz = timeZone(u);
    const outcomes: LoggedTime[] = [];
    for (const entry of entries) {
      try {
        const project = await resolveProject(entry.project, entry.client);
        const taskId = entry.task
          ? pick("task", entry.task, await tasks(project.id)).id
          : undefined;
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
    const u = await user();
    const tz = timeZone(u);
    // Clockify shifts this window back by the profile time zone's offset, so ask for a day more on
    // each side and keep only the entries whose entry date is in range.
    const startOfDay = (date: string, days: number) =>
      isoZ(day(date, days).toZonedDateTime(tz).toInstant());
    const start = startOfDay(from, -1);
    const end = startOfDay(to, 2);
    const raw = await all<HydratedEntry>(
      `/workspaces/${u.activeWorkspace}/user/${u.id}/time-entries?start=${start}&end=${end}&hydrated=true`,
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
    const { activeWorkspace: ws, id: userId } = await user();
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
      // Clockify's bulk delete is all-or-nothing: one bad id fails the batch and deletes nothing.
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

  return {
    projects,
    timeEntries,
    logTime,
    deleteTimeEntries,
  };
}

export const projectLabel = (name: string, client?: string | null) =>
  client ? `${name} (${client})` : name;

const MAX_CANDIDATES = 10;
const LIST_PROJECTS = "call list_projects";

export function pick<T extends { name: string }>(
  kind: string,
  name: string,
  items: T[],
  {
    label = (item: T) => item.name,
    ambiguous,
    unknown,
  }: { label?: (item: T) => string; ambiguous?: string; unknown?: string } = {},
): T {
  const n = name.trim().toLowerCase();
  const exact = items.filter((i) => i.name.toLowerCase() === n);
  const hits = exact.length ? exact : items.filter((i) => i.name.toLowerCase().includes(n));
  if (hits.length === 1) return hits[0];
  const isAmbiguous = hits.length > 0;
  const closest = (isAmbiguous ? hits : items)
    .map((item) => ({ item, distance: editDistance(n, item.name.toLowerCase()) }))
    .sort((a, b) => a.distance - b.distance)
    .map(({ item }) => item);
  const rest = closest.length - MAX_CANDIDATES;
  let candidates = closest.slice(0, MAX_CANDIDATES).map(label).join(", ") || "(none)";
  if (rest > 0) candidates += ` …and ${rest} more`;
  const nextStep = isAmbiguous ? ambiguous : unknown;
  if (nextStep) candidates += ` — ${nextStep}`;
  throw new Error(
    `${isAmbiguous ? "Ambiguous" : "Unknown"} ${kind} "${name}". Candidates: ${candidates}`,
  );
}

function editDistance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const prev = row;
    row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return row[b.length];
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

const day = (date: string, days: number) => Temporal.PlainDate.from(date).add({ days });

const isoZ = (i: Temporal.Instant) => i.toString({ smallestUnit: "second" });

export function interval(date: string, start: string, end: string, tz: string) {
  if (end === start)
    throw new Error(`Start and end are both "${start}" on ${date} — a zero-length entry.`);
  const s = profileTimeToUtc(`${date}T${start}`, tz);
  const endDate = end < start ? day(date, 1).toString() : date;
  const e = profileTimeToUtc(`${endDate}T${end}`, tz);
  return { start: isoZ(s), end: isoZ(e), hours: hoursBetween(s, e) };
}
