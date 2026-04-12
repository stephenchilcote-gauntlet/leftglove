// LeftGlove + OpenClaw Hype Demo — Browser Segments
//
// Records browser-side demo segments as WebM video via Playwright.
// Two segments: Amazon product page + state park campsite reservation.
//
// Pre-conditions (start via bin/demo-run):
//   TL UI:     http://localhost:8080
//   Sieve:     http://localhost:3333
//
// Modes:
//   Default (cached): Loads frozen sieve JSON + screenshots from cached-sieve/
//   Live (LIVE_MODE=1): Navigates sieve to real URLs, saves output to cached-sieve/
//
// Output: test-results/browser-tour-{hash}/video.webm
//         audio-clips/timing.json

import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { test, type Page } from '@playwright/test';

const TL_URL = 'http://localhost:8080?api=http://localhost:3333';
const SIEVE_URL = 'http://localhost:3333';

// Real target URLs for live capture
const AMAZON_URL = 'https://www.amazon.com/dp/B0BSHF7WHW';
const CAMPSITE_URL = 'https://www.reservecalifornia.com/';

// Set LIVE_MODE=1 to capture from real sites; default uses cached data
const LIVE_MODE = process.env.LIVE_MODE === '1';

const CACHED_DIR = path.join(__dirname, 'cached-sieve');

// ── Timing log ──────────────────────────────────────────────────────────────

let _t0 = 0;
const timingLog: { id: string; clipId: string | null; t: number; duration: number }[] = [];
let _captionSeq = 0;

// ── Fake cursor ─────────────────────────────────────────────────────────────

const vtCursor = { x: 960, y: 540 };

async function initCursor(page: Page) {
  const { x, y } = vtCursor;
  await page.evaluate(({ x, y }) => {
    if (document.getElementById('demo-cursor')) return;
    const cur = document.createElement('div');
    cur.id = 'demo-cursor';
    cur.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M5 3l14 8-6.5 1.5L10 19z" fill="white" stroke="#222" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
    cur.style.cssText = `
      position: fixed; z-index: 100001; pointer-events: none;
      left: ${x}px; top: ${y}px;
      transition: left 0.5s cubic-bezier(0.4,0,0.2,1), top 0.5s cubic-bezier(0.4,0,0.2,1);
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
    `;
    document.body.appendChild(cur);
  }, { x, y });
}

async function ensureCursor(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await initCursor(page);
}

async function moveTo(page: Page, selector: string) {
  await ensureCursor(page);
  const box = await page.locator(selector).first().boundingBox({ timeout: 6000 }).catch(() => null);
  if (!box) return;
  const tx = Math.round(box.x + box.width / 2);
  const ty = Math.round(box.y + box.height / 2);
  vtCursor.x = tx;
  vtCursor.y = ty;
  await page.evaluate(({ x, y }) => {
    const cur = document.getElementById('demo-cursor');
    if (cur) { cur.style.left = `${x}px`; cur.style.top = `${y}px`; }
  }, { x: tx, y: ty });
  await page.waitForTimeout(600);
}

// ── Caption ─────────────────────────────────────────────────────────────────

async function caption(
  page: Page,
  text: string,
  durationMs = 4000,
  clipId?: string,
  anchorSelector?: string,
) {
  const tOffset = _t0 ? Date.now() - _t0 : 0;
  timingLog.push({ id: `cap-${++_captionSeq}`, clipId: clipId ?? null, t: tOffset, duration: durationMs });

  let anchorBox: { x: number; y: number; width: number; height: number } | null = null;
  if (anchorSelector) {
    anchorBox = await page.locator(anchorSelector).first().boundingBox({ timeout: 3000 }).catch(() => null);
  }

  await page.evaluate(({ text, ab }) => {
    let cap = document.getElementById('demo-caption');
    if (!cap) {
      cap = document.createElement('div');
      cap.id = 'demo-caption';
      document.body.appendChild(cap);
    }

    const baseStyle = `
      position: fixed; z-index: 100000; pointer-events: none;
      font-family: 'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif;
      color: #cce8ff; font-size: 17px; line-height: 1.45;
      transition: opacity 0.25s ease;
    `;

    if (ab) {
      const VW = window.innerWidth;
      const VH = window.innerHeight;
      const capW = Math.min(560, VW - 40);
      const elemCY = ab.y + ab.h / 2;
      let top = elemCY < VH * 0.55
        ? Math.min(ab.y + ab.h + 14, VH - 100)
        : Math.max(ab.y - 72, 60);
      let left = ab.x + ab.w / 2 - capW / 2;
      left = Math.max(16, Math.min(left, VW - capW - 16));

      cap.style.cssText = baseStyle + `
        left: ${left}px; top: ${top}px; width: ${capW}px;
        background: rgba(0,10,20,0.92);
        border: 1px solid rgba(0,217,255,0.25);
        border-radius: 8px; padding: 10px 18px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      `;
    } else {
      cap.style.cssText = baseStyle + `
        bottom: 0; left: 0; right: 0;
        background: rgba(0,10,20,0.88);
        border-top: 1px solid rgba(0,217,255,0.3);
        padding: 12px 48px;
        text-align: center;
      `;
    }

    cap.textContent = text;
    cap.style.opacity = '1';
  }, { text, ab: anchorBox ? { x: anchorBox.x, y: anchorBox.y, w: anchorBox.width, h: anchorBox.height } : null });
  await page.waitForTimeout(durationMs);
}

async function clearCaption(page: Page) {
  await page.evaluate(() => {
    const el = document.getElementById('demo-caption');
    if (el) el.style.opacity = '0';
  });
  await page.waitForTimeout(250);
}

// ── Highlight ───────────────────────────────────────────────────────────────

async function highlight(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox({ timeout: 5000 }).catch(() => null);
  if (!box) return;
  await page.evaluate((rect) => {
    document.querySelectorAll('.demo-highlight').forEach(e => e.remove());
    const ring = document.createElement('div');
    ring.className = 'demo-highlight';
    ring.style.cssText = `
      position: fixed; z-index: 99997;
      left: ${rect.x - 4}px; top: ${rect.y - 4}px;
      width: ${rect.w + 8}px; height: ${rect.h + 8}px;
      border: 2px solid #00d9ff;
      border-radius: 6px;
      box-shadow: 0 0 12px rgba(0,217,255,0.5);
      pointer-events: none;
      transition: all 0.3s ease;
    `;
    document.body.appendChild(ring);
  }, { x: box.x, y: box.y, w: box.width, h: box.height });
  await page.waitForTimeout(400);
}

async function clearHighlights(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('.demo-highlight').forEach(e => e.remove());
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────���──

async function cursorClick(page: Page, selector: string) {
  await moveTo(page, selector);
  await highlight(page, selector);
  await page.waitForTimeout(300);
  await page.locator(selector).first().click();
  await clearHighlights(page);
}

async function pause(page: Page, ms = 1500) {
  await page.waitForTimeout(ms);
}

async function waitForSieve(page: Page, timeoutMs = 30000) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="status-indicator"]');
      if (!el) return false;
      const text = el.textContent || '';
      if (/\d+\s+element/i.test(text)) return true;
      if (/diff ready/i.test(text)) return true;
      if (/ambiguous/i.test(text)) return true;
      return false;
    },
    { timeout: timeoutMs },
  );
}

// ── Cached sieve injection ──────────────────────────────────────────────────

async function loadCachedSieve(name: string): Promise<{ inventory: any; screenshotB64: string }> {
  const inventoryPath = path.join(CACHED_DIR, `${name}.json`);
  const screenshotPath = path.join(CACHED_DIR, `${name}-screenshot.png`);
  const inventory = JSON.parse(await fs.readFile(inventoryPath, 'utf-8'));
  const screenshotB64 = (await fs.readFile(screenshotPath)).toString('base64');
  return { inventory, screenshotB64 };
}

async function injectCachedInventory(page: Page, cached: { inventory: any; screenshotB64: string }) {
  await page.evaluate(({ inventory, screenshot }) => {
    const s = (window as any).state || (state as any);
    s.inventory = inventory;
    s.classifications = {};
    s.glossaryNames = {};
    s.mode = 'pass1';
    s.pass1Index = 0;

    const img = document.getElementById('screenshot-img') as HTMLImageElement;
    if (img) img.src = `data:image/png;base64,${screenshot}`;

    const status = document.querySelector('[data-testid="status-indicator"]');
    if (status) status.textContent = `${inventory.elements?.length || 0} elements`;

    (window as any).renderOverlay?.();
    (window as any).renderPanel?.();
  }, { inventory: cached.inventory, screenshot: cached.screenshotB64 });
}

// ── Live sieve capture ──────────────────────────────────────────────────────

async function liveSieveCapture(page: Page, url: string, cacheName: string) {
  // Navigate sieve to the real URL
  await page.evaluate(async (args) => {
    const API = new URLSearchParams(window.location.search).get('api') || '';
    await fetch(API + '/navigate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: args.url }),
    });
  }, { url });

  // Run sieve
  const sieveResult = await page.evaluate(async () => {
    const API = new URLSearchParams(window.location.search).get('api') || '';
    const res = await fetch(API + '/sieve', { method: 'POST' });
    return res.json();
  });

  // Save screenshot
  const screenshotRes = await fetch(`${SIEVE_URL}/screenshot`);
  const screenshotBuf = Buffer.from(await screenshotRes.arrayBuffer());

  // Write to cache
  await fs.mkdir(CACHED_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHED_DIR, `${cacheName}.json`), JSON.stringify(sieveResult, null, 2));
  await fs.writeFile(path.join(CACHED_DIR, `${cacheName}-screenshot.png`), screenshotBuf);

  return { inventory: sieveResult, screenshotB64: screenshotBuf.toString('base64') };
}

// ── Batch classify + name ───────────────────────────────────────────────────

async function batchClassifyAndName(page: Page, intentName: string) {
  await page.evaluate(({ intent }) => {
    const s = (window as any).state || (state as any);
    if (!s.inventory?.elements?.length) return;
    const els = s.inventory.elements;

    // Pass 1: classify every element using the sieve's category field
    for (let i = 0; i < els.length; i++) {
      const cat = els[i].category;
      if (cat && !s.classifications[i]) {
        s.classifications[i] = cat;
      }
    }

    // Pass 2: auto-name elements that have a data-testid locator
    const pass2 = [];
    for (let i = 0; i < els.length; i++) {
      const cat = s.classifications[i];
      if (cat === 'chrome' || cat === 'skip') continue;
      pass2.push(i);
    }
    s.pass2Order = pass2;

    for (const i of pass2) {
      const el = els[i];
      const testid = el.locators?.testid || el.locators?.['data-testid'];
      const label = el.label || '';
      const name = testid || label.replace(/[^a-zA-Z0-9 ]/g, '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30);
      if (name && !s.glossaryNames[i]) {
        s.glossaryNames[i] = {
          name: name,
          intent: intent,
          source: 'human',
          notes: '',
        };
      }
    }

    s.mode = 'review';
    (window as any).saveState?.();
    (window as any).renderOverlay?.();
    (window as any).renderPanel?.();
  }, { intent: intentName });
}

// ── Screenshot dir ──────────────────────────────────────────────────────────

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
fsSync.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function snap(page: Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) });
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE DEMO
// ═══════════════════════════════════════════════════════════════════════════════

test('LeftGlove + OpenClaw Hype Demo — Browser Tour', async ({ page }) => {
  _t0 = Date.now();

  // Page-frames dir for split-screen terminal segments
  const pageFrameDir = path.join(__dirname, 'page-frames');
  await fs.mkdir(pageFrameDir, { recursive: true });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — AMAZON PRODUCT PAGE (~30s browser segment)
  // ═══════════════════════════════════════════════════════════════════════════

  // -- Scene: Load TL UI (clean state) --
  await page.goto(TL_URL);
  await page.waitForSelector('[data-testid="url-input"]');
  await page.evaluate(() => {
    localStorage.clear();
    const s = (window as any).state || (state as any);
    s.inventory = null;
    s.classifications = {};
    s.glossaryNames = {};
    s.pageUrl = '';
    const img = document.getElementById('screenshot-img') as HTMLImageElement;
    if (img) img.src = '';
    const overlay = document.getElementById('overlay-svg');
    if (overlay) overlay.innerHTML = '';
    const status = document.getElementById('status-indicator');
    if (status) status.textContent = 'Ready';
  });
  await ensureCursor(page);
  await pause(page, 1000);

  // -- Scene: Type Amazon URL and sieve --
  await cursorClick(page, '[data-testid="url-input"]');
  await page.fill('[data-testid="url-input"]', AMAZON_URL);
  await pause(page, 500);

  let amazonData: { inventory: any; screenshotB64: string };

  if (LIVE_MODE) {
    await cursorClick(page, '[data-testid="btn-navigate"]');
    await waitForSieve(page, 60000); // Amazon may be slow
    amazonData = await liveSieveCapture(page, AMAZON_URL, 'amazon-product');
  } else {
    // Fake the navigate click, then inject cached data
    await cursorClick(page, '[data-testid="btn-navigate"]');
    await pause(page, 1000); // Simulate sieve running
    amazonData = await loadCachedSieve('amazon-product');
    await injectCachedInventory(page, amazonData);
  }

  await pause(page, 500);
  await snap(page, 'amazon-after-sieve');

  // Caption: sieve result
  const amazonCount = amazonData.inventory.elements?.length || 142;
  await caption(page,
    `${amazonCount} interactive elements on one Amazon product page. No LLM. No vision model. Zero tokens.`,
    10500, 'amazon-sieve',
    '[data-testid="status-indicator"]',
  );
  await clearCaption(page);

  // -- Scene: Rapid-fire classify --
  await caption(page,
    'Classify the whole page in seconds. Clickable. Readable. Typable. Done.',
    6000, 'amazon-classify',
    '[data-testid="progress"]',
  );

  // Classify first few elements with keyboard shortcuts
  const classifyKeys = ['c', 'c', 'r', 'r', 't', 'c', 'x'];
  for (const key of classifyKeys) {
    await page.keyboard.press(key);
    await pause(page, 400);
  }
  await clearCaption(page);
  await pause(page, 500);

  // Batch classify + name with Amazon intent
  await batchClassifyAndName(page, 'Amazon');
  await pause(page, 2000);
  await snap(page, 'amazon-classified');

  // Capture page frame for terminal split-screen segments
  if (LIVE_MODE) {
    const screenshotRes = await fetch(`${SIEVE_URL}/screenshot`);
    const buf = Buffer.from(await screenshotRes.arrayBuffer());
    await fs.writeFile(path.join(pageFrameDir, 'amazon-page.png'), buf);
  } else {
    // Use cached screenshot as page frame
    await fs.writeFile(
      path.join(pageFrameDir, 'amazon-page.png'),
      Buffer.from(amazonData.screenshotB64, 'base64'),
    );
  }

  await pause(page, 1500);

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — CAMPSITE RESERVATION (~25s browser segment)
  // ═══════════════════════════════════════════════════════════════════════════

  // Clear state for second demo
  await page.evaluate(() => {
    const s = (window as any).state || (state as any);
    s.inventory = null;
    s.classifications = {};
    s.glossaryNames = {};
    s.pageUrl = '';
    s.mode = 'pass1';
    s.pass1Index = 0;
    const img = document.getElementById('screenshot-img') as HTMLImageElement;
    if (img) img.src = '';
    const overlay = document.getElementById('overlay-svg');
    if (overlay) overlay.innerHTML = '';
    const status = document.getElementById('status-indicator');
    if (status) status.textContent = 'Ready';
    (window as any).renderOverlay?.();
    (window as any).renderPanel?.();
  });

  // Caption: transition to campsite
  await caption(page,
    'Now a state park reservation form. Date pickers. Dropdowns. Availability grids.',
    5000, 'campsite-intro',
  );
  await clearCaption(page);

  // -- Scene: Type campsite URL and sieve --
  await cursorClick(page, '[data-testid="url-input"]');
  await page.fill('[data-testid="url-input"]', '');
  await page.fill('[data-testid="url-input"]', CAMPSITE_URL);
  await pause(page, 500);

  let campsiteData: { inventory: any; screenshotB64: string };

  if (LIVE_MODE) {
    await cursorClick(page, '[data-testid="btn-navigate"]');
    await waitForSieve(page, 60000);
    campsiteData = await liveSieveCapture(page, CAMPSITE_URL, 'campsite-booking');
  } else {
    await cursorClick(page, '[data-testid="btn-navigate"]');
    await pause(page, 1000);
    campsiteData = await loadCachedSieve('campsite-booking');
    await injectCachedInventory(page, campsiteData);
  }

  await pause(page, 500);
  await snap(page, 'campsite-after-sieve');

  // Caption: sieve result
  const campsiteCount = campsiteData.inventory.elements?.length || 87;
  await caption(page,
    `${campsiteCount} elements. Every form field mapped. Every dropdown inventoried.`,
    8000, 'campsite-sieve',
    '[data-testid="status-indicator"]',
  );
  await clearCaption(page);

  // Rapid-fire classify campsite
  const campsiteKeys = ['s', 't', 't', 's', 'c', 'r', 'x'];
  for (const key of campsiteKeys) {
    await page.keyboard.press(key);
    await pause(page, 400);
  }

  // Batch classify + name with Campsite intent
  await batchClassifyAndName(page, 'Campsite');
  await pause(page, 2000);
  await snap(page, 'campsite-classified');

  // Capture page frames for campsite interaction split-screen
  if (LIVE_MODE) {
    // Capture the base campsite page
    const baseRes = await fetch(`${SIEVE_URL}/screenshot`);
    const baseBuf = Buffer.from(await baseRes.arrayBuffer());
    await fs.writeFile(path.join(pageFrameDir, 'campsite-base.png'), baseBuf);

    // Interact with the form and capture each step
    const steps = [
      { action: 'click', selector: '[data-testid="park-select"]', name: 'campsite-step-1-park' },
      { action: 'fill', selector: '[data-testid="arrival-date"]', text: '07/03/2026', name: 'campsite-step-2-arrival' },
      { action: 'fill', selector: '[data-testid="departure-date"]', text: '07/06/2026', name: 'campsite-step-3-departure' },
      { action: 'click', selector: '[data-testid="site-type"]', name: 'campsite-step-4-type' },
      { action: 'click', selector: '[data-testid="search-btn"]', name: 'campsite-step-5-search' },
    ];

    for (const step of steps) {
      if (step.action === 'click') {
        await fetch(`${SIEVE_URL}/click`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selector: step.selector }),
        });
      } else if (step.action === 'fill' && step.text) {
        await fetch(`${SIEVE_URL}/fill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selector: step.selector, text: step.text }),
        });
      }
      const stepRes = await fetch(`${SIEVE_URL}/screenshot`);
      const stepBuf = Buffer.from(await stepRes.arrayBuffer());
      await fs.writeFile(path.join(pageFrameDir, `${step.name}.png`), stepBuf);
    }
  } else {
    // Use cached screenshot as base page frame
    await fs.writeFile(
      path.join(pageFrameDir, 'campsite-base.png'),
      Buffer.from(campsiteData.screenshotB64, 'base64'),
    );
    // Copy any cached step screenshots that exist
    for (let i = 1; i <= 6; i++) {
      const stepFile = path.join(CACHED_DIR, `campsite-step-${i}.png`);
      const destFile = path.join(pageFrameDir, `campsite-step-${i}.png`);
      if (fsSync.existsSync(stepFile)) {
        await fs.copyFile(stepFile, destFile);
      }
    }
  }

  await pause(page, 1500);

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOSING — Side-by-side stats (~15s browser segment)
  // ═══════════════════════════════════════════════════════════════════════════

  // Show closing stats overlay
  await page.evaluate(({ amazonCount, campsiteCount }) => {
    const overlay = document.createElement('div');
    overlay.id = 'demo-closing-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 100002;
      background: rgba(0,10,20,0.95);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      font-family: 'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif;
      color: #cce8ff;
      opacity: 0; transition: opacity 0.5s ease;
    `;
    overlay.innerHTML = `
      <div style="display:flex; gap:80px; margin-bottom:48px;">
        <div style="text-align:center;">
          <div style="font-size:64px; font-weight:700; color:#00d9ff;">${amazonCount}</div>
          <div style="font-size:18px; opacity:0.7;">Amazon elements</div>
          <div style="font-size:24px; font-weight:600; color:#00ff88; margin-top:8px;">0 tokens</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:64px; font-weight:700; color:#00d9ff;">${campsiteCount}</div>
          <div style="font-size:18px; opacity:0.7;">Campsite elements</div>
          <div style="font-size:24px; font-weight:600; color:#00ff88; margin-top:8px;">0 tokens</div>
        </div>
      </div>
      <div style="font-size:22px; line-height:1.6; text-align:center; max-width:700px;">
        The sieve sees everything.<br>
        The glossary names everything.<br>
        The agent knows everything.
      </div>
      <div style="margin-top:40px; font-size:28px; font-weight:700; color:#00d9ff;">
        LeftGlove + OpenClaw
      </div>
      <div style="margin-top:8px; font-size:14px; opacity:0.5;">
        Deterministic page understanding for AI agents
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });
  }, { amazonCount, campsiteCount });

  await pause(page, 500);

  await caption(page,
    'The sieve sees everything. The glossary names everything. The agent knows everything.',
    10000, 'closing',
  );
  await clearCaption(page);
  await pause(page, 5000);

  // ── Write timing log ──────────────────────────────────────────────────────
  const audioDir = path.join(__dirname, 'audio-clips');
  fsSync.mkdirSync(audioDir, { recursive: true });
  fsSync.writeFileSync(
    path.join(audioDir, 'timing.json'),
    JSON.stringify(timingLog, null, 2),
  );
});
