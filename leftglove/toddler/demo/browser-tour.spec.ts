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

// __dirname is available natively in Playwright's CJS transform

const TL_URL = 'http://localhost:8080?api=http://localhost:3333';
const DEMO_LOGIN = 'http://localhost:3000/login';

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

/** Wait for sieve to complete — matches first sieve (element count) or re-sieve (diff/resolve). */
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

/** Load a fixture file by injecting JSON directly into fromIntermediate(). */
async function loadFixture(page: Page, fixturePath: string) {
  const json = fs.readFileSync(fixturePath, 'utf-8');
  await page.evaluate(async (jsonStr) => {
    const data = JSON.parse(jsonStr);
    const errors = (window as any).fromIntermediate(data);
    if (errors.length) throw new Error('Load failed: ' + errors.join('; '));
    const n = (window as any).state.inventory?.elements?.length || 0;
    document.getElementById('status-indicator')!.textContent =
      n + ' element' + (n !== 1 ? 's' : '') + ' (loaded)';
    await (window as any).renderScreenshot();
    (window as any).renderOverlay();
    (window as any).renderPanel();
    (window as any).renderMetadata();
    (window as any).saveState();
  }, json);
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

  const FIXTURES = path.join(__dirname, '..', 'fixtures');
  const loginLabeled = path.join(FIXTURES, 'demo-login-labeled.json');

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
    'This is a web application. We\'re going to show you what our system sees when it looks at it.',
    5000, 'intro',
  );
  await clearCaption(page);

  // -- Scene: Type URL and navigate (Navigate auto-sieves) --
  await cursorClick(page, '[data-testid="url-input"]');
  await page.fill('[data-testid="url-input"]', DEMO_LOGIN);
  await pause(page, 500);
  await cursorClick(page, '[data-testid="btn-navigate"]');

  // Navigate auto-calls doSieve() — wait for sieve to finish
  await waitForSieve(page);
  await pause(page, 500);
  await snap(page, 'act1-after-sieve');

  // Caption: sieve result
  await caption(page,
    'The sieve filtered out the noise and found the meaningful elements. Classified in under a second. No screenshots sent to an LLM. Deterministic.',
    6000, 'sieve-result',
    '[data-testid="status-indicator"]',
  );
  await clearCaption(page);

  // -- Scene: Rapid-fire classify --
  await caption(page,
    'A human can classify an entire page in under a minute.',
    4000, 'rapid-classify',
    '[data-testid="progress"]',
  );

  // Classify first 5 elements with keyboard shortcuts
  const classifyKeys = ['c', 't', 't', 'c', 'x'];
  for (const key of classifyKeys) {
    await page.keyboard.press(key);
    await pause(page, 600);
  }
  await clearCaption(page);
  await pause(page, 500);
  await snap(page, 'act1-after-classify');

  // -- Scene: Load pre-labeled state --
  await caption(page,
    'Here\'s the full classification. Every element named, located, typed. This becomes the glossary.',
    6000, 'pre-labeled',
  );

  await loadFixture(page, loginLabeled);
  await pause(page, 2000);
  await snap(page, 'act1-pre-labeled');
  await clearCaption(page);
  await pause(page, 1500);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 3a — RE-SIEVE SHOWS NEW ELEMENT (~20s)
  // (Between Act 2 terminal segment and this, the agent added a checkbox)
  // ═══════════════════════════════════════════════════════════════════════════

  // Caption: code change context
  await caption(page,
    'The agent added a Remember Me checkbox. Let\'s see what the sieve thinks about the new version.',
    5000, 're-sieve-intro',
  );
  await clearCaption(page);

  // Re-sieve (the demo app should have the checkbox by now if the terminal
  // script ran the code change — for recording, we sieve whatever is live)
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
    'The sieve found a new element. One checkbox that wasn\'t there before. Everything else is unchanged.',
    5000, 're-sieve',
    '[data-testid="diff-summary"]',
  );
  await clearCaption(page);
  await pause(page, 1000);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 5a — RE-SIEVE SHOWS ELEMENT GONE (~20s)
  // (Between Act 4 terminal segment and this, the checkbox was removed)
  // ═══════════════════════════════════════════════════════════════════════════

  // If there's a diff to accept first, accept it
  const mode = await page.evaluate(() => (window as any).state.mode);
  if (mode === 'diff') {
    await page.evaluate(() => (window as any).acceptDiff());
    await pause(page, 500);
  }

  await caption(page,
    'Now someone removed the checkbox. Let\'s sieve again.',
    4000, 'element-removed-intro',
  );
  await clearCaption(page);

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
    'Login.remember-me is gone. The glossary diff shows minus one entry.',
    5000, 'element-gone',
    '[data-testid="diff-summary"]',
  );
  await clearCaption(page);

  // Closing caption
  await caption(page,
    'The sieve does for E2E testing what unit test frameworks did for functions — makes it so cheap and structured that there\'s no excuse not to do it.',
    7000, 'closing',
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
