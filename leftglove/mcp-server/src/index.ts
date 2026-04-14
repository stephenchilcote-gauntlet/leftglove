#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerAllTools } from "./tools/index.js";
import { startSieveServer } from "./sieve/server.js";

const config = loadConfig();

// If SIEVE_URL is not set, start the built-in Playwright sieve server
let sieveServer: Awaited<ReturnType<typeof startSieveServer>> | null = null;
if (!process.env.SIEVE_URL) {
  const port = parseInt(process.env.SIEVE_PORT ?? "3333", 10);
  const headless = process.env.SIEVE_HEADLESS !== "false";
  sieveServer = await startSieveServer({ port, headless });
  config.sieveUrl = sieveServer.url;
}

const server = new McpServer({
  name: config.serverName,
  version: config.serverVersion,
});

await registerAllTools(server, config);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("LeftGlove MCP server running (stdio transport)");

// Graceful shutdown
process.on("SIGINT", async () => {
  if (sieveServer) await sieveServer.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  if (sieveServer) await sieveServer.close();
  process.exit(0);
});
