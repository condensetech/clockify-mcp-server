const BASE = process.env.CLOCKIFY_API_BASE ?? "https://api.clockify.me/api/v1";

export async function api(path: string, init?: RequestInit) {
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
  return res.status === 204 ? null : res.json();
}

export type Me = { id: string; activeWorkspace: string; settings: { timeZone: string } };
export type Project = { id: string; name: string; clientName?: string; archived: boolean };

// ponytail: memoised for process lifetime, no TTL — a stdio server dies with the session
let _me: Promise<Me> | undefined;
export function me(): Promise<Me> {
  _me ??= api("/user") as Promise<Me>;
  return _me;
}

export async function workspaceId() {
  return process.env.CLOCKIFY_WORKSPACE_ID ?? (await me()).activeWorkspace;
}

export async function timeZone() {
  return (await me()).settings.timeZone;
}

let _projects: Promise<Project[]> | undefined;
export function projects(): Promise<Project[]> {
  // ponytail: one page of 200 — paginate if someone actually has more projects than that
  _projects ??= workspaceId().then(
    (ws) => api(`/workspaces/${ws}/projects?archived=false&page-size=200`) as Promise<Project[]>,
  );
  return _projects;
}

const _tasks = new Map<string, Promise<{ id: string; name: string }[]>>();
function tasks(projectId: string) {
  const cached = _tasks.get(projectId);
  if (cached) return cached;
  const p = workspaceId().then(
    (ws) =>
      api(`/workspaces/${ws}/projects/${projectId}/tasks?page-size=200`) as Promise<
        { id: string; name: string }[]
      >,
  );
  _tasks.set(projectId, p);
  return p;
}

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

function parts(d: Date, tz: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second" | "weekday", string>;
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

export const isoZ = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;

function nextDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** date + HH:MM local → the `{start,end}` a time-entry POST wants, second-precision ISO-Z. */
export function interval(date: string, start: string, end: string, tz: string) {
  const s = localToUtc(`${date}T${start}`, tz);
  // ponytail: end <= start means an overnight shift — roll to the next local day, nobody logs negative time
  const e = localToUtc(`${end <= start ? nextDay(date) : date}T${end}`, tz);
  return { start: isoZ(s), end: isoZ(e), hours: (e.getTime() - s.getTime()) / 3600000 };
}
