// Source checks that need no browser: Moose untouched, American English, no placeholder copy.
import { test, expect } from '@playwright/test';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const fx = f => fs.readFileSync(path.join(import.meta.dirname, '../fixtures', f), 'utf8');

test('Moose section HTML is byte-for-byte v5', () => {
  expect(read('index.html').includes(fx('moose-v5.html'))).toBe(true);
});
test('Moose CSS is byte-for-byte v5', () => {
  expect(read('css/site.css').includes(fx('moose-v5.css'))).toBe(true);
});
test('Moose files are byte-for-byte v5', () => {
  for (const line of fx('files-v5.sha256').trim().split('\n')) {
    const [hash, name] = line.split(/\s+/);
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'files', name))).digest('hex');
    expect(h, name).toBe(hash);
  }
});

const BRIT = /\b(\w*(colour|favour|honour|behaviour|neighbour|flavour|rumour)\w*|\w+(isation|ising)|\w+(ised|ises)|centre\w*|metres?|litres?|maths|modell\w+|labell\w+|travell\w+|cancell\w+|signall\w+|defence|licence|grey|programme|catalogue|whilst|amongst|learnt|spelt|cheque|tyre|aluminium|sceptic\w*|fortnight|judgement|ageing|organis\w+|realis\w+|recognis\w+|optimis\w+|specialis\w+|visualis\w+|summaris\w+|prioritis\w+)\b/gi;
const OK = new Set(['labelledby', 'raised', 'rises', 'promised', 'advised', 'surprised', 'compromised', 'revised', 'premises', 'promises', 'exercises', 'surprises', 'enterprises', 'comprised', 'comprises', 'advertised', 'praised', 'noises', 'cruises', 'raises', 'arises', 'devised', 'supervised', 'improvised', 'televised', 'precised']);
test('American English in visible copy and scripts (Moose excluded)', () => {
  let html = read('index.html');
  const i = html.indexOf('id="moose"'); html = html.slice(0, i) + html.slice(html.indexOf('</section>', i));
  const hits = [];
  for (const [f, t] of [['index.html', html], ...['js/site.js', 'js/live.js', 'js/collision-sim.js'].map(f => [f, read(f)])]) {
    for (const m of t.matchAll(BRIT)) if (!OK.has(m[0].toLowerCase())) hits.push(f + ': ' + m[0]);
    for (const m of t.matchAll(/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}\b/g)) hits.push(f + ': date ' + m[0]);
    if (/en-GB/.test(t)) hits.push(f + ': en-GB locale');
  }
  expect(hits).toEqual([]);
});
test('no placeholder copy', () => {
  const t = read('index.html');
  expect(t).not.toMatch(/lorem ipsum|TODO|FIXME|\{\{|href="#"/i);
});
