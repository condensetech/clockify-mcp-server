import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { PAGE_SIZE } from "./clockify.ts";
import { createServer } from "./server.ts";

const USER = { id: "u1", activeWorkspace: "ws1", settings: { timeZone: "Europe/Rome" } };
const filler = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `Filler ${prefix}${i}` }));
const PROJECTS = [
  { id: "p1", name: "Acme" },
  ...filler("fp", PAGE_SIZE - 1),
  { id: "p2", name: "Evil Corp", clientName: "Evil Inc" },
];
const TASKS: Record<string, unknown[]> = {
  p1: [...filler("ft", PAGE_SIZE), { id: "t1", name: "Design" }],
};

type Call = { method: string; path: string; query: URLSearchParams; body?: unknown };
let calls: Call[] = [];
let user: object = USER;
let timeEntries: unknown[] = [];
let nextId = 1;

const json = (data: unknown, status = 200) => Response.json(data, { status });
function paged(list: unknown[], query: URLSearchParams) {
  const size = Number(query.get("page-size") ?? 50);
  const page = Number(query.get("page") ?? 1);
  return Response.json(list.slice((page - 1) * size, page * size), {
    headers: { "Last-Page": String(page * size >= list.length) },
  });
}

function clockify(method: string, path: string, query: URLSearchParams, body: unknown) {
  if (method === "GET" && path === "/user") return json(user);
  if (method === "GET" && path === "/workspaces/ws1/projects") return paged(PROJECTS, query);
  const tasks = path.match(/^\/workspaces\/ws1\/projects\/(\w+)\/tasks$/);
  if (method === "GET" && tasks) return paged(TASKS[tasks[1]] ?? [], query);
  if (method === "POST" && path === "/workspaces/ws1/time-entries") {
    if ((body as { description?: string }).description === "reject")
      return new Response("project is archived", { status: 400 });
    return json({ id: `te${nextId++}` }, 201);
  }
  if (method === "GET" && path === "/workspaces/ws1/user/u1/time-entries")
    return paged(timeEntries, query);
  if (method === "DELETE" && path === "/workspaces/ws1/user/u1/time-entries") {
    const ids = query.get("time-entry-ids")?.split(",") ?? [];
    if (ids.includes("outage")) return new Response("upstream down", { status: 503 });
    return ids.includes("missing")
      ? new Response("Time entry with ID missing doesn't belong to Workspace", { status: 400 })
      : json(ids.map((id) => ({ id })));
  }
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

beforeAll(() => {
  delete process.env.CLOCKIFY_WORKSPACE_ID;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(/^.*?\/api\/v1/, "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, query: url.searchParams, body });
    return clockify(method, path, url.searchParams, body);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  process.env = env;
});

beforeEach(async () => {
  process.env.CLOCKIFY_API_KEY = "test-key";
  calls = [];
  user = USER;
  timeEntries = [];
  nextId = 1;

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);
  client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
});

afterEach(async () => {
  await client.close();
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
  expect(posts).toHaveLength(3);
});

const valid = { project: "Acme", date: "2026-08-18", start: "09:00", end: "10:00" };

test.each([
  ["a day-first date", { date: "18/08/2026" }],
  ["a date that does not exist", { date: "2026-02-31" }],
  ["a single-digit hour", { start: "9:00" }],
  ["an hour past 23", { start: "25:00" }],
  ["minutes past 59", { end: "10:99" }],
  ["24:00", { end: "24:00" }],
  ["seconds", { start: "09:00:00" }],
])("log_time rejects %s before calling Clockify", async (_, bad) => {
  const r = await call("log_time", { entries: [{ ...valid, ...bad }] });
  expect(r.isError).toBe(true);
  expect(calls).toHaveLength(0);
});

test("list_time_entries rejects a date that does not exist before calling Clockify", async () => {
  const r = await call("list_time_entries", { from: "2026-02-30", to: "2026-03-01" });
  expect(r.isError).toBe(true);
  expect(calls).toHaveLength(0);
});

const entry = (id: string, start: string, end: string | null, extra: object = {}) => ({
  id,
  timeInterval: { start, end },
  project: { name: "Acme" },
  task: null,
  ...extra,
});

test("list_time_entries pages until Last-Page and converts back to the profile time zone", async () => {
  const full = Array.from({ length: PAGE_SIZE }, (_, i) =>
    entry(`e${i}`, "2026-08-17T07:00:00Z", "2026-08-17T08:00:00Z"),
  );
  timeEntries = [...full, entry("last", "2026-08-18T07:00:00Z", "2026-08-18T09:15:00Z")];

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
  expect(pages[0].query.get("start")).toBe("2026-08-16T22:00:00Z");
  expect(pages[0].query.get("end")).toBe("2026-08-23T21:59:59Z");
});

test("list_time_entries reports a running time entry without counting its duration", async () => {
  timeEntries = [
    entry("done", "2026-08-18T07:00:00Z", "2026-08-18T08:00:00Z", { description: "standup" }),
    entry("running", "2026-08-18T08:00:00Z", null),
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

const deletes = () =>
  calls
    .filter((c) => c.method === "DELETE")
    .map((c) => c.query.get("time-entry-ids") ?? c.path.split("/").pop());

test("delete_time_entries deletes every id in one bulk request", async () => {
  const r = await call("delete_time_entries", { ids: ["a1", "b2", "c3"] });
  expect(r.structuredContent).toEqual({ deleted: ["a1", "b2", "c3"], failed: [] });
  expect(text(r)).toBe("Deleted 3, failed 0");
  expect(deletes()).toEqual(["a1,b2,c3"]);
});

test("delete_time_entries falls back to one at a time when the bulk request fails", async () => {
  const r = await call("delete_time_entries", { ids: ["a1", "missing", "b2"] });
  expect(r.structuredContent).toEqual({
    deleted: ["a1", "b2"],
    failed: [{ id: "missing", error: expect.stringContaining("404") }],
  });
  expect(text(r)).toMatch(/^FAILED missing: .*404.*\nDeleted 2, failed 1$/);
  expect(deletes()).toEqual(["a1,missing,b2", "a1", "missing", "b2"]);
});

test("delete_time_entries does not retry one at a time when the bulk request fails for another reason", async () => {
  const r = await call("delete_time_entries", { ids: ["a1", "outage"] });
  expect(r.isError).toBe(true);
  expect(text(r)).toContain("503");
  expect(deletes()).toEqual(["a1,outage"]);
});

test("a missing API key comes back as a tool error, not a crash", async () => {
  process.env.CLOCKIFY_API_KEY = "";
  const r = await call("delete_time_entries", { ids: ["a1"] });
  expect(r.isError).toBe(true);
  expect(text(r)).toContain("CLOCKIFY_API_KEY is not set");
  expect(calls).toHaveLength(0);
});

test("log_time refuses to guess a time zone the profile does not have", async () => {
  user = { ...USER, settings: {} };
  const r = await call("log_time", { entries: [valid] });
  expect(r.isError).toBe(true);
  expect(text(r)).toContain("No time zone on your Clockify profile");
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
});
