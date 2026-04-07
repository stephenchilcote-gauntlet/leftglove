import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";

export function registerEchoTool(server: McpServer, _config: Config): void {
  server.tool(
    "echo",
    "Echoes back the provided message. Used to verify the MCP connection is working.",
    { message: z.string().describe("The message to echo back") },
    async ({ message }) => ({
      content: [{ type: "text", text: `Echo: ${message}` }],
    })
  );
}
