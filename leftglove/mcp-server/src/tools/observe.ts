import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { textResult } from "./util.js";

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
        // Navigate first if URL provided (sieve server ignores url in body)
        if (url) {
          const navEndpoint = new URL("/navigate", config.sieveUrl).toString();
          const navRes = await fetch(navEndpoint, {
            method: "POST",
            body: JSON.stringify({ url }),
            headers: { "content-type": "application/json" },
            signal: AbortSignal.timeout(15000),
          });
          if (!navRes.ok) {
            return textResult(`Navigate failed: HTTP ${navRes.status} from ${navEndpoint}`);
          }
        }
        const endpoint = new URL("/sieve", config.sieveUrl).toString();
        const res = await fetch(endpoint, {
          method: "POST",
          body: "{}",
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          return textResult(`Observe failed: HTTP ${res.status} from ${endpoint}`);
        }
        const data = await res.json();
        return textResult(JSON.stringify(data, null, 2));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Observe failed: ${msg}. Is the sieve server running at ${config.sieveUrl}?`);
      }
    },
  );
}
