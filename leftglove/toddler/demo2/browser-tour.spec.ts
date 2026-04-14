// LeftGlove + OpenClaw Hype Demo — Browser Tour
//
// Three segments:
//   1. Toddler Loop (TL UI) — brief showcase of the classification tool
//   2. Agent Browser (eBay) — real browser with sieve overlays + interaction
//   3. Generalization (Reserve California) — different site, same detection
//
// Full-screen 1920x1080, single Playwright recording. No split screen, no fake terminal.
//
// Pre-conditions:
//   TL UI server running: http://localhost:8080 (for segment 1 only)
//
// Output:
//   test-results/browser-tour-*/video.webm  (1920x1080 recording)
//   audio-clips/timing.json                 (narration sync)

import * as fsSync from 'fs';
import * as path from 'path';
import { test, type Page } from '@playwright/test';
import { sieveAndOverlay, clearOverlay, loadSieveSource } from './overlay-inject';

const TL_URL = 'http://localhost:8080';
const EBAY_URL = 'https://www.ebay.com/sch/i.html?_nkw=wireless+earbuds&_sop=15';
const CAMPSITE_URL = 'https://www.reservecalifornia.com/';

const EBAY_FIXTURE = path.join(__dirname, 'fixtures', 'ebay-search.json');

// ── Timing log ─────────────────────────────────────────────────────────────

let _t0 = 0;
const timingLog: { id: string; clipId: string; t: number; duration: number }[] = [];

function mark(id: string, duration: number) {
  timingLog.push({ id, clipId: id, t: Date.now() - _t0, duration });
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function pause(page: Page, ms = 1500) {
  await page.waitForTimeout(ms);
}

/** Load a fixture file into the TL UI via the hidden file input. */
async function loadFixture(page: Page, fixturePath: string) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="status-indicator"]');
    if (el) el.textContent = '';
  });
  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(fixturePath);
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="status-indicator"]');
      const text = el?.textContent || '';
      return /\d+\s+element/i.test(text);
    },
    { timeout: 30000 },
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// THE DEMO
// ═══════════════════════════════════════════════════════════════════════════

test('LeftGlove + OpenClaw Hype Demo', async ({ page }) => {
  _t0 = Date.now();
  const sieveSource = loadSieveSource();

  // ═══════════════════════════════════════════════════════════════════════════
  // SEGMENT 1: TODDLER LOOP — Show the classification tool briefly
  // ═══════════════════════════════════════════════════════════════════════════

  await page.goto(TL_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="url-input"]');

  // Hide panels and scale up the viewport to fill 1920x1080
  await page.addStyleTag({ content: `
    #panel, #toolbar, #metadata-strip, #nav-buttons { display: none !important; }
    #viewport {
      display: flex !important;
      justify-content: center !important;
      overflow: hidden !important;
    }
    #screenshot-container {
      transform: scale(1.9);
      transform-origin: top center;
    }
  `});

  // Load pre-classified eBay fixture — shows the overlay instantly
  await loadFixture(page, EBAY_FIXTURE);
  await pause(page, 500);

  mark('toddler-intro', 8000);

  // Simulate rapid element navigation — audience sees cursor jumping between elements
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('ArrowRight');
    await pause(page, 400);
  }

  // Hold on the classified view — long enough for toddler-intro narration (~10s)
  await pause(page, 8000);

  // ═══════════════════════════════════════════════════════════════════════════
  // SEGMENT 2: AGENT BROWSER — Real eBay with sieve overlays
  // ═══════════════════════════════════════════════════════════════════════════

  // Navigate directly to real eBay — Playwright IS the browser
  await page.goto(EBAY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for eBay bot-check to clear and real content to appear
  await page.waitForFunction(
    () => {
      // Bot check pages have "Checking your browser" text
      const body = document.body?.textContent || '';
      if (body.includes('Checking your browser')) return false;
      // Wait for actual search results
      return !!document.querySelector('.srp-results, .s-item, #srp-river-results');
    },
    { timeout: 60000 },
  ).catch(() => {});
  await pause(page, 2000);

  mark('agent-sees', 8000);

  // Raw page visible for a moment — audience sees real eBay
  await pause(page, 2000);

  // Inject sieve.js and render overlays — colored boxes appear on every element
  await sieveAndOverlay(page, sieveSource);
  await pause(page, 1000); // Let fade-in complete

  // Hold with overlays visible
  await pause(page, 5000);

  mark('ebay-interact', 8000);

  // Scroll down to show more products with overlays
  await clearOverlay(page);
  await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'smooth' }));
  await pause(page, 1500);

  // Re-sieve after scroll — new elements, new overlays
  await sieveAndOverlay(page, sieveSource);
  await pause(page, 4000);

  // Scroll down again for more content
  await clearOverlay(page);
  await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'smooth' }));
  await pause(page, 1500);

  // Re-sieve once more
  await sieveAndOverlay(page, sieveSource);
  await pause(page, 4000);

  // ═══════════════════════════════════════════════════════════════════════════
  // SEGMENT 3: GENERALIZATION — Reserve California
  // ═══════════════════════════════════════════════════════════════════════════

  await clearOverlay(page);
  await page.goto(CAMPSITE_URL, { waitUntil: 'domcontentloaded' });

  // Wait for Reserve California to fully load (has a processing spinner)
  await page.waitForFunction(
    () => !document.body?.textContent?.includes('processing your request'),
    { timeout: 30000 },
  ).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await pause(page, 3000);

  mark('generalize', 8000);

  // Raw campsite page visible
  await pause(page, 2000);

  // Sieve + overlay on completely different site
  await sieveAndOverlay(page, sieveSource);
  await pause(page, 1000);

  // Hold with overlays — audience sees different layout, same detection
  await pause(page, 7000);

  mark('closing', 8000);

  // Hold for closing narration
  await pause(page, 8000);

  // ── Save timing ──────────────────────────────────────────────────────────

  const audioDir = path.join(__dirname, 'audio-clips');
  fsSync.mkdirSync(audioDir, { recursive: true });
  fsSync.writeFileSync(
    path.join(audioDir, 'timing.json'),
    JSON.stringify(timingLog, null, 2),
  );
});
