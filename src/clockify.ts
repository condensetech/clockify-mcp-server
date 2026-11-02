const configured = (name: string) => process.env[name] || undefined;

const BASE = configured("CLOCKIFY_API_BASE") ?? "https://api.clockify.me/api/v1";

export class ClockifyError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const key = configured("CLOCKIFY_API_KEY");
  if (!key) throw new Error("CLOCKIFY_API_KEY is not set");
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "X-Api-Key": key, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok)
    throw new ClockifyError(
      res.status,
      `Clockify ${init?.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`,
    );
  return res;
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await request(path, init);
  return (res.status === 204 ? null : await res.json()) as T;
}

export type Me = { id: string; activeWorkspace: string; settings?: { timeZone?: string } };
export type Project = { id: string; name: string; clientName?: string; archived: boolean };
type Task = { id: string; name: string };

export const PAGE_SIZE = 200;

export async function all<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 1; ; page++) {
    // Clockify silently ignores `pageSize`, the name its own docs give, and returns 50 per page.
    const res = await request(`${path}${sep}page-size=${PAGE_SIZE}&page=${page}`);
    items.push(...((await res.json()) as T[]));
    if (res.headers.get("Last-Page") !== "false") return items;
  }
}

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

export function lookups() {
  const me = memoSuccesses(() => api<Me>("/user"));

  async function workspaceId() {
    return configured("CLOCKIFY_WORKSPACE_ID") ?? (await me()).activeWorkspace;
  }

  async function timeZone() {
    // Intl.DateTimeFormat({ timeZone: undefined }) silently uses the host zone rather than
    // throwing, which would put every entry at the wrong hour with no error to go on.
    const tz = (await me()).settings?.timeZone;
    if (!tz)
      throw new Error(
        "No timeZone on your Clockify profile — set it in Clockify → Preferences before logging time.",
      );
    return tz;
  }

  const projects = memoSuccesses(async () =>
    all<Project>(`/workspaces/${await workspaceId()}/projects?archived=false`),
  );

  const tasks = memoSuccesses(async (projectId) =>
    all<Task>(`/workspaces/${await workspaceId()}/projects/${projectId}/tasks`),
  );

  return {
    me,
    workspaceId,
    timeZone,
    projects,
    resolveProject: async (name: string) => pick("project", name, await projects()),
    resolveTask: async (projectId: string, name: string) =>
      pick("task", name, await tasks(projectId)),
  };
}

export function pick<T extends { name: string }>(kind: string, name: string, items: T[]): T {
  const n = name.trim().toLowerCase();
  const exact = items.filter((i) => i.name.toLowerCase() === n);
  const hits = exact.length ? exact : items.filter((i) => i.name.toLowerCase().includes(n));
  if (hits.length === 1) return hits[0];
  const candidates = (hits.length ? hits : items).map((i) => i.name).join(", ");
  throw new Error(
    `${hits.length ? "Ambiguous" : "Unknown"} ${kind} "${name}". Candidates: ${candidates || "(none)"}`,
  );
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function parts(d: Date, tz: string) {
  let fmt = formatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, fmt);
  }
  return Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value])) as Record<
    "year" | "month" | "day" | "hour" | "minute" | "second" | "weekday",
    string
  >;
}

function utcOffsetMs(at: Date, tz: string) {
  const p = parts(at, tz);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - at.getTime();
}

export function localToUtc(local: string, tz: string): Date {
  const wallAsUtc = new Date(`${local}Z`);
  if (Number.isNaN(wallAsUtc.getTime()))
    throw new Error(`Invalid local datetime "${local}" (expected YYYY-MM-DDTHH:MM)`);
  const firstGuess = new Date(wallAsUtc.getTime() - utcOffsetMs(wallAsUtc, tz));
  return new Date(wallAsUtc.getTime() - utcOffsetMs(firstGuess, tz));
}

export function utcToLocal(iso: string, tz: string) {
  const p = parts(new Date(iso), tz);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${String(+p.hour % 24).padStart(2, "0")}:${p.minute}`,
    weekday: p.weekday,
  };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const hoursBetween = (start: Date | string, end: Date | string) =>
  round2((new Date(end).getTime() - new Date(start).getTime()) / 3600000);

export const isoZ = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;

function nextDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function interval(date: string, start: string, end: string, tz: string) {
  if (end === start)
    throw new Error(`Start and end are both "${start}" on ${date} — a zero-length entry.`);
  const s = localToUtc(`${date}T${start}`, tz);
  const overnight = end < start;
  const e = localToUtc(`${overnight ? nextDay(date) : date}T${end}`, tz);
  return { start: isoZ(s), end: isoZ(e), hours: hoursBetween(s, e) };
}
