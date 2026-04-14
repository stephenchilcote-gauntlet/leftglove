/**
 * Playwright-based sieve server — replaces the Clojure/Etaoin sieve server.
 *
 * Endpoints:
 *   POST /sieve      — inject sieve.js, return element inventory
 *   POST /navigate   — navigate to a URL
 *   POST /click      — click by index, coordinates, or CSS selector
 *   POST /fill       — fill by index, coordinates, or CSS selector
 *   GET  /screenshot  — PNG screenshot of current page
 *   GET  /status      — current browser state
 *
 * The server keeps the last sieve inventory in memory so that click/fill
 * can resolve element indices to center coordinates.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIEVE_JS = readFileSync(join(__dirname, "sieve.js"), "utf8");

export interface SieveServerOptions {
  port?: number;
  width?: number;
  height?: number;
  headless?: boolean;
}

export interface SieveServer {
  port: number;
  url: string;
  close: () => Promise<void>;
}

interface SieveInventory {
  elements?: SieveElement[];
  [key: string]: unknown;
}

interface SieveElement {
  rect?: { x: number; y: number; w: number; h: number };
  [key: string]: unknown;
}

type ClickTarget = string | { x: number; y: number };

function resolveTarget(
  body: Record<string, unknown>,
  lastInventory: SieveInventory | null,
): ClickTarget {
  // Raw coordinates
  if (body.x != null && body.y != null) {
    return { x: Number(body.x), y: Number(body.y) };
  }

  // Element index from last sieve
  if (body.index != null) {
    const idx = Number(body.index);
    const elements = lastInventory?.elements;
    if (!elements) throw new Error("No sieve inventory — call /sieve first");
    const el = elements[idx];
    if (!el) throw new Error(`Element index ${idx} out of range (${elements.length} elements)`);
    const rect = el.rect;
    if (!rect) throw new Error(`Element ${idx} has no rect`);
    return {
      x: rect.x + rect.w / 2,
      y: rect.y + rect.h / 2,
    };
  }

  // CSS selector (legacy)
  if (typeof body.selector === "string") {
    return body.selector;
  }

  throw new Error("Provide 'index' (element index) or 'selector' (CSS)");
}

async function clickElement(page: Page, target: ClickTarget): Promise<Record<string, unknown>> {
  if (typeof target === "string") {
    await page.click(target);
    await page.waitForTimeout(500);
    return { clicked: target, url: page.url(), title: await page.title() };
  }

  const { x, y } = target;
  // Scroll into view, then click at viewport-relative position
  await page.evaluate(
    ([px, py]) => window.scrollTo(0, Math.max(0, py - window.innerHeight / 2)),
    [x, y],
  );
  await page.waitForTimeout(150);
  const vpX = await page.evaluate(([px]) => px - window.scrollX, [x, y]);
  const vpY = await page.evaluate(([, py]) => py - window.scrollY, [x, y]);
  await page.mouse.click(vpX, vpY);
  await page.waitForTimeout(500);
  return { clicked: { x, y }, url: page.url(), title: await page.title() };
}

async function fillElement(
  page: Page,
  target: ClickTarget,
  text: string,
): Promise<Record<string, unknown>> {
  if (typeof target === "string") {
    await page.fill(target, text);
    await page.waitForTimeout(300);
    return { filled: target, text, url: page.url(), title: await page.title() };
  }

  const { x, y } = target;
  await page.evaluate(
    ([px, py]) => window.scrollTo(0, Math.max(0, py - window.innerHeight / 2)),
    [x, y],
  );
  await page.waitForTimeout(150);

  // Focus, clear, type, dispatch events — matching the Clojure implementation
  await page.evaluate(
    ({ px, py, txt }: { px: number; py: number; txt: string }) => {
      const el = document.elementFromPoint(px - window.scrollX, py - window.scrollY);
      if (!el) throw new Error(`No element at (${px}, ${py})`);
      (el as HTMLElement).focus();
      (el as HTMLInputElement).value = "";
      (el as HTMLInputElement).value = txt;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { px: x, py: y, txt: text },
  );
  await page.waitForTimeout(300);
  return { filled: { x, y }, text, url: page.url(), title: await page.title() };
}

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString();
        resolve(raw.length > 0 ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(json);
}

function pngResponse(res: ServerResponse, buffer: Buffer): void {
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(buffer);
}

export async function startSieveServer(
  opts: SieveServerOptions = {},
): Promise<SieveServer> {
  const port = opts.port ?? 3333;
  const width = opts.width ?? 960;
  const height = opts.height ?? 1080;
  const headless = opts.headless ?? true;

  const browser: Browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  let lastInventory: SieveInventory | null = null;

  const server = createServer(async (req, res) => {
    const method = req.method?.toUpperCase();
    const path = req.url?.split("?")[0];

    if (method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    try {
      if (method === "POST" && path === "/sieve") {
        const result = await page.evaluate(SIEVE_JS);
        lastInventory = result as SieveInventory;
        jsonResponse(res, 200, result);
      } else if (method === "POST" && path === "/navigate") {
        const body = await parseBody(req);
        const url = body.url as string;
        if (!url) {
          jsonResponse(res, 400, { error: "Missing 'url' in request body" });
          return;
        }
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        jsonResponse(res, 200, { url: page.url(), title: await page.title() });
      } else if (method === "POST" && path === "/click") {
        const body = await parseBody(req);
        const target = resolveTarget(body, lastInventory);
        const result = await clickElement(page, target);
        jsonResponse(res, 200, result);
      } else if (method === "POST" && path === "/fill") {
        const body = await parseBody(req);
        const text = body.text as string;
        if (text == null) {
          jsonResponse(res, 400, { error: "Missing 'text' in request body" });
          return;
        }
        const target = resolveTarget(body, lastInventory);
        const result = await fillElement(page, target, String(text));
        jsonResponse(res, 200, result);
      } else if (method === "GET" && path === "/screenshot") {
        const buffer = await page.screenshot({ fullPage: false });
        pngResponse(res, buffer);
      } else if (method === "GET" && path === "/status") {
        jsonResponse(res, 200, {
          ready: true,
          url: page.url(),
          title: await page.title(),
        });
      } else {
        jsonResponse(res, 404, { error: "Not found" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 500, { error: msg });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      const sieveUrl = `http://localhost:${port}`;
      console.error(`[sieve] Server started on ${sieveUrl}`);
      console.error(
        "[sieve] Endpoints: POST /sieve, GET /screenshot, POST /navigate, GET /status, POST /click, POST /fill",
      );
      resolve({
        port,
        url: sieveUrl,
        close: async () => {
          server.close();
          await context.close();
          await browser.close();
          console.error("[sieve] Server stopped.");
        },
      });
    });
  });
}
