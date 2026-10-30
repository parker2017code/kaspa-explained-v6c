// States: API down (simulation fallback), reduced motion, long-running idle demo.
import { test as base, expect } from '@playwright/test';
import { offline } from './helpers.mjs';

const test = base.extend({
  pageErrors: async ({ page }, use) => {
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    // with the APIs blocked, only the blocked requests themselves may log
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errs.push(m.text()); });
    await use(errs);
    expect(errs).toEqual([]);
  },
});

test('API unreachable: labeled simulation, honest fallbacks, no script errors', async ({ page, pageErrors }) => {
  await offline(page);
  await page.goto('./');
  await expect(page.locator('#liveSource')).toContainText('Simulation');
  await expect(page.locator('#coldOpen')).not.toContainText('real Kaspa blocks');
  await expect(page.locator('#lfHash')).toHaveText('not reachable');
  await expect(page.locator('#lfSupply')).toHaveText('not reachable');
  await expect(page.locator('#tOut')).toContainText('could not be reached', { timeout: 20_000 });
  await expect(page.locator('#orderOut')).toContainText(/simulation/, { timeout: 30_000 });
  // every toy still works without the network
  await page.locator('#c3').scrollIntoViewIfNeeded();
  await page.click('#gHide');
  await expect(page.locator('#gOut')).toContainText(/went dark|Mining in secret/);
  await page.click('#dGo'); await page.click('#dFast');
  await expect(page.locator('#dBout')).toContainText('Settled', { timeout: 15_000 });
});

test('idle ghost demo keeps running past its history cap', async ({ page, pageErrors }) => {
  await offline(page);
  await page.clock.install();
  await page.goto('./');
  await page.locator('#c3').scrollIntoViewIfNeeded();
  await page.clock.runFor(120_000);
  await expect(page.locator('#gOut')).not.toContainText('enough history');
  await page.click('#gHide');
  await page.clock.runFor(5_000);
  await expect(page.locator('#gOut')).toContainText('Mining in secret');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('loads, toys give results without animating', async ({ page, pageErrors }) => {
    await page.goto('./');
    await page.locator('#c3').scrollIntoViewIfNeeded();
    await page.click('#gHide');
    await expect(page.locator('#gOut')).toContainText('Mining in secret');
    await page.locator('#coinsMore summary').click();
    await page.click('#coinsGo');
    await expect(page.locator('#coinsOut')).toContainText('They landed in the order');
    const anims = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length);
    expect(anims).toBe(0);
  });
});
