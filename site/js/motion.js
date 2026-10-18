// The motion layer: the front page's night-to-day sky, entrances, count-ups, the headline reveal, the steps, the horizontal
// strip, route slides, the nav's sun, and (heroPanel) the drawn cell that follows the pointer. Transform, opacity, colour
// and filter only.
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

  // ---------- colour helpers for the sky (pure) ----------
  const hexRgb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim()); const n = m ? parseInt(m[1], 16) : 0xfbfcfd; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * clamp01(t)));
  const rgbCss = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  // WCAG relative luminance, 0 (black) to 1 (white)
  const luminance = (c) => { const l = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  // below this the sky counts as night: white text then reads better on it than navy does
  const NIGHT = 0.18;
  // The sky colour at viewport height yv. Each section names its own sky; across each boundary the colour blends over a
  // zone of up to 40% of the screen, so the change is gradual and every section sits on its own colour once it fills the view.
  function skyColour(rects, cols, yv, vh) {
    const n = rects.length;
    if (!n) return hexRgb("#fbfcfd");
    let i = 0;
    while (i < n - 1 && yv >= rects[i].bottom) i++;
    const zone = (j, k) => Math.max(1, Math.min(vh * 0.4, rects[j].height / 2, rects[k].height / 2));
    if (i > 0) { const z = zone(i - 1, i), b = rects[i].top; if (yv < b + z) return mixRgb(cols[i - 1], cols[i], smooth((yv - (b - z)) / (2 * z))); }
    if (i < n - 1) { const z = zone(i, i + 1), b = rects[i].bottom; if (yv > b - z) return mixRgb(cols[i], cols[i + 1], smooth((yv - (b - z)) / (2 * z))); }
    return cols[i].slice();
  }

  // ---------- the nav: its drawn sun lights one ray at a time as the page is scrolled; on the front page the nav takes the sky's colour ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  let route = "index", skyCtl = null;
  function updateNav() {
    const nav = $(".nav");
    if (!nav) return;
    const y = scrollY, max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const p = clamp01(y / max);
    const rays = nav.querySelectorAll(".nav__sun line");
    rays.forEach((r, i) => r.classList.toggle("is-lit", p >= (i + 1) / (rays.length + 1) || p > 0.995));   // none at the top, all eight at the bottom
    nav.classList.toggle("is-scrolled", y > 8);
    if (skyCtl) skyCtl.update();
  }

  // ---------- the front page's sky: night at the top, sunrise at the why, daylight for the product, noon at the end ----------
  // Stars and a moon fade out as the sky lightens; a drawn sun rises from below the screen and hands over to the
  // finale's own sun. Colour is driven by the scroll position, so it follows the reader whatever their speed.
  function seeded(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function sky(view) {
    const layer = $(".sky"), nav = $(".nav"), body = document.body;
    const secs = [...view.querySelectorAll("[data-sky]")];
    const clear = () => {
      body.style.backgroundColor = ""; body.classList.remove("is-night");
      if (nav) { nav.style.removeProperty("--nav-bg"); nav.classList.remove("is-night"); }
    };
    if (!secs.length || !layer) { clear(); return null; }
    const stars = layer.querySelector(".sky__stars");
    if (stars && !stars.children.length) {
      const rnd = seeded(20261017);   // the same sky on every visit
      for (let i = 0; i < 90; i++) {
        const st = document.createElement("span");
        st.className = "star" + (rnd() < 0.18 ? " is-big" : "");
        st.style.left = (rnd() * 100).toFixed(2) + "%";
        st.style.top = (rnd() * 88).toFixed(2) + "%";
        st.style.setProperty("--tw", (2.5 + rnd() * 4).toFixed(2) + "s");
        st.style.animationDelay = (-rnd() * 6).toFixed(2) + "s";
        stars.appendChild(st);
      }
    }
    const cols = secs.map((el) => hexRgb(el.dataset.sky));
    const why = view.querySelector(".why"), how = view.querySelector(".how"), hero = view.querySelector("[data-hero]"), cue = view.querySelector(".opening__cue");
    function update() {
      const vh = innerHeight, rects = secs.map((el) => el.getBoundingClientRect());
      const mid = skyColour(rects, cols, vh * 0.5, vh);
      const navH = nav ? nav.offsetHeight : 0;
      const top = skyColour(rects, cols, navH / 2, vh);
      const L = luminance(mid);
      body.style.backgroundColor = rgbCss(mid);
      body.classList.toggle("is-night", L < NIGHT);
      if (nav) { nav.style.setProperty("--nav-bg", rgbCss(top)); nav.classList.toggle("is-night", luminance(top) < NIGHT); }
      const night = clamp01((NIGHT + 0.04 - L) / 0.17);   // 1 in deep night, 0 once the sky has lightened
      // the sun: below the screen until the why section comes up, fully risen once the bench's steps are half way up,
      // and gone before the finale, which draws its own sun beside the panel
      let rise = 0, shown = 0;
      if (why && hero) {
        const w = why.getBoundingClientRect(), h = hero.getBoundingClientRect();
        const end = (how ? how.getBoundingClientRect().bottom : h.top) - vh * 0.5;   // where the rise ends, relative to now
        rise = clamp01((vh - w.top) / Math.max(1, (vh - w.top) + end));
        shown = clamp01(rise * 5) * clamp01((h.top - vh * 0.7) / (vh * 0.4));
      }
      layer.style.setProperty("--night", night.toFixed(3));
      layer.style.setProperty("--rise", smooth(rise).toFixed(4));
      layer.style.setProperty("--sun-on", shown.toFixed(3));
      if (cue) cue.classList.toggle("is-gone", scrollY > 40);
    }
    update();
    return { update, destroy: clear };
  }

  function init() {
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
      if (el.hasAttribute("data-hero") || el.hasAttribute("data-opening") || el.classList.contains("is-in")) { el.classList.add("is-in"); return; }  // the opening and the finale reveal their own parts
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
    if (!hero || !hero.querySelector(".rp")) return none;   // the front page no longer draws it; kept for a page that does
    const diagram = hero.querySelector(".rp"), numEl = hero.querySelector("[data-rp-num]"), scrollWord = hero.querySelector(".hero__scroll");
    const gain = () => Number(hero.dataset.gain) || 0;
    const setVars = (k, w, g) => { hero.style.setProperty("--k", k.toFixed(4)); hero.style.setProperty("--w", w.toFixed(4)); hero.style.setProperty("--g", g.toFixed(4)); };
    if (reduced()) { setVars(1, 1, 1); if (numEl) numEl.textContent = `+${Math.round(gain())}%`; return none; }
    let raw = -1, hook = null;
    const apply = (p) => {
      raw = p;
      // a beat on wiring A first, then the swap through the middle, then the wires redraw and the gain counts, then a hold
      const cells = smooth((p - 0.16) / 0.44);                                             // the swap, 16% to 60%
      const wires = p < 0.12 ? 1 : p < 0.34 ? 1 - (p - 0.12) / 0.22 : clamp01((p - 0.62) / 0.2);   // erased as the cells start, redrawn once they land
      const g = cells;                                                                     // the plate and the numeral rise with the swap itself
      setVars(cells, wires, g);
      if (numEl) numEl.textContent = `+${Math.round(gain() * g)}%`;   // in step with the cells, not ahead of them
      if (scrollWord) scrollWord.classList.toggle("is-gone", p > 0.06);
      if (hook) hook(p);
    };
    function update() {
      // The page keeps scrolling; the swap plays as the diagram rises. It starts as soon as the reader scrolls when
      // the diagram is already in the first screen (laptops), or as the diagram comes in from below (phones), and
      // it is done by the time the diagram's upper part reaches the top of the viewport.
      const vh = innerHeight, r = diagram.getBoundingClientRect(), docTop = r.top + scrollY;
      const start = Math.max(0, docTop - vh * 0.9);
      const end = Math.max(start + vh * 0.6, Math.min(start + vh, docTop + r.height * 0.35));   // about a screen of scroll; the cells land by 60% of it
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
    const reset = () => { const t = track(); if (t) t.style.transform = ""; stage.style.transform = ""; stage.style.opacity = ""; cards().forEach((c) => c.style.removeProperty("--arrive")); };
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
      cards().forEach((c) => { const r = c.getBoundingClientRect(); c.style.setProperty("--arrive", clamp01((vw - r.left) / (r.width * 0.9)).toFixed(3)); });
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
  function revealHero(view) {
    const els = [...view.querySelectorAll("[data-opening] [data-reveal]")];   // on screen at first paint
    if (!els.length) return () => {};
    if (reduced()) { els.forEach(revealNow); return () => {}; }
    // one frame in the hidden state so the transition has somewhere to start from; a timer in case no frame comes
    let done = false;
    const go = () => { if (done) return; done = true; els.forEach(revealNow); };
    const raf = requestAnimationFrame(() => requestAnimationFrame(go));
    const timer = setTimeout(go, 120);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); go(); };
  }
  const revealedKeys = new Set(); // once per page load, per section: a redrawn section shows its title at once
  function watchReveal(view) {
    const els = [...view.querySelectorAll("[data-reveal]")].filter((el) => !el.closest("[data-opening]") && !el.classList.contains("is-revealed"));
    if (!els.length) return () => {};
    const keyOf = (el) => (el.closest("section") || el).className.split(" ")[0] + ":" + el.tagName + ":" + [...el.classList].join(".");
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

  // ---------- the drawn cell follows the pointer ----------
  // It leans toward the pointer (a CSS perspective transform on the svg), its shadow slides away from the sun, and the
  // sunlit corner of its face reaches further the more the face turns up and left, toward the sun. Left alone it sways
  // slowly. Nothing runs off screen, in a hidden tab, or under reduced motion.
  function heroPanel(slot) {
    const panel = slot && slot.querySelector(".hero__panel"), poly = slot && slot.querySelector("[data-lit-poly]");
    if (!panel) return () => {};
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
      raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf && !dead && onScreen && !hidden) raf = requestAnimationFrame(frame); };
    const onPointer = (e) => {
      const r = slot.getBoundingClientRect();
      if (!r.width) return;
      px = Math.max(-1, Math.min(1, ((e.clientX - (r.left + r.width / 2)) / r.width) * 2));
      py = Math.max(-1, Math.min(1, ((e.clientY - (r.top + r.height / 2)) / r.height) * 2));
      lastMove = performance.now(); wake();
    };
    document.addEventListener("pointermove", onPointer, { passive: true });
    const io = typeof IntersectionObserver === "function" ? new IntersectionObserver((es) => es.forEach((e) => { onScreen = e.isIntersecting; wake(); }), { threshold: 0 }) : null;
    if (io) io.observe(slot);
    const onVis = (visible) => { if (visible) wake(); };
    visibilityHooks.add(onVis);
    wake();
    return () => { dead = true; if (raf) cancelAnimationFrame(raf); if (io) io.disconnect(); visibilityHooks.delete(onVis); document.removeEventListener("pointermove", onPointer); };
  }

  function mount(view, page) {
    const cleanups = [];
    route = page === "front" ? "index" : page;
    if (skyCtl) { skyCtl.destroy(); skyCtl = null; }
    if (page === "front") skyCtl = sky(view);
    updateNav();
    const safe = (fn) => { try { const c = fn(); if (c) cleanups.push(typeof c === "function" ? c : () => c.destroy && c.destroy()); return c; } catch (err) { console.warn("motion:", err && err.message); return null; } };
    safe(() => entrances(view));
    safe(() => countUps(view));
    let stripCtl = null, stepsCtl = null, rpCtl = null;
    if (page === "front") {
      const rp = safe(() => repairing(view));
      rpCtl = rp;
      stripCtl = safe(() => strip(view));
      stepsCtl = safe(() => stepsDriver(view));
      safe(() => revealHero(view));
      safe(() => watchReveal(view));
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
      refresh() { updateNav(); safe(() => countUps(view)); if (rpCtl && rpCtl.redraw) rpCtl.redraw(); if (stripCtl) stripCtl.size(); if (stepsCtl) stepsCtl.rebuild(); safe(() => watchReveal(view)); },
      destroy() { cleanups.forEach((fn) => { try { fn(); } catch (_) {} }); if (skyCtl) { skyCtl.destroy(); skyCtl = null; } },
    };
  }

  return { init, mount, transition, reduced, parseCount, formatCount, easeOut, supports, progressOf, skyColour, hexRgb, luminance, NIGHT };
})();
