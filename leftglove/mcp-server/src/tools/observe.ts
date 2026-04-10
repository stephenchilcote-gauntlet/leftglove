import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";

export function registerObserveTool(server: McpServer, config: Config): void {
  server.tool(
    "observe",
    "Run the sieve on the current page. Returns a structured inventory of interactive elements (clickable, typable, readable). Use this first to understand page state before acting.",
    {
      url: z
        .string()
        .optional()
        .describe("Optional URL to navigate to before observing"),
    },
    async ({ url }) => {
      try {
        const endpoint = new URL("/sieve", config.sieveUrl).toString();
        const body = url ? JSON.stringify({ url }) : "{}";
        const res = await fetch(endpoint, {
          method: "POST",
          body,
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Observe failed: HTTP ${res.status} from ${endpoint}`,
              },
            ],
          };
        }
        const data = await res.json();
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(data, null, 2) },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Observe failed: ${msg}. Is the sieve server running at ${config.sieveUrl}?`,
            },
          ],
        };
      }
    },
  );
}
