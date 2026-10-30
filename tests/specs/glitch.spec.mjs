import { test, expect } from './helpers.mjs';
// Regressions found by the live audit (Oct 30, 2026).

test('order: re-clicking mid-animation never throws', async ({ page, errors }) => {
  test.slow();
  await page.goto('./');
  const go = page.locator('#oGo');
  await expect(go).toBeEnabled({ timeout: 40_000 });
  await go.click();
  await page.waitForTimeout(400);
  await page.locator('#oAgain').evaluate(b => b.click());
  await page.waitForTimeout(300);
  await go.click();
  await page.waitForTimeout(300);
  await go.click();
  await expect(page.locator('#orderOut')).toContainText(/real blocks.*in one line|simulation/, { timeout: 20_000 });
});

test('rendered text uses curly apostrophes (Moose excluded)', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  const bad = await page.evaluate(() => {
    const out = []; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
    while ((t = tw.nextNode())) { const p = t.parentElement; if (!p || p.closest('#moose,script,style,code,pre,noscript')) continue;
      const m = t.textContent.match(/\w'\w|\w'(?=\s)|\s'\w/g); if (m) out.push(t.textContent.trim().slice(0, 60)); }
    document.querySelectorAll('[data-pop]').forEach(e => { if (!e.closest('#moose') && /\w'\w/.test(e.dataset.pop)) out.push(e.dataset.pop.slice(0, 60)); });
    return out;
  });
  expect(bad).toEqual([]);
});
