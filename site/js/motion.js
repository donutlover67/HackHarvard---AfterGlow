// The motion layer: entrances, count-ups, the hero re-pairing, the dust text, the horizontal strip, route
// slides, and (hero3d) the loader for the three.js slab. Transform, opacity, colour and filter only.
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
  const decide3D = (env) => !!env.webgl && !env.reduced && !env.saveData && !env.forceSvg && !(typeof env.deviceMemory === "number" && env.deviceMemory < 2);
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

  function init() {
    document.documentElement.classList.add(reduced() ? "reduced" : "has-motion");
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
    const sweep = () => { const now = Date.now(); if (now - last < 120) return; last = now; rest.forEach((el) => { if (!el.classList.contains("is-in") && el.getBoundingClientRect().top < innerHeight * 0.9) el.classList.add("is-in"); }); };
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
    const diagram = hero.querySelector(".rp"), numEl = hero.querySelector("[data-rp-num]"), scrollWord = hero.querySelector(".hero__scroll");
    const gain = () => Number(hero.dataset.gain) || 0;
    const setVars = (k, w, g) => { hero.style.setProperty("--k", k.toFixed(4)); hero.style.setProperty("--w", w.toFixed(4)); hero.style.setProperty("--g", g.toFixed(4)); };
    if (reduced()) { setVars(1, 1, 1); if (numEl) numEl.textContent = `+${Math.round(gain())}%`; return none; }
    let raw = -1, hook = null;
    const pinned = () => getComputedStyle(hero.querySelector(".hero__pin") || hero).position === "sticky";
    function update() {
      const vh = innerHeight;
      // pinned: progress through the hero's extra screen; otherwise: how far the diagram has risen into view
      const p = pinned() ? progressOf(hero.getBoundingClientRect(), vh) : clamp01(1 - (diagram.getBoundingClientRect().top - vh * 0.15) / (vh * 0.6));
      if (p === raw) return;
      raw = p;
      const cells = smooth((p - 0.1) / 0.6);                                   // the swap
      const wires = p < 0.3 ? 1 - p / 0.3 : clamp01((p - 0.55) / 0.35);        // erased while the cells move, redrawn as they land
      const g = clamp01((p - 0.55) / 0.35);                                     // the plate and the numeral
      setVars(cells, wires, g);
      if (numEl) numEl.textContent = `+${Math.round(gain() * easeOut(g))}%`;
      if (scrollWord) scrollWord.classList.toggle("is-gone", p > 0.1);
      if (hook) hook(p);
    }
    const onScroll = rafThrottle(update);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    update();
    return { setHook(fn) { hook = fn; if (raw >= 0) fn(raw); }, progress: () => Math.max(0, raw), destroy() { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); } };
  }

  // ---------- the strip: on fine pointers the section pins and the vertical scroll slides the track sideways ----------
  function strip(view) {
    const section = view.querySelector("[data-strip]");
    const none = { size() {}, destroy() {} };
    if (!section) return none;
    const pin = section.querySelector(".strip__pin");
    const track = () => section.querySelector(".strip__track");
    const drive = matchMedia("(min-width: 760px) and (pointer: fine)").matches && !reduced();
    if (!drive) { section.classList.add("is-row"); return none; }
    let overflow = 0;
    function update() {
      const t = track(); if (!t || !overflow) return;
      const p = progressOf(section.getBoundingClientRect(), pin.offsetHeight);
      t.style.transform = `translate3d(${(-p * overflow).toFixed(1)}px, 0, 0)`;
    }
    function size() {
      const t = track(); if (!t) return;
      t.style.transform = "";
      section.classList.remove("is-row");
      overflow = Math.max(0, t.scrollWidth - t.clientWidth);
      // a pin taller than the screen would hide its own bottom: fall back to the swipe row
      if (!overflow || pin.offsetHeight > innerHeight) { overflow = 0; section.style.height = ""; section.classList.add("is-row"); return; }
      section.style.height = `${pin.offsetHeight + overflow}px`;
      update();
    }
    const onScroll = rafThrottle(update), onResize = rafThrottle(size);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onResize);
    size();
    return { size, destroy() { removeEventListener("scroll", onScroll); removeEventListener("resize", onResize); section.style.height = ""; const t = track(); if (t) t.style.transform = ""; } };
  }

  // ---------- dust: the headline gathers out of particles, then the real text takes over ----------
  const dusted = new Set(); // once per page load, by key
  const stretchWord = (pct) => { const v = parseFloat(pct); if (!Number.isFinite(v)) return "normal"; return v >= 125 ? "extra-expanded" : v >= 118 ? "expanded" : v >= 106 ? "semi-expanded" : v <= 94 ? "semi-condensed" : "normal"; };
  function dust(el, key) {
    if (!el || reduced() || dusted.has(key)) return () => {};
    dusted.add(key);
    let cancelled = false, canvas = null, stopLoop = null;
    const show = () => { el.classList.remove("is-dusting"); if (canvas) { canvas.style.opacity = "0"; const c = canvas; canvas = null; setTimeout(() => c.remove(), 300); } removeEventListener("resize", cancel); };
    const cancel = () => { cancelled = true; if (stopLoop) stopLoop(); show(); };
    el.classList.add("is-dusting");
    if (!el.style.position && getComputedStyle(el).position === "static") el.style.position = "relative";
    addEventListener("resize", cancel);
    (async () => {
      if (document.fonts && document.fonts.status !== "loaded") {
        await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 600))]);
        if (cancelled) return;
        if (document.fonts.status !== "loaded") { show(); return; }
      }
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) { show(); return; }
      const dpr = Math.min(win.devicePixelRatio || 1, 2);
      const cs = getComputedStyle(el);
      // draw each line where it sits, then keep the dark pixels as targets
      const off = document.createElement("canvas");
      off.width = Math.ceil(box.width * dpr); off.height = Math.ceil(box.height * dpr);
      const o = off.getContext("2d", { willReadFrequently: true });
      if (!o) { show(); return; }
      o.scale(dpr, dpr);
      o.fillStyle = "#000"; o.textBaseline = "alphabetic";
      o.font = `${cs.fontStyle} ${cs.fontWeight} ${stretchWord(cs.fontStretch)} ${cs.fontSize} ${cs.fontFamily}`;
      if ("letterSpacing" in o) o.letterSpacing = cs.letterSpacing;
      if ("fontStretch" in o) o.fontStretch = stretchWord(cs.fontStretch);
      const ascent = (o.measureText("Hg").fontBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8);
      const lines = [...el.querySelectorAll(".line")];
      (lines.length ? lines : [el]).forEach((line) => {
        [...line.getClientRects()].forEach((r) => { o.fillText(line.textContent, r.left - box.left, r.top - box.top + ascent); });
      });
      const data = o.getImageData(0, 0, off.width, off.height).data;
      const step = Math.max(2, Math.round(2 * dpr));
      let pts = [];
      for (let y = 0; y < off.height; y += step) for (let x = 0; x < off.width; x += step) if (data[(y * off.width + x) * 4 + 3] > 128) pts.push([x / dpr, y / dpr]);
      if (pts.length > 1500) { for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; } pts = pts.slice(0, 1500); }
      if (!pts.length) { show(); return; }
      const particles = pts.map(([tx, ty]) => ({ tx, ty, sx: tx + (Math.random() - 0.5) * box.width * 1.6, sy: ty + (Math.random() - 0.5) * box.height * 2.6, delay: Math.random() * 250, size: 1.4 + Math.random() * 1.2 }));
      canvas = document.createElement("canvas");
      canvas.className = "dust-canvas"; canvas.setAttribute("aria-hidden", "true");
      canvas.width = off.width; canvas.height = off.height;
      el.appendChild(canvas);
      const c = canvas.getContext("2d"); c.scale(dpr, dpr);
      const ink = cs.getPropertyValue("--cell").trim() || "#15224a";
      const t0 = performance.now(), travel = 650;
      stopLoop = loop((now) => {
        if (cancelled || !canvas) return false;
        const el0 = now - t0;
        c.clearRect(0, 0, box.width, box.height);
        c.fillStyle = ink;
        let done = true;
        for (const p of particles) {
          const t = clamp01((el0 - p.delay) / travel);
          if (t < 1) done = false;
          const e = easeOut(t);
          c.globalAlpha = Math.min(1, t * 4);
          c.fillRect(p.sx + (p.tx - p.sx) * e, p.sy + (p.ty - p.sy) * e, p.size, p.size);
        }
        if (done) { show(); return false; }
        return true;
      });
    })().catch(() => show());
    return cancel;
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

  // ---------- the three.js slab: hero3d.js, imported after first paint, only on the front page ----------
  const hero3dSlots = new WeakMap();
  function hero3d(slot, rp) {
    if (!slot) return () => {};
    const probe = document.createElement("canvas");
    const env = { webgl: !!(probe.getContext("webgl2") || probe.getContext("webgl")), reduced: reduced(), saveData: !!(navigator.connection && navigator.connection.saveData), deviceMemory: navigator.deviceMemory, forceSvg: forceSvg() };
    if (!decide3D(env)) return () => {};
    let ctl = hero3dSlots.get(slot) || null, dead = false, io = null;
    const connect = () => {
      if (!ctl) return;
      rp.setHook((k) => ctl.setProgress(k));
      if (typeof IntersectionObserver === "function") { io = new IntersectionObserver((es) => es.forEach((e) => ctl.setVisible(e.isIntersecting && !document.hidden)), { threshold: 0 }); io.observe(slot); }
      visibilityHooks.add(onVis);
    };
    const onVis = (visible) => { if (ctl) ctl.setVisible(visible); };
    const start = () => {
      if (dead || ctl) { connect(); return; }
      // a dynamic import in a classic script resolves against this script's URL (site/js/), not the page's
      import("./hero3d.js").then((mod) => {
        if (dead) return;
        ctl = mod.mount(slot, { touch: matchMedia("(pointer: coarse)").matches });
        hero3dSlots.set(slot, ctl);
        slot.classList.add("has-3d");
        connect();
      }).catch((err) => { console.warn("hero3d stays off:", err && err.message); });
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(start, { timeout: 600 }); else setTimeout(start, 300);
    return () => { dead = true; if (io) io.disconnect(); visibilityHooks.delete(onVis); if (ctl) { ctl.dispose(); hero3dSlots.delete(slot); slot.classList.remove("has-3d"); ctl = null; } };
  }

  // ---------- per page ----------
  function mount(view, page) {
    const cleanups = [];
    const safe = (fn) => { try { const c = fn(); if (c) cleanups.push(typeof c === "function" ? c : () => c.destroy && c.destroy()); return c; } catch (err) { console.warn("motion:", err && err.message); return null; } };
    safe(() => entrances(view));
    safe(() => countUps(view));
    let stripCtl = null;
    if (page === "front") {
      const rp = safe(() => repairing(view));
      stripCtl = safe(() => strip(view));
      safe(() => dust(view.querySelector("h1[data-dust]"), "h1"));
      safe(() => observe([view.querySelector("h2[data-dust]")], (el) => dust(el, "h2"), 0.6));
      if (rp) safe(() => hero3d(view.querySelector("[data-hero-slot]"), rp));
    }
    // if anything above failed, nothing may stay hidden
    if (!reduced()) setTimeout(() => view.querySelectorAll("[data-in]:not(.is-in)").forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add("is-in"); }), 2500);
    return {
      // runs arrived and front.js redrew its sections in place: count the new numerals, re-measure the strip, watch the new dust line
      refresh() { safe(() => countUps(view)); if (stripCtl) stripCtl.size(); safe(() => observe([view.querySelector("h2[data-dust]")], (el) => dust(el, "h2"), 0.6)); },
      destroy() { cleanups.forEach((fn) => { try { fn(); } catch (_) {} }); },
    };
  }

  return { init, mount, transition, reduced, parseCount, formatCount, easeOut, decide3D, supports, progressOf };
})();
