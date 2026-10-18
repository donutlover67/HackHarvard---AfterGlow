// The motion layer: entrances, count-ups, the hero re-pairing, the headline reveal, the steps, the horizontal strip, route
// slides, and (heroPanel) the drawn cell that follows the pointer. Transform, opacity, colour and filter only.
// Readers who prefer reduced motion, or open ?motion=off, get the end states at once; loops pause while
// the tab is hidden. Nothing here touches the document at load, so bun can test the pure parts.
window.SSMotion = (function () {
  const win = window;
  // ---------- pure parts ----------
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
  const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  // "80–88%" -> ["", {n:80,d:0}, "–", {n:88,d:0}, "%"]: every number scales, everything else stays
  function parseCount(text) {
    const parts = [], re = /\d+(?:\.\d+)?/g; let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push({ n: Number(m[0]), d: (m[0].split(".")[1] || "").length });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }
  const formatCount = (parts, t) => parts.map((p) => (typeof p === "string" ? p : (p.n * t).toFixed(p.d))).join("");
  // how far a pinned region has been scrolled through: 0 at its top, 1 when only one viewport of it is left
  function progressOf(rect, viewportH) {
    const room = rect.height - viewportH;
    if (room <= 0) return rect.top < 0 ? 1 : 0;
    return clamp01(-rect.top / room);
  }
  const supports = (w) => ({
    io: typeof w.IntersectionObserver === "function",
    idle: typeof w.requestIdleCallback === "function",
    viewTransitions: !!(w.document && typeof w.document.startViewTransition === "function"),
    fonts: !!(w.document && w.document.fonts),
  });
  const reduced = () => !!(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches) || /[?&]motion=off\b/.test(win.location.search);
  const forceSvg = () => /[?&]hero=svg\b/.test(win.location.search);

  // ---------- one frame loop for everything time-based; it stops while the tab is hidden ----------
  let hidden = false, rafId = 0;
  const loops = new Set();
  function frame(now) {
    rafId = 0;
    if (hidden) return;
    for (const l of [...loops]) { let keep = false; try { keep = l(now); } catch (_) { keep = false; } if (!keep) loops.delete(l); }
    if (loops.size) rafId = requestAnimationFrame(frame);
  }
  function loop(tick) {
    loops.add(tick);
    if (!rafId && !hidden) rafId = requestAnimationFrame(frame);
    return () => loops.delete(tick);
  }
  const rafThrottle = (fn) => { let waiting = false; return () => { if (waiting) return; waiting = true; requestAnimationFrame(() => { waiting = false; fn(); }); }; };

  // the nav, as the ui-refresh branch's motion.js has it (updateNav there): hidden over a full-bleed hero, then slides
  // in; the sun fills as you scroll. This site has no .hero--full, so the nav shows on every page from the first paint.
  const $ = (sel, root = document) => root.querySelector(sel);
  let route = "index";
  function updateNav() {
    const nav = $(".nav");
    if (!nav) return;
    const y = scrollY, max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const sun = $(".nav__sun");
    if (sun) sun.style.setProperty("--p", clamp01(y / max).toFixed(3));
    const hero = route === "index" && $(".hero--full");
    nav.classList.toggle("is-tucked", !!hero && y < innerHeight * 0.25);
  }
  // the nav pills' hover particles (motion.css .pop): each page's pill has its own set, drawn as strokes that pop out
  // of the pill. [where, relative to the pill; viewBox; colour; paths]. Passports: a check, ticks and a stamp.
  // Array Builder: wiring, a plus and a minus. Impact: sun rays above and below. Second Use: arrows going round.
  const SIDE_L = "right:calc(100% + 3px);top:50%;margin-top:-8px;width:12px;height:16px";
  const SIDE_R = "left:calc(100% + 3px);top:50%;margin-top:-8px;width:12px;height:16px";
  const POPS = {
    passports: [
      ["right:-7px;bottom:calc(100% - 5px);width:16px;height:14px", "0 0 16 14", "sun", ["M2 7l4 4 8-9"]],
      [SIDE_L, "0 0 12 16", "cell", ["M10 3 3 1", "M9 8H1", "M10 13l-7 2"]],
      ["left:14px;top:calc(100% + 4px);width:9px;height:9px", "0 0 9 9", "cell", ["M1.5 1.5h6v6h-6z"]],
    ],
    build: [
      ["left:calc(100% + 3px);top:50%;margin-top:-6px;width:18px;height:12px", "0 0 18 12", "cell", ["M1 6l3-4 4 8 4-8 3 4h2"]],
      ["left:12px;bottom:calc(100% + 3px);width:10px;height:10px", "0 0 10 10", "sun", ["M5 1v8", "M1 5h8"]],
      ["right:16px;top:calc(100% + 6px);width:10px;height:4px", "0 0 10 4", "sun", ["M1 2h8"]],
      ["right:calc(100% + 4px);top:50%;margin-top:-2px;width:14px;height:4px", "0 0 14 4", "cell", ["M1 2h1", "M6 2h1", "M11 2h1"]],
    ],
    impact: [
      ["left:50%;margin-left:-14px;bottom:calc(100% + 2px);width:28px;height:12px", "0 0 28 12", "sun", ["M5 11 1 5", "M14 10V1", "M23 11l4-6"]],
      ["left:50%;margin-left:-14px;top:calc(100% + 2px);width:28px;height:12px", "0 0 28 12", "sun", ["M5 1 1 7", "M14 2v9", "M23 1l4 6"]],
      ["right:calc(100% + 3px);top:50%;margin-top:-2px;width:10px;height:4px", "0 0 10 4", "cell", ["M9 2H1"]],
      ["left:calc(100% + 3px);top:50%;margin-top:-2px;width:10px;height:4px", "0 0 10 4", "cell", ["M1 2h8"]],
    ],
    reuse: [
      ["right:-9px;bottom:calc(100% - 9px);width:18px;height:18px", "0 0 18 18", "cell", ["M3 10a6 6 0 0 1 11-4", "M14 1.5V6H9.5"]],
      ["left:-9px;top:calc(100% - 9px);width:18px;height:18px", "0 0 18 18", "cell", ["M15 8a6 6 0 0 1-11 4", "M4 16.5V12h4.5"]],
      ["left:10px;bottom:calc(100% + 4px);width:10px;height:10px", "0 0 10 10", "sun", ["M1.5 1.5l2 2", "M8.5 1.5l-2 2", "M1.5 8.5l2-2", "M8.5 8.5l-2-2"]],
      ["right:14px;top:calc(100% + 4px);width:9px;height:9px", "0 0 9 9", "sun", ["M4.5 1a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7"]],
    ],
  };
  POPS.other = [[SIDE_L, "0 0 12 16", "cell", ["M10 3 3 1", "M9 8H1", "M10 13l-7 2"]], [SIDE_R, "0 0 12 16", "cell", ["M2 3l7-2", "M3 8h8", "M2 13l7 2"]]];
  function navPops() {
    document.querySelectorAll(".nav__links a").forEach((a) => {
      if (a.querySelector(".pop")) return;
      const set = POPS[a.dataset.route] || POPS.other;
      a.insertAdjacentHTML("beforeend", set.map(([box, vb, c, ds], k) => `<svg class="pop pop--${c}" style="${box};--k:${k}" viewBox="${vb}" aria-hidden="true" focusable="false">${ds.map((d, i) => `<path d="${d}" pathLength="1" style="--i:${k + i}"/>`).join("")}</svg>`).join(""));
    });
  }
  function init() {
    try { navPops(); } catch (_) { /* decoration only */ }
    document.documentElement.classList.add(reduced() ? "reduced" : "has-motion");
    const onNav = rafThrottle(updateNav);
    addEventListener("scroll", onNav, { passive: true });
    addEventListener("resize", onNav, { passive: true });
    updateNav();
    hidden = document.hidden;
    document.addEventListener("visibilitychange", () => {
      hidden = document.hidden;
      if (!hidden && loops.size && !rafId) rafId = requestAnimationFrame(frame);
      visibilityHooks.forEach((fn) => { try { fn(!hidden); } catch (_) {} });
    });
  }
  const visibilityHooks = new Set();

  // call fn(el) once when el is `threshold` visible; without IntersectionObserver, at once
  function observe(els, fn, threshold) {
    const list = els.filter(Boolean);
    if (!list.length) return () => {};
    if (typeof IntersectionObserver !== "function") { list.forEach(fn); return () => {}; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); fn(e.target); } }), { threshold });
    list.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }

  // ---------- entrances: a section's parts rise in, staggered, once ----------
  function entrances(view) {
    const sections = [...view.querySelectorAll("[data-in]")];
    const rest = [];
    sections.forEach((el) => {
      if (el.hasAttribute("data-hero") || el.classList.contains("is-in")) { el.classList.add("is-in"); return; }  // the hero is on screen at first paint; its moves are its own
      const kids = el.children.length === 1 ? el.children[0].children : el.children;
      [...kids].forEach((c, i) => { c.classList.add("m-part"); c.style.setProperty("--i", String(Math.min(i, 6))); });
      rest.push(el);
    });
    if (reduced()) { rest.forEach((el) => el.classList.add("is-in")); return () => {}; }
    const stopIo = observe(rest, (el) => el.classList.add("is-in"), 0.2);
    // a fast flick or a throttled frame can carry a section past the observer: anything whose top has entered the viewport shows
    let last = 0;
    const sweep = () => { const now = Date.now(); if (now - last < 120) return; last = now; rest.forEach((el) => { if (!el.classList.contains("is-in") && el.getBoundingClientRect().top < innerHeight * 0.9) el.classList.add("is-in"); }); view.querySelectorAll("[data-reveal]:not(.is-revealed)").forEach((el) => { if (el.getBoundingClientRect().bottom < innerHeight * 0.6) el.classList.add("is-revealed"); }); view.querySelectorAll(".step:not(.is-lit)").forEach((el) => { if (el.getBoundingClientRect().bottom < innerHeight * 0.3) el.classList.add("is-lit"); }); };
    addEventListener("scroll", sweep, { passive: true });
    return () => { stopIo(); removeEventListener("scroll", sweep); };
  }

  // ---------- count-ups: numerals run from 0 to their value the first time they are seen ----------
  function countUps(view) {
    const els = [...view.querySelectorAll("[data-count]")].filter((el) => !el.dataset.counted);
    const start = (el) => {
      if (el.dataset.counted) return;   // two observers can see the same numeral when runs arrive before the first fires
      el.dataset.counted = "1";
      const parts = parseCount(el.textContent);
      if (reduced() || !parts.some((p) => typeof p !== "string")) return;
      const t0 = performance.now(), dur = 600;
      el.textContent = formatCount(parts, 0);
      loop((now) => { const t = clamp01((now - t0) / dur); el.textContent = formatCount(parts, easeOut(t)); return t < 1; });
    };
    return observe(els, start, 0.5);
  }

  // ---------- the re-pairing: scroll progress through the hero moves cells 2 and 3, redraws the wires, counts the gain ----------
  function repairing(view) {
    const hero = view.querySelector("[data-hero]");
    const none = { setHook() {}, destroy() {}, progress: () => 1 };
    if (!hero) return none;
    const diagram = hero.querySelector(".rp"), numEl = hero.querySelector("[data-rp-num]"), pin = hero.querySelector(".repair__pin");
    const gain = () => Number(hero.dataset.gain) || 0;
    const setVars = (k, w, g) => { hero.style.setProperty("--k", k.toFixed(4)); hero.style.setProperty("--w", w.toFixed(4)); hero.style.setProperty("--g", g.toFixed(4)); };
    const fill = hero.querySelector(".repair__fill");
    // the bubble's radius in vmax and whether the panels show; the layer itself is fixed to the screen, so it is
    // switched off before the section approaches and once it has scrolled past
    const setBubble = (r, show, on) => { hero.style.setProperty("--r", r.toFixed(2)); hero.style.setProperty("--show", show.toFixed(4)); if (fill) fill.classList.toggle("is-off", !on); };
    if (reduced()) { setVars(1, 1, 1); setBubble(170, 1, false); if (numEl) numEl.textContent = `+${Math.round(gain())}%`; return none; }
    const pinned = () => !!pin && getComputedStyle(pin).position === "sticky";
    let raw = -1, hook = null;
    const apply = (p) => {
      raw = p;
      // a beat on wiring A first, then the swap through the middle, then the wires redraw and the gain counts, then a hold
      const cells = smooth((p - 0.16) / 0.44);                                             // the swap, 16% to 60%
      const wires = p < 0.12 ? 1 : p < 0.34 ? 1 - (p - 0.12) / 0.22 : clamp01((p - 0.62) / 0.2);   // erased as the cells start, redrawn once they land
      const g = cells;                                                                     // the plate and the numeral rise with the swap itself
      setVars(cells, wires, g);
      if (numEl) numEl.textContent = `+${Math.round(gain() * g)}%`;   // in step with the cells, not ahead of them
      if (hook) hook(p);
    };
    function update() {
      const vh = innerHeight;
      if (pinned()) {
        const rect = hero.getBoundingClientRect(), q = progressOf(rect, vh);
        if (rect.top > 0) {
          // approaching: a semicircle rises at the bottom of the screen while the first screen is still leaving
          const pre = clamp01((vh - rect.top) / (vh * 0.8));
          setBubble(20 * smooth(pre), 0, pre > 0);
        } else if (rect.bottom <= vh) {
          setBubble(170, 1, false);   // scrolled past: the pin's own navy carries on, the screen layer goes
        } else {
          // the screen holds: the bubble swells slowly at first and fast at the end, then the panels show and swap
          const x = clamp01(q / 0.42);
          setBubble(20 + 160 * x * x * x, clamp01((q - 0.3) / 0.14), true);
        }
        const p = clamp01((q - 0.38) / 0.62);
        if (p !== raw) apply(p);
        return;
      }
      // unpinned (phones): the ground is simply navy and the swap plays as the diagram rises into view
      setBubble(170, 1, false);
      const r = diagram.getBoundingClientRect(), docTop = r.top + scrollY;
      const start = Math.max(0, docTop - vh * 0.9);
      const end = Math.max(start + vh * 0.6, Math.min(start + vh, docTop + r.height * 0.35));
      const p = clamp01((scrollY - start) / (end - start));
      if (p !== raw) apply(p);
    }
    const onScroll = rafThrottle(update);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    addEventListener("pageshow", onScroll);   // a reload restores the scroll position after the first measure
    update();
    return { setHook(fn) { hook = fn; if (raw >= 0) fn(raw); }, progress: () => Math.max(0, raw), redraw() { if (raw >= 0) apply(raw); else update(); }, destroy() { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); removeEventListener("pageshow", onScroll); } };
  }

  // ---------- the strip: on fine pointers the section pins; the first stretch of scroll zooms the wirings in and
  // settles them, the rest slides them sideways, and each card arrives into place as it reaches the screen ----------
  function strip(view) {
    const section = view.querySelector("[data-strip]");
    const none = { size() {}, destroy() {} };
    if (!section) return none;
    const pin = section.querySelector(".strip__pin");
    const stage = section.querySelector(".strip__stage") || pin;
    const track = () => section.querySelector(".strip__track");
    const cards = () => [...section.querySelectorAll(".wiring")];
    const mq = matchMedia("(min-width: 760px) and (pointer: fine)");
    if (reduced()) { section.classList.add("is-row"); return none; }
    let overflow = 0, approach = 0;
    const reset = () => { const t = track(); if (t) t.style.transform = ""; stage.style.transform = ""; stage.style.opacity = ""; cards().forEach((c) => { c.style.removeProperty("--arrive"); c.style.removeProperty("--arc"); c.style.removeProperty("--rot"); }); };
    function update() {
      const t = track(); if (!t || !overflow) return;
      place(progressOf(section.getBoundingClientRect(), pin.offsetHeight) * (approach + overflow));
    }
    function place(scrolled) {
      const t = track(); if (!t || !overflow) return;
      // the approach: the stage grows from 0.86 to full size and rises into place; then the slide
      const a = approach ? smooth(Math.min(scrolled, approach) / approach) : 1;
      const x = Math.max(0, scrolled - approach);
      stage.style.transform = `translate3d(0, ${((1 - a) * 48).toFixed(1)}px, 0) scale(${(0.86 + 0.14 * a).toFixed(4)})`;
      stage.style.opacity = (0.4 + 0.6 * a).toFixed(3);
      t.style.transform = `translate3d(${(-x).toFixed(1)}px, 0, 0)`;
      // a card still off to the right sits a little lower and quieter until it has come in
      const vw = innerWidth;
      cards().forEach((c) => {
        const r = c.getBoundingClientRect(), dx = (r.left + r.width / 2 - vw / 2) / (vw / 2);   // -1 at the left edge, 1 at the right
        c.style.setProperty("--arrive", clamp01((vw - r.left) / (r.width * 0.9)).toFixed(3));
        c.style.setProperty("--arc", (Math.min(1, dx * dx) * 84).toFixed(1));               // the row bends like a ring: both ends dip (at most 84px)
        c.style.setProperty("--rot", (Math.max(-1.3, Math.min(1.3, dx)) * 2.5).toFixed(2));
      });
    }
    const row = () => { overflow = 0; section.style.height = ""; pin.style.paddingBlock = ""; section.classList.add("is-row"); };
    function size() {
      const t = track(); if (!t) return;
      reset();
      pin.style.paddingBlock = "";
      if (!mq.matches) { row(); return; }      // a window resized across 760 px, or a touch screen: the swipe row
      section.classList.remove("is-row");
      // a pin taller than the screen would hide its own bottom: tighten its padding first, and only then give up
      if (pin.offsetHeight > innerHeight) pin.style.paddingBlock = "40px";
      overflow = Math.max(0, t.scrollWidth - t.clientWidth);
      approach = Math.round(Math.min(420, innerHeight * 0.45));
      if (!overflow || pin.offsetHeight > innerHeight) { row(); return; }
      section.style.height = `${pin.offsetHeight + approach + overflow}px`;
      update();
    }
    const onScroll = rafThrottle(update), onResize = rafThrottle(size);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onResize);
    size();
    return { size, destroy() { removeEventListener("scroll", onScroll); removeEventListener("resize", onResize); section.style.height = ""; pin.style.paddingBlock = ""; reset(); } };
  }

  // ---------- reveals: headline lines rise out of their masks; the lede, the buttons and the slab follow ----------
  // The hidden state lives in CSS under html.has-motion only, so a failed script never hides a word.
  const revealNow = (el) => { if (el) el.classList.add("is-revealed"); };
  // The intro, on every page load: the sun draws itself (its outline, then its fill, then the rays one by one), comes
  // alive (breathing, turning, the beams reaching down), and the cell slides up into place under it. The text below the
  // fold is left to the scroll. Coming back to the front page within the app, and reduced motion, skip it.
  const INTRO = { place: 2600, done: 4200 };
  let introPlayed = false;
  function intro(view) {
    const hero = view.querySelector(".hero"), slot = view.querySelector(".hero__slot");
    if (!hero || reduced() || introPlayed) { if (slot && !reduced()) requestAnimationFrame(() => requestAnimationFrame(() => revealNow(slot))); else if (slot) revealNow(slot); return () => {}; }
    introPlayed = true;
    document.documentElement.classList.add("is-intro");
    if (slot) requestAnimationFrame(() => requestAnimationFrame(() => revealNow(slot)));
    const t1 = setTimeout(() => hero.classList.add("is-placed"), INTRO.place);
    const t2 = setTimeout(() => document.documentElement.classList.remove("is-intro"), INTRO.done);
    return () => { [t1, t2].forEach(clearTimeout); hero.classList.add("is-placed"); document.documentElement.classList.remove("is-intro"); if (slot) revealNow(slot); };
  }
  const revealedKeys = new Set(); // once per page load, per section: a redrawn section shows its title at once
  function watchReveal(view) {
    const els = [...view.querySelectorAll("[data-reveal]")].filter((el) => !el.closest("[data-hero]") && !el.classList.contains("is-revealed"));
    if (!els.length) return () => {};
    const keyOf = (el) => (el.closest("section") || el).className.split(" ")[0] + ":" + el.tagName;
    const pending = [];
    els.forEach((el) => { if (reduced() || revealedKeys.has(keyOf(el))) revealNow(el); else pending.push(el); });
    if (!pending.length) return () => {};
    const go = (el) => { revealedKeys.add(keyOf(el)); revealNow(el); };
    const stopIo = observe(pending, go, 0.5);
    const sweep = () => pending.forEach((el) => { if (!el.classList.contains("is-revealed") && el.getBoundingClientRect().top < innerHeight * 0.85) go(el); });
    addEventListener("scroll", sweep, { passive: true });
    return () => { stopIo(); removeEventListener("scroll", sweep); };
  }

  // ---------- the bench's four steps light one by one as the reader scrolls through their section ----------
  // On a wide screen they light in turn as the section passes a point 70% down the screen and their rail draws across;
  // on a phone each lights as its drawing reaches that point. Without script or under reduced motion all four are lit.
  function stepsDriver(view) {
    const none = { rebuild() {}, destroy() {} };
    const how = view.querySelector(".how");
    const steps = [...view.querySelectorAll(".step")];
    if (!how || !steps.length) return none;
    if (reduced()) { steps.forEach((s) => s.classList.add("is-lit")); return none; }
    const wires = [...view.querySelectorAll(".string__wire path")];
    const phone = () => matchMedia("(max-width: 760px)").matches;
    const docY = (el, frac) => { const r = el.getBoundingClientRect(); return scrollY + r.top + r.height * frac; };
    function update() {
      const tipY = scrollY + innerHeight * 0.7;
      const q = clamp01((tipY - how.offsetTop) / (how.offsetHeight || 1));
      steps.forEach((s, i) => {
        const lit = phone() ? tipY >= docY(s.querySelector(".step__glyph") || s, 0.5) - 14 : q >= (i + 1) / 5;
        s.classList.toggle("is-lit", lit);
      });
      const draw = (1 - clamp01(q * 1.25)).toFixed(3);
      wires.forEach((w) => { w.style.strokeDashoffset = draw; });
    }
    const onScroll = rafThrottle(update);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    update();
    return { rebuild: update, destroy() { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); } };
  }

  // ---------- route changes: the view slides along the nav axis ----------
  function transition(swap, dir) {
    document.documentElement.dataset.dir = dir === "back" ? "back" : "fwd";
    if (reduced()) { swap(); return Promise.resolve(); }
    if (typeof document.startViewTransition === "function") {
      let done = false;
      const run = () => { if (!done) { done = true; swap(); } };
      try {
        const vt = document.startViewTransition(run);
        // a skipped transition (a second navigation, a hidden tab) rejects these; none of that is an error here
        vt.ready.catch(() => {}); vt.updateCallbackDone.catch(() => {});
        // if no frame comes to capture the old view (hidden or throttled document), draw anyway
        const guard = setTimeout(() => { if (!done) { try { vt.skipTransition(); } catch (_) {} run(); } }, 350);
        return vt.finished.catch(() => {}).then(() => clearTimeout(guard));
      } catch (_) { run(); return Promise.resolve(); }
    }
    const view = document.getElementById("view");
    view.classList.add("is-leaving");
    return new Promise((resolve) => setTimeout(() => {
      view.classList.remove("is-leaving"); swap(); view.classList.add("is-entering");
      setTimeout(() => { view.classList.remove("is-entering"); resolve(); }, 260);
    }, 160));
  }

  // ---------- the passports collage: pans diagonally with the scroll; a card near the middle of the screen wakes ----------
  function collage(view) {
    const section = view.querySelector(".fpass");
    const none = { rebuild() {}, destroy() {} };
    if (!section || reduced()) return none;
    let io = null;
    const watch = () => {
      if (io) io.disconnect();
      if (typeof IntersectionObserver !== "function") { section.querySelectorAll(".ppass").forEach((c) => c.classList.add("is-near")); return; }
      io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("is-near", e.isIntersecting)), { rootMargin: "-38% 0px -38% 0px", threshold: 0 });
      section.querySelectorAll(".ppass").forEach((c) => io.observe(c));
    };
    const update = () => {
      const r = section.getBoundingClientRect(), vh = innerHeight;
      section.style.setProperty("--pan", clamp01((vh - r.top) / (vh + r.height)).toFixed(4));   // 0 as it enters from below, 1 as it leaves above
    };
    const onScroll = rafThrottle(update);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    watch(); update();
    return { rebuild() { watch(); update(); }, destroy() { if (io) io.disconnect(); removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); } };
  }

  // ---------- the drawn cell follows the pointer ----------
  // It leans toward the pointer (a CSS perspective transform on the svg), its shadow slides away from the sun, and the
  // sunlit corner of its face reaches further the more the face turns up and left, toward the sun. Left alone it sways
  // slowly. Nothing runs off screen, in a hidden tab, or under reduced motion.
  function heroPanel(slot) {
    const panel = slot && slot.querySelector(".hero__panel"), poly = slot && slot.querySelector("[data-lit-poly]"), blob = slot && slot.querySelector("[data-blob-at]");
    if (!panel) return () => {};
    // a clipPath may hold only shapes, so the window's travel, turn and breath all sit on the blob path's one transform
    const fine = matchMedia("(pointer: fine)").matches;
    let blobOn = false, bx = -999, by = -999;
    const placeBlob = (now) => { if (blob) blob.setAttribute("transform", blobOn ? `translate(${bx.toFixed(1)} ${by.toFixed(1)}) rotate(${((now / 45) % 360).toFixed(1)}) scale(${(1 + 0.07 * Math.sin(now / 900)).toFixed(3)})` : "translate(-999 -999)"); };
    const blobOff = () => { blobOn = false; placeBlob(0); };
    const pose = (nx, ny) => {
      const lit = clamp01(0.5 - nx * 0.28 - ny * 0.24), reach = 0.3 + lit * 1.1;
      panel.style.setProperty("--tx", (14 - ny * 7).toFixed(2)); panel.style.setProperty("--ty", (nx * 9).toFixed(2));
      panel.style.setProperty("--sx", (10 + nx * 7).toFixed(1)); panel.style.setProperty("--sy", (12 + ny * 6).toFixed(1));
      if (poly) poly.setAttribute("points", `0,0 ${Math.round(540 * reach)},0 0,${Math.round(405 * reach)}`);
    };
    if (reduced()) { pose(-0.3, -0.3); return () => {}; }
    let px = 0, py = 0, cx = 0, cy = 0, raf = 0, lastMove = 0, onScreen = true, dead = false;
    const frame = (now) => {
      raf = 0;
      if (dead || !onScreen || hidden) return;
      const idle = now - lastMove > 1800;
      const tx = idle ? 0.35 * Math.sin(now / 3800) - 0.15 : px, ty = idle ? 0.25 * Math.cos(now / 4700) - 0.1 : py;
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      pose(cx, cy);
      // the window's edge turns and breathes slowly, like liquid (the blob path is drawn around its own origin)
      if (blobOn) placeBlob(now);
      raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf && !dead && onScreen && !hidden) raf = requestAnimationFrame(frame); };
    const onPointer = (e) => {
      const r = slot.getBoundingClientRect();
      if (!r.width) return;
      const rx = ((e.clientX - (r.left + r.width / 2)) / r.width) * 2, ry = ((e.clientY - (r.top + r.height / 2)) / r.height) * 2;
      px = Math.max(-1, Math.min(1, rx)); py = Math.max(-1, Math.min(1, ry));
      // the window under the skin follows the pointer while it is over the drawing (the svg's own 400x300 frame)
      if (blob && fine) { if (Math.abs(rx) <= 1 && Math.abs(ry) <= 1) { bx = 200 + rx * 200; by = 150 + ry * 150; blobOn = true; placeBlob(performance.now()); } else blobOff(); }
      lastMove = performance.now(); wake();
    };
    const onLeave = () => blobOff();
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointercancel", onLeave);
    document.addEventListener("pointermove", onPointer, { passive: true });
    const io = typeof IntersectionObserver === "function" ? new IntersectionObserver((es) => es.forEach((e) => { onScreen = e.isIntersecting; wake(); }), { threshold: 0 }) : null;
    if (io) io.observe(slot);
    const onVis = (visible) => { if (visible) wake(); };
    visibilityHooks.add(onVis);
    wake();
    return () => { dead = true; if (raf) cancelAnimationFrame(raf); if (io) io.disconnect(); visibilityHooks.delete(onVis); document.removeEventListener("pointermove", onPointer); document.removeEventListener("pointerleave", onLeave); document.removeEventListener("pointercancel", onLeave); };
  }

  function mount(view, page) {
    const cleanups = [];
    route = page === "front" ? "index" : page;
    document.body.classList.toggle("has-hero", !!$(".hero--full", view));
    updateNav();
    const safe = (fn) => { try { const c = fn(); if (c) cleanups.push(typeof c === "function" ? c : () => c.destroy && c.destroy()); return c; } catch (err) { console.warn("motion:", err && err.message); return null; } };
    safe(() => entrances(view));
    safe(() => countUps(view));
    safe(() => watchReveal(view));   // every page: the Impact page's opening carries data-reveal too
    let stripCtl = null, stepsCtl = null, rpCtl = null, collageCtl = null;
    if (page === "front") {
      const rp = safe(() => repairing(view));
      rpCtl = rp;
      collageCtl = safe(() => collage(view));
      stripCtl = safe(() => strip(view));
      stepsCtl = safe(() => stepsDriver(view));
      safe(() => intro(view));
      safe(() => heroPanel(view.querySelector("[data-hero-slot]")));
    }
    // if anything above failed, nothing may stay hidden
    if (!reduced()) setTimeout(() => {
      view.querySelectorAll("[data-in]:not(.is-in)").forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add("is-in"); });
      view.querySelectorAll("[data-reveal]:not(.is-revealed)").forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add("is-revealed"); });
      view.querySelectorAll(".step:not(.is-lit)").forEach((el) => { if (el.getBoundingClientRect().bottom < innerHeight * 0.5) el.classList.add("is-lit"); });
    }, 2500);
    return {
      // runs arrived and front.js redrew its sections in place: count the new numerals, re-measure the strip, watch the new heading
      refresh() { updateNav(); safe(() => countUps(view)); if (rpCtl && rpCtl.redraw) rpCtl.redraw(); if (stripCtl) stripCtl.size(); if (stepsCtl) stepsCtl.rebuild(); if (collageCtl) collageCtl.rebuild(); safe(() => watchReveal(view)); },
      destroy() { cleanups.forEach((fn) => { try { fn(); } catch (_) {} }); },
    };
  }

  return { init, mount, transition, reduced, parseCount, formatCount, easeOut, supports, progressOf };
})();
