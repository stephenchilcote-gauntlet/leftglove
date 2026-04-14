// Demo 3 — Browser Recording
//
// Records intro segments for the LeftGlove demo video:
//   Segment A: Raw HTML scrolling (eBay page source — unintelligible noise)
//   Segment B: Toddler Loop UI — show sieved eBay with element overlays
//   Segment C: Manual classification — classify elements using keyboard shortcuts
//   Segment D: Sieve overlay — colored boxes on real eBay showing what matters
//
// Pre-conditions:
//   TL UI:   http://localhost:8080
//   Sieve:   http://localhost:3333
//
// Output:
//   test-results/browser-tour-*/video.webm

import { test, type Page } from '@playwright/test';

const TL_URL = 'http://localhost:8080';
const SIEVE_URL = 'http://localhost:3333';
const EBAY_URL = 'https://www.ebay.com/sch/i.html?_nkw=wireless+earbuds&_sop=15';

async function pause(page: Page, ms = 1500) {
  await page.waitForTimeout(ms);
}

/** Navigate the sieve browser via its HTTP API (not via the TL UI). */
async function sieveNavigate(url: string): Promise<void> {
  const resp = await fetch(`${SIEVE_URL}/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  await resp.json();
}

/** Run sieve via its HTTP API. */
async function sieveScan(): Promise<any> {
  const resp = await fetch(`${SIEVE_URL}/sieve`, { method: 'POST' });
  return resp.json();
}

// ═══════════════════════════════════════════════════════════════════════════
test('LeftGlove Demo 3 — Intro Segments', async ({ page }) => {

  // ─── SEGMENT A: Raw HTML scrolling (5s) ─────────────────────────────────
  // Show realistic raw HTML source scrolling fast — unintelligible noise.
  // This is a standalone visual: no sieve needed.

  await page.goto('about:blank');
  await page.evaluate(() => {
    document.body.innerHTML = '';
    document.body.style.cssText = `
      background: #0d1117; color: #8b949e;
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      font-size: 11px; line-height: 1.4;
      padding: 20px 40px; white-space: pre; overflow: hidden; margin: 0;
    `;
    const htmlLines = [
      '<!DOCTYPE html>',
      '<html xmlns="http://www.w3.org/1999/xhtml" lang="en">',
      '<head>',
      '  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <title>wireless earbuds | eBay</title>',
      '  <link rel="stylesheet" href="https://ir.ebaystatic.com/cr/v/c01/s/v2.min.css">',
      '  <script>window.__INITIAL_STATE__={"modules":{"SEARCH_RESULTS":{"items":[',
      '    {"itemId":"v1|335251351456","title":"JLab Go POP+ True Wireless Bluetooth Earbuds",',
      '     "price":{"value":"18.89","currency":"USD"},"condition":"Certified Refurbished",',
      '     "itemLocation":"United States","seller":{"username":"jlab-audio","feedbackScore":98.5}},',
      '    {"itemId":"v1|235425329067","title":"JLab GO Sport+ True Wireless Earbuds",',
      '     "price":{"value":"29.99","currency":"USD"},"condition":"Brand New",',
      '     "shippingCost":{"value":"0.00","type":"FREE"}},',
      '  ]},"PAGINATION":{"totalEntries":160000,"entriesPerPage":60}}};</script>',
      '</head>',
      '<body id="s0-0-0" class="srp s-page">',
      '  <div id="gh" class="gh-flex" role="banner"><table class="gh-tbl"><tbody><tr>',
      '    <td class="gh-td gh-first"><a href="/" class="gh-p" aria-label="eBay Home">',
      '      <svg viewBox="0 0 120 48"><use xlink:href="#gh-logo"></use></svg></a></td>',
      '    <td class="gh-td"><nav role="navigation" aria-label="Account"><ul id="gh-topl">',
      '      <li class="gh-t"><a href="https://signin.ebay.com/ws/eBayISAPI.dll?SignIn">',
      '        <span class="gh-uc-txt">Hi! <a href="/signin">Sign in</a></span></a></li>',
      '      <li><a href="/deals" class="gh-eb-li-a gh-d">Daily Deals</a></li>',
      '      <li><a href="/giftcards" class="gh-eb-li-a">Gift Cards</a></li>',
      '      <li><a href="/help/home" class="gh-eb-li-a">Help & Contact</a></li>',
      '    </ul></nav></td>',
      '    <td class="gh-td"><form id="gh-f" action="/sch/i.html" method="GET">',
      '      <div class="gh-search"><input id="gh-ac-box" type="text" class="gh-tb"',
      '        value="wireless earbuds" aria-label="Search for anything" role="combobox">',
      '      <button type="submit" class="btn btn-prim gh-spr" id="gh-btn-search">',
      '        <svg viewBox="0 0 24 24"><use xlink:href="#gh-search-icon"></use></svg>',
      '      </button></div></form></td>',
      '  </tr></tbody></table></div>',
      '  <div id="srp-river-main" class="clearfix">',
      '    <h1 class="srp-controls__count-heading"><span>160,000+ results</span> for wireless earbuds</h1>',
      '    <div class="srp-format-tabs"><ul role="tablist">',
      '      <li><button role="tab" aria-selected="true">All Listings</button></li>',
      '      <li><button role="tab">Auction</button></li>',
      '      <li><button role="tab">Buy It Now</button></li>',
      '    </ul></div>',
      '    <ul class="srp-results srp-list clearfix">',
      '      <li class="s-item" data-view="mi:1686|iid:1"><div class="s-item__wrapper clearfix">',
      '        <div class="s-item__image-section"><a href="/itm/335251351456" tabindex="0">',
      '          <img src="https://i.ebayimg.com/thumbs/images/g/XxY/s-l300.jpg"',
      '            alt="JLab Go POP+ True Wireless Bluetooth Earbuds"></a></div>',
      '        <div class="s-item__info"><a href="/itm/335251351456" class="s-item__link">',
      '          <span role="heading" aria-level="3">JLab Go POP+ True Wireless Bluetooth Earbuds,',
      '            In-Ear Headphones, Refurbished</span></a>',
      '          <span class="SECONDARY_INFO">Certified - Refurbished</span>',
      '          <span class="s-item__price">US $18.89</span>',
      '          <span class="STRIKETHROUGH">US $49.99</span>',
      '          <span class="s-item__freeXDays">Free delivery in 3-4 days</span>',
      '          <span class="s-item__location">Located in United States</span>',
      '          <span class="s-item__free-returns">Free returns</span>',
      '        </div></div></li>',
      '      <li class="s-item" data-view="mi:1686|iid:2"><div class="s-item__wrapper clearfix">',
      '        <div class="s-item__image-section"><a href="/itm/235425329067">',
      '          <img alt="JLab GO Sport+ True Wireless Earbuds"></a></div>',
      '        <div class="s-item__info"><a href="/itm/235425329067">',
      '          <span role="heading" aria-level="3">JLab GO Sport+ True Wireless Earbuds,',
      '            Gym & Work Out Running Headphones</span></a>',
      '          <span class="s-item__price">US $29.99</span>',
      '          <span class="STRIKETHROUGH">US $39.99</span>',
      '          <span class="s-item__freeXDays">Free delivery</span>',
      '        </div></div></li>',
      '      <li class="s-item"><div class="s-item__wrapper clearfix">',
      '        <div class="s-item__info"><a href="/itm/235914385086">',
      '          <span>JLab Go Pop ANC True Wireless Earbuds, 24+ Hr Playtime</span></a>',
      '          <span class="s-item__price">US $29.99</span></div></div></li>',
      '      <li class="s-item"><div class="s-item__wrapper clearfix">',
      '        <div class="s-item__info"><a href="/itm/394872615432">',
      '          <span>Samsung Galaxy Buds FE True Wireless ANC Earbuds</span></a>',
      '          <span class="s-item__price">US $54.99</span></div></div></li>',
      '    </ul>',
      '    <div class="srp-sidebar" role="complementary">',
      '      <h2 class="x-refine__item">Category</h2>',
      '      <ul><li><a href="#">Cell Phones & Accessories (153,000)</a></li>',
      '        <li><a href="#">Consumer Electronics (4,200)</a></li></ul>',
      '      <h2>Condition</h2><ul><li><a href="#">New (120,000)</a></li>',
      '        <li><a href="#">Pre-Owned (8,500)</a></li></ul>',
      '      <h2>Price</h2><div><label>Under $10.00</label>',
      '        <label>$10.00 to $25.00</label><label>Over $25.00</label></div>',
      '      <h2>Brand</h2><ul><li><a href="#">Apple (12,000)</a></li>',
      '        <li><a href="#">Samsung (8,500)</a></li></ul>',
      '    </div>',
      '  </div>',
      '  <footer id="glbfooter" role="contentinfo">',
      '    <div><a href="/help/home">Help</a> <a href="#">Community</a> <a href="/sl/sell">Sell</a></div>',
      '    <span>Copyright 1995-2026 eBay Inc. All Rights Reserved.</span>',
      '    <script>!function(e){var r=e.querySelectorAll("img[data-src]");for(var a=0;a<r.length;a++){',
      '      r[a].src=r[a].getAttribute("data-src");}}(document);</script>',
      '  </footer>',
      '</body></html>',
    ];
    const content = htmlLines.join('\n');
    document.body.textContent = content + '\n\n' + content + '\n\n' + content;
  });

  await pause(page, 500);
  // Fast auto-scroll — "wall of noise" effect
  for (let i = 0; i < 25; i++) {
    await page.evaluate(() => window.scrollBy(0, 200));
    await pause(page, 180);
  }

  // ─── SEGMENT B: Toddler Loop UI on eBay (15s) ──────────────────────────
  // Navigate sieve browser to eBay via API, then open TL UI to sieve it.

  await sieveNavigate(EBAY_URL);
  await pause(page, 3000);  // Let eBay load in sieve browser

  // Now open TL UI
  await page.goto(TL_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="url-input"]');
  await pause(page, 1000);

  // Click Sieve button — runs sieve.js on the current page in sieve browser
  await page.locator('[data-testid="btn-sieve"]').click();

  // Wait for elements to load
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="status-indicator"]');
      return el && /\d+\s+element/i.test(el.textContent || '');
    },
    { timeout: 30000 },
  );
  await pause(page, 2000);

  // Show elements — arrow through a few
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('ArrowRight');
    await pause(page, 600);
  }
  await pause(page, 2000);

  // ─── SEGMENT C: Manual classification (15s) ────────────────────────────
  // Classify elements using keyboard shortcuts: c=click, t=type, r=read, x=chrome, .=skip
  // Go back to start
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('ArrowLeft');
    await pause(page, 100);
  }
  await pause(page, 500);

  const classifications = [
    'x', 'x', 'x',           // chrome (header elements)
    'c', 'c',                 // clickable (nav links)
    't',                      // typable (search box)
    'c',                      // clickable (search button)
    'x',                      // chrome
    'r',                      // readable (heading)
    'c',                      // clickable (product link)
    'r',                      // readable (price)
    'c',                      // clickable
    'r',                      // readable (price)
    '.', 'c', 'r',            // skip, click, read
  ];

  for (const key of classifications) {
    await page.keyboard.press(key);
    await pause(page, 350);
  }
  await pause(page, 2000);

  // ─── SEGMENT D: Hold on classified view (5s) ───────────────────────────
  // The TL UI overlay already shows classified elements from segments B/C.
  // Hold this view — it demonstrates the sieve visualization.
  await pause(page, 5000);
});
