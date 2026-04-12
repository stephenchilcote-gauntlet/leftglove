// LeftGlove + OpenClaw Hype Demo — Browser Segments
//
// Records browser-side demo segments as WebM video via Playwright.
// Two segments: Amazon product page + state park campsite reservation.
//
// Pre-conditions:
//   TL UI running: http://localhost:8080
//   Fixtures exist: fixtures/amazon-product.json, fixtures/campsite-booking.json
//   (No sieve server needed — fixtures are pre-classified)
//
// Output: test-results/browser-tour-{hash}/video.webm
//         audio-clips/timing.json

import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { test, type Page } from '@playwright/test';

const TL_URL = 'http://localhost:8080';
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

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

async function pause(page: Page, ms = 1500) {
  await page.waitForTimeout(ms);
}

// Highlight an element by its glossary name in the overlay SVG.
// The overlay renders <rect> elements with data-idx; glossary names are in state.glossaryNames.
// We find the element index by name, then highlight the corresponding overlay rect.
async function highlightByGlossaryName(page: Page, glossaryName: string, captionText: string) {
  const rect = await page.evaluate((name) => {
    const s = (window as any).state;
    if (!s?.glossaryNames) return null;
    for (const [idx, gn] of Object.entries(s.glossaryNames) as any) {
      if (gn.name === name) {
        const el = s.inventory?.elements?.[Number(idx)];
        if (el?.rect) return { x: el.rect.x, y: el.rect.y, w: el.rect.w, h: el.rect.h };
      }
    }
    return null;
  }, glossaryName);

  if (rect) {
    // Highlight using the element's rect in screenshot coordinates,
    // but we need to translate to viewport coords via the screenshot container offset
    await page.evaluate((r) => {
      document.querySelectorAll('.demo-highlight').forEach(e => e.remove());
      const container = document.getElementById('screenshot-container');
      const img = document.getElementById('screenshot-img') as HTMLImageElement;
      if (!container || !img) return;
      const containerRect = container.getBoundingClientRect();
      // Scale from sieve coords to displayed screenshot coords
      const scaleX = img.clientWidth / (img.naturalWidth || img.clientWidth);
      const scaleY = img.clientHeight / (img.naturalHeight || img.clientHeight);
      const ring = document.createElement('div');
      ring.className = 'demo-highlight';
      ring.style.cssText = `
        position: fixed; z-index: 99997;
        left: ${containerRect.left + r.x * scaleX - 4}px;
        top: ${containerRect.top + r.y * scaleY - 4}px;
        width: ${r.w * scaleX + 8}px; height: ${r.h * scaleY + 8}px;
        border: 2px solid #00d9ff;
        border-radius: 6px;
        box-shadow: 0 0 12px rgba(0,217,255,0.5);
        pointer-events: none;
        transition: all 0.3s ease;
      `;
      document.body.appendChild(ring);
    }, rect);
  }

  await caption(page, captionText, 3000);
  await clearHighlights(page);
  await clearCaption(page);
  await pause(page, 300);
}

// ── Fixture loading ─────────────────────────────────────────────────────────

async function loadFixture(fixtureName: string): Promise<any> {
  const fixturePath = path.join(FIXTURES_DIR, `${fixtureName}.json`);
  if (!fsSync.existsSync(fixturePath)) {
    throw new Error(
      `Fixture not found: ${fixturePath}\n` +
      `Run the manual classification workflow first:\n` +
      `  1. bin/demo-run\n` +
      `  2. Classify in TL UI\n` +
      `  3. Export to fixtures/${fixtureName}.json`
    );
  }
  return JSON.parse(await fs.readFile(fixturePath, 'utf-8'));
}

async function injectFixture(page: Page, fixtureData: any): Promise<number> {
  return await page.evaluate((data) => {
    const errors = (window as any).fromIntermediate(data);
    if (errors.length) throw new Error('Load failed: ' + errors.join('; '));
    (window as any)._lastPass2Rendered = -1;
    const n = (window as any).state.inventory
      ? (window as any).state.inventory.elements.length
      : 0;
    document.getElementById('status-indicator')!.textContent =
      n + ' element' + (n !== 1 ? 's' : '') + ' (loaded)';
    return (window as any).renderScreenshot().then(() => {
      (window as any).renderOverlay();
      (window as any).renderPanel();
      (window as any).renderMetadata();
      return n;
    });
  }, fixtureData);
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

  // Load fixtures upfront — fail fast if missing
  const amazonFixture = await loadFixture('amazon-product');
  const campsiteFixture = await loadFixture('campsite-booking');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — AMAZON PRODUCT PAGE
  // ═══════════════════════════════════════════════════════════════════════════

  // -- Scene: Load TL UI (clean state) --
  await page.goto(TL_URL);
  await page.waitForSelector('#status-indicator');
  await ensureCursor(page);
  await pause(page, 1000);

  // -- Scene: Inject Amazon fixture --
  const amazonCount = await injectFixture(page, amazonFixture);
  await pause(page, 1000);
  await snap(page, 'amazon-after-load');

  // Caption: sieve result
  await caption(page,
    `${amazonCount} interactive elements on one Amazon product page. No LLM. No vision model. Zero tokens.`,
    10500, 'amazon-sieve',
    '#status-indicator',
  );
  await clearCaption(page);

  // -- Scene: Classification overview --
  await caption(page,
    'Classify the whole page in seconds. Clickable. Readable. Typable. Done.',
    6000, 'amazon-classify',
  );
  await clearCaption(page);
  await pause(page, 500);

  // -- Scene: Walk through key Amazon elements --
  await highlightByGlossaryName(page, 'add-to-cart',
    'Amazon.add-to-cart — clickable');
  await highlightByGlossaryName(page, 'price',
    'Amazon.price — readable');
  await highlightByGlossaryName(page, 'quantity-selector',
    'Amazon.quantity-selector — selectable');
  await snap(page, 'amazon-classified');

  // Extract page-frame screenshot from fixture source data
  if (amazonFixture.source?.screenshot) {
    await fs.writeFile(
      path.join(pageFrameDir, 'amazon-page.png'),
      Buffer.from(amazonFixture.source.screenshot, 'base64'),
    );
  }

  await pause(page, 1500);

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — CAMPSITE RESERVATION
  // ═══════════════════════════════════════════════════════════════════════════

  // Caption: transition to campsite
  await caption(page,
    'Now a state park reservation form. Date pickers. Dropdowns. Availability grids.',
    5000, 'campsite-intro',
  );
  await clearCaption(page);

  // -- Scene: Inject campsite fixture --
  const campsiteCount = await injectFixture(page, campsiteFixture);
  await pause(page, 1000);
  await snap(page, 'campsite-after-load');

  // Caption: sieve result
  await caption(page,
    `${campsiteCount} elements. Every form field mapped. Every dropdown inventoried.`,
    8000, 'campsite-sieve',
    '#status-indicator',
  );
  await clearCaption(page);

  // -- Scene: Walk through key campsite elements --
  await highlightByGlossaryName(page, 'park-selector',
    'Campsite.park-selector — selectable');
  await highlightByGlossaryName(page, 'arrival-date',
    'Campsite.arrival-date — typable');
  await highlightByGlossaryName(page, 'departure-date',
    'Campsite.departure-date — typable');
  await highlightByGlossaryName(page, 'campsite-type',
    'Campsite.campsite-type — selectable');
  await highlightByGlossaryName(page, 'search-button',
    'Campsite.search-button — clickable');
  await snap(page, 'campsite-classified');

  // Extract page-frame screenshot from fixture source data
  if (campsiteFixture.source?.screenshot) {
    await fs.writeFile(
      path.join(pageFrameDir, 'campsite-base.png'),
      Buffer.from(campsiteFixture.source.screenshot, 'base64'),
    );
  }

  await pause(page, 1500);

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOSING — Side-by-side stats
  // ═══════════════════════════════════════════════════════════════════════════

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
