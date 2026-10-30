// Glitch hunt: node tools/hunt.mjs <url> <outdir> [--offline]
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
const [url, out, flag] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const report = {};
for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: name === 'mobile', hasTouch: name === 'mobile' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errs.push('reqfail: ' + r.url()));
  if (flag === '--offline') await page.route(/api\.kaspa\.org|mempool\.space/, r => r.abort());
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(20000);
  const r = { errs };
  r.overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  r.wide = await page.evaluate(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > w + 1 || b.left < -1) && getComputedStyle(e).position !== 'fixed' && !e.closest('.scroll,.sr-only,.skip'); }).slice(0, 15).map(e => e.tagName + '#' + e.id + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)); });
  r.small = await page.evaluate(() => [...document.querySelectorAll('button,a,input,summary')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height && (b.height < 24 || b.width < 24) && !e.closest('.sr-only'); }).map(e => e.tagName + ' ' + (e.id || e.textContent.trim().slice(0, 20)) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)).slice(0, 30));
  r.texts = await page.evaluate(() => Object.fromEntries(['hudRate','hudPar','hudSeen','btcScale','btcScaleNote','liveSource','lfScore','lfHash','lfSupply','emitLive','emitOut','yVal','minersOut','raceOut','tK','tB','tOut','orderOut','gOut','dKout','dBout'].map(id => [id, document.getElementById(id)?.textContent])));
  const ax = await new AxeBuilder({ page }).analyze();
  r.axe = ax.violations.map(v => v.id + ' (' + v.impact + ') x' + v.nodes.length + ': ' + v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | '));
  await page.screenshot({ path: `${out}/${name}-hero.png` });
  for (const id of ['c1','c2','c3','c4','c5','c6','c7','c8','moose','tally','finish']) {
    await page.locator('#' + id).scrollIntoViewIfNeeded();
    await page.evaluate(id => document.getElementById(id).scrollIntoView({ block: 'start' }), id);
    await page.waitForTimeout(700);
    await page.locator('#' + id).screenshot({ path: `${out}/${name}-${id}.png` });
  }
  report[name] = r;
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
