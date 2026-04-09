/**
 * Playwright config for LeftGlove demo video recording.
 *
 * Expects services running (via bin/demo-run):
 *   Demo app:  http://localhost:3000
 *   TL UI:     http://localhost:8080
 *   Sieve:     http://localhost:3333
 *
 * Run: make demo-browser
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: __dirname || '.',
  testMatch: ['browser-tour.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 480000,
  use: {
    baseURL: 'http://localhost:8080',
    viewport: { width: 1920, height: 1080 },
    headless: true,
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 },
    },
    launchOptions: {
      args: ['--disable-infobars', '--no-sandbox'],
    },
  },
});
