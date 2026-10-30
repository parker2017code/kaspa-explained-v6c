/* Kaspa Explained. Plain JS, no dependencies. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = function (v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var params = new URLSearchParams(location.search);
  function setParam(k, v) {
    params.set(k, v);
    history.replaceState(null, '', location.pathname + '?' + params.toString() + location.hash);
  }
  function fit(c) {
    if (!c.dataset.h) { c.dataset.h = c.getAttribute('height') || ''; if (c.dataset.h) c.style.height = c.dataset.h + 'px'; }
    var dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.dataset.h ? +c.dataset.h : c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g: g, w: w, h: h };
  }
  var fmt = function (n, d) { return n.toLocaleString('en-US', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }); };

  /* Theme and nerd mode */
  var themeBtn = $('theme');
  function paintTheme() { themeBtn.textContent = document.documentElement.dataset.theme === 'light' ? 'Dark' : 'Light'; }
  themeBtn.addEventListener('click', function () {
    var t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t; store.set('ke-theme-v', t);
    try { localStorage.setItem('ke-theme', t); } catch (e) {}
    paintTheme(); redrawAll();
  });
  paintTheme();
  var nerdBtn = $('nerd');
  function setNerd(on) {
    document.body.classList.toggle('nerd', on);
    nerdBtn.setAttribute('aria-pressed', String(on));
    document.querySelectorAll('details.nerd').forEach(function (d) { d.open = on; });
    store.set('ke-nerd', on);
  }
  nerdBtn.addEventListener('click', function () { setNerd(!document.body.classList.contains('nerd')); });
  setNerd(store.get('ke-nerd', false));

  /* Popovers for "i" buttons and glossary terms */
  var pop = null, popFor = null, pinned = false;
  function closePop() { if (pop) { pop.remove(); pop = null; if (popFor) { popFor.setAttribute('aria-expanded', 'false'); popFor.removeAttribute('aria-describedby'); } popFor = null; pinned = false; } }
  function openPop(btn) {
    closePop();
    pop = document.createElement('div'); pop.className = 'pop'; pop.id = 'pop'; pop.setAttribute('role', 'tooltip');
    pop.textContent = btn.getAttribute('data-pop');
    document.body.appendChild(pop);
    var r = btn.getBoundingClientRect(), pw = pop.offsetWidth;
    var left = Math.min(Math.max(8, r.left + window.scrollX + r.width / 2 - pw / 2), document.documentElement.clientWidth - pw - 8);
    pop.style.left = left + 'px'; pop.style.top = (r.bottom + window.scrollY + 8) + 'px';
    btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-describedby', 'pop'); popFor = btn;
  }
  document.querySelectorAll('[data-pop]').forEach(function (b) {
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', function (e) { e.stopPropagation(); if (popFor === b && pinned) closePop(); else { if (popFor !== b) openPop(b); pinned = true; } });
    b.addEventListener('mouseenter', function () { if (matchMedia('(hover: hover)').matches && !pinned) openPop(b); });
    b.addEventListener('mouseleave', function () { if (matchMedia('(hover: hover)').matches && !pinned) closePop(); });
  });
  document.addEventListener('click', closePop);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });
  window.addEventListener('scroll', closePop, { passive: true });

  /* Chapters, progress and resume */
  var chapters = Array.prototype.slice.call(document.querySelectorAll('section.chapter[id]'));
  var dots = $('dots'), seen = store.get('ke-seen', {});
  chapters.forEach(function (s, i) {
    var a = document.createElement('a'); a.href = '#' + s.id;
    a.title = s.dataset.title; a.setAttribute('aria-label', s.dataset.title);
    if (seen[s.id]) a.classList.add('seen');
    dots.appendChild(a); s._dot = a;
  });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var s = en.target;
      chapters.forEach(function (c) { c._dot.classList.toggle('here', c === s); });
      seen[s.id] = 1; s._dot.classList.add('seen'); store.set('ke-seen', seen);
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  chapters.forEach(function (s) { io.observe(s); });
  var bar = $('progress');
  function onScroll() {
    var h = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (h > 0 ? Math.min(100, scrollY / h * 100) : 0) + '%';
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* Live facts (chapter 7), read-only */
  var API = 'https://api.kaspa.org';
  function getJSON(u) { return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  var liveReward = null;
  function facts() {
    Promise.all([getJSON(API + '/info/hashrate?stringOnly=false'), getJSON(API + '/info/coinsupply'), getJSON(API + '/info/blockreward'), getJSON(API + '/info/halving')]).then(function (r) {
      $('lfHash').textContent = fmt(r[0].hashrate / 1000, 1) + ' PH/s';
      $('lfSupply').textContent = fmt(+r[1].circulatingSupply / 1e8 / 1e9, 3) + ' billion';
      liveReward = r[2].blockreward;
      $('emitLive').textContent = 'Live now: ' + fmt(liveReward, 8) + ' KAS per block, about ' + fmt(liveReward * 10, 2) + ' KAS a second. Next step down: ' + fmt(r[3].nextHalvingAmount, 8) + ' KAS per block, around ' + new Date(r[3].nextHalvingTimestamp * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) + '. Source: api.kaspa.org.';
    }).catch(function () { ['lfHash', 'lfSupply'].forEach(function (id) { $(id).textContent = 'not reachable'; }); });
  }
  facts();
  if (window.KLive) KLive.subs.push(function () { if (KLive.daa) $('lfScore').textContent = fmt(KLive.daa); });

  /* Chapter 3: grow a DAG, order it with GHOSTDAG (k = 3) */
  var K = 3, G = { blocks: [], secret: [], hidingSince: 0 };
  function mk(parents, hidden) {
    var b = { id: G.blocks.length + G.secret.length, parents: parents, hidden: !!hidden, past: new Set() };
    parents.forEach(function (p) { b.past.add(p); p.past.forEach(function (x) { b.past.add(x); }); });
    b.layer = parents.length ? Math.max.apply(null, parents.map(function (p) { return p.layer; })) + 1 : 0;
    return b;
  }
  function ghost(b) {
    if (b._gd) return b._gd;
    if (!b.parents.length) { b._gd = { score: 1, blue: new Set([b]), order: [b] }; return b._gd; }
    var sp = b.parents.slice().sort(function (x, y) { return ghost(y).score - ghost(x).score || x.id - y.id; })[0];
    var spd = ghost(sp), blue = new Set(spd.blue); blue.add(sp);
    var merge = []; b.past.forEach(function (x) { if (x !== sp && !sp.past.has(x)) merge.push(x); });
    merge.sort(function (x, y) { return ghost(x).score - ghost(y).score || x.id - y.id; });
    var inAnti = function (a, c) { return a !== c && !a.past.has(c) && !c.past.has(a); };
    var reds = [];
    merge.forEach(function (c) {
      var anti = []; blue.forEach(function (x) { if (inAnti(x, c)) anti.push(x); });
      var ok = anti.length <= K && anti.every(function (x) {
        var n = 1; blue.forEach(function (y) { if (inAnti(x, y)) n++; }); return n <= K;
      });
      if (ok) blue.add(c); else reds.push(c);
    });
    var bl = merge.filter(function (c) { return blue.has(c); });
    var order = spd.order.concat(bl, reds, [b]);
    b._gd = { score: blue.size, blue: blue, order: order, sp: sp };
    return b._gd;
  }
  function tips(list) {
    var hasChild = new Set(); list.forEach(function (b) { b.parents.forEach(function (p) { hasChild.add(p); }); });
    return list.filter(function (b) { return !hasChild.has(b); });
  }
  function gReset() {
    G.blocks = [mk([])]; G.secret = []; G.hidingSince = 0; G.released = null;
    for (var i = 0; i < 3; i++) honestRound();
    $('gOut').textContent = 'Honest miners are working. Each block points at every block its miner had seen.';
    $('gHide').disabled = false; $('gRelease').disabled = true; drawGhost();
  }
  function width() { return 2; }
  function honestRound() {
    var t = tips(G.blocks), n = width(), add = [];
    for (var i = 0; i < n; i++) add.push(mk(t));
    add.forEach(function (b) { b.id = G.blocks.length; G.blocks.push(b); });
    if (G.secret.length) G.hidingSince += n;
  }
  var auto = null, hiding = false, atkAcc = 0;
  function q() { return +$('qAtk').value / 100; }
  $('qAtk').addEventListener('input', function () { $('qAtkVal').textContent = Math.round(q() * 100) + '%'; setParam('atk', Math.round(q() * 100)); });
  function autoStep() {
    if (G.blocks.length + G.secret.length > 140) {
      if (!hiding && !G.released) { gReset(); drawGhost(); return; }
      stopAuto(); $('gOut').textContent = 'That is enough history for one demo. Reset to play again.'; return;
    }
    honestRound();
    if (hiding) {
      atkAcc += width() * q() / (1 - q());
      while (atkAcc >= 1) { atkAcc -= 1; var prev = G.secret.length ? [G.secret[G.secret.length - 1]] : [G.base]; var b = mk(prev, true); G.secret.push(b); }
      $('gOut').textContent = 'Mining in secret: ' + G.secret.length + ' hidden blocks. The honest network has added ' + G.hidingSince + ' it can see. Release whenever you like.';
      $('gRelease').disabled = G.secret.length === 0;
    }
    drawGhost();
  }
  function startAuto() { if (!auto && !reduced) auto = setInterval(autoStep, 650); }
  function stopAuto() { clearInterval(auto); auto = null; }
  $('gHide').addEventListener('click', function () {
    G.base = tips(G.blocks)[0]; G.secret = []; G.released = null; G.hidingSince = 0; atkAcc = 0; hiding = true;
    $('gHide').disabled = true; $('gRelease').disabled = true;
    $('gOut').textContent = 'You went dark. Your blocks only point at each other now.';
    startAuto();
    if (reduced) { for (var i = 0; i < 6; i++) autoStep(); }
    drawGhost();
  });
  $('gRelease').addEventListener('click', function () {
    hiding = false;
    G.secret.forEach(function (b) { b.hidden = false; b.id = G.blocks.length; b.mine = true; G.blocks.push(b); });
    var released = G.secret; G.secret = [];
    honestRound(); G.flashAt = performance.now(); G.released = released;
    var v = ghost(mk(tips(G.blocks)));
    var red = released.filter(function (b) { return !v.blue.has(b); }).length;
    $('gOut').innerHTML = red ? '<b>' + red + ' of your ' + released.length + ' blocks came out red.</b> They stay in the DAG, but GHOSTDAG puts them at the back of the line, so any payment in them that conflicts with the honest history loses.'
      : 'Released fast enough to count as honest, so it isn’t an attack. Hide for longer.';
    $('gHide').disabled = false; $('gRelease').disabled = true;
    drawGhost();
  });
  $('gReset').addEventListener('click', function () { hiding = false; gReset(); startAuto(); });
  var gIO = new IntersectionObserver(function (e) { if (e[0].isIntersecting) startAuto(); else stopAuto(); });
  gIO.observe($('ghost'));
  function drawGhost() {
    var c = $('ghostCanvas'), f = fit(c), g = f.g, w = f.w, h = f.h;
    G.blocks.forEach(function (b) { delete b._gd; });
    var v = ghost(mk(tips(G.blocks)));
    var all = G.blocks.concat(G.secret);
    var maxL = Math.max.apply(null, all.map(function (b) { return b.layer; }));
    var span = Math.max(6, Math.floor(w / 62)), minL = Math.max(0, maxL - span + 1), dx = (w - 60) / Math.max(1, span - 1);
    var byLayer = {};
    all.forEach(function (b) { (byLayer[b.layer] = byLayer[b.layer] || []).push(b); });
    Object.keys(byLayer).forEach(function (L) {
      var arr = byLayer[L]; arr.sort(function (a, b) { return (a.hidden ? 1 : 0) - (b.hidden ? 1 : 0) || a.id - b.id; });
      arr.forEach(function (b, i) { b.x = 30 + (L - minL) * dx; b.y = h / 2 + (w > 700 ? 30 : 50) + (i - (arr.length - 1) / 2) * 50; });
    });
    g.clearRect(0, 0, w, h);
    var vis = function (b) { return b.layer >= minL - 1; };
    g.lineWidth = 1.2;
    all.forEach(function (b) {
      if (!vis(b)) return;
      b.parents.forEach(function (p) {
        g.strokeStyle = b.hidden ? css('--orange') : css('--line-bright'); g.globalAlpha = b.hidden ? 0.6 : 0.7;
        g.setLineDash(b.hidden ? [4, 4] : []);
        g.beginPath(); g.moveTo(b.x - 12, b.y); g.lineTo(p.x + 12, p.y); g.stroke();
      });
    });
    g.setLineDash([]); g.globalAlpha = 1;
    all.forEach(function (b) {
      if (!vis(b)) return;
      var isBlue = v.blue.has(b);
      g.fillStyle = b.hidden ? 'transparent' : (isBlue ? css('--cyan') : css('--red'));
      g.strokeStyle = b.hidden ? css('--orange') : 'transparent'; g.lineWidth = 2;
      g.beginPath(); g.roundRect ? g.roundRect(b.x - 12, b.y - 12, 24, 24, 5) : g.rect(b.x - 12, b.y - 12, 24, 24);
      g.fill(); if (b.hidden) g.stroke();
      g.fillStyle = b.hidden ? css('--orange') : css('--bg'); g.font = '600 10px ' + css('--mono'); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(b.hidden ? '?' : String(b.id), b.x, b.y + 0.5);
      if (b.mine && !b.hidden) { g.strokeStyle = css('--orange'); g.lineWidth = 1.5; g.strokeRect(b.x - 15, b.y - 15, 30, 30); }
    });
    /* scoreboard and verdict, drawn on the stage */
    var honest = G.blocks.filter(function (b) { return !b.mine; }).length;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = '13px ' + css('--font'); g.fillStyle = css('--faint');
    g.fillText('Honest network', 0, 18); g.fillText(G.secret.length ? 'You, in secret' : (G.released ? 'Your released blocks' : 'You'), 170, 18);
    g.font = '500 30px ' + css('--mono'); g.fillStyle = css('--cyan'); g.fillText(fmt(honest), 0, 52);
    g.fillStyle = css('--orange'); g.fillText(fmt(G.secret.length || (G.released ? G.released.length : 0)), 170, 52);
    if (G.released && G.flashAt) {
      var red = G.released.filter(function (b) { return !v.blue.has(b); }).length, el = performance.now() - G.flashAt;
      if (el < 700 && !reduced) {
        g.globalAlpha = 1 - el / 700; g.strokeStyle = css('--red'); g.lineWidth = 3;
        G.released.forEach(function (b) { if (vis(b)) { g.strokeRect(b.x - 18 - el / 30, b.y - 18 - el / 30, 36 + el / 15, 36 + el / 15); } });
        g.globalAlpha = 1; g.lineWidth = 1; requestAnimationFrame(drawGhost);
      }
      var wideG = w > 700; g.textAlign = wideG ? 'right' : 'left'; g.font = '700 ' + (wideG ? 44 : 26) + 'px ' + css('--display'); g.fillStyle = red ? css('--red') : css('--muted');
      g.fillText(red ? 'Outvoted: ' + red + ' of ' + G.released.length + ' red.' : 'Too short to be an attack.', wideG ? w : 0, wideG ? 52 : 92);
    }
    var ord = v.order.slice(0, -1);
    $('gOrder').innerHTML = ord.slice(-28).map(function (b) { return v.blue.has(b) ? String(b.id) : '<span style="color:var(--red)">' + b.id + ' red</span>'; }).join(' → ');
  }
  var a0 = +params.get('atk'); if (a0 >= 5 && a0 <= 45) $('qAtk').value = a0; $('qAtkVal').textContent = Math.round(q() * 100) + '%';
  gReset();

  /* Chapter 3: coins vs one balance */
  var coinsBtn = $('coinsGo');
  function drawCoins(t, order) {
    var c = $('coinsCanvas'), f = fit(c), g = f.g, w = f.w, h = f.h;
    g.clearRect(0, 0, w, h);
    var font = css('--font'), muted = css('--muted'), green = css('--green'), orange = css('--orange');
    g.font = '13px ' + font; g.fillStyle = muted; g.textBaseline = 'middle'; g.textAlign = 'left';
    var lab = Math.min(120, w * 0.28), colW = (w - lab) / 3;
    g.fillText('Separate coins', 0, 55); g.fillText('One balance', 0, 125);
    g.textAlign = 'center'; g.font = '12px ' + font;
    ['on the way', 'waiting', 'done'].forEach(function (s, k) { g.fillText(s, lab + colW * (k + 0.5), 14); });
    order = order || [0, 1, 2, 3, 4];
    /* order[k] = which payment (0..4) lands k-th; one lands every 0.4 s */
    var arrive = [], doneAt = [], prev = 0;
    order.forEach(function (p, k) { arrive[p] = 0.3 + 0.4 * k; });
    for (var p = 0; p < 5; p++) { doneAt[p] = Math.max(arrive[p], prev); prev = doneAt[p] + 0.05; }
    function dot(x, y, col, n) {
      g.fillStyle = col; g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill();
      g.fillStyle = css('--bg'); g.font = '600 11px ' + font; g.fillText(String(n + 1), x, y + 0.5);
    }
    for (var i = 0; i < 5; i++) {
      var dx = (i - 2) * 24;
      /* coins: each is done as soon as it lands */
      var cc = t < arrive[i] ? 0 : 2;
      dot(lab + colW * (cc + 0.5) + dx, 55, cc === 2 ? green : muted, i);
      var bc = t < arrive[i] ? 0 : (t < doneAt[i] ? 1 : 2);
      dot(lab + colW * (bc + 0.5) + dx, 125, bc === 2 ? green : bc === 1 ? orange : muted, i);
    }
  }
  var coinsState = { t: 0, order: null };
  drawCoins(0, null);
  coinsBtn.addEventListener('click', function () {
    var arr = [0, 1, 2, 3, 4].sort(function () { return Math.random() - 0.5; });
    var t0 = performance.now();
    $('coinsOut').textContent = 'Five payments land in five parallel blocks, in random order.';
    (function tick(now) {
      var t = (now - t0) / 1000; drawCoins(t, arr);
      if (t < 2.6 && !reduced) requestAnimationFrame(tick);
      else { drawCoins(9, arr); coinsState = { t: 9, order: arr }; var waited = 0;
        var arrivedAt = []; arr.forEach(function (q, k) { arrivedAt[q] = k; });
        for (var q = 1; q < 5; q++) { var mx = -1; for (var r = 0; r < q; r++) mx = Math.max(mx, arrivedAt[r]); if (mx > arrivedAt[q]) waited++; }
        $('coinsOut').textContent = 'They landed in the order ' + arr.map(function (p) { return p + 1; }).join(', ') + '. Separate coins: all five done on landing. One balance: ' + waited + ' of five had to wait for a lower number.';}
    })(t0);
  });

  /* Chapter 4: Satoshi's catch-up formula for Bitcoin */
  function nakamoto(q, z) {
    var p = 1 - q, lam = z * (q / p), sum = 1, pois = Math.exp(-lam);
    for (var k = 0; k <= z; k++) { if (k > 0) pois *= lam / k; sum -= pois * (1 - Math.pow(q / p, z - k)); }
    return Math.max(0, sum);
  }
  function drawRace() {
    var q = +$('qIn').value / 100; $('qVal').textContent = Math.round(q * 100) + '%'; setParam('q', Math.round(q * 100));
    var c = $('raceCanvas'), f = fit(c), g = f.g, w = f.w, h = f.h, pad = 34;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = css('--line'); g.beginPath(); g.moveTo(pad, 10); g.lineTo(pad, h - 24); g.lineTo(w - 6, h - 24); g.stroke();
    g.fillStyle = css('--faint'); g.font = '12px ' + css('--font'); g.textAlign = 'left';
    g.fillText('100%', 0, 14); g.fillText('0%', 8, h - 26);
    [0, 30, 60, 90, 120].forEach(function (m) { g.textAlign = m === 0 ? 'left' : m === 120 ? 'right' : 'center'; g.fillText(m + ' min', pad + (w - pad - 10) * m / 120 + (m === 120 ? 10 : 0), h - 8); });
    g.strokeStyle = css('--orange'); g.lineWidth = 2; g.beginPath();
    for (var m = 0; m <= 120; m += 1) {
      var z = Math.floor(m / 10), P = nakamoto(q, z), x = pad + (w - pad - 10) * m / 120, y = 10 + (h - 34) * (1 - P);
      if (m === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = css('--green'); g.beginPath(); g.arc(pad + 2, h - 26, 5, 0, 7); g.fill();
    g.textAlign = 'left'; g.fillText('Kaspa: seconds', pad + 12, h - 34);
    var zz = 0; while (zz < 2000 && nakamoto(q, zz) > 0.001) zz++;
    $('raceOut').innerHTML = 'Against a ' + Math.round(q * 100) + '% attacker, Bitcoin needs <b>' + zz + ' blocks</b>, about <b>' + (zz * 10 >= 120 ? fmt(zz * 10 / 60, 1) + ' hours' : zz * 10 + ' minutes') + '</b>, before the chance of reversal drops under 0.1%.';
  }
  var q0 = +params.get('q'); if (q0 >= 5 && q0 <= 45) $('qIn').value = q0;
  $('qIn').addEventListener('input', drawRace);

  /* Chapter 5: insiders at launch */
  var FAIR = [['XRP', 100], ['Ethereum', 16.7], ['Cardano', 11.52], ['Bitcoin', 0], ['Kaspa', 0]];
  function drawFair() {
    var c = $('fairCanvas'), f = fit(c), g = f.g, w = f.w, h = f.h, lw = 80, rowH = h / FAIR.length;
    g.clearRect(0, 0, w, h); g.font = '14px ' + css('--font'); g.textBaseline = 'middle';
    FAIR.forEach(function (r, i) {
      var y = i * rowH + rowH / 2, bw = (w - lw - 60) * r[1] / 100;
      g.fillStyle = css('--muted'); g.textAlign = 'left'; g.fillText(r[0], 0, y);
      g.fillStyle = r[0] === 'Kaspa' ? css('--green') : css('--faint'); g.globalAlpha = r[0] === 'Kaspa' ? 1 : 0.55;
      g.fillRect(lw, y - 9, Math.max(2, bw), 18); g.globalAlpha = 1;
      g.fillStyle = css('--text'); g.fillText(r[1] === 0 ? '0%' : (r[1] % 1 ? r[1].toFixed(1) : r[1]) + '%', lw + Math.max(2, bw) + 8, y);
    });
  }

  /* Chapter 5: emission */
  var STEP_S = 2629800, R_NOW = 20.60172230, STEP_START = 2026.757, SUPPLY_NOW = 27.779e9, T_SUPPLY = 2026.82;
  var ratio = Math.pow(0.5, 1 / 12);
  function rate(y) { var n = Math.floor((y - STEP_START) * 365.25 * 86400 / STEP_S); return R_NOW * Math.pow(ratio, n); }
  function supplyAt(y) { // exact sum over the monthly steps (a coarse Riemann sum overshot the 28.704B cap)
    var YS = 365.25 * 86400, s = SUPPLY_NOW, t = T_SUPPLY;
    while (t < y) {
      var n = Math.floor((t - STEP_START) * YS / STEP_S), end = Math.min(y, STEP_START + (n + 1) * STEP_S / YS);
      s += rate(t) * (end - t) * YS; t = end + 1e-9;
    }
    return s;
  }
  function drawEmit() {
    var y = +$('yIn').value; setParam('y', y.toFixed(2));
    var month = new Date(Date.UTC(Math.floor(y), Math.round((y % 1) * 12), 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    $('yVal').textContent = month;
    var c = $('emitCanvas'), f = fit(c), g = f.g, w = f.w, h = f.h, pad = 30;
    g.clearRect(0, 0, w, h);
    var X = function (yy) { return pad + (w - pad - 8) * (yy - 2026) / 14; }, Y = function (r) { return 10 + (h - 34) * (1 - r / 22); };
    g.strokeStyle = css('--line'); g.beginPath(); g.moveTo(pad, 10); g.lineTo(pad, h - 24); g.lineTo(w - 6, h - 24); g.stroke();
    g.fillStyle = css('--faint'); g.font = '12px ' + css('--font'); g.textAlign = 'center';
    [2026, 2030, 2034, 2038].forEach(function (yy) { g.fillText(yy, X(yy), h - 8); });
    g.strokeStyle = css('--green'); g.lineWidth = 2; g.beginPath();
    for (var yy = 2026.76; yy <= 2040; yy += 1 / 48) { var px = X(yy), py = Y(rate(yy)); if (yy === 2026.76) g.moveTo(px, py); else g.lineTo(px, py); }
    g.stroke();
    g.fillStyle = css('--text'); g.beginPath(); g.arc(X(y), Y(rate(y)), 5, 0, 7); g.fill();
    var s = supplyAt(y);
    $('emitOut').innerHTML = month + ': about <b>' + fmt(rate(y), 2) + ' KAS a second</b> to miners, and about <b>' + fmt(s / 1e9, 2) + ' billion</b> KAS in total. Dates are approximate; steps follow block count, not the calendar.';
  }
  var y0 = +params.get('y'); if (y0 >= +$('yIn').min && y0 <= 2040) $('yIn').value = y0;
  $('yIn').addEventListener('input', drawEmit);

  /* Chapter 5: who pays miners */
  function drawMiners() {
    var tps = +$('tpsIn').value, fee = +$('feeIn').value;
    $('tpsVal').textContent = fmt(tps); $('feeVal').textContent = fee.toFixed(3);
    setParam('tps', tps); setParam('fee', fee);
    var sub = R_NOW * 86400, fees = tps * fee * 86400, share = fees / (sub + fees);
    var c = $('minersCanvas'), f = fit(c), g = f.g, w = f.w, h = f.h;
    g.clearRect(0, 0, w, h);
    g.fillStyle = css('--green'); g.fillRect(0, 20, w * (1 - share), 30);
    g.fillStyle = css('--orange'); g.fillRect(w * (1 - share), 20, w * share, 30);
    g.font = '13px ' + css('--font'); g.textBaseline = 'top'; g.fillStyle = css('--muted');
    g.textAlign = 'left'; g.fillText('new coins', 0, 58); g.textAlign = 'right'; g.fillText('fees', w, 58);
    $('minersOut').innerHTML = 'Per day: <b>' + fmt(sub) + ' KAS</b> in new coins, <b>' + fmt(fees) + ' KAS</b> in fees. Fees are <b>' + fmt(share * 100, 1) + '%</b> of what miners earn. These are your guesses, not measurements.';
  }
  ['tps', 'fee'].forEach(function (k) { var v = params.get(k); if (v !== null) $(k + 'In').value = v; $(k + 'In').addEventListener('input', drawMiners); });

  /* Chapter 6: read-only transaction lookup */
  $('txGo').addEventListener('click', function () {
    var id = $('txIn').value.trim().toLowerCase(), out = $('txOut');
    if (!/^[0-9a-f]{64}$/.test(id)) { out.textContent = 'That doesn’t look like a transaction id. It should be 64 characters, 0-9 and a-f.'; return; }
    out.textContent = 'Asking the network…';
    getJSON(API + '/transactions/' + id + '?resolve_previous_outpoints=no').then(function (tx) {
      var when = tx.block_time ? new Date(tx.block_time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' }) + ' your time' : 'unknown time';
      var total = (tx.outputs || []).reduce(function (a, o) { return a + (+o.amount || 0); }, 0) / 1e8;
      out.innerHTML = (tx.is_accepted ? 'Accepted' : 'In a block, not yet accepted (give it a few seconds)') + ' · first in a block at ' + when +
        ' · outputs total ' + fmt(total, 4) + ' KAS · <a href="https://kas.fyi/transaction/' + id + '">open in explorer</a>';
    }).catch(function () { out.textContent = 'Not found, or the API could not be reached. New transactions can take a few seconds to show up.'; });
  });

  /* Chapter 4: the duel. Kaspa side counts real blocks; Bitcoin side waits for real Bitcoin blocks. */
  var duel = null, btcTip = null;
  function btcPoll() {
    getJSON('https://mempool.space/api/v1/blocks').then(function (r) { btcTip = { h: r[0].height, t: r[0].timestamp * 1000 }; }).catch(function () {});
  }
  btcPoll(); setInterval(btcPoll, 30000);
  function mmss(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  $('dGo').addEventListener('click', function () {
    duel = { id: (duel ? duel.id : 0) + 1, t0: performance.now(), wall: Date.now(), fast: false, btcH0: btcTip ? btcTip.h : null };
    $('dFast').hidden = false; $('dGo').textContent = 'Pay again'; $('dKpile').textContent = '';
    var run = duel.id;
    (function step(now) {
      if (!duel || duel.id !== run) return; var d = duel, t = Math.max(0, now - d.t0);
      var KS = 3000, k = Math.min(1, t / KS);
      $('dKclock').textContent = (Math.min(t, KS) / 1000).toFixed(1) + ' s';
      $('dKfill').style.width = (k * 100) + '%';
      var kBlocks = window.KLive && KLive.ok ? KLive.countSince(d.wall) : null;
      var kTxt = kBlocks === null ? '' : ' Real Kaspa blocks mined since you pressed: <b class="num">' + fmt(kBlocks) + '</b>' + (k < 1 || t < 9000 ? ' (they reach this page a few seconds late)' : '') + '.';
      var pile = $('dKpile'), have = pile.childElementCount, want = kBlocks === null ? 0 : Math.min(kBlocks, 900);
      for (; have < want; have++) pile.appendChild(document.createElement('i'));
      $('dKout').innerHTML = (k < 1 ? 'Confirming.' : '<b>Done.</b> Settled within Sompolinsky’s 1 to 3 seconds.') + kTxt;
      var bt = d.fast ? d.fastT + (now - d.fastAt) * 600 : t;
      var conf = d.fast ? Math.min(6, Math.floor(bt / 600000)) : (btcTip && d.btcH0 !== null ? Math.max(0, btcTip.h - d.btcH0) : 0);
      $('dBclock').textContent = mmss(Math.min(bt, 3600000)) + (d.fast ? ' (×600)' : '');
      $('dBfill').style.width = (Math.min(6, conf) / 6 * 100) + '%';
      document.querySelectorAll('#dBslots i').forEach(function (el, i) { el.classList.toggle('on', i < conf); });
      var since = btcTip ? mmss(Date.now() - btcTip.t) : null;
      $('dBout').innerHTML = conf >= 6 ? '<b>Settled.</b> Six confirmations.' : (d.fast ? conf + ' of 6 confirmations. Simulated at the average pace, one block per ten minutes.' :
        'Waiting for the next real Bitcoin block' + (since ? ': the last one, #' + fmt(btcTip.h) + ', was ' + since + ' ago.' : '.') + ' Then five more.');
      if (conf < 6) requestAnimationFrame(step);
    })(duel.t0);
  });
  $('dFast').addEventListener('click', function () { if (!duel) return; duel.fast = true; duel.fastAt = performance.now(); duel.fastT = performance.now() - duel.t0; $('dFast').hidden = true; });

  /* Chapter 7: rob the vault */
  var VAULT = {
    steal: 'Rejected. Every miner checked the rule: this coin may only go to the cold wallet before the lock date. Having the key was not enough.',
    split: 'Rejected. The rule wants all of it to go to cold storage. Half doesn’t count. Sneaky, though.',
    cold: 'Accepted. That is exactly what the rule allows. The owner is now very safe, and you have achieved nothing.',
    wait: 'Accepted, once the date has passed. That is the other path the owner wrote. Real vaults pair this with a long delay so the owner can react first.'
  };
  document.querySelectorAll('[data-try]').forEach(function (b) {
    b.addEventListener('click', function () { $('vaultOut').textContent = VAULT[b.dataset.try]; });
  });

  /* Finish: copy the two sentences */
  $('copy').addEventListener('click', function () {
    var t = $('mine').value;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { $('copyOut').textContent = 'Copied.'; })
      .catch(function () { $('mine').select(); $('copyOut').textContent = 'Selected. Press copy on your keyboard.'; });
    store.set('ke-two', t);
  });
  var saved = store.get('ke-two', null); if (saved) $('mine').value = saved;

  function redrawAll() { drawGhost(); drawCoins(coinsState.t, coinsState.order); drawRace(); drawFair(); drawEmit(); drawMiners(); }
  document.querySelectorAll('details').forEach(function (d) { d.addEventListener('toggle', function () { if (d.open) redrawAll(); }); });
  redrawAll();
  var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(redrawAll, 120); });
})();
