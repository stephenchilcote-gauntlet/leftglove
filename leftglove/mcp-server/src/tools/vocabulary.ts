import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
    "List all available vocabulary actions. Returns intent regions, their elements, applicable verbs (click/fill/see), and testid locators. Read this to know what you can call with act.",
    {},
    async () => ({
      content: [
        { type: "text" as const, text: JSON.stringify(currentGlossary, null, 2) },
      ],
    }),
  );

  server.tool(
    "act",
    "Execute a vocabulary action on a named element. Use list_vocabulary first to discover available intents, elements, and verbs. Verb rules: click=buttons/links, fill=text inputs (requires text param), see=read visible text.",
    {
      verb: z.enum(["click", "fill", "see"]).describe("Verb to perform"),
      intent: z
        .string()
        .describe("Intent region name, e.g. 'ToddlerLoop'"),
      element: z
        .string()
        .describe("Element key from list_vocabulary, e.g. 'url-input'"),
      text: z
        .string()
        .optional()
        .describe("Text to type (required when verb is fill)"),
    },
    async ({ verb, intent, element, text }) => {
      const intentObj = currentGlossary.intents.find(
        (i) => i.intent === intent,
      );
      if (!intentObj) {
        const available =
          currentGlossary.intents.map((i) => i.intent).join(", ") || "none";
        return {
          content: [
            {
              type: "text" as const,
              text: `Unknown intent "${intent}". Available: ${available}`,
            },
          ],
        };
      }

      const el = intentObj.elements.find((e) => e.key === element);
      if (!el) {
        const available =
          intentObj.elements.map((e) => e.key).join(", ") || "none";
        return {
          content: [
            {
              type: "text" as const,
              text: `Unknown element "${element}" in intent "${intent}". Available: ${available}`,
            },
          ],
        };
      }

      if (!el.verbs.includes(verb)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Verb "${verb}" is not valid for element "${element}" (type: ${el.type}). Valid verbs: ${el.verbs.join(", ") || "none"}`,
            },
          ],
        };
      }

      if (verb === "fill" && !text) {
        return {
          content: [
            {
              type: "text" as const,
              text: 'text parameter is required for verb "fill"',
            },
          ],
        };
      }

      const testidInfo = el.testid
        ? `testid="${el.testid}"`
        : "no testid";
      const textInfo = verb === "fill" ? ` with "${text}"` : "";
      return {
        content: [
          {
            type: "text" as const,
            text: `[stub] ${verb} ${intent}.${element}${textInfo} — ${testidInfo}`,
          },
        ],
      };
    },
  );

  server.tool(
    "refresh_vocabulary",
    "Reload SL glossary files from disk. Call this after editing EDN files to reflect changes in list_vocabulary and act.",
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
