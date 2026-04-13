// LeftGlove + OpenClaw Hype Demo — Browser Tour
//
// Loads pre-classified fixtures so the demo shows instant results.
// Simultaneously writes a .cast file showing what the MCP API looks like.
//
// Pre-conditions:
//   TL UI server running: http://localhost:8080
//   Fixtures in fixtures/ (created by create-ebay-fixture.ts or manually)
//
// Output:
//   test-results/browser-tour-*/video.webm  (TL UI recording, 960x1080)
//   casts/mcp-commands.cast                 (terminal recording)
//   audio-clips/timing.json                 (narration sync)

import * as fsSync from 'fs';
import * as path from 'path';
import { test, type Page } from '@playwright/test';

const TL_URL = 'http://localhost:8080';

const EBAY_FIXTURE = path.join(__dirname, 'fixtures', 'ebay-search.json');
const CAMPSITE_FIXTURE = path.join(__dirname, 'fixtures', 'campsite-booking.json');

// ── Cast file writer (asciinema v2 format for terminal side) ───────────────

class CastWriter {
  private lines: string[] = [];
  private t0 = Date.now();

  constructor(private cols = 100, private rows = 35) {
    this.lines.push(JSON.stringify({
      version: 2, width: cols, height: rows,
      timestamp: Math.floor(Date.now() / 1000),
      env: { SHELL: '/bin/bash', TERM: 'xterm-256color' },
    }));
  }

  private ts(): number {
    return (Date.now() - this.t0) / 1000;
  }

  write(text: string) {
    this.lines.push(JSON.stringify([this.ts(), 'o', text]));
  }

  typeCommand(cmd: string) {
    this.write('\r\n\x1b[1;36m$ \x1b[0m');
    this.write(cmd);
    this.write('\r\n');
  }

  output(text: string) {
    for (const line of text.split('\n')) {
      this.write(line + '\r\n');
    }
  }

  save(filePath: string) {
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
    fsSync.writeFileSync(filePath, this.lines.join('\n') + '\n');
  }
}

// ── Timing log ─────────────────────────────────────────────────────────────

let _t0 = 0;
const timingLog: { id: string; clipId: string | null; t: number; duration: number }[] = [];

// ── Helpers ────────────────────────────────────────────────────────────────

async function pause(page: Page, ms = 1500) {
  await page.waitForTimeout(ms);
}

/** Load a fixture file into the TL UI via the hidden file input. */
async function loadFixture(page: Page, fixturePath: string) {
  // Clear status so we can detect when the new fixture finishes loading
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="status-indicator"]');
    if (el) el.textContent = '';
  });
  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(fixturePath);
  // Wait for the fixture to load — status indicator updates
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="status-indicator"]');
      const text = el?.textContent || '';
      return /\d+\s+element/i.test(text);
    },
    { timeout: 30000 },
  );
}

/** Parse element count from status indicator text like "485 elements (loaded)" */
async function getElementCount(page: Page): Promise<number> {
  const text = await page.textContent('[data-testid="status-indicator"]') ?? '';
  const m = text.match(/(\d+)\s+element/i);
  return m ? parseInt(m[1], 10) : 0;
}

/** Read glossary names via testAPI (reliable across modes). */
async function getGlossaryNames(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const api = (window as any).testAPI;
    if (!api) return [];
    const gn = api.getGlossaryNames();  // { index: { name, intent, ... } }
    const names: string[] = [];
    for (const entry of Object.values(gn) as any[]) {
      const name = entry?.name;
      if (name && typeof name === 'string' && !names.includes(name)) {
        names.push(name);
      }
    }
    return names;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// THE DEMO
// ═══════════════════════════════════════════════════════════════════════════

test('LeftGlove + OpenClaw Hype Demo — Browser Tour', async ({ page }) => {
  _t0 = Date.now();
  const cast = new CastWriter(80, 25);

  cast.write('\x1b[1;32mLeftGlove MCP Demo\x1b[0m\r\n');
  cast.write('\x1b[90m─────────────────────────────────────\x1b[0m\r\n\r\n');

  // ─── Open TL UI ──────────────────────────────────────────────────────────
  await page.goto(TL_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="url-input"]');

  // Hide the bottom detail panel for a cleaner demo view
  await page.addStyleTag({ content: `
    #panel-info, #panel-controls, #nav-buttons { display: none !important; }
    #page-frame { height: calc(100vh - 40px) !important; }
  `});
  await pause(page, 1000);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 1: EBAY — Price comparison for wireless earbuds
  // ═══════════════════════════════════════════════════════════════════════════

  cast.typeCommand('mcp call observe --url "ebay.com/wireless+earbuds&sort=price"');
  cast.write('\x1b[90mAgent: researching competitor prices...\x1b[0m\r\n');

  // Load pre-classified eBay fixture — instant results
  await loadFixture(page, EBAY_FIXTURE);
  const ebayCount = await getElementCount(page);
  await pause(page, 1500);

  cast.output(`\x1b[1;32m✓\x1b[0m \x1b[1m${ebayCount} elements detected\x1b[0m`);
  cast.output('');

  const tEbaySieve = Date.now() - _t0;
  timingLog.push({ id: 'ebay-sieve', clipId: 'ebay-sieve', t: tEbaySieve, duration: 8000 });

  // Let the ebay-sieve narration play (13s clip) while viewer sees the page.
  // Need at least 13s + pad before ebay-highlights fires.
  await pause(page, 14000);

  // Show classification results in terminal
  const ebayOverlayNames = await getGlossaryNames(page);
  const ebayNamed = ebayOverlayNames.length;

  cast.output(`\x1b[1;32m✓\x1b[0m \x1b[1m${ebayCount} classified, ${ebayNamed} named\x1b[0m`);
  cast.output('');

  // Prioritize listing-relevant names for the competitor price research story
  const priceKeywords = /listing|price|product|title|seller|ship|rating|result|item|bid|buy/i;
  const prioritized = [
    ...ebayOverlayNames.filter(n => priceKeywords.test(n)),
    ...ebayOverlayNames.filter(n => !priceKeywords.test(n)),
  ];
  for (const name of prioritized.slice(0, 12)) {
    cast.output(`  \x1b[32m✓\x1b[0m \x1b[1m${name}\x1b[0m`);
  }
  if (prioritized.length > 12) {
    cast.output(`  \x1b[90m... ${prioritized.length - 12} more\x1b[0m`);
  }
  cast.output('');

  const tEbayHighlights = Date.now() - _t0;
  timingLog.push({ id: 'ebay-highlights', clipId: 'ebay-highlights', t: tEbayHighlights, duration: 6000 });

  // Let ebay-highlights narration finish (~11s) while eBay overlay is visible
  await pause(page, 14000);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 2: CAMPSITE — A completely different site
  // ═══════════════════════════════════════════════════════════════════════════

  cast.typeCommand('# Now: a state park reservation system');
  cast.typeCommand('mcp call observe --url "reservecalifornia.com/park/720"');
  cast.write('\x1b[90mNavigating to Reserve California...\x1b[0m\r\n');

  // Load pre-classified campsite fixture — instant results
  await loadFixture(page, CAMPSITE_FIXTURE);

  const tCampsiteIntro = Date.now() - _t0;
  timingLog.push({ id: 'campsite-intro', clipId: 'campsite-intro', t: tCampsiteIntro, duration: 3000 });

  const campsiteCount = await getElementCount(page);
  // Let campsite-intro narration (~5s) finish
  await pause(page, 5500);

  cast.output(`\x1b[1;32m✓\x1b[0m \x1b[1m${campsiteCount} elements detected\x1b[0m`);
  cast.output('');

  const tCampsiteSieve = Date.now() - _t0;
  timingLog.push({ id: 'campsite-sieve', clipId: 'campsite-sieve', t: tCampsiteSieve, duration: 6000 });

  // Let campsite-sieve narration (~7s) play
  await pause(page, 8000);

  const campsiteOverlayNames = await getGlossaryNames(page);
  const campsiteNamed = campsiteOverlayNames.length;

  cast.output(`\x1b[1;32m✓\x1b[0m \x1b[1m${campsiteCount} classified, ${campsiteNamed} named\x1b[0m`);
  cast.output('');

  for (const name of campsiteOverlayNames.slice(0, 10)) {
    cast.output(`  \x1b[32m✓\x1b[0m \x1b[1m${name}\x1b[0m`);
  }
  if (campsiteOverlayNames.length > 10) {
    cast.output(`  \x1b[90m... ${campsiteOverlayNames.length - 10} more\x1b[0m`);
  }
  cast.output('');

  const tCampsiteHighlights = Date.now() - _t0;
  timingLog.push({ id: 'campsite-highlights', clipId: 'campsite-highlights', t: tCampsiteHighlights, duration: 6000 });

  // Let campsite-highlights narration (~9s) finish
  await pause(page, 10000);

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOSING
  // ═══════════════════════════════════════════════════════════════════════════

  cast.typeCommand('mcp call list_vocabulary');
  cast.output('');
  cast.output(`\x1b[1;36m${ebayCount}\x1b[0m eBay elements → \x1b[1;32m${ebayNamed}\x1b[0m named (prices, listings, filters)`);
  cast.output(`\x1b[1;36m${campsiteCount}\x1b[0m Campsite elements → \x1b[1;32m${campsiteNamed}\x1b[0m named (dates, controls, info)`);
  cast.output('');
  cast.output('\x1b[1mAny site. Any layout. Zero tokens for detection.\x1b[0m');
  cast.output('');

  const tClosing = Date.now() - _t0;
  timingLog.push({ id: 'closing', clipId: 'closing', t: tClosing, duration: 10000 });

  await pause(page, 14000);

  // ── Save outputs ─────────────────────────────────────────────────────────

  const castsDir = path.join(__dirname, 'casts');
  cast.save(path.join(castsDir, 'mcp-commands.cast'));

  const audioDir = path.join(__dirname, 'audio-clips');
  fsSync.mkdirSync(audioDir, { recursive: true });
  fsSync.writeFileSync(
    path.join(audioDir, 'timing.json'),
    JSON.stringify(timingLog, null, 2),
  );
});
