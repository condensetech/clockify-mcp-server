#!/usr/bin/env node
import "temporal-polyfill/global";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.ts";

await createServer({
  apiKey: process.env.CLOCKIFY_API_KEY,
  apiBase: process.env.CLOCKIFY_API_BASE || undefined,
}).connect(new StdioServerTransport());
console.error("clockify mcp server ready");
