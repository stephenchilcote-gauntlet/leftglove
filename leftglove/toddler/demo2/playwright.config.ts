/**
 * Playwright config for LeftGlove + OpenClaw hype demo.
 *
 * Expects services running (via bin/demo-run):
 *   TL UI:     http://localhost:8080
 *   Sieve:     http://localhost:3333
 *
 * Run: make demo2-browser
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: __dirname || '.',
  testMatch: ['browser-tour.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 900000,
  use: {
    baseURL: 'http://localhost:8080',
    viewport: { width: 1920, height: 1080 },
    headless: true,
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 },
    },

    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    launchOptions: {
      args: [
        '--disable-infobars',
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    },
  },
});
