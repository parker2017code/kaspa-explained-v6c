// Whole-page checks on both viewports: errors, overflow, head tags, axe, links, targets, CLS.
import { test, expect } from './helpers.mjs';
import AxeBuilder from '@axe-core/playwright';

test('loads with zero console errors and live data', async ({ page, errors }) => {
  await page.goto('./');
  await expect(page.locator('#liveSource')).toContainText(/Live from api\.kaspa\.org|Simulation/, { timeout: 20_000 });
  await expect(page.locator('#hudRate')).not.toHaveText('…', { timeout: 20_000 });
  await expect(page.locator('#lfHash')).toHaveText(/PH\/s|EH\/s|not reachable/);
});

test('head: title, description, favicon, lang, viewport', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle(/Kaspa/);
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /.{40,}/);
  await expect(page.locator('link[rel=icon]')).toHaveAttribute('href', /.+/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /width=device-width/);
});

test('no sideways scroll, nothing pokes out of the viewport', async ({ page }) => {
  await page.goto('./');
  await page.locator('#liveSource').filter({ hasText: /Live|Simulation/ }).waitFor();
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out = [...document.querySelectorAll('body *')].filter(e => {
      const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return b.width > 0 && (b.right > w + 1 || b.left < -1) && cs.position !== 'fixed' && !e.closest('.scroll,.sr-only,.skip,.pop');
    }).map(e => e.tagName + '#' + e.id + '.' + e.className);
    return { over: document.documentElement.scrollWidth - w, out };
  });
  expect(r.over).toBe(0);
  expect(r.out).toEqual([]);
});

test('reflow at 320 px and at 200% zoom (720 px)', async ({ page }) => {
  for (const width of [320, 720]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `overflow at ${width}`).toBe(0);
  }
});

for (const [label, prep] of [
  ['default', async () => {}],
  ['nerd mode, light theme', async page => { await page.click('#nerd'); await page.click('#theme'); }],
]) {
  test(`axe: no serious or critical issues (${label})`, async ({ page }) => {
    await page.goto('./');
    await page.locator('#liveSource').filter({ hasText: /Live|Simulation/ }).waitFor();
    await prep(page);
    // Let the hero fade-in finish; axe mid-transition reads half-opacity text as low contrast.
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
    const res = await new AxeBuilder({ page }).analyze();
    const bad = res.violations.filter(v => ['serious', 'critical'].includes(v.impact))
      .map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
    expect(bad).toEqual([]);
  });
}

test('links: no empty or placeholder hrefs, in-page anchors resolve', async ({ page }) => {
  await page.goto('./');
  const bad = await page.evaluate(() => [...document.querySelectorAll('a')].filter(a => {
    const h = a.getAttribute('href');
    if (!h || h === '#' || /^javascript:/i.test(h) || /example\.com|TODO|lorem/i.test(h)) return true;
    if (h.startsWith('#')) return !document.getElementById(h.slice(1));
    return false;
  }).map(a => a.outerHTML.slice(0, 120)));
  expect(bad).toEqual([]);
});

test('local files linked from the page exist', async ({ page, request }) => {
  await page.goto('./');
  const hrefs = await page.$$eval('a[href^="files/"]', as => as.map(a => a.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const h of hrefs) expect((await request.head(h)).status(), h).toBe(200);
});

test('controls are at least 24 px, or have a hit area that is', async ({ page }) => {
  await page.goto('./');
  const small = await page.evaluate(() => [...document.querySelectorAll('button,summary,input,select,textarea,.btn,.dots a')].filter(e => {
    const b = e.getBoundingClientRect(); if (!b.width || !b.height) return false;
    const after = getComputedStyle(e, '::after'), before = getComputedStyle(e, '::before');
    const pad = (s, a, z) => s.content !== 'none' && s.position === 'absolute' ? Math.max(0, -parseFloat(s[a] || 0)) + Math.max(0, -parseFloat(s[z] || 0)) : 0;
    const h = b.height + Math.max(pad(after, 'top', 'bottom'), pad(before, 'top', 'bottom'));
    const w = b.width + Math.max(pad(after, 'left', 'right'), pad(before, 'left', 'right'));
    return h < 24 || w < 24;
  }).map(e => e.tagName + '#' + e.id + ' ' + (e.textContent || '').trim().slice(0, 20)));
  expect(small).toEqual([]);
});

test('layout does not shift late (CLS under 0.1)', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('./');
  await page.locator('#liveSource').filter({ hasText: /Live|Simulation/ }).waitFor();
  await expect.poll(() => page.evaluate(() => document.getElementById('hudRate').textContent)).not.toBe('…');
  expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.1);
});
