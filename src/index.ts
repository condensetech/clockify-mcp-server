#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.ts";

await createServer().connect(new StdioServerTransport());
console.error("clockify mcp server ready");
