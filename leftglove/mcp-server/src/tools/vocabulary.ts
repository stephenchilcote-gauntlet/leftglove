import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { type Glossary, loadGlossary } from "../bridge/glossary.js";

let currentGlossary: Glossary = { intents: [] };

export function registerVocabularyTools(
  server: McpServer,
  config: Config,
  initial: Glossary,
): void {
  currentGlossary = initial;

  server.tool(
    "list_vocabulary",
    "List the glossary: intent regions, their elements, applicable verbs (click/fill/see), and testid locators.",
    {},
    async () => ({
      content: [
        { type: "text" as const, text: JSON.stringify(currentGlossary, null, 2) },
      ],
    }),
  );

  server.tool(
    "refresh_vocabulary",
    "Reload SL glossary files from disk. Call this after editing EDN files to reflect changes in list_vocabulary.",
    {},
    async () => {
      try {
        currentGlossary = await loadGlossary(config.slProjectDir);
        const n = currentGlossary.intents.reduce(
          (acc, i) => acc + i.elements.length,
          0,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Refreshed: ${n} element(s) across ${currentGlossary.intents.length} intent(s).`,
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Refresh failed: ${msg}` }],
        };
      }
    },
  );
}
