// `||` not `??`: an empty env var (`CLOCKIFY_API_BASE=` in .env, or an empty value in a harness
// config) would otherwise win over the default and make every request 404 or fail to parse.
const BASE = process.env.CLOCKIFY_API_BASE || "https://api.clockify.me/api/v1";

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.CLOCKIFY_API_KEY;
  if (!key) throw new Error("CLOCKIFY_API_KEY is not set");
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "X-Api-Key": key, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok)
    throw new Error(
      `Clockify ${init?.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`,
    );
  return (res.status === 204 ? null : await res.json()) as T;
}

export type Me = { id: string; activeWorkspace: string; settings: { timeZone: string } };
export type Project = { id: string; name: string; clientName?: string; archived: boolean };
type Task = { id: string; name: string };

/** Items per request. Not a Clockify maximum: it returns up to at least 5000 per page. */
const PAGE_SIZE = 200;

/**
 * Every item of a list endpoint. Pages until a short page comes back: Clockify's `Last-Page`
 * header would mean plumbing response headers out of api(), and a short page is the same signal.
 * The param must be `page-size`: Clockify silently ignores `pageSize` (the name its own docs
 * give) and returns its default of 50, which reads as a short page and stops after page 1.
 */
export async function all<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  // ponytail: 50 pages = 10k items, a ceiling no workspace or timesheet reaches — bounded so a
  // misbehaving API cannot spin forever
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= 50; page++) {
    const batch = await api<T[]>(`${path}${sep}page-size=${PAGE_SIZE}&page=${page}`);
    items.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return items;
}

// ponytail: memoised for process lifetime, no TTL — a stdio server dies with the session.
// Failures are evicted, though: caching a rejection would poison every later call in the session
// over one dropped wifi packet, and the only cure would be restarting the whole agent.
function memo<V>(load: (key: string) => Promise<V>) {
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

export const me = memo(() => api<Me>("/user"));

export async function workspaceId() {
  return process.env.CLOCKIFY_WORKSPACE_ID || (await me()).activeWorkspace;
}

export async function timeZone() {
  // Intl.DateTimeFormat({ timeZone: undefined }) silently uses the host zone rather than throwing,
  // which would put every entry at the wrong hour with no error to go on.
  const tz = (await me()).settings?.timeZone;
  if (!tz)
    throw new Error(
      "No timeZone on your Clockify profile — set it in Clockify → Preferences before logging time.",
    );
  return tz;
}

export const projects = memo(async () =>
  all<Project>(`/workspaces/${await workspaceId()}/projects?archived=false`),
);

const tasks = memo(async (projectId) =>
  all<Task>(`/workspaces/${await workspaceId()}/projects/${projectId}/tasks`),
);

/** Exact case-insensitive match wins; else substring. 0 or >1 → throw with the candidates. */
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

export async function resolveProject(name: string) {
  return pick("project", name, await projects());
}

export async function resolveTask(projectId: string, name: string) {
  return pick("task", name, await tasks(projectId));
}

// Building a formatter costs ~20x a format call, and parts() runs several times per entry.
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

/** How far ahead of UTC the zone is at that instant, in ms. */
function offset(at: Date, tz: string) {
  const p = parts(at, tz);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - at.getTime();
}

/** `localToUtc("2026-08-18T09:00", "Europe/Rome")` → the instant that is 09:00 in Rome. */
export function localToUtc(local: string, tz: string): Date {
  const d = new Date(`${local}Z`);
  if (Number.isNaN(d.getTime()))
    throw new Error(`Invalid local datetime "${local}" (expected YYYY-MM-DDTHH:MM)`);
  // Two passes: the first offset is sampled at the wall time read as UTC, which on a DST
  // transition day can sit the other side of the jump. Re-sampling at the candidate instant
  // converges for every real zone. A wall time that does not exist (spring-forward gap) lands
  // on the instant just after the jump.
  const first = new Date(d.getTime() - offset(d, tz));
  return new Date(d.getTime() - offset(first, tz));
}

/** The inverse: an instant rendered in the profile zone. */
export function utcToLocal(iso: string, tz: string) {
  const p = parts(new Date(iso), tz);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${String(+p.hour % 24).padStart(2, "0")}:${p.minute}`,
    weekday: p.weekday,
  };
}

/** Hours are reported to 2dp — raw ms/3600000 prints 3.6666666666666665. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const hoursBetween = (start: Date | string, end: Date | string) =>
  round2((new Date(end).getTime() - new Date(start).getTime()) / 3600000);

export const isoZ = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;

function nextDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** date + HH:MM local → the `{start,end}` a time-entry POST wants, second-precision ISO-Z. */
export function interval(date: string, start: string, end: string, tz: string) {
  // A zero-length entry is always a typo, and rolling it to the next day would post 24 billable
  // hours as a success. Refuse instead of guessing which of the two the caller meant.
  if (end === start)
    throw new Error(`Start and end are both "${start}" on ${date} — a zero-length entry.`);
  const s = localToUtc(`${date}T${start}`, tz);
  // ponytail: end < start means an overnight shift — roll to the next local day, nobody logs negative time
  const e = localToUtc(`${end < start ? nextDay(date) : date}T${end}`, tz);
  return { start: isoZ(s), end: isoZ(e), hours: hoursBetween(s, e) };
}
