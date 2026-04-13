// Quick script to create an eBay fixture by navigating, sieving,
// auto-classifying, and exporting the state.
//
// Usage: npx playwright test create-ebay-fixture.ts --timeout 600000

import * as fsSync from 'fs';
import * as path from 'path';
import { test, type Page } from '@playwright/test';

const SIEVE_URL = 'http://localhost:3333';
const TL_URL = 'http://localhost:8080';
const EBAY_URL = 'https://www.ebay.com/sch/i.html?_nkw=wireless+earbuds&_sop=15';

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

async function waitForAutoComplete(page: Page, timeoutMs = 600000) {
  await page.waitForFunction(
    () => {
      const mode = document.querySelector('[data-testid="mode-indicator"]')?.textContent ?? '';
      return /review/i.test(mode);
    },
    { timeout: timeoutMs },
  );
}

test('Create eBay fixture', async ({ page }) => {
  await page.goto(`${TL_URL}?api=${SIEVE_URL}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="url-input"]');

  // Navigate to eBay
  await page.fill('[data-testid="url-input"]', EBAY_URL);
  await pause(page, 500);
  await page.click('[data-testid="btn-navigate"]');
  console.log('Navigating to eBay...');

  // Wait for sieve, then handle interstitial
  await waitForSieve(page);
  console.log('Initial sieve done, waiting for interstitial...');
  await pause(page, 5000);

  // Re-sieve after interstitial clears
  await page.click('[data-testid="btn-sieve"]');
  await waitForSieve(page);

  const countText = await page.textContent('[data-testid="status-indicator"]') ?? '';
  console.log('Sieve result:', countText);

  // Auto-classify
  console.log('Starting auto-classify...');
  await page.click('[data-testid="btn-auto-classify"]');
  await waitForAutoComplete(page);
  console.log('Auto-classify complete!');

  await pause(page, 2000);

  // Export the state by clicking Export button
  // The Export button triggers a download. Instead, let's grab the state directly.
  const fixture = await page.evaluate(() => {
    // Access the app's export function
    return (window as any).testAPI?.exportState?.() ?? null;
  });

  if (fixture) {
    const outPath = path.join(__dirname, 'fixtures', 'ebay-search.json');
    fsSync.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
    console.log(`Fixture saved: ${outPath}`);
  } else {
    // Try the Export button approach - intercept the download
    console.log('testAPI.exportState not available, trying Export button...');

    // Use page.evaluate to get the intermediate format directly
    const state = await page.evaluate(() => {
      const app = document.querySelector('#app') as any;
      // Try to get the state from the app's internal state
      const inventory = (window as any).__inventory;
      const classifications = (window as any).__classifications;
      return { inventory, classifications };
    });

    // Click Export and capture the download
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="btn-export"]'),
    ]);

    const downloadPath = path.join(__dirname, 'fixtures', 'ebay-search.json');
    await download.saveAs(downloadPath);
    console.log(`Fixture saved via download: ${downloadPath}`);
  }
});
