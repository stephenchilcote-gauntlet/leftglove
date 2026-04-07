import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { registerEchoTool } from "./echo.js";

export function registerAllTools(server: McpServer, config: Config): void {
  registerEchoTool(server, config);
}
