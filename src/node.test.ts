import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import pkg from "../package.json";

// Runs the bundle adopters get from npm under whatever `node` is first on PATH, so CI can check
// every supported Node version. On Node < 26 this is the only test that exercises the Temporal
// polyfill: `bun test` always uses Bun's built-in Temporal.

const BUNDLE = `${import.meta.dir}/../dist/index.js`;

let posted: { start: string; end: string }[] = [];
let fake: ReturnType<typeof Bun.serve>;
let client: Client;

beforeAll(async () => {
  const build = Bun.spawnSync(["bun", "run", "build"], { stderr: "inherit" });
  if (build.exitCode !== 0) throw new Error("bun run build failed");

  fake = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname.replace(/^\/api\/v1/, "");
      if (path === "/user")
        return Response.json({
          id: "u1",
          activeWorkspace: "ws1",
          settings: { timeZone: "Europe/Rome" },
        });
      if (path === "/workspaces/ws1/projects")
        return Response.json([{ id: "p1", name: "Acme" }], { headers: { "Last-Page": "true" } });
      if (req.method === "POST" && path === "/workspaces/ws1/time-entries") {
        posted.push(await req.json());
        return Response.json({ id: `te${posted.length}` }, { status: 201 });
      }
      return new Response(`unexpected ${req.method} ${path}`, { status: 500 });
    },
  });

  client = new Client({ name: "node-smoke", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: "node",
      args: [BUNDLE],
      env: { CLOCKIFY_API_KEY: "test-key", CLOCKIFY_API_BASE: `${fake.url}api/v1` },
      stderr: "ignore",
    }),
  );
}, 30_000);

afterAll(async () => {
  await client?.close();
  fake?.stop();
});

test("the bundle starts with a node shebang, which npx needs to run the bin", async () => {
  const firstLine = (await Bun.file(BUNDLE).text()).split("\n", 1)[0];
  expect(firstLine).toBe("#!/usr/bin/env node");
});

test("reports the version from package.json", () => {
  expect(client.getServerVersion()?.version).toBe(pkg.version);
});

test("log_time converts profile time to UTC across daylight saving", async () => {
  posted = [];
  const r = await client.callTool({
    name: "log_time",
    arguments: {
      entries: [
        { project: "Acme", date: "2026-07-15", start: "09:00", end: "13:00" },
        { project: "Acme", date: "2026-01-15", start: "09:00", end: "13:00" },
      ],
    },
  });
  expect(r.isError).toBeFalsy();
  expect(posted.map((p) => [p.start, p.end])).toEqual([
    ["2026-07-15T07:00:00Z", "2026-07-15T11:00:00Z"],
    ["2026-01-15T08:00:00Z", "2026-01-15T12:00:00Z"],
  ]);
});
