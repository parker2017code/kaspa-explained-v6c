/* v6c poster layer: the header takes the color of the field under it, and the band shows real block ids. */
(function () {
  'use strict';
  var bar = document.getElementById('bar');
  var fields = Array.prototype.slice.call(document.querySelectorAll('main [data-field], footer[data-field]'));
  if (bar && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) bar.dataset.field = e.target.dataset.field; });
    }, { rootMargin: '-28px 0px -96% 0px' });
    fields.forEach(function (f) { io.observe(f); });
  }

  var track = document.getElementById('bandTrack'), note = document.getElementById('bandNote'), shown = 0;
  function fill() {
    var L = window.KLive; if (!L || !track || !L.blocks || L.blocks.size < 12) return;
    var list = []; L.blocks.forEach(function (b) { list.push(b); });
    list.sort(function (a, b) { return b.t - a.t; });
    var ids = list.slice(0, 14).map(function (b) { return String(b.h).slice(0, 8); });
    var html = ids.map(function (h) { return '<span>' + h.replace(/[^0-9a-f]/gi, '') + '</span>'; }).join('');
    track.innerHTML = html + html;
    shown = Date.now();
    if (L.sim && note) note.textContent = 'Simulation: the Kaspa network could not be reached, so these block ids are made up by this page.';
  }
  function poll() { if (!shown || Date.now() - shown > 45000) fill(); }
  setInterval(poll, 1500);
})();

/* Motion that never "keeps running": the band slides with the scroll, entrances rise once. */
(function () {
  'use strict';
  if (!window.matchMedia || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var track = document.getElementById('bandTrack'), band = track && track.parentNode, raf = 0;
  function slide() {
    raf = 0; if (!track) return;
    var r = band.getBoundingClientRect(), w = track.scrollWidth / 2 || 1;
    var x = ((window.scrollY * 0.6) % w);
    track.style.transform = 'translate3d(' + (-x).toFixed(1) + 'px,0,0)';
    if (r.bottom < 0) return;
  }
  window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(slide); }, { passive: true });
  slide();
  var els = document.querySelectorAll('.chapter h2, .chapter .slab, .versus figure, .tiles li, .qcard, .stair span');
  if (!('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('up'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  Array.prototype.forEach.call(els, function (el) {
    var r = el.getBoundingClientRect(); if (r.top < innerHeight) return;
    el.classList.add('rise'); io.observe(el);
  });
})();

/* "Take a fresh ten seconds" only makes sense after the first line-up. */
(function () {
  var go = document.getElementById('oGo'), again = document.getElementById('oAgain');
  if (go && again) go.addEventListener('click', function () { again.hidden = false; });
})();
