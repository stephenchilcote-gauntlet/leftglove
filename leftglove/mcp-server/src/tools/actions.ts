import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { textResult } from "./util.js";

export function registerActionTools(server: McpServer, config: Config): void {
  server.tool(
    "click",
    "Click an element by its index from the last observe result. Use observe first to get the element inventory, then click by index.",
    {
      index: z.number().int().describe("Element index from the last observe result"),
    },
    async ({ index }) => {
      try {
        const endpoint = new URL("/click", config.sieveUrl).toString();
        const res = await fetch(endpoint, {
          method: "POST",
          body: JSON.stringify({ index }),
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          const err = await res.text();
          return textResult(`Click failed: HTTP ${res.status} — ${err}`);
        }
        const data = await res.json();
        return textResult(JSON.stringify(data, null, 2));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Click failed: ${msg}`);
      }
    },
  );

  server.tool(
    "fill",
    "Fill a text input by its index from the last observe result. Use observe first to find the input, then fill by index.",
    {
      index: z.number().int().describe("Element index from the last observe result"),
      text: z.string().describe("Text to type into the input"),
    },
    async ({ index, text }) => {
      try {
        const endpoint = new URL("/fill", config.sieveUrl).toString();
        const res = await fetch(endpoint, {
          method: "POST",
          body: JSON.stringify({ index, text }),
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          const err = await res.text();
          return textResult(`Fill failed: HTTP ${res.status} — ${err}`);
        }
        const data = await res.json();
        return textResult(JSON.stringify(data, null, 2));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Fill failed: ${msg}`);
      }
    },
  );

  server.tool(
    "navigate",
    "Navigate the browser to a URL. Use this to go to a specific page before observing.",
    {
      url: z.string().describe("URL to navigate to"),
    },
    async ({ url }) => {
      try {
        const endpoint = new URL("/navigate", config.sieveUrl).toString();
        const res = await fetch(endpoint, {
          method: "POST",
          body: JSON.stringify({ url }),
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) {
          const err = await res.text();
          return textResult(`Navigate failed: HTTP ${res.status} — ${err}`);
        }
        const data = await res.json();
        return textResult(JSON.stringify(data, null, 2));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Navigate failed: ${msg}`);
      }
    },
  );

  server.tool(
    "screenshot",
    "Take a screenshot of the current browser page. Returns a base64-encoded PNG image.",
    {},
    async () => {
      try {
        const endpoint = new URL("/screenshot", config.sieveUrl).toString();
        const res = await fetch(endpoint, {
          method: "GET",
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          return textResult(`Screenshot failed: HTTP ${res.status}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        return {
          content: [
            {
              type: "image" as const,
              data: buffer.toString("base64"),
              mimeType: "image/png",
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Screenshot failed: ${msg}`);
      }
    },
  );
}
