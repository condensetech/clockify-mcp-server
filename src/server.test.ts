import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "./server.ts";

// A fake Clockify behind a stubbed fetch: one user in Europe/Rome, 201 projects, 201 tasks on
// Acme. One more than a page of each, and the ones the tests use by name sit past the first
// page, so any lookup that stops at page 1 fails. The lookups in clockify.ts are memoised for
// the process, so this world must not change between tests — vary only the per-test state below.
const ME = { id: "u1", activeWorkspace: "ws1", settings: { timeZone: "Europe/Rome" } };
const filler = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `Filler ${prefix}${i}` }));
const PROJECTS = [
  { id: "p1", name: "Acme", archived: false },
  ...filler("fp", 199).map((p) => ({ ...p, archived: false })),
  { id: "p2", name: "Evil Corp", clientName: "Evil Inc", archived: false },
];
const TASKS = { p1: [...filler("ft", 200), { id: "t1", name: "Design" }] } as Record<
  string,
  unknown[]
>;

type Call = { method: string; path: string; query: URLSearchParams; body?: unknown };
let calls: Call[] = [];
let entryPages: unknown[][] = [];
let nextId = 1;

const json = (data: unknown, status = 200) => Response.json(data, { status });
/** The slice of `list` that Clockify's page / page-size params ask for; page defaults to 1. */
function paged(list: unknown[], query: URLSearchParams) {
  const size = Number(query.get("page-size") ?? 50);
  const page = Number(query.get("page") ?? 1);
  return json(list.slice((page - 1) * size, page * size));
}

function clockify(method: string, path: string, query: URLSearchParams, body: unknown) {
  if (method === "GET" && path === "/user") return json(ME);
  if (method === "GET" && path === "/workspaces/ws1/projects") return paged(PROJECTS, query);
  const tasks = path.match(/^\/workspaces\/ws1\/projects\/(\w+)\/tasks$/);
  if (method === "GET" && tasks) return paged(TASKS[tasks[1]] ?? [], query);
  if (method === "POST" && path === "/workspaces/ws1/time-entries") {
    if ((body as { description?: string }).description === "reject")
      return new Response("project is archived", { status: 400 });
    return json({ id: `te${nextId++}` }, 201);
  }
  if (method === "GET" && path === "/workspaces/ws1/user/u1/time-entries")
    return json(entryPages[Number(query.get("page")) - 1] ?? []);
  const del = path.match(/^\/workspaces\/ws1\/time-entries\/(\w+)$/);
  if (method === "DELETE" && del)
    return del[1] === "missing"
      ? new Response("not found", { status: 404 })
      : new Response(null, { status: 204 });
  return new Response(`unexpected ${method} ${path}`, { status: 500 });
}

const realFetch = globalThis.fetch;
const env = { ...process.env };
let client: Client;

beforeAll(async () => {
  process.env.CLOCKIFY_API_KEY = "test-key";
  delete process.env.CLOCKIFY_WORKSPACE_ID;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    // the host and /api/v1 prefix depend on CLOCKIFY_API_BASE; route on what follows
    const path = url.pathname.replace(/^.*?\/api\/v1/, "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, query: url.searchParams, body });
    return clockify(method, path, url.searchParams, body);
  }) as typeof fetch;

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);
  client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
});

afterAll(async () => {
  await client.close();
  globalThis.fetch = realFetch;
  process.env = env;
});

beforeEach(() => {
  calls = [];
  entryPages = [];
  nextId = 1;
});

const call = (name: string, args: Record<string, unknown> = {}) =>
  client.callTool({ name, arguments: args });
const text = (r: Awaited<ReturnType<typeof call>>) =>
  (r.content as { type: string; text: string }[]).map((c) => c.text).join("\n");

test("list_projects returns every project, past the first page", async () => {
  const r = await call("list_projects");
  expect(r.isError).toBeFalsy();
  const { projects } = r.structuredContent as { projects: unknown[] };
  expect(projects).toHaveLength(201);
  expect(projects[0]).toEqual({ id: "p1", name: "Acme" });
  expect(projects[200]).toEqual({ id: "p2", name: "Evil Corp", clientName: "Evil Inc" });
  expect(text(r)).toStartWith("Acme\nFiller fp0\n");
  expect(text(r)).toEndWith("\nEvil Corp (Evil Inc)");
});

test("log_time creates what it can and reports each failure", async () => {
  const r = await call("log_time", {
    entries: [
      { project: "acme", task: "design", date: "2026-08-18", start: "09:00", end: "13:00" },
      {
        project: "evil",
        date: "2026-08-18",
        start: "14:00",
        end: "15:30",
        billable: false,
        description: "review",
      },
      { project: "nope", date: "2026-08-18", start: "16:00", end: "17:00" },
      { project: "Acme", date: "2026-08-19", start: "09:00", end: "10:00", description: "reject" },
    ],
  });

  expect(r.isError).toBeFalsy();
  expect(r.structuredContent).toMatchObject({
    created: [
      { id: "te1", project: "Acme", date: "2026-08-18", start: "09:00", end: "13:00", hours: 4 },
      { id: "te2", project: "Evil Corp", start: "14:00", end: "15:30", hours: 1.5 },
    ],
    failed: [
      { project: "nope", error: expect.stringContaining('Unknown project "nope"') },
      { project: "Acme", description: "reject", error: expect.stringContaining("400") },
    ],
    totalHours: 5.5,
  });
  expect(text(r)).toContain("2 created, 2 failed, 5.5h total");

  // Local Rome times went out as UTC; billable is only sent when the caller set it.
  const posts = calls.filter((c) => c.method === "POST").map((c) => c.body);
  expect(posts[0]).toEqual({
    start: "2026-08-18T07:00:00Z",
    end: "2026-08-18T11:00:00Z",
    projectId: "p1",
    taskId: "t1",
  });
  expect(posts[1]).toEqual({
    start: "2026-08-18T12:00:00Z",
    end: "2026-08-18T13:30:00Z",
    projectId: "p2",
    description: "review",
    billable: false,
  });
  // the unknown project never reached the API
  expect(posts).toHaveLength(3);
});

test("log_time rejects malformed input before calling Clockify", async () => {
  const r = await call("log_time", {
    entries: [{ project: "Acme", date: "18/08/2026", start: "9:00", end: "10:00" }],
  });
  expect(r.isError).toBe(true);
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
});

const entry = (id: string, start: string, end: string | null, extra: object = {}) => ({
  id,
  timeInterval: { start, end },
  project: { name: "Acme" },
  task: null,
  ...extra,
});

test("list_time_entries pages until a short page and converts back to local time", async () => {
  const full = Array.from({ length: 200 }, (_, i) =>
    entry(`e${i}`, "2026-08-17T07:00:00Z", "2026-08-17T08:00:00Z"),
  );
  entryPages = [full, [entry("last", "2026-08-18T07:00:00Z", "2026-08-18T09:15:00Z")]];

  const r = await call("list_time_entries", { from: "2026-08-17", to: "2026-08-23" });
  expect(r.isError).toBeFalsy();
  const { entries, totalHours } = r.structuredContent as {
    entries: Record<string, unknown>[];
    totalHours: number;
  };
  expect(entries).toHaveLength(201);
  expect(entries[200]).toEqual({
    id: "last",
    project: "Acme",
    task: null,
    description: "",
    date: "2026-08-18",
    start: "09:00",
    end: "11:15",
    hours: 2.25,
  });
  expect(totalHours).toBe(202.25);

  const pages = calls.filter((c) => c.path.endsWith("/time-entries"));
  expect(pages.map((c) => c.query.get("page"))).toEqual(["1", "2"]);
  // the local day range, Monday 00:00 to Sunday 23:59:59 in Rome, as UTC
  expect(pages[0].query.get("start")).toBe("2026-08-16T22:00:00Z");
  expect(pages[0].query.get("end")).toBe("2026-08-23T21:59:59Z");
});

test("list_time_entries reports a running timer without counting it", async () => {
  entryPages = [
    [
      entry("done", "2026-08-18T07:00:00Z", "2026-08-18T08:00:00Z", { description: "standup" }),
      entry("running", "2026-08-18T08:00:00Z", null),
    ],
  ];
  const r = await call("list_time_entries", { from: "2026-08-18", to: "2026-08-18" });
  expect(r.structuredContent).toMatchObject({
    entries: [
      { id: "done", hours: 1, end: "10:00" },
      { id: "running", hours: null, end: null },
    ],
    totalHours: 1,
  });
  expect(text(r)).toContain("2026-08-18 09:00–10:00 Acme — standup (1h) [done]");
  expect(text(r)).toContain("10:00–running Acme (?h) [running]");
});

test("list_time_entries says so when there is nothing", async () => {
  const r = await call("list_time_entries", { from: "2026-08-18", to: "2026-08-18" });
  expect(text(r)).toBe("No entries.\n0h total");
});

test("delete_time_entries deletes each id and reports the ones that failed", async () => {
  const r = await call("delete_time_entries", { ids: ["a1", "missing", "b2"] });
  expect(r.structuredContent).toEqual({
    deleted: ["a1", "b2"],
    failed: [{ id: "missing", error: expect.stringContaining("404") }],
  });
  expect(text(r)).toMatch(/^FAILED missing: .*404.*\nDeleted 2, failed 1$/);
});

test("a missing API key comes back as a tool error, not a crash", async () => {
  process.env.CLOCKIFY_API_KEY = "";
  try {
    // Either the workspace lookup trips it (an error result) or the DELETE does (a failed id),
    // depending on what is already cached — so look for the message anywhere in the result.
    const r = await call("delete_time_entries", { ids: ["a1"] });
    expect(JSON.stringify(r)).toContain("CLOCKIFY_API_KEY is not set");
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  } finally {
    process.env.CLOCKIFY_API_KEY = "test-key";
  }
});
