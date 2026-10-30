/* Live Kaspa feed (read-only, api.kaspa.org) + the hero DAG and the real-order stage. */
(function () {
  'use strict';
  var API = 'https://api.kaspa.org';
  var $ = function (id) { return document.getElementById(id); };
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = function (v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); };
  var fmt = function (n, d) { return n.toLocaleString('en-US', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }); };
  var L = window.KLive = { times: [], blocks: new Map(), ok: false, failed: false, newest: 0, daa: null, subs: [], sim: false };
  function j(u) { return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function markChain() { if (!L.chain) return; var s = L.chain().set; L.blocks.forEach(function (b) { b.chain = s.has(b.h); }); }
  function emit() { markChain(); L.subs.forEach(function (f) { try { f(); } catch (e) {} }); }

  /* Lanes: each block gets a vertical slot that is free near its timestamp. */
  var LANES = 18, laneBusy = [];
  function lane(t, h) {
    var seed = parseInt(h.slice(0, 6), 16) % LANES, best = -1;
    for (var k = 0; k < LANES; k++) {
      var c = (seed + (k % 2 ? 1 : -1) * Math.ceil(k / 2) + LANES * 4) % LANES;
      if (!laneBusy[c] || Math.abs(laneBusy[c] - t) > 260) { best = c; break; }
    }
    if (best < 0) best = seed;
    laneBusy[best] = t; return best;
  }
  function ingest(b) {
    var v = b.verboseData, h = b.header, o = L.blocks.get(v.hash);
    if (o) { o.chain = !!v.isChainBlock; o.blues = v.mergeSetBluesHashes || []; o.reds = v.mergeSetRedsHashes || []; return false; }
    var t = +h.timestamp;
    L.blocks.set(v.hash, { h: v.hash, t: t, bs: +v.blueScore, p: (h.parents && h.parents[0]) ? h.parents[0].parentHashes : [], sp: v.selectedParentHash,
      chain: !!v.isChainBlock, blues: v.mergeSetBluesHashes || [], reds: v.mergeSetRedsHashes || [], bw: h.blueWork || '0', tx: (v.transactionIds || []).length, lane: lane(t, v.hash), jit: (parseInt(v.hash.slice(6, 10), 16) / 65535 - 0.5) * 0.7 });
    if (t > L.newest) L.newest = t;
    L.times.push(t);
    if (!L.first || t < L.first) L.first = t;
    return true;
  }
  function prune() { var cut = L.newest - 120000; L.blocks.forEach(function (b, k) { if (b.t < cut) { if (b.t >= arrived) L.prunedSince++; L.blocks.delete(k); } }); }

  /* Streaming budget: full blocks are about 30 kB each, so the feed runs while
     the page is visible and pauses itself after a while. */
  var BUDGET = innerWidth < 700 ? 45000 : 120000, streamedMs = 0, lastTick = performance.now(), paused = false, busy = false;
  function visible() { return document.visibilityState === 'visible'; }
  var arrived = Date.now(), maxDaa = 0;
  function bigw(b) { try { return BigInt('0x' + (b.bw || '0')); } catch (e) { return 0n; } }
  /* The selected chain: walk selected parents back from the heaviest known tip. */
  L.chain = function () {
    var top = null; L.blocks.forEach(function (b) { if (!top || bigw(b) > bigw(top)) top = b; });
    var set = new Set(), list = [], c = top;
    while (c) { set.add(c.h); list.push(c); c = L.blocks.get(c.sp); }
    return { set: set, list: list.reverse() };
  };
  L.stats = function () {
    /* The newest few seconds are still arriving, so measure the 30 s before them. */
    var hi = L.newest - 3000, lo = Math.max(hi - 30000, L.first + 2000), n = 0, par = 0;
    L.blocks.forEach(function (b) { if (b.t > lo && b.t <= hi) { n++; par += b.p.length; } });
    var span = (hi - lo) / 1000;
    return { rate: span > 4 ? n / span : null, par: n ? par / n : null, seen: countSince(arrived) };
  };
  function countSince(t) { return L.countSince(t); }
  L.prunedSince = 0; L.countSince = function (t) { var n = 0; for (var i = L.times.length - 1; i >= 0; i--) if (L.times[i] >= t) n++; return n; };
  function lowHash() {
    /* Newest chain block we already hold, a few back so nothing between polls is missed. */
    var ch = L.chain().list; return ch.length > 4 ? ch[ch.length - 4].h : null;
  }
  function boot() {
    return j(API + '/info/virtual-chain-blue-score').then(function (r) {
      return j(API + '/blocks-from-bluescore?blueScoreGte=' + (r.blueScore - 60) + '&includeTransactions=false');
    }).then(function (r) { return r[0].verboseData.hash; });
  }
  function cycle() {
    var now = performance.now(); if (visible() && !paused) streamedMs += now - lastTick; lastTick = now;
    if (streamedMs > BUDGET && !paused) { paused = true; setSource(); }
    if (busy || !visible() || paused || L.sim) return;
    busy = true;
    var lh = lowHash();
    (lh ? Promise.resolve(lh) : boot()).then(function (h) {
      return j(API + '/blocks?lowHash=' + h + '&includeBlocks=true&includeTransactions=false');
    }).then(function (r) {
      (r.blocks || []).forEach(function (b) { if (ingest(b) && b.verboseData.hash) { var d = +b.header.daaScore; if (d > maxDaa) maxDaa = d; } });
      L.daa = maxDaa; prune(); L.ok = true; L.failed = false;
    }).catch(function (e) { if (!L.ok) { L.failed = true; startSim(); } })
      .then(function () { busy = false; setSource(); emit(); });
  }
  function setSource() {
    var s = $('liveSource'); if (!s) return;
    if (L.sim) { s.textContent = 'Simulation: the live network could not be reached from your browser.'; return; }
    if (!L.ok) return;
    s.innerHTML = paused ? 'Live feed paused to save data (about 0.3 MB a second). <button type="button" class="link" id="resume">Resume</button>'
      : 'Live from api.kaspa.org, shown a few seconds behind real time.';
    var r = $('resume'); if (r) r.addEventListener('click', function () { paused = false; streamedMs = 0; setSource(); });
  }
  /* Fallback only if the API is unreachable: a labeled simulation at 10 blocks a second. */
  var simTimer = null;
  function startSim() {
    if (simTimer) return; L.sim = true;
    var hex = function () { var s = ''; for (var i = 0; i < 64; i++) s += '0123456789abcdef'[Math.random() * 16 | 0]; return s; };
    var t = Date.now();
    simTimer = setInterval(function () {
      t += 100;
      var recent = []; L.blocks.forEach(function (b) { if (b.t > t - 700) recent.push(b.h); });
      var h = hex(); L.blocks.set(h, { h: h, t: t, bs: 0, p: recent.slice(-10), sp: recent[recent.length - 1], chain: false, blues: [], reds: [], bw: '0', tx: 0, lane: lane(t, h) });
      L.newest = t; prune();
    }, 100);
  }
  setInterval(cycle, 2000); cycle();
  document.addEventListener('visibilitychange', function () { lastTick = performance.now(); if (visible()) cycle(); });

  /* Sound: off by default, one soft tick per block as it appears. */
  var ac = null, soundOn = false, lastBeep = 0;
  var sBtn = $('sound');
  if (sBtn) sBtn.addEventListener('click', function () {
    soundOn = !soundOn; sBtn.setAttribute('aria-pressed', String(soundOn));
    if (soundOn && !ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  });
  function tick(chain) {
    if (!soundOn || !ac) return; var n = ac.currentTime; if (n - lastBeep < 0.03) return; lastBeep = n;
    var o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = chain ? 660 : 1320; g.gain.setValueAtTime(0.0001, n); g.gain.exponentialRampToValueAtTime(0.04, n + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, n + 0.06);
    o.connect(g); g.connect(ac.destination); o.start(n); o.stop(n + 0.07);
  }

  function fit(c) {
    var dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g: g, w: w, h: h };
  }

  /* Hero: real blocks scroll in at the pace they were mined. */
  var hero = $('liveDag'), renderT = 0, lastF = 0, appeared = new Set(), heroOn = true, seenCount = 0;
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { heroOn = e[0].isIntersecting; if (heroOn && !reduced) requestAnimationFrame(frame); }).observe(hero);
  function layout(w, h, pps, top, bottom) {
    var c = (top + h - bottom) / 2, half = (h - bottom - top) / 2, gap = Math.min(22, half * 0.18), bd = (half - gap) / 8.6;
    return { x: function (t) { return w - 40 - (renderT - t) * pps / 1000; }, c: c,
      y: function (l, b) {
        var side = l < 9 ? -1 : 1, k = l < 9 ? 8 - l : l - 9, ly = c + side * (gap + (k + 0.5 + (b && b.jit || 0)) * bd);
        var yk = b && b.yk || 0; return ly + (c - ly) * yk;
      } };
  }
  function drawDag(g, w, h, opt) {
    var pps = opt.pps, lay = layout(w, h, pps, opt.top, opt.bottom), size = opt.size;
    var list = []; L.blocks.forEach(function (b) { if (b.t <= renderT && lay.x(b.t) > -30) list.push(b); });
    var teal = css('--green'), chainC = css('--text'), faint = css('--faint'), lineC = css('--line');
    g.clearRect(0, 0, w, h);
    var dtk = reduced ? 1 : Math.min(1, (opt.dt || 16) * 0.0035);
    list.forEach(function (b) { var tg = b.chain ? 1 : 0; b.yk = (b.yk || 0) + (tg - (b.yk || 0)) * dtk; });
    /* time ruler */
    var by = opt.ruler || (h - opt.bottom + 34);
    g.strokeStyle = lineC; g.lineWidth = 1; g.beginPath(); g.moveTo(0, by); g.lineTo(w - 40, by); g.stroke();
    g.fillStyle = faint; g.font = '12px ' + css('--mono'); g.textAlign = 'center'; g.textBaseline = 'top';
    var step = pps > 50 ? 2000 : 3000, first = Math.floor(renderT / step) * step;
    for (var tt = first; w - 40 - (renderT - tt) * pps / 1000 > 30; tt -= step) {
      var tx = w - 40 - (renderT - tt) * pps / 1000; g.fillRect(tx, by - 4, 1, 4);
      g.fillText(new Date(tt).toLocaleTimeString('en-US'), tx, by + 6);
    }
    /* parent links fade with age */
    g.lineWidth = 1;
    list.forEach(function (b) {
      var x = lay.x(b.t), y = lay.y(b.lane, b), a = Math.max(0, Math.min(1, x / w));
      g.strokeStyle = teal; g.globalAlpha = 0.08 + 0.22 * a; g.beginPath();
      b.p.forEach(function (ph) { var p = L.blocks.get(ph); if (!p || p.h === b.sp) return; g.moveTo(x, y); g.lineTo(lay.x(p.t), lay.y(p.lane, p)); });
      g.stroke();
    });
    g.globalAlpha = 1;
    /* the selected chain: one bright thread through the swarm */
    var chain = list.filter(function (b) { return b.chain || b.yk > 0.5; }).sort(function (a, b) { return a.bs - b.bs; });
    g.strokeStyle = chainC; g.lineWidth = 2; g.beginPath();
    chain.forEach(function (b, i) { var x = lay.x(b.t), y = lay.y(b.lane, b); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke(); g.lineWidth = 1;
    var now = performance.now();
    list.forEach(function (b) {
      var x = lay.x(b.t), y = lay.y(b.lane, b), s = b.chain ? size + 2 : size;
      if (!appeared.has(b.h)) { appeared.add(b.h); b.born = now; tick(b.chain); }
      var age = (now - (b.born || 0)) / 500;
      if (!reduced && age < 1) {
        g.strokeStyle = teal; g.globalAlpha = 1 - age; g.lineWidth = 1.5;
        var r = s / 2 + age * 14; g.strokeRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; g.lineWidth = 1;
      }
      g.fillStyle = b.chain ? chainC : teal;
      g.fillRect(x - s / 2, y - s / 2, s, s);
      if (b.reds.length) { g.strokeStyle = css('--orange'); g.strokeRect(x - s / 2 - 2, y - s / 2 - 2, s + 4, s + 4); }
    });
    if (opt.dimX) {
      /* keep the words readable: the oldest blocks fade behind them */
      var bg = css('--bg'), gr = g.createLinearGradient(opt.dimX - 220, 0, opt.dimX, 0);
      gr.addColorStop(0, bg); gr.addColorStop(1, 'rgba(0,0,0,0)');
      var y0 = opt.dimY + 60, gv = g.createLinearGradient(0, opt.dimY, 0, y0);
      gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(1, bg);
      g.globalAlpha = 0.86; g.fillStyle = bg; g.fillRect(0, y0, opt.dimX - 220, h - y0);
      g.fillStyle = gv; g.fillRect(0, opt.dimY, opt.dimX - 220, 60);
      g.fillStyle = gr; g.fillRect(opt.dimX - 220, y0, 220, h - y0); g.globalAlpha = 1;
    }
    return list;
  }
  var hudAt = 0;
  function hud(ts) {
    if (ts - hudAt < 400 || !L.newest) return; hudAt = ts;
    var st = L.stats();
    if (st.rate !== null) $('hudRate').textContent = fmt(st.rate, 1);
    if (st.par !== null) $('hudPar').textContent = fmt(st.par, 1);
    $('hudSeen').textContent = fmt(st.seen);
  }
  var heroIn = document.querySelector('.hero-in'), hudEl = $('hud'), cold = $('coldOpen');
  document.documentElement.classList.add('js');
  if (!reduced) { heroIn.classList.add('pre'); }
  var revealed = false;
  function reveal() { if (revealed) return; revealed = true; heroIn.classList.remove('pre'); if (cold) cold.classList.add('gone'); }
  setTimeout(reveal, reduced ? 0 : 6500);
  L.subs.push(function () { if (L.ok && !revealed && !reduced) setTimeout(reveal, 3200); });
  function geo(f) {
    /* v6c: the DAG lives in its own black panel below the headline; no text to fade behind. */
    if (hero.parentNode.classList.contains('slab')) { var w2 = f.w > 900, t2 = hudEl.offsetTop + hudEl.offsetHeight + (w2 ? 36 : 26); return { pps: w2 ? 80 : 46, top: t2, bottom: 58, size: w2 ? 8 : 6 }; }
    var wide = f.w > 900, top = hudEl.offsetTop + hudEl.offsetHeight + 44;
    if (wide) return { pps: 80, top: top, bottom: 70, size: 8, ruler: top - 30, dimX: heroIn.offsetLeft + heroIn.offsetWidth + 40, dimY: heroIn.offsetTop - 30 };
    var bottom = f.h - heroIn.offsetTop + 50;
    return { pps: 46, top: top, bottom: Math.min(bottom, f.h - top - 80), size: 6 };
  }
  /* Bitcoin at the same scale: how far off-screen its latest block would sit. */
  var btc = null, btcAt = 0;
  function btcPoll() { j('https://mempool.space/api/v1/blocks').then(function (r) { btc = { h: r[0].height, t: r[0].timestamp * 1000 }; L.btc = btc; }).catch(function () {}); }
  btcPoll(); setInterval(btcPoll, 30000);
  function btcScale(pps) {
    var el = $('btcScale'); if (!el || !btc || !L.newest) return;
    var now = performance.now(); if (now - btcAt < 1000) return; btcAt = now;
    var age = (Date.now() - btc.t) / 1000, px = age * pps, m = px * 0.0254 / 96;
    var mm = Math.floor(age / 60), ss = Math.floor(age % 60);
    el.innerHTML = 'At this scale, Bitcoin’s latest block is <b class="num">' + fmt(m, 1) + ' meters</b> off the left of your screen.';
    $('btcScaleNote').textContent = 'Bitcoin block #' + fmt(btc.h) + ', mined ' + mm + ' min ' + ss + ' s ago (mempool.space). Its average gap, ten minutes, would be ' + fmt(600 * pps * 0.0254 / 96, 1) + ' meters here.';
  }
  function frame(ts) {
    var dt = lastF ? Math.min(100, ts - lastF) : 16; lastF = ts;
    if (L.newest) {
      var target = L.newest - 1200;
      if (!renderT) renderT = L.newest - 9000;
      var lag = target - renderT;
      renderT += dt * (1 + Math.max(-0.6, Math.min(1.5, lag / 4000)));
      if (lag > 30000) renderT = target - 4000;
    }
    var f = fit(hero), wide = f.w > 700, g0 = geo(f);
    g0.dt = dt; drawDag(f.g, f.w, f.h, g0);
    btcScale(g0.pps);
    hud(ts || performance.now());
    if (!reduced && heroOn) requestAnimationFrame(frame);
  }
  if (reduced) { L.subs.push(function () { renderT = L.newest - 1200; requestAnimationFrame(frame); }); }
  requestAnimationFrame(frame);
  var hoverTip = null;
  hero.addEventListener('mousemove', function (e) {
    var r = hero.getBoundingClientRect(), g0 = geo({ w: r.width, h: r.height }), lay = layout(r.width, r.height, g0.pps, g0.top, g0.bottom);
    var mx = e.clientX - r.left, my = e.clientY - r.top, best = null, bd = 144;
    L.blocks.forEach(function (b) { if (b.t > renderT) return; var dx = lay.x(b.t) - mx, dy = lay.y(b.lane, b) - my, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = b; } });
    if (!hoverTip) { hoverTip = document.createElement('div'); hoverTip.className = 'pop'; document.body.appendChild(hoverTip); }
    if (!best) { hoverTip.style.display = 'none'; return; }
    hoverTip.style.display = 'block';
    hoverTip.textContent = 'Block ' + best.h.slice(0, 8) + '…' + best.h.slice(-4) + ' · mined ' + new Date(best.t).toLocaleTimeString('en-US') + ' your time · points at ' + best.p.length + ' parents · ' + best.tx + ' transactions' + (best.chain ? ' · on the selected chain' : '');
    hoverTip.style.left = Math.min(e.pageX + 12, document.documentElement.clientWidth - 330) + 'px'; hoverTip.style.top = (e.pageY + 14) + 'px';
  });
  hero.addEventListener('mouseleave', function () { if (hoverTip) hoverTip.style.display = 'none'; });

  /* Chapter 2: freeze ten real seconds, then put them in GHOSTDAG order. */
  var oc = $('orderCanvas'), oGo = $('oGo'), oAgain = $('oAgain'), snap = null, anim = 0, ordered = null;
  var bw = bigw;
  function takeSnap() {
    var end = Math.min(renderT || L.newest, L.newest - 2500), start = end - 10000, list = [];
    L.blocks.forEach(function (b) { if (b.t >= start && b.t <= end) list.push(b); });
    list.sort(function (a, b) { return a.t - b.t; });
    var ch = L.chain(); list.forEach(function (b) { b.chain = ch.set.has(b.h); });
    snap = { list: list, start: start, end: end }; ordered = null; anim = 0;
    drawOrder();
  }
  function computeOrder() {
    /* Rank every block that some known chain block has merged. */
    var ch = L.chain(), chain = ch.list;
    snap.list.forEach(function (b) { b.chain = ch.set.has(b.h); });
    var rank = new Map(), r = 0;
    chain.forEach(function (c) {
      var ms = c.blues.concat(c.reds).filter(function (h) { return h !== c.sp; }).map(function (h) { return L.blocks.get(h) || { h: h, bw: '0' }; });
      ms.sort(function (a, b) { var d = bw(a) - bw(b); return d < 0n ? -1 : d > 0n ? 1 : (a.h < b.h ? -1 : 1); });
      ms.forEach(function (m) { if (!rank.has(m.h)) rank.set(m.h, r++); });
      if (!rank.has(c.h)) rank.set(c.h, r++);
    });
    var inOrder = snap.list.filter(function (b) { return rank.has(b.h); }).sort(function (a, b) { return rank.get(a.h) - rank.get(b.h); });
    var waiting = snap.list.filter(function (b) { return !rank.has(b.h); });
    var reds = 0; chain.forEach(function (c) { c.reds.forEach(function (h) { if (snap.list.some(function (b) { return b.h === h; })) reds++; }); });
    ordered = { list: inOrder, waiting: waiting, reds: reds, chains: snap.list.filter(function (b) { return b.chain; }).length };
  }
  function ease(x) { return x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3); }
  function drawOrder() {
    if (!snap) return;
    var f = fit(oc), g = f.g, w = f.w, h = f.h, s = w > 700 ? 11 : 8;
    var top = 34, dagH = h * 0.56, c = (top + dagH) / 2, half = (dagH - top) / 2 - 6, gap = Math.min(18, half * 0.16), bd = (half - gap) / 8.6;
    var X = function (t) { return 24 + (w - 48) * (t - snap.start) / (snap.end - snap.start); };
    var Y = function (b) { if (b.chain) return c; var side = b.lane < 9 ? -1 : 1, k = b.lane < 9 ? 8 - b.lane : b.lane - 9; return c + side * (gap + (k + 0.5 + (b.jit || 0)) * bd); };
    var pos = new Map(); snap.list.forEach(function (b) { pos.set(b.h, { x: X(b.t), y: Y(b) }); });
    var line = css('--line'), teal = css('--green'), text = css('--text'), faint = css('--faint'), orange = css('--orange');
    g.clearRect(0, 0, w, h);
    g.font = (w < 560 ? '12px ' : '13px ') + css('--font'); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = faint;
    var tsA = new Date(snap.start).toLocaleTimeString('en-US'), tsB = new Date(snap.end).toLocaleTimeString('en-US');
    g.fillText(w < 560 ? tsA + ' to ' + tsB + ', your time' : 'Ten real seconds, as mined: ' + tsA + ' to ' + tsB + ' your time', 24, 16);
    var seq = ordered ? ordered.list : [], N = seq.length;
    var A = Math.min(1, anim / 0.62), B = ease((anim - 0.66) / 0.34);
    var visited = ordered ? Math.floor(A * N) : 0, rank = new Map(); seq.forEach(function (b, i) { rank.set(b.h, i); });
    /* the web */
    g.strokeStyle = line; g.lineWidth = 1; g.globalAlpha = ordered ? 0.7 : 1; g.beginPath();
    snap.list.forEach(function (b) { var a = pos.get(b.h); b.p.forEach(function (ph) { var c2 = pos.get(ph); if (c2) { g.moveTo(a.x, a.y); g.lineTo(c2.x, c2.y); } }); });
    g.stroke(); g.globalAlpha = 1;
    /* the needle: GHOSTDAG order threaded through the real blocks */
    if (ordered && visited > 1) {
      g.strokeStyle = orange; g.lineWidth = 1.5; g.globalAlpha = 0.9 * (1 - B * 0.6); g.beginPath();
      for (var i = 0; i < visited; i++) { var p = pos.get(seq[i].h); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
      g.stroke(); g.globalAlpha = 1; g.lineWidth = 1;
    }
    /* the line everyone agrees on */
    var per = Math.max(10, Math.floor((w - 48) / (s + 5))), rowH = s + 22, stripTop = dagH + 56;
    var T = function (i) { return { x: 24 + (i % per) * (s + 5) + s / 2, y: stripTop + Math.floor(i / per) * rowH }; };
    if (ordered && B > 0) {
      g.fillStyle = faint; g.globalAlpha = B; g.fillText('The one order every node computes, read left to right', 24, dagH + 34); g.globalAlpha = 1;
    }
    snap.list.forEach(function (b) {
      var p = pos.get(b.h), r = rank.has(b.h) ? rank.get(b.h) : -1, x = p.x, y = p.y, lit = r >= 0 && r < visited;
      if (ordered && r >= 0 && B > 0) { var q = T(r), k = ease(B * 1.4 - (r / Math.max(1, N)) * 0.4); x = p.x + (q.x - p.x) * k; y = p.y + (q.y - p.y) * k;
        g.fillStyle = b.chain ? text : teal; g.globalAlpha = 0.18; g.fillRect(p.x - s / 2, p.y - s / 2, s, s); g.globalAlpha = 1; }
      g.fillStyle = r < 0 && ordered ? faint : (b.chain ? text : teal);
      if (ordered && !lit && r >= 0 && B === 0) g.globalAlpha = 0.35;
      g.fillRect(x - s / 2, y - s / 2, s, s); g.globalAlpha = 1;
      if (ordered && r === visited - 1 && B === 0) { g.strokeStyle = orange; g.lineWidth = 2; g.strokeRect(x - s / 2 - 4, y - s / 2 - 4, s + 8, s + 8); g.lineWidth = 1; }
    });
    if (ordered && B > 0.5) {
      g.fillStyle = faint; g.font = '11px ' + css('--mono'); g.textAlign = 'center'; g.textBaseline = 'top'; g.globalAlpha = (B - 0.5) * 2;
      seq.forEach(function (b, i) { if ((i + 1) % 10 === 0 || i === 0) { var q = T(i); g.fillText(String(i + 1), q.x, q.y + s / 2 + 4); } });
      g.globalAlpha = 1;
    }
    if (ordered && B === 0 && visited > 0) {
      g.fillStyle = orange; g.font = '600 15px ' + css('--mono'); g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      g.fillText(fmt(visited) + ' / ' + fmt(N), w - 24, w < 560 ? 31 : 16);
    }
  }
  function playOrder() {
    computeOrder();
    var o = ordered;
    $('orderOut').textContent = 'Threading ' + fmt(o.list.length) + ' real blocks in GHOSTDAG order…';
    var caption = function () { $('orderOut').innerHTML = '<b>' + fmt(snap.list.length) + ' real blocks</b>, mined in parallel in ten seconds, now in one line. ' +
      fmt(o.chains) + (o.chains === 1 ? ' is a chain block' : ' are chain blocks') + ' (white): each one merged the blocks it saw. Red: <b>' + o.reds + '</b>.' +
      (o.waiting.length ? ' ' + o.waiting.length + ' newest still waiting for a chain block to merge them (gray).' : ''); };
    if (reduced) { anim = 1; drawOrder(); caption(); return; }
    var t0 = performance.now(), lastV = 0;
    (function step(now) { anim = Math.min(1, (now - t0) / 6000); var v = Math.floor(Math.min(1, anim / 0.62) * ordered.list.length); if (v > lastV) { tick(ordered.list[v - 1] && ordered.list[v - 1].chain); lastV = v; } drawOrder(); if (anim < 1) requestAnimationFrame(step); else caption(); })(t0);
  }
  oGo.addEventListener('click', function () { takeSnap(); playOrder(); oGo.textContent = 'Line them up again'; });
  oAgain.addEventListener('click', function () { takeSnap(); $('orderOut').textContent = 'A fresh ten seconds from the network. Line them up.'; });
  L.subs.push(function () {
    if (oGo.disabled && L.newest - L.first > 16000 && renderT) { takeSnap(); oGo.disabled = false; oGo.textContent = 'Line them up'; if (L.sim) $('orderOut').textContent = 'The live network could not be reached; this is a simulation and the order step is unavailable.'; }
  });
  addEventListener('resize', function () { drawOrder(); });

  /* ---- Your visit: real counts since page load ---- */
  (function tally() {
    var cv = $('tallyCanvas'); if (!cv) return;
    var t0 = Date.now(), k0 = null, b0 = null, k = null, b = null, bt = null;
    function poll() {
      if (document.visibilityState === 'hidden') return;
      j('https://api.kaspa.org/info/blockdag').then(function (r) { var d = Number(r.virtualDaaScore); if (k0 === null) k0 = d; k = d; draw(); }).catch(function () {});
      j('https://mempool.space/api/blocks/tip/height').then(function (h) { h = Number(h); if (b0 === null) b0 = h; b = h; draw(); }).catch(function () {});
      j('https://mempool.space/api/v1/blocks').then(function (r) { bt = { h: r[0].height, t: r[0].timestamp * 1000 }; draw(); }).catch(function () {});
    }
    poll(); setInterval(poll, 15000);
    function draw() {
      if (L.ok && L.daa && k0 !== null && L.daa > k) k = L.daa;
      var el = (Date.now() - t0) / 1000, ok = k0 !== null && b0 !== null && k > k0;
      var nK = ok ? Math.max(0, k - k0) : 0, nB = ok ? Math.max(0, b - b0) : 0;
      var mins = Math.floor(el / 60), secs = Math.floor(el % 60);
      var since = mins ? mins + ' min ' + secs + ' s' : secs + ' s';
      $('tK').textContent = ok ? fmt(nK) : '…';
      $('tB').textContent = ok ? fmt(nB) : '…';
      $('tKnote').textContent = 'blocks in ' + since;
      $('tBnote').textContent = 'blocks in ' + since;
      if (!ok) { $('tOut').textContent = (L.sim && k0 === null) ? 'The live networks could not be reached from your browser, so there is nothing to count.' : 'Counting since you opened the page (' + since + ').'; }
      else if (nB === 0) {
        var age = bt ? Math.floor((Date.now() - bt.t) / 60000) : null;
        $('tOut').innerHTML = 'You have been here ' + since + '. Kaspa added about <b class="num">' + fmt(nK) + '</b> blocks. Bitcoin added none' + (age !== null ? ': its newest, #' + fmt(bt.h) + ', is ' + age + ' min old.' : '.') + ' Both are secured by proof-of-work.';
      } else {
        $('tOut').innerHTML = 'You have been here ' + since + '. Kaspa added about <b class="num">' + fmt(nK) + '</b> blocks; Bitcoin added <b class="num">' + fmt(nB) + '</b>. Both are secured by proof-of-work.';
      }
      var w = cv.clientWidth, h = 220, dpr = devicePixelRatio || 1;
      if (!w) return;
      cv.width = w * dpr; cv.height = h * dpr; var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      var gap = 2, s = 14, cols, rows, per = 1, avail = h - 28;
      for (; s > 3; s--) { cols = Math.floor(w / (s + gap)); rows = Math.floor(avail / (s + gap)); if (cols * rows >= nK) break; }
      while (nK / per > cols * rows) per *= 10;
      var n = Math.ceil(nK / per); g.fillStyle = css('--green');
      for (var i = 0; i < n; i++) g.fillRect((i % cols) * (s + gap), Math.floor(i / cols) * (s + gap), s, s);
      g.fillStyle = css('--faint'); g.font = '12px ' + css('--mono');
      if (ok) g.fillText('Kaspa: one square = ' + (per === 1 ? 'one block' : fmt(per) + ' blocks'), 0, h - 6);
      var pile = $('tBpile'), cells = Math.max(1, nB);
      if (pile.childElementCount !== cells) { pile.textContent = ''; for (var q = 0; q < cells; q++) pile.appendChild(document.createElement('i')); }
      Array.prototype.forEach.call(pile.children, function (c, i2) { c.classList.toggle('on', i2 < nB); });
    }
    setInterval(draw, 1000); addEventListener('resize', draw);
  })();
})();
