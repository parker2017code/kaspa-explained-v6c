import { test as base, expect } from '@playwright/test';
// Fails any test that logs a console error, a page error, or a failed same-origin request.
export const test = base.extend({
  errors: async ({ page }, use) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('requestfailed', r => { if (r.url().startsWith(page.url().split('/').slice(0, 3).join('/')) && !r.url().includes('/files/')) errors.push('requestfailed: ' + r.url()); });
    await use(errors);
    expect(errors, 'console/page errors').toEqual([]);
  },
});
export { expect };
export const offline = page => page.route(/api\.kaspa\.org|mempool\.space/, r => r.abort());

// Range inputs reject fill() for off-step values; set like a user drag would.
export async function setRange(page, sel, v) {
  await page.locator(sel).evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
}
