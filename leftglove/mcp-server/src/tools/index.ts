import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { registerEchoTool } from "./echo.js";
import { registerObserveTool } from "./observe.js";
import { registerVocabularyTools } from "./vocabulary.js";
import { loadGlossary } from "../bridge/glossary.js";

export async function registerAllTools(
  server: McpServer,
  config: Config,
): Promise<void> {
  registerEchoTool(server, config);
  registerObserveTool(server, config);
  const glossary = await loadGlossary(config.slProjectDir);
  registerVocabularyTools(server, config, glossary);
}
