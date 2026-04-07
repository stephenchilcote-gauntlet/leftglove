import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerAllTools } from "./tools/index.js";

const config = loadConfig();

const server = new McpServer({
  name: config.serverName,
  version: config.serverVersion,
});

registerAllTools(server, config);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("LeftGlove MCP server running (stdio transport)");
