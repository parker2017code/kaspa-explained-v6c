// Collision demo: single chain vs blockDAG under the same block arrivals.
// One copy, loaded by index.html. It used to live
// inline in both pages; the copies drifted and one correctness bug had to
// be found twice (TODO.md, Aug 29, 2026). Self-initializes on any element
// carrying data-collision-sim, whose value is the element-id prefix.

      function initCollisionSim(rootId, prefix){
        const RATE_LOG_MIN = Math.log10(1/600), RATE_LOG_MAX = Math.log10(32);
        const DELAY_LOG_MIN = Math.log10(0.05), DELAY_LOG_MAX = Math.log10(5);
        const root = document.getElementById(rootId);
        const rateInput = document.getElementById(prefix + 'rate');
        const delayInput = document.getElementById(prefix + 'delay');
        const rateVal = document.getElementById(prefix + 'rateVal');
        const delayVal = document.getElementById(prefix + 'delayVal');
        const chainCanvas = document.getElementById(prefix + 'chainCanvas');
        const dagCanvas = document.getElementById(prefix + 'dagCanvas');
        const chainCtx = chainCanvas.getContext('2d');
        const dagCtx = dagCanvas.getContext('2d');
        const stepBtn = document.getElementById(prefix + 'step');
        const graphSummary = document.getElementById(prefix + 'graphSummary');
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        function lambda() {
          const t = rateInput.value / 1000;
          return Math.pow(10, RATE_LOG_MIN + t * (RATE_LOG_MAX - RATE_LOG_MIN));
        }
        function delay() {
          const t = delayInput.value / 1000;
          return Math.pow(10, DELAY_LOG_MIN + t * (DELAY_LOG_MAX - DELAY_LOG_MIN));
        }
        function fmtRate(r) {
          if (r < 1) return '1 every ' + humanDuration(1 / r);
          return r.toFixed(r < 10 ? 1 : 0) + ' a second';
        }
        function fmtDelay(d) {
          if (d < 1) return Math.round(d * 1000) + ' ms';
          return d.toFixed(1) + ' s';
        }
        function humanDuration(seconds) {
          if (seconds < 1) return Math.max(1, Math.round(seconds * 1000)) + ' ms';
          if (seconds < 60) return (seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)) + ' seconds';
          if (seconds < 3600) return Math.round(seconds / 60) + ' minutes';
          return (seconds / 3600).toFixed(1) + ' hours';
        }

        function meanIntervalReal() { return 1 / lambda(); }

        const T_KASPA = (Math.log10(10) - RATE_LOG_MIN) / (RATE_LOG_MAX - RATE_LOG_MIN);
        // Playback pace has one fixed point: at 1 block a second the display
        // shows a block a second, real time. At and above that rate there is
        // no compression at all, so 32 a second means 32 a second on screen.
        // Below it the display rate is the seventh root of the real rate,
        // compressed hard enough that Bitcoin's one-every-10-minutes lands
        // every couple of seconds instead of reading as a label nobody waits
        // for. The collision math always uses the real rate and delay.
        function playbackRate(L) { return L >= 1 ? L : Math.pow(L, 1 / 7); }
        function playbackInterval() { return 1 / playbackRate(lambda()); }

        const N = 20;
        let virtualClock = 0;
        let total = 0, discarded = 0;
        let chainTip = { id: 0, tSeen: 0 };
        let dagTips = [{ id: 0, tSeen: 0 }];
        let chainBlocks = [{ id: 0, miner: 0, orphaned: false, born: 0, t: 0 }];
        let dagBlocks = [{ id: 0, miner: 0, parents: [], born: 0, t: 0, seen: 0 }];
        let autoTimer = null;
        let rafId = null;

        // Blocks are found by a Poisson process, so the gap between them is
        // exponentially distributed, never constant. This was written once and
        // left unwired while the scheduler used a fixed timer, so the tally was
        // sampling correctly underneath while the screen showed a metronome,
        // which teaches the opposite of how mining works.
        // 1 - Math.random() keeps the argument in (0, 1]; Math.random() can
        // return 0 and log(0) is -Infinity.
        function nextWaitMs() { return -Math.log(1 - Math.random()) * playbackInterval() * 1000; }

        function resetSim() {
          virtualClock = 0; total = 0; discarded = 0;
          chainTip = { id: 0, tSeen: 0 };
          dagTips = [{ id: 0, tSeen: 0 }];
          chainBlocks = [{ id: 0, miner: 0, orphaned: false, born: performance.now(), t: 0 }];
          dagBlocks = [{ id: 0, miner: 0, parents: [], born: performance.now(), t: 0, seen: 0 }];
        }

        function generateEvent() {
          const L = lambda(), D = delay();
          virtualClock += (-Math.log(Math.random()) / L);
          const tMake = virtualClock;
          const tSeen = tMake + D;
          const miner = Math.floor(Math.random() * 4);
          const id = ++total;
          const now = performance.now();

          const orphaned = tMake < chainTip.tSeen;
          if (orphaned) discarded++;
          else chainTip = { id, tSeen };
          chainBlocks.push({ id, miner, orphaned, born: now, t: tMake });
          if (chainBlocks.length > N) chainBlocks.shift();

          // A block builds on every tip it can already see. When it can see none,
          // it builds on the most recent block it CAN see, never on a tip it
          // could not have seen. The old fallback handed it the invisible tip
          // anyway, so every block consumed the single tip and became the single
          // tip: measured at 10 blocks a second, 100% of blocks ended up with
          // exactly one parent and the "BlockDAG" panel drew a chain. With this,
          // 25% of blocks carry two or more parents, which is the whole point.
          let visible = dagTips.filter(t => t.tSeen <= tMake);
          if (visible.length === 0) {
            const seen = dagBlocks.filter(b => b.seen !== undefined && b.seen <= tMake);
            visible = seen.length ? [{ id: seen[seen.length - 1].id }] : [{ id: dagBlocks[0].id }];
          }
          const parentIds = visible.map(t => t.id);
          dagTips = dagTips.filter(t => parentIds.indexOf(t.id) === -1);
          dagTips.push({ id, tSeen });
          dagBlocks.push({ id, miner, parents: parentIds, born: now, t: tMake, seen: tSeen });
          if (dagBlocks.length > N) dagBlocks.shift();

          updateStats();
        }

        // A share under 10% rounded to whole percent reads as "about 0%" at
        // Bitcoin's block rate, which is a real number turned into a wrong one.
        function fmtPct(v) {
          if (v >= 10) return v.toFixed(0);
          if (v >= 1) return v.toFixed(1);
          return v.toFixed(2);
        }

        function updateStats() {
          const kept = total - discarded;
          const ld = lambda() * delay();
          const predictedDiscardPct = (ld / (1 + ld)) * 100;
          document.getElementById(prefix + 'chainStat').textContent =
            'so far: ' + kept.toLocaleString() + ' kept, ' + discarded.toLocaleString() + ' thrown away';
          document.getElementById(prefix + 'dagStat').textContent =
            'so far: ' + total.toLocaleString() + ' kept, 0 thrown away';
          document.getElementById(prefix + 'resultLine').innerHTML =
            'A single chain throws away about <b>' + fmtPct(predictedDiscardPct) + '%</b> of its blocks at this rate.';
          if (graphSummary) {
            graphSummary.textContent = 'Graph summary: the single-chain view has ' + kept.toLocaleString() +
              ' kept and ' + discarded.toLocaleString() + ' thrown-away blocks in this run. The blockDAG view keeps all ' +
              total.toLocaleString() + ' blocks and connects each one to the parents it saw.';
          }
        }

        function fitCanvas(c) {
          const dpr = window.devicePixelRatio || 1;
          const w = c.clientWidth, h = c.clientHeight;
          if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
            c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
          }
          const ctx = c.getContext('2d');
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          return { w, h };
        }


        // These are blocks, so they are drawn as blocks. A circle reads as a
        // data point; a rounded rectangle reads as the thing being described.
        function blockPath(ctx, x, y, w, h, r) {
          ctx.beginPath();
          ctx.moveTo(x - w / 2 + r, y - h / 2);
          ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
          ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
          ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
          ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
          ctx.closePath();
        }

        // Nothing is allowed to leave its canvas. Stacked rows and the off-line
        // discarded blocks both push away from the center, and at high
        // concurrency that ran past the edge and clipped blocks out of view.
        function clampY(y, h, half) {
          return Math.max(half + 2, Math.min(h - half - 2, y));
        }

        // A chain is a line, so every block it keeps sits on one. Blocks it
        // discarded sit off the line, unconnected, which is what "ignored"
        // actually looks like. Spreading kept blocks across miner lanes made
        // the chain zigzag, which a chain never does.
        function chainY(h, b) {
          if (!b.orphaned) return h / 2;
          return h / 2 + (b.id % 2 === 0 ? -1 : 1) * h * 0.30;
        }

        // The DAG is laid out by when a block was mined, not by its index. With
        // index spacing no two blocks ever shared a horizontal position, so
        // concurrent blocks were drawn one after another and the panel rendered
        // as a chain. Parallelism is the one thing this panel exists to show.
        function timeX(w, t, t0, t1) {
          if (!(t1 > t0)) return w / 2;
          return 22 + (w - 44) * ((t - t0) / (t1 - t0));
        }

        // Vertical position stacks blocks that overlap in time. Miner lanes put
        // consecutive blocks on random rows, which drew one wandering line and
        // made a DAG look like a chain. Here the first block at a given moment
        // takes the spine and anything concurrent with it steps off, alternating
        // above and below, so a burst of parallel blocks reads as a column.
        function dagLayout(blocks, w, h, t0, t1, d) {
          const pos = {};
          const placed = [];
          // Two blocks are concurrent when they were mined within one network
          // delay of each other, because neither could have seen the other. That
          // is the model's own definition, so the stacking threshold comes from
          // it rather than from a pixel guess: an earlier fixed 15px window sat
          // right at the average block spacing and stacked almost nothing.
          const span = (t1 > t0) ? (t1 - t0) : 1;
          const windowPx = Math.max(10, (w - 44) * (d / span));
          blocks.forEach((b) => {
            const x = timeX(w, b.t, t0, t1);
            let row = 0;
            while (placed.some(q => Math.abs(q.x - x) < windowPx && q.row === row)) row++;
            placed.push({ x, row });
            const step = Math.min(24, (h - 20) / 5);
            const dir = row % 2 === 1 ? -1 : 1;
            const rank = Math.ceil(row / 2);
            pos[b.id] = { x, y: clampY(h / 2 + dir * rank * step, h, 8) };
          });
          return pos;
        }

        function popScale(ageMs) {
          if (reducedMotion) return 1;
          const t = Math.min(1, ageMs / 260);
          const eased = 1 - Math.pow(1 - t, 3);
          return 0.4 + eased * 0.6 + (t < 1 ? Math.sin(t * Math.PI) * 0.15 : 0);
        }

        function render() {
          const now = performance.now();
          const cs = fitCanvas(chainCanvas);
          chainCtx.clearRect(0, 0, cs.w, cs.h);
          const style = getComputedStyle(document.getElementById(rootId));
          const green = style.getPropertyValue('--green').trim();
          const pink = style.getPropertyValue('--orange').trim();
          const line = style.getPropertyValue('--line-bright').trim();

          chainCtx.strokeStyle = line;
          chainCtx.lineWidth = 1.5;
          // Both panels share one time axis. Spacing is elapsed time, not slot
          // number, so a gap on screen is a real gap between blocks, and the
          // same block sits at the same x in both panels.
          const ct0 = chainBlocks[0].t;
          const ct1 = chainBlocks[chainBlocks.length - 1].t;
          // The spine used to be drawn only between kept blocks inside the
          // 20-block window. Raise latency and almost everything is orphaned, so
          // the window holds no kept block and the chain vanished entirely:
          // measured at max rate and max delay, zero line pixels and zero kept
          // blocks painted, leaving orphans floating against nothing while the
          // legend still read "kept, on the chain". The chain does not stop
          // existing because this view happens to contain none of its blocks, so
          // its line is drawn across the full width first, faintly, and the
          // segments between kept blocks are drawn over it.
          const spineY = clampY(chainY(cs.h, { orphaned: false }), cs.h, 9);
          chainCtx.save();
          chainCtx.globalAlpha = 0.35;
          chainCtx.beginPath();
          chainCtx.moveTo(0, spineY);
          chainCtx.lineTo(cs.w, spineY);
          chainCtx.stroke();
          chainCtx.restore();

          let prevX = null, prevY = null;
          chainBlocks.forEach((b, i) => {
            const x = timeX(cs.w, b.t, ct0, ct1);
            const y = clampY(chainY(cs.h, b), cs.h, 9);
            if (!b.orphaned && prevX !== null) {
              chainCtx.beginPath();
              chainCtx.moveTo(prevX, prevY);
              chainCtx.lineTo(x, y);
              chainCtx.stroke();
            }
            if (!b.orphaned) { prevX = x; prevY = y; }
          });
          chainBlocks.forEach((b, i) => {
            const x = timeX(cs.w, b.t, ct0, ct1);
            const y = clampY(chainY(cs.h, b), cs.h, 9);
            const scale = popScale(now - b.born);
            // Both panels hold the same 20 blocks at the same slot and lane, so
            // a discarded block sits directly above the copy the DAG keeps, and
            // that comparison is the entire point of the demo. Fading the
            // discarded ones to 45% and shrinking them turned two thirds of this
            // panel into ghosts, so it stopped reading as the same blocks under a
            // different rule. Same size, full opacity, hollow: thrown away is an
            // empty ring where the DAG below has something solid.
            blockPath(chainCtx, x, y, 15 * scale, 11 * scale, 3);
            if (b.orphaned) {
              chainCtx.strokeStyle = pink;
              chainCtx.lineWidth = 2;
              chainCtx.stroke();
            } else {
              chainCtx.fillStyle = green;
              chainCtx.fill();
            }
          });

          const ds = fitCanvas(dagCanvas);
          dagCtx.clearRect(0, 0, ds.w, ds.h);
          const idIndex = {};
          dagBlocks.forEach((b, i) => { idIndex[b.id] = i; });
          dagCtx.strokeStyle = line;
          dagCtx.lineWidth = 1.2;
          const t0 = dagBlocks[0].t;
          const t1 = dagBlocks[dagBlocks.length - 1].t;
          const dagPos = dagLayout(dagBlocks, ds.w, ds.h, t0, t1, delay());
          dagBlocks.forEach((b, i) => {
            const x = dagPos[b.id].x;
            const y = dagPos[b.id].y;
            // A parent older than the 20-block window used to drop its edge
            // silently. At high latency every parent is outside the window, so
            // the panel drew no edges at all while its own caption said each
            // block points at the parents it saw: measured zero edge pixels at
            // max rate and max delay. An off-window parent is still a parent, so
            // the edge runs to the left border instead of disappearing. One stub
            // per block, not one per missing parent, or the panel fills with
            // overlapping lines to the same edge.
            let offWindow = false;
            b.parents.forEach(pid => {
              const pi = idIndex[pid];
              if (pi === undefined) { offWindow = true; return; }
              const pb = dagBlocks[pi];
              const px = dagPos[pb.id].x;
              const py = dagPos[pb.id].y;
              dagCtx.beginPath();
              dagCtx.moveTo(px, py);
              dagCtx.lineTo(x, y);
              dagCtx.stroke();
            });
            if (offWindow) {
              // A short leader, not a line to the border. Running it to x=0 was
              // correct about the parent being off-window and wrong about
              // everything else: at high delay every block's parent is off-window,
              // so every block drew a full-width rule and the panel read as ruled
              // paper rather than a graph. A stub says the edge continues past the
              // view without pretending to show where it lands.
              dagCtx.beginPath();
              dagCtx.moveTo(Math.max(0, x - 16), y);
              dagCtx.lineTo(x, y);
              dagCtx.stroke();
            }
          });
          dagBlocks.forEach((b, i) => {
            const x = dagPos[b.id].x;
            const y = dagPos[b.id].y;
            const scale = popScale(now - b.born);
            dagCtx.fillStyle = green;
            blockPath(dagCtx, x, y, 14 * scale, 10 * scale, 3);
            dagCtx.fill();
          });

          const stillAnimating = chainBlocks.some(b => now - b.born < 260) || dagBlocks.some(b => now - b.born < 260);
          if (!reducedMotion && stillAnimating) {
            rafId = requestAnimationFrame(render);
          } else {
            rafId = null;
          }
        }

        function requestRender() {
          if (rafId === null) rafId = requestAnimationFrame(render);
        }

        function scheduleNext() {
          if (reducedMotion) return;
          const waitMs = nextWaitMs();
          autoTimer = setTimeout(() => { generateEvent(); requestRender(); scheduleNext(); }, waitMs);
        }

        function fmtShown(s) {
          if (s < 1) return Math.round(s * 1000) + ' ms';
          return s.toFixed(1) + ' s';
        }

        function updateHonesty() {
          const real = meanIntervalReal();
          const shown = playbackInterval();
          const note = document.getElementById(prefix + 'honestyNote');
          if (shown < real * 0.85) {
            const n = Math.round(real / shown);
            note.textContent = 'A block at this rate arrives every ' + humanDuration(real) +
              ' in reality, sped up about ' + n + 'x here so the wait is watchable. From one block a second upward, playback is real time.';
          } else {
            note.textContent = 'Real time: blocks arrive here as fast as they would on a network running this rate, one every ' +
              fmtShown(shown) + '.';
          }
        }

        function onSliderChange() {
          rateVal.textContent = fmtRate(lambda());
          delayVal.textContent = fmtDelay(delay());
          updateHonesty();
          if (autoTimer) clearTimeout(autoTimer);
          resetSim();
          updateStats();
          requestRender();
          if (!reducedMotion) scheduleNext();
        }

        rateInput.addEventListener('input', onSliderChange);
        delayInput.addEventListener('input', onSliderChange);
        if (typeof ResizeObserver === 'function' && root) {
          new ResizeObserver(requestRender).observe(root);
        } else {
          window.addEventListener('resize', requestRender);
        }

        rateInput.value = Math.round(T_KASPA * 1000);
        onSliderChange();

        if (reducedMotion) {
          stepBtn.hidden = false;
          stepBtn.addEventListener('click', function () { generateEvent(); render(); });
        }
      }

document.querySelectorAll('[data-collision-sim]').forEach(function (el) {
  initCollisionSim(el.id, el.getAttribute('data-collision-sim'));
});
