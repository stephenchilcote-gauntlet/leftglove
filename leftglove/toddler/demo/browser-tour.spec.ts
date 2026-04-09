// LeftGlove Demo Video — Browser Segments
//
// Records browser-side demo segments as WebM video via Playwright.
// Three segments corresponding to Acts 1, 3a, and 5a of the demo.
//
// Pre-conditions (start via bin/demo-run):
//   Demo app:  http://localhost:3000
//   TL UI:     http://localhost:8080
//   Sieve:     http://localhost:3333
//
// Output: test-results/browser-tour-{hash}/video.webm
//         audio-clips/timing.json

import * as fs from 'fs';
import * as path from 'path';
import { test, type Page } from '@playwright/test';

const TL_URL = 'http://localhost:8080?api=http://localhost:3333';
const DEMO_APP = 'http://localhost:3000';

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

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// Wait for sieve to complete — matches first sieve (element count) or re-sieve (diff/resolve).
async function waitForSieve(page: Page, timeoutMs = 30000) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="status-indicator"]');
      if (!el) return false;
      const text = el.textContent || '';
      // First sieve: "N elements"
      if (/\d+\s+element/i.test(text)) return true;
      // Re-sieve: "Diff ready" or "N ambiguous"
      if (/diff ready/i.test(text)) return true;
      if (/ambiguous/i.test(text)) return true;
      return false;
    },
    { timeout: timeoutMs },
  );
}

// Batch-classify all elements using the sieve's own categories, then
// auto-name notable elements by their data-testid. No synthetic fixtures.
async function batchClassifyAndName(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).state;
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
    // Build pass2Order first
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
      // Use testid as glossary name, or derive from label
      const name = testid || label.replace(/[^a-zA-Z0-9 ]/g, '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30);
      if (name && !s.glossaryNames[i]) {
        s.glossaryNames[i] = {
          name: name,
          intent: 'Fundraiser',
          source: 'human',
          notes: '',
        };
      }
    }

    // Update mode to pass2/review
    s.mode = 'review';
    (window as any).saveState();
    (window as any).renderOverlay();
    (window as any).renderPanel();
  });
}

// Toggle the recurring donation element on/off via the demo app API
async function setRecurring(enabled: boolean) {
  await fetch(`${DEMO_APP}/set-recurring`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

// Force the sieve's Chrome to reload the page (picks up server-side state changes)
async function reloadSieveBrowser(page: Page) {
  await page.evaluate(async (url) => {
    const API = new URLSearchParams(window.location.search).get('api') || '';
    await fetch(API + '/navigate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  }, DEMO_APP);
}

// ── Screenshot dir ──────────────────────────────────────────────────────────

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function snap(page: Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) });
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE DEMO
// ═══════════════════════════════════════════════════════════════════════════════

test('LeftGlove Demo — Browser Tour', async ({ page }) => {
  _t0 = Date.now();

  // Ensure recurring donation is OFF at start
  await setRecurring(false);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 1 — THE SIEVE SEES EVERYTHING (~60s)
  // ═══════════════════════════════════════════════════════════════════════════

  // -- Scene: Load TL UI (clean state) --
  await page.goto(TL_URL);
  await page.waitForSelector('[data-testid="url-input"]');
  // Clear any residual state so first sieve is truly fresh
  await page.evaluate(() => {
    localStorage.clear();
    (window as any).state = (window as any).state || {};
    (window as any).state.inventory = null;
    (window as any).state.classifications = {};
    (window as any).state.glossaryNames = {};
    (window as any).state.pageUrl = '';
    const img = document.getElementById('screenshot-img') as HTMLImageElement;
    if (img) img.src = '';
    const overlay = document.getElementById('overlay-svg');
    if (overlay) overlay.innerHTML = '';
    const status = document.getElementById('status-indicator');
    if (status) status.textContent = 'Ready';
  });
  await ensureCursor(page);
  await pause(page, 1000);

  // Caption: intro
  await caption(page,
    'This is a fundraising page. We\'re going to show you what our system sees when it looks at it.',
    5500, 'intro',
  );
  await clearCaption(page);

  // -- Scene: Type URL and navigate (Navigate auto-sieves) --
  await cursorClick(page, '[data-testid="url-input"]');
  await page.fill('[data-testid="url-input"]', DEMO_APP);
  await pause(page, 500);
  await cursorClick(page, '[data-testid="btn-navigate"]');

  // Navigate auto-calls doSieve() — wait for sieve to finish
  await waitForSieve(page);
  await pause(page, 500);
  await snap(page, 'act1-after-sieve');

  // Caption: sieve result
  await caption(page,
    'The sieve found the meaningful elements — donate button, amount input, progress bar, supporter comments. Deterministic. No LLM. No tokens burned.',
    10500, 'sieve-result',
    '[data-testid="status-indicator"]',
  );
  await clearCaption(page);

  // -- Scene: Rapid-fire classify --
  await caption(page,
    'Clickable. Typable. Typable. Readable. A human can classify an entire page in under a minute.',
    8500, 'rapid-classify',
    '[data-testid="progress"]',
  );

  // Classify first 5 elements with keyboard shortcuts
  const classifyKeys = ['c', 't', 't', 'r', 'x'];
  for (const key of classifyKeys) {
    await page.keyboard.press(key);
    await pause(page, 600);
  }
  await clearCaption(page);
  await pause(page, 500);
  await snap(page, 'act1-after-classify');

  // -- Scene: Show fully classified state (from live sieve data) --
  await caption(page,
    'Here\'s the full classification. Every element named, located, typed. This becomes the glossary — the vocabulary that agents and tests are bound to.',
    9500, 'pre-labeled',
  );

  await batchClassifyAndName(page);
  await pause(page, 2000);
  await snap(page, 'act1-pre-labeled');
  await clearCaption(page);
  await pause(page, 1500);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 3a — RE-SIEVE SHOWS NEW ELEMENT (~20s)
  // (Between Act 2 terminal segment and this, the agent added a recurring toggle)
  // ═══════════════════════════════════════════════════════════════════════════

  // Caption: code change context
  await caption(page,
    'The agent added a recurring donation toggle. Let\'s see what the sieve thinks about the new version.',
    4000, 're-sieve-intro',
  );
  await clearCaption(page);

  // Enable recurring donation element in the demo app
  await setRecurring(true);

  // Reload the sieve's Chrome browser to pick up the server-side toggle change
  await reloadSieveBrowser(page);

  // Re-sieve — the page now has the recurring donation toggle
  await cursorClick(page, '[data-testid="btn-sieve"]');

  // Wait for diff or new sieve result
  await page.waitForFunction(
    () => {
      const status = document.querySelector('[data-testid="status-indicator"]');
      const diff = document.querySelector('[data-testid="diff-summary"]');
      return (status && /element/i.test(status.textContent || '')) ||
             (diff && diff.style.display !== 'none');
    },
    { timeout: 20000 },
  );
  await pause(page, 1000);
  await snap(page, 'act3a-resieve');

  // Caption: new element found
  await caption(page,
    'The sieve found a new element — the recurring donation checkbox. Everything else is unchanged.',
    7000, 're-sieve',
    '[data-testid="diff-summary"]',
  );
  await clearCaption(page);
  await pause(page, 1000);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 5a — RE-SIEVE SHOWS ELEMENT GONE (~20s)
  // (Between Act 4 terminal segment and this, the recurring toggle was removed)
  // ═══════════════════════════════════════════════════════════════════════════

  // If there's a diff to accept first, accept it
  const mode = await page.evaluate(() => (window as any).state.mode);
  if (mode === 'diff') {
    await page.evaluate(() => (window as any).acceptDiff());
    await pause(page, 500);
  }

  await caption(page,
    'Now someone removed the recurring toggle. Let\'s sieve again.',
    6000, 'element-removed-intro',
  );
  await clearCaption(page);

  // Disable recurring donation element
  await setRecurring(false);

  // Reload the sieve's Chrome to pick up the removal
  await reloadSieveBrowser(page);

  await cursorClick(page, '[data-testid="btn-sieve"]');
  await page.waitForFunction(
    () => {
      const status = document.querySelector('[data-testid="status-indicator"]');
      const diff = document.querySelector('[data-testid="diff-summary"]');
      return (status && /element/i.test(status.textContent || '')) ||
             (diff && diff.style.display !== 'none');
    },
    { timeout: 20000 },
  );
  await pause(page, 1000);
  await snap(page, 'act5a-element-gone');

  await caption(page,
    'Fundraiser.recurring-checkbox is gone. The glossary diff shows minus one entry. The customer can\'t set up monthly donations anymore.',
    8000, 'element-gone',
    '[data-testid="diff-summary"]',
  );
  await clearCaption(page);

  // Closing caption
  await caption(page,
    'The sieve does for E2E testing what unit test frameworks did for functions — makes it so cheap and structured that there\'s no excuse not to do it.',
    10000, 'closing',
  );
  await clearCaption(page);
  await pause(page, 2000);

  // ── Write timing log ──────────────────────────────────────────────────────
  const audioDir = path.join(__dirname, 'audio-clips');
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(
    path.join(audioDir, 'timing.json'),
    JSON.stringify(timingLog, null, 2),
  );
});
