// LeftGlove + OpenClaw Hype Demo — Browser Tour
//
// Records the actual TL UI workflow: navigate → sieve → auto-classify → glossary.
// Simultaneously writes a .cast file showing what the MCP API looks like.
//
// Pre-conditions:
//   Sieve server running: http://localhost:3333
//   TL UI server running: http://localhost:8080 (with ANTHROPIC_API_KEY)
//
// Output:
//   test-results/browser-tour-*/video.webm  (TL UI recording, 960x1080)
//   casts/mcp-commands.cast                 (terminal recording)
//   audio-clips/timing.json                 (narration sync)

import * as fsSync from 'fs';
import * as path from 'path';
import { test, type Page } from '@playwright/test';

const SIEVE_URL = 'http://localhost:3333';
const TL_URL = 'http://localhost:8080';

// Act 1: Small seller competition research on eBay
const EBAY_URL = 'https://www.ebay.com/sch/i.html?_nkw=wireless+earbuds&_sop=15';
const CAMPSITE_URL = 'https://www.reservecalifornia.com/park/720/2100';

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

async function waitForSieve(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="status-indicator"]');
      const text = el?.textContent || '';
      return /\d+\s+element/i.test(text);
    },
    { timeout: 60000 },
  );
}

/** Wait until auto-classify reaches Review mode (all batches done). */
async function waitForAutoComplete(page: Page, timeoutMs = 300000) {
  await page.waitForFunction(
    () => {
      const mode = document.querySelector('[data-testid="mode-indicator"]')?.textContent ?? '';
      return /review/i.test(mode);
    },
    { timeout: timeoutMs },
  );
}

/** Parse element count from status indicator text like "485 elements (12 visible)" */
async function getElementCount(page: Page): Promise<number> {
  const text = await page.textContent('[data-testid="status-indicator"]') ?? '';
  const m = text.match(/(\d+)\s+element/i);
  return m ? parseInt(m[1], 10) : 0;
}

/** Parse counts from the toast message "Auto-classified N elements, named M." */
async function getAutoClassifyCounts(page: Page): Promise<{ classified: number; named: number }> {
  const text = await page.evaluate(() =>
    document.getElementById('toast')?.textContent ?? ''
  );
  const cm = text.match(/classified\s+(\d+)/i);
  const nm = text.match(/named\s+(\d+)/i);
  return {
    classified: cm ? parseInt(cm[1], 10) : 0,
    named: nm ? parseInt(nm[1], 10) : 0,
  };
}

/** Read glossary names from the overlay SVG text labels. */
async function getGlossaryNamesFromOverlay(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const labels: string[] = [];
    document.querySelectorAll('[data-testid="overlay-svg"] text').forEach((el) => {
      const t = el.textContent?.trim();
      // Skip empty, duplicates, and long accessibility text blobs
      if (t && t.length < 40 && !labels.includes(t)) labels.push(t);
    });
    return labels;
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
  await page.goto(`${TL_URL}?api=${SIEVE_URL}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="url-input"]');

  // Hide the bottom detail panel for a cleaner demo view — more space for
  // the page content and overlay labels
  await page.addStyleTag({ content: `
    #panel-info, #panel-controls, #nav-buttons { display: none !important; }
    #page-frame { height: calc(100vh - 40px) !important; }
  `});
  await pause(page, 1000);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 1: EBAY — Price comparison for wireless earbuds
  // ═══════════════════════════════════════════════════════════════════════════

  // Type URL and navigate — this is the real sieve server working
  await page.fill('[data-testid="url-input"]', EBAY_URL);
  await pause(page, 500);
  await page.click('[data-testid="btn-navigate"]');

  cast.typeCommand('mcp call observe --url "ebay.com/wireless+earbuds"');
  cast.write('\x1b[90mNavigating and running sieve...\x1b[0m\r\n');

  // Wait for sieve to complete in TL UI
  await waitForSieve(page);
  const ebayCount = await getElementCount(page);
  await pause(page, 1500);

  // Show element count in terminal (from real TL UI state)
  cast.output(`\x1b[1;32m✓\x1b[0m \x1b[1m${ebayCount} elements detected\x1b[0m`);
  cast.output('');

  const tEbaySieve = Date.now() - _t0;
  timingLog.push({ id: 'ebay-sieve', clipId: 'ebay-sieve', t: tEbaySieve, duration: 8000 });

  // Auto-classify — click the button and show progress on terminal
  await page.click('[data-testid="btn-auto-classify"]');
  cast.typeCommand('mcp call auto-classify');
  cast.write('\x1b[90mAuto-classifying with LLM...\x1b[0m\r\n');

  // Poll status and show progress in terminal while auto-classify runs
  {
    let lastProgress = '';
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      const mode = await page.evaluate(() =>
        document.querySelector('[data-testid="mode-indicator"]')?.textContent ?? ''
      );
      if (/review/i.test(mode)) break;
      const status = await page.evaluate(() =>
        document.getElementById('status-indicator')?.textContent ?? ''
      );
      const m = status.match(/\((\d+\/\d+)\)/);
      if (m && m[1] !== lastProgress) {
        lastProgress = m[1];
        cast.write(`\x1b[90m  batch ${lastProgress}\x1b[0m\r\n`);
      }
      await pause(page, 3000);
    }
  }
  // Read counts immediately (toast disappears after 5s)
  const ebayStatus = await getAutoClassifyCounts(page);
  // Let the overlay settle visually
  await pause(page, 3000);
  const ebayOverlayNames = await getGlossaryNamesFromOverlay(page);

  // Show named elements in terminal
  cast.output(`\x1b[1;32m✓\x1b[0m \x1b[1m${ebayStatus.classified} classified, ${ebayStatus.named} named\x1b[0m`);
  cast.output('');

  for (const name of ebayOverlayNames.slice(0, 12)) {
    cast.output(`  \x1b[32m✓\x1b[0m \x1b[1m${name}\x1b[0m`);
  }
  if (ebayOverlayNames.length > 12) {
    cast.output(`  \x1b[90m... ${ebayOverlayNames.length - 12} more\x1b[0m`);
  }
  cast.output('');

  const tEbayHighlights = Date.now() - _t0;
  timingLog.push({ id: 'ebay-highlights', clipId: 'ebay-highlights', t: tEbayHighlights, duration: 6000 });

  // Wait for ebay-highlights narration to finish before navigating away.
  // The clip is 9.4s and starts ~300ms after the timing event (in recording
  // time). Navigate must happen AFTER 9700ms + buffer so the viewer sees
  // the eBay overlay while hearing about eBay elements.
  await pause(page, 12000);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 2: CAMPSITE — Booking a state park reservation
  // ═══════════════════════════════════════════════════════════════════════════

  cast.typeCommand('# Now: a state park reservation system');

  // Navigate to campsite — this tells the sieve server to go to a new page
  // Reserve California shows a "processing your request" interstitial that
  // resolves after a few seconds. Navigate once to trigger it, wait for the
  // interstitial to clear, then navigate again to sieve the real page.
  await page.fill('[data-testid="url-input"]', CAMPSITE_URL);
  await pause(page, 500);
  await page.click('[data-testid="btn-navigate"]');

  cast.typeCommand('mcp call observe --url "reservecalifornia.com/park/720"');
  cast.write('\x1b[90mNavigating to Reserve California...\x1b[0m\r\n');

  await waitForSieve(page);

  // Wait for interstitial to clear, then re-sieve (not re-navigate, which
  // would trigger the interstitial again)
  await pause(page, 5000);
  await page.click('[data-testid="btn-sieve"]');
  await waitForSieve(page);

  // Fire campsite-intro timing AFTER interstitial clears so narration
  // aligns with the real campsite page, not the spinner.
  const tCampsiteIntro = Date.now() - _t0;
  timingLog.push({ id: 'campsite-intro', clipId: 'campsite-intro', t: tCampsiteIntro, duration: 3000 });

  const campsiteCount = await getElementCount(page);
  // Let campsite-intro narration (5s) finish before campsite-sieve fires
  await pause(page, 5500);

  cast.output(`\x1b[1;32m✓\x1b[0m \x1b[1m${campsiteCount} elements detected\x1b[0m`);
  cast.output('');

  const tCampsiteSieve = Date.now() - _t0;
  timingLog.push({ id: 'campsite-sieve', clipId: 'campsite-sieve', t: tCampsiteSieve, duration: 6000 });

  // Auto-classify campsite
  await page.click('[data-testid="btn-auto-classify"]');
  cast.typeCommand('mcp call auto-classify');
  cast.write('\x1b[90mAuto-classifying...\x1b[0m\r\n');

  {
    let lastProgress = '';
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      const mode = await page.evaluate(() =>
        document.querySelector('[data-testid="mode-indicator"]')?.textContent ?? ''
      );
      if (/review/i.test(mode)) break;
      const status = await page.evaluate(() =>
        document.getElementById('status-indicator')?.textContent ?? ''
      );
      const m = status.match(/\((\d+\/\d+)\)/);
      if (m && m[1] !== lastProgress) {
        lastProgress = m[1];
        cast.write(`\x1b[90m  batch ${lastProgress}\x1b[0m\r\n`);
      }
      await pause(page, 3000);
    }
  }
  const campsiteStatus = await getAutoClassifyCounts(page);
  await pause(page, 3000);
  const campsiteOverlayNames = await getGlossaryNamesFromOverlay(page);

  cast.output(`\x1b[1;32m✓\x1b[0m \x1b[1m${campsiteStatus.classified} classified, ${campsiteStatus.named} named\x1b[0m`);
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

  // Let campsite-highlights narration (9.6s) finish and viewer see overlay
  await pause(page, 10000);

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOSING
  // ═══════════════════════════════════════════════════════════════════════════

  // Summary stats
  cast.typeCommand('mcp call list_vocabulary');
  cast.output('');
  cast.output(`\x1b[1;36m${ebayCount}\x1b[0m eBay elements → \x1b[1;32m${ebayStatus.named}\x1b[0m named`);
  cast.output(`\x1b[1;36m${campsiteCount}\x1b[0m Campsite elements → \x1b[1;32m${campsiteStatus.named}\x1b[0m named`);
  cast.output('');
  cast.output('\x1b[1mZero tokens for detection. Deterministic. Every time.\x1b[0m');
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
