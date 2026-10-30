// User flows as ground truth: every expander, every button, each toy, keyboard.
import { test, expect, setRange } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.locator('#liveSource').filter({ hasText: /Live|Simulation/ }).waitFor({ timeout: 20_000 });
});

test('every expander opens and shows content', async ({ page, errors }) => {
  const n = await page.locator('details').count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) {
    const d = page.locator('details').nth(i);
    await d.locator('summary').click();
    await expect(d).toHaveAttribute('open', '');
    await expect(d.locator('.in').first()).toBeVisible();
  }
});

test('nerd mode opens every nerd expander and shows secondary controls; off closes them', async ({ page, errors }) => {
  await page.click('#nerd');
  await expect(page.locator('#nerd')).toHaveAttribute('aria-pressed', 'true');
  const nerd = page.locator('details.nerd');
  for (const d of await nerd.all()) await expect(d).toHaveAttribute('open', '');
  await page.click('#nerd');
  for (const d of await nerd.all()) await expect(d).not.toHaveAttribute('open', '');
});

test('theme toggle flips and keeps the coins result', async ({ page, errors }) => {
  await page.locator('#coinsMore summary').click();
  await page.click('#coinsGo');
  await expect(page.locator('#coinsOut')).toContainText('They landed in the order');
  const before = await page.locator('#coinsCanvas').screenshot();
  await page.click('#theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.click('#theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const after = await page.locator('#coinsCanvas').screenshot();
  expect(after.equals(before), 'coins canvas reset by redraw').toBe(true);
});

test('collision toy: sliders change the readouts', async ({ page, errors }) => {
  const rate = page.locator('#cs-rateVal');
  const r0 = await rate.textContent();
  await setRange(page, '#cs-rate', 100);
  await expect(rate).not.toHaveText(r0);
  await expect(page.locator('#cs-resultLine')).toContainText('%');
});

test('order: line up real blocks', async ({ page, errors }) => {
  test.slow();
  const go = page.locator('#oGo');
  await expect(go).toBeEnabled({ timeout: 40_000 });
  await go.click();
  await expect(page.locator('#orderOut')).toContainText(/real blocks.*in one line|simulation/, { timeout: 20_000 });
  await page.click('#oAgain');
  await expect(page.locator('#orderOut')).toContainText('fresh ten seconds');
});

test('ghost: hide, release, verdict; reset works', async ({ page, errors }) => {
  await page.locator('#c3').scrollIntoViewIfNeeded();
  await page.click('#gHide');
  await expect(page.locator('#gOut')).toContainText(/went dark|Mining in secret/);
  await expect(page.locator('#gRelease')).toBeEnabled({ timeout: 15_000 });
  await page.waitForFunction(() => /Mining in secret: [3-9]/.test(document.getElementById('gOut').textContent), null, { timeout: 20_000 });
  await page.click('#gRelease');
  await expect(page.locator('#gOut')).toContainText(/came out red|Too short|isn’t an attack/);
  await expect(page.locator('#gHide')).toBeEnabled();
  await page.click('#gReset');
  await expect(page.locator('#gOut')).toContainText('Honest miners are working');
});

test('duel: pay twice, fast-forward settles in six blocks, one loop only', async ({ page, errors }) => {
  await page.locator('#c4').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    window.__raf = 0; const o = window.requestAnimationFrame;
    window.requestAnimationFrame = f => o(t => { window.__raf++; f(t); });
  });
  await page.click('#dGo');
  await page.click('#dGo');
  await page.click('#dGo');
  await page.evaluate(() => { window.__raf = 0; });
  await page.waitForTimeout(1000); // measuring frame count over one second needs a fixed window
  const perSec = await page.evaluate(() => window.__raf);
  await page.click('#dFast');
  await expect(page.locator('#dBout')).toContainText('Settled', { timeout: 15_000 });
  await expect(page.locator('#dKout')).toContainText('Done');
  // other loops on the page (hero, sims) also use rAF; three stacked duel loops would add ~120+/s
  const idle = await page.evaluate(async () => { window.__raf = 0; await new Promise(r => setTimeout(r, 1000)); return window.__raf; });
  expect(perSec - idle).toBeLessThan(90);
});

test('race: stronger attacker needs more Bitcoin blocks (monotonic)', async ({ page, errors }) => {
  await page.click('#nerd');
  const blocks = [];
  for (const q of [5, 10, 20, 30, 40, 45]) {
    await setRange(page, '#qIn', q);
    const t = await page.locator('#raceOut').textContent();
    blocks.push(+t.match(/needs (\d+) blocks/)[1]);
  }
  for (let i = 1; i < blocks.length; i++) expect(blocks[i]).toBeGreaterThanOrEqual(blocks[i - 1]);
});

test('emission: rate never rises and supply never falls across the slider; max under 28.7B', async ({ page, errors }) => {
  const min = +(await page.locator('#yIn').getAttribute('min'));
  let lastRate = Infinity, lastSupply = 0;
  for (let y = min; y <= 2040; y += 0.5) {
    await setRange(page, '#yIn', y.toFixed(4));
    const t = await page.locator('#emitOut').textContent();
    const rate = +t.match(/about ([\d.,]+) KAS a second/)[1].replace(/,/g, '');
    const sup = +t.match(/about ([\d.,]+) billion/)[1];
    expect(rate).toBeLessThanOrEqual(lastRate + 1e-9);
    expect(sup).toBeGreaterThanOrEqual(lastSupply);
    expect(sup).toBeLessThanOrEqual(28.70); // maxSupply 28.704B (api.kaspa.org/info/coinsupply), shown to two decimals
    lastRate = rate; lastSupply = sup;
  }
});

test('emission: chart starts at today, not a frozen past', async ({ page, errors }) => {
  const min = +(await page.locator('#yIn').getAttribute('min'));
  const now = new Date(); const yNow = now.getUTCFullYear() + now.getUTCMonth() / 12;
  expect(min).toBeGreaterThan(yNow - 0.25);
});

test('miners: fee share is consistent with the two daily numbers', async ({ page, errors }) => {
  for (const [tps, fee] of [['10', '0.001'], ['300', '0.01']]) {
    await setRange(page, '#tpsIn', tps); await setRange(page, '#feeIn', fee);
    const t = await page.locator('#minersOut').textContent();
    const [sub, fees] = [...t.matchAll(/([\d,]+) KAS/g)].map(m => +m[1].replace(/,/g, ''));
    const pct = +t.match(/([\d.]+)%/)[1];
    expect(Math.abs(pct - fees / (sub + fees) * 100)).toBeLessThan(0.1);
  }
});

test('vault: every move gives its own verdict', async ({ page, errors }) => {
  const seen = new Set();
  for (const b of await page.locator('[data-try]').all()) { await b.click(); seen.add(await page.locator('#vaultOut').textContent()); }
  expect(seen.size).toBe(await page.locator('[data-try]').count());
});

test('lookup: rejects bad ids, reads a mocked transaction', async ({ page, errors }) => {
  await page.fill('#txIn', 'nope'); await page.click('#txGo');
  await expect(page.locator('#txOut')).toContainText("doesn’t look like a transaction id");
  const id = 'a'.repeat(64);
  await page.route('**/transactions/' + id + '*', r => r.fulfill({ json: { is_accepted: true, block_time: 1761800000000, outputs: [{ amount: 150000000 }] } }));
  await page.fill('#txIn', id); await page.click('#txGo');
  await expect(page.locator('#txOut')).toContainText('Accepted');
  await expect(page.locator('#txOut')).toContainText('1.5000 KAS');
});

test('copy button confirms', async ({ page, context, errors }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.fill('#mine', 'Two sentences.');
  await page.click('#copy');
  await expect(page.locator('#copyOut')).toHaveText(/Copied|Selected/);
});

test('no dead buttons: every visible button changes something', async ({ page, errors }) => {
  await page.click('#nerd'); // shows every control
  const ids = await page.$$eval('main button:not([disabled]):not([hidden]):not(#nerd)', bs => bs.filter(b => b.offsetParent).map((b, i) => b.id || (b.dataset.try ? '[data-try=' + b.dataset.try + ']' : '')).filter(Boolean));
  const dead = [];
  for (const id of ids) {
    const sel = id.startsWith('[') ? id : '#' + id;
    const snap = () => page.evaluate(() => document.querySelector('main').innerText + '|' + [...document.querySelectorAll('main [aria-pressed],main [aria-expanded],main button')].map(e => e.getAttribute('aria-pressed') + e.getAttribute('aria-expanded') + e.disabled + e.hidden).join());
    const el = page.locator(sel).first();
    if (!(await el.isVisible())) continue; // an earlier button hid it (e.g. Nerd mode off)
    const a = await snap();
    await el.click();
    try { await expect.poll(snap, { timeout: 3_000 }).not.toBe(a); } catch { dead.push(sel); }
  }
  expect(dead).toEqual([]);
});

test('keyboard: tabbing shows a visible focus ring', async ({ page, errors }) => {
  const missing = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const e = document.activeElement; if (!e || e === document.body) return null;
      const s = getComputedStyle(e);
      const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
      return ring ? null : e.tagName + '#' + e.id + ' ' + (e.textContent || '').trim().slice(0, 20);
    });
    if (r) missing.push(r);
  }
  expect(missing).toEqual([]);
});

test('popover: opens on click, describes its button, closes on Escape', async ({ page, errors }) => {
  const b = page.locator('[data-pop]').first();
  await b.scrollIntoViewIfNeeded();
  await b.click();
  await expect(page.locator('.pop')).toBeVisible();
  await expect(b).toHaveAttribute('aria-expanded', 'true');
  await expect(b).toHaveAttribute('aria-describedby', 'pop');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pop')).toHaveCount(0);
});
