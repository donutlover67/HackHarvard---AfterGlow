// Second String site: scroll motion, after hhuh.io. Content fades up out of a slight blur as it scrolls in,
// a paragraph lights up word by word as it passes, numbers count up once, decorations drift at their own depth,
// and the nav slides in once you leave the front page's hero, with a sun that fills as you scroll.
// No dependencies. Nothing here changes data or routing: app.js calls SSMotion.refresh(route) after each render.
// Reduced-motion users and print get every end state at once.
window.SSMotion = (function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let route = "index";

  // ---------- reveals: fade up out of a slight blur, staggered within a group ----------
  // What reveals: every top-level block of a page, plus the parts of the front page's sections.
  const REVEAL = [".view > *", ".story > *", ".stats > *", ".steps > .step", ".how > *", ".demo > *"];
  const revealIO = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); revealIO.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -8% 0px" }) : null;
  function reveals(root) {
    const els = new Set();
    REVEAL.forEach((sel) => $$(sel, root).forEach((el) => { if (!el.matches(".hero, .ticker, [data-noreveal]")) els.add(el); }));
    // siblings that enter together are staggered so a row of cards cascades instead of popping at once
    const seen = new Map();
    els.forEach((el) => {
      const n = seen.get(el.parentElement) || 0;
      seen.set(el.parentElement, n + 1);
      el.style.setProperty("--d", `${Math.min(n, 5) * 0.08}s`);
      el.classList.add("reveal");
      if (reduce || !revealIO) el.classList.add("is-in"); else revealIO.observe(el);
    });
  }

  // ---------- a paragraph that lights up word by word as it scrolls past ----------
  let scrubs = [];
  function prepScrub(el) {
    if (el.dataset.scrubbed) return;
    el.dataset.scrubbed = "1";
    const hl = el.dataset.scrubHl ? new RegExp(el.dataset.scrubHl) : null;   // case-sensitive: "String" the name, not "string"
    // split text nodes only, so links and emphasis inside the paragraph survive
    const walk = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement("span");
            s.className = "w" + (hl && hl.test(part) ? " hl" : "");
            s.textContent = part;
            frag.appendChild(s);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1) walk(c);
      });
    };
    walk(el);
  }
  function updateScrubs() {
    scrubs.forEach((el) => {
      const words = $$(".w", el), r = el.getBoundingClientRect();
      const p = clamp((innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35), 0, 1);
      const n = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle("on", i < n));
    });
  }

  // ---------- numbers that count up once, when they are mostly in view ----------
  const countIO = "IntersectionObserver" in window ? new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return;
    countIO.unobserve(en.target);
    const el = en.target, end = Number(el.dataset.count), pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
    const t0 = performance.now(), dur = 1600;
    const step = (t) => {
      const k = clamp((t - t0) / dur, 0, 1);
      el.textContent = pre + Math.round(end * (1 - Math.pow(1 - k, 4))) + suf;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), { threshold: 0.6 }) : null;
  function counters(root) {
    $$("[data-count]", root).forEach((el) => {
      // the markup holds the final value (print, no script); start from zero only when the count-up will run
      if (reduce || !countIO) return;
      el.textContent = (el.dataset.prefix || "") + "0" + (el.dataset.suffix || "");
      countIO.observe(el);
    });
  }

  // ---------- decorations drift at their own depth ----------
  let depths = [];
  function updateDepths() {
    depths.forEach((el) => {
      const r = el.parentElement.getBoundingClientRect();   // the parent isn't moved, so no feedback loop
      const d = r.top + r.height / 2 - innerHeight / 2;
      el.style.setProperty("--sy", `${(-d * parseFloat(el.dataset.depth)).toFixed(1)}px`);
    });
  }

  // ---------- nav: hidden over the front page's hero, then slides in; the sun fills as you scroll ----------
  function updateNav() {
    const nav = $(".nav");
    if (!nav) return;
    const y = scrollY, max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const sun = $(".nav__sun");
    if (sun) sun.style.setProperty("--p", clamp(y / max, 0, 1).toFixed(3));
    const hero = route === "index" && $(".hero--full");
    nav.classList.toggle("is-tucked", !!hero && y < innerHeight * 0.25);
  }

  // one rAF per frame for everything that follows the scroll
  let queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; updateNav(); if (!reduce) { updateScrubs(); updateDepths(); } });
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });

  // called by app.js after every render
  function refresh(r) {
    route = r || "index";
    const view = $("#view");
    document.body.dataset.route = route;
    document.body.classList.toggle("has-hero", !!$(".hero--full", view));
    reveals(view);
    scrubs = $$("[data-scrub]", view);
    scrubs.forEach(prepScrub);
    if (reduce) scrubs.forEach((el) => $$(".w", el).forEach((w) => w.classList.add("on")));
    counters(view);
    depths = reduce ? [] : $$("[data-depth]", view);
    updateNav();
    if (!reduce) { updateScrubs(); updateDepths(); }
  }
  return { refresh, reduce };
})();
