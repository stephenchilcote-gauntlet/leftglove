#!/usr/bin/env node
// Standalone runner for the Playwright sieve server.
// Usage: node run-sieve-server.mjs [port] [--headless false]
import { startSieveServer } from "./dist/sieve/server.js";

const port = parseInt(process.env.SIEVE_PORT ?? process.argv[2] ?? "3333", 10);
const headless = process.env.SIEVE_HEADLESS !== "false";

console.error(`[sieve-runner] Starting sieve server on port ${port}, headless=${headless}`);
const srv = await startSieveServer({ port, headless });
console.error(`[sieve-runner] Ready at ${srv.url}`);

process.on("SIGINT",  async () => { await srv.close(); process.exit(0); });
process.on("SIGTERM", async () => { await srv.close(); process.exit(0); });
