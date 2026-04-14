// overlay-inject.ts — Inject sieve.js into a real page and render SVG overlays
//
// Usage:
//   import { sieveAndOverlay, clearOverlay, loadSieveSource } from './overlay-inject';
//   const sieveSource = loadSieveSource();
//   const result = await sieveAndOverlay(page, sieveSource);
//   await clearOverlay(page);

import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';

const CATEGORY_COLORS: Record<string, string> = {
  clickable: '#22c55e',
  typable:   '#3b82f6',
  readable:  '#eab308',
  chrome:    '#6b7280',
  custom:    '#a855f7',
  split:     '#f97316',
};

export interface SieveResult {
  elementCount: number;
  categories: Record<string, number>;
}

/** Read sieve.js source from the shiftlefter resources directory. Call once at startup. */
export function loadSieveSource(): string {
  const sievePath = path.resolve(__dirname, '..', '..', '..', '..', 'shiftlefter', 'resources', 'sieve.js');
  return fs.readFileSync(sievePath, 'utf-8');
}

/** Inject sieve.js into the page and render colored SVG overlays on detected elements. */
export async function sieveAndOverlay(
  page: Page,
  sieveSource: string,
  options: {
    showLabels?: boolean;
    skipChrome?: boolean;
    fadeIn?: boolean;
  } = {},
): Promise<SieveResult> {
  const { showLabels = true, skipChrome = true, fadeIn = true } = options;

  // Step 1: Run sieve.js — returns the page inventory
  const inventory = await page.evaluate(sieveSource).catch(() => ({ elements: [] }));

  if (!(inventory as any).elements?.length) {
    return { elementCount: 0, categories: {} };
  }

  // Step 2: Render overlay
  const result = await page.evaluate(
    ({ elements, colors, showLabels, skipChrome, fadeIn }) => {
      // Remove existing overlay if present
      const existing = document.getElementById('sieve-overlay');
      if (existing) existing.remove();

      const scrollW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      const scrollH = Math.max(document.documentElement.scrollHeight, window.innerHeight);

      // Build SVG content
      const rects: string[] = [];
      const cats: Record<string, number> = {};
      let rendered = 0;

      for (const el of elements) {
        cats[el.category] = (cats[el.category] || 0) + 1;

        if (skipChrome && (el.category === 'chrome' || el.category === 'skip')) continue;
        if (!el.rect || el.rect.w < 3 || el.rect.h < 3) continue;

        const color = colors[el.category] || '#888888';
        const { x, y, w, h } = el.rect;

        rects.push(
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" ` +
          `fill="${color}22" stroke="${color}" stroke-width="2" rx="3"/>`,
        );

        if (showLabels && el.label) {
          const label = String(el.label).slice(0, 30);
          const fontSize = Math.min(12, Math.max(9, h * 0.4));
          rects.push(
            `<text x="${x + 3}" y="${y - 4}" ` +
            `font-family="monospace" font-size="${fontSize}px" font-weight="bold" ` +
            `fill="white" style="text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.7);"` +
            `>${label.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`,
          );
        }

        rendered++;
      }

      // Create container
      const container = document.createElement('div');
      container.id = 'sieve-overlay';
      container.style.cssText = [
        'position: absolute',
        'top: 0',
        'left: 0',
        `width: ${scrollW}px`,
        `height: ${scrollH}px`,
        'pointer-events: none',
        'z-index: 2147483647',
        fadeIn ? 'opacity: 0; transition: opacity 0.6s ease-in' : '',
      ].filter(Boolean).join('; ');

      container.innerHTML =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${scrollW}" height="${scrollH}" ` +
        `viewBox="0 0 ${scrollW} ${scrollH}" style="position:absolute;top:0;left:0;">` +
        rects.join('\n') +
        `</svg>`;

      document.body.appendChild(container);

      // Trigger fade-in
      if (fadeIn) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            container.style.opacity = '1';
          });
        });
      }

      return { rendered, cats };
    },
    {
      elements: (inventory as any).elements || [],
      colors: CATEGORY_COLORS,
      showLabels,
      skipChrome,
      fadeIn,
    },
  );

  return {
    elementCount: (inventory as any).elements?.length || 0,
    categories: result.cats,
  };
}

/** Remove the sieve overlay from the page. */
export async function clearOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('sieve-overlay');
    if (el) el.remove();
  });
}

/** Highlight specific elements by adding a pulsing animation to matching rects. */
export async function highlightElements(
  page: Page,
  sieveSource: string,
  matchFn: string, // Serialized function body: (el) => boolean
): Promise<number> {
  const inventory = await page.evaluate(sieveSource);
  const count = await page.evaluate(
    ({ elements, matchFnBody }) => {
      const overlay = document.getElementById('sieve-overlay');
      if (!overlay) return 0;
      const svg = overlay.querySelector('svg');
      if (!svg) return 0;

      // Add pulse animation style if not already present
      if (!document.getElementById('sieve-pulse-style')) {
        const style = document.createElement('style');
        style.id = 'sieve-pulse-style';
        style.textContent = `
          @keyframes sieve-pulse {
            0%, 100% { stroke-width: 2; opacity: 1; }
            50% { stroke-width: 5; opacity: 0.8; }
          }
        `;
        document.head.appendChild(style);
      }

      const matchFn = new Function('el', matchFnBody);
      let highlighted = 0;

      for (const el of elements) {
        if (el.category === 'chrome' || el.category === 'skip') continue;
        if (!el.rect || !matchFn(el)) continue;

        const { x, y, w, h } = el.rect;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));
        rect.setAttribute('fill', 'rgba(255, 200, 0, 0.15)');
        rect.setAttribute('stroke', '#ffc800');
        rect.setAttribute('stroke-width', '4');
        rect.setAttribute('rx', '3');
        rect.style.animation = 'sieve-pulse 1.5s ease-in-out infinite';
        svg.appendChild(rect);
        highlighted++;
      }

      return highlighted;
    },
    { elements: (inventory as any).elements || [], matchFnBody: matchFn },
  );

  return count;
}
