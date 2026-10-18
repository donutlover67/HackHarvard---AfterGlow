// The front page's sky, drawn on one canvas behind the page. At night: deep space, a dense field of stars that twinkle,
// large four-point sparkle stars, the Milky Way across the screen, two glowing planets, a moon, and shooting stars with
// glowing tails. Before dawn a warm glow gathers on the horizon; the sun rises out of it into a blue day with slow clouds.
// motion.js says how far the day has come (0 night, 1 noon) and how visible the sun should be; this file draws that,
// and animates the twinkle, the shooting stars and the clouds while the page is on screen.
// No images, nothing loaded from anywhere. The pure parts (colours) work without a document, for the tests.
window.SSSky = (function () {
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const hexRgb = (hex) => { const n = parseInt(String(hex).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], clamp01(t))));
  const css = (c, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
  // a bump: 0 before a, rising to 1 at b, back to 0 at c
  const bump = (t, a, b, c) => (t <= a || t >= c ? 0 : t < b ? smooth((t - a) / (b - a)) : 1 - smooth((t - b) / (c - b)));

  // the sky at the top, the middle and the bottom of the screen, at five points of the day
  const KEYS = [
    { t: 0, top: "#02050d", mid: "#07101e", bot: "#0d1a2b" },     // deep space
    { t: 0.3, top: "#060a1f", mid: "#1a1640", bot: "#47295a" },   // before dawn: violet, the horizon warming
    { t: 0.5, top: "#25386e", mid: "#6b5a8c", bot: "#ea9a68" },   // sunrise
    { t: 0.72, top: "#9cc6ec", mid: "#c7dff4", bot: "#f6e1cc" },  // morning
    { t: 1, top: "#a6d2f3", mid: "#cde7f9", bot: "#f3f9fe" },     // day
  ].map((k) => ({ t: k.t, top: hexRgb(k.top), mid: hexRgb(k.mid), bot: hexRgb(k.bot) }));
  function stops(t) {
    t = clamp01(t);
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1], u = (t - a.t) / (b.t - a.t);
    return { top: mix(a.top, b.top, u), mid: mix(a.mid, b.mid, u), bot: mix(a.bot, b.bot, u) };
  }
  // the colour at height f of the screen (0 top, 1 bottom)
  function colourAt(t, f) {
    const s = stops(t);
    f = clamp01(f);
    return f < 0.5 ? mix(s.top, s.mid, f / 0.5) : mix(s.mid, s.bot, (f - 0.5) / 0.5);
  }

  function seeded(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const TINTS = [[255, 255, 255], [196, 214, 255], [255, 196, 232]];   // white, pale blue, pale pink, as in the reference
  const tintOf = (r) => (r < 0.7 ? 0 : r < 0.85 ? 1 : 2);

  // ---------- the renderer ----------
  function create(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    let W = 0, H = 0, dpr = 1, stars = [], band = [], sparkles = [], planets = [], clouds = [], meteors = [];
    let moon = null, nextMeteor = 0;
    const state = { t: 0, sun: 1, scroll: 0 };

    function sprite(w, h, draw) { const c = document.createElement("canvas"); c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr); const x = c.getContext("2d"); x.scale(dpr, dpr); draw(x); return c; }
    function build() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const r = seeded(20261018);
      const n = Math.round(Math.max(420, Math.min(1200, (W * H) / 1400)));
      stars = Array.from({ length: n }, () => ({ x: r() * W, y: r() * H * 1.6, s: 0.5 + Math.pow(r(), 4) * 2.1, a: 0.45 + r() * 0.55, f: 0.4 + r() * 1.8, p: r() * 6.283, c: tintOf(r()), d: 0.35 + r() * 0.65 }));
      // the Milky Way's own faint stars, thick along its middle (a rough bell curve across the band)
      band = Array.from({ length: Math.round(n * 1.4) }, () => ({ u: r(), v: (r() + r() + r() - 1.5) / 1.5, s: 0.35 + r() * 0.9, a: 0.2 + r() * 0.6, c: tintOf(r()) }));
      const big = W < 700 ? 6 : 12;
      sparkles = Array.from({ length: big }, () => ({ x: (0.04 + r() * 0.92) * W, y: (0.06 + r() * 0.8) * H, s: 4 + Math.pow(r(), 2) * 10, f: 0.5 + r() * 1.2, p: r() * 6.283, c: r() < 0.6 ? [244, 240, 205] : [222, 206, 255] }));
      planets = [
        { x: 0.055, y: 0.74, r: 9, c: [126, 230, 150] },    // a small green one low on the left
        { x: 0.93, y: 0.34, r: 13, c: [236, 112, 196] },    // a pink one on the right
      ];
      // the moon: a crescent cut from a disc, drawn once
      const mr = Math.max(16, Math.min(34, W * 0.022));
      moon = { r: mr, img: sprite(mr * 2 + 2, mr * 2 + 2, (x) => { x.fillStyle = "#f3efd6"; x.beginPath(); x.arc(mr + 1, mr + 1, mr, 0, 6.283); x.fill(); x.globalCompositeOperation = "destination-out"; x.beginPath(); x.arc(mr + 1 + mr * 0.42, mr + 1 - mr * 0.22, mr * 0.9, 0, 6.283); x.fill(); }) };
      // clouds: soft white puffs, drawn once each and drifted
      clouds = Array.from({ length: W < 700 ? 3 : 5 }, (_, i) => {
        const cw = (0.22 + r() * 0.16) * Math.max(W, 700), ch = cw * 0.34;
        const img = sprite(cw, ch, (x) => {
          x.filter = `blur(${Math.round(ch * 0.12)}px)`;
          x.fillStyle = "rgba(255,255,255,0.9)";
          for (let k = 0; k < 7; k++) { const px = cw * (0.18 + r() * 0.64), py = ch * (0.48 + r() * 0.14), pr = ch * (0.16 + r() * 0.16); x.beginPath(); x.arc(px, py, pr, 0, 6.283); x.fill(); }
          x.fillRect(cw * 0.2, ch * 0.5, cw * 0.6, ch * 0.18);
        });
        return { img, w: cw, h: ch, x: r() * W, y: (0.1 + (i / 5) * 0.45 + r() * 0.06) * H, v: 4 + r() * 6, a: 0.5 + r() * 0.3 };
      });
      meteors = [];
    }

    function spawn(now, night) {
      const r = Math.random;
      const ang = Math.PI * (0.77 + r() * 0.07);                     // down and to the left
      const sp = (0.75 + r() * 0.55) * Math.max(W, H) / 1000;        // pixels per millisecond
      meteors.push({ x: W * (0.3 + r() * 0.8), y: H * (-0.05 + r() * 0.42), dx: Math.cos(ang), dy: Math.sin(ang), sp, born: now, life: 650 + r() * 650, len: Math.max(W, H) * (0.1 + r() * 0.12), pink: r() < 0.45 });
      nextMeteor = now + (1100 + r() * 2600) / Math.max(0.35, night);
    }

    function draw(now, animate) {
      const t = state.t, night = clamp01(1 - t / 0.42), day = smooth((t - 0.55) / 0.35);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // the sky
      const s = stops(t), g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, css(s.top)); g.addColorStop(0.5, css(s.mid)); g.addColorStop(1, css(s.bot));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // the warm glow on the horizon before and through sunrise
      const dawn = bump(t, 0.12, 0.42, 0.8);
      if (dawn > 0.01) {
        const hg = ctx.createRadialGradient(W * 0.78, H * 1.08, 0, W * 0.78, H * 1.08, Math.max(W, H) * 0.85);
        hg.addColorStop(0, `rgba(255, 168, 98, ${0.6 * dawn})`); hg.addColorStop(0.45, `rgba(240, 120, 120, ${0.22 * dawn})`); hg.addColorStop(1, "rgba(240, 120, 120, 0)");
        ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H);
      }
      if (night > 0.01) {
        const tw = (f, p) => (animate ? 0.55 + 0.45 * Math.sin(now * 0.001 * f + p) : 0.8);
        // the Milky Way: a soft violet band from the lower left to the upper right
        ctx.save();
        ctx.translate(W * 0.5, H * 0.56); ctx.rotate(-Math.atan2(H * 0.8, W * 1.2));
        const L = Math.hypot(W, H) * 1.3, bw = Math.max(H, W * 0.5) * 0.5;
        // a wide violet haze, a magenta heart and a pale core, as in the reference
        const mg = ctx.createLinearGradient(0, -bw / 2, 0, bw / 2);
        mg.addColorStop(0, "rgba(70, 40, 120, 0)"); mg.addColorStop(0.22, `rgba(78, 46, 128, ${0.26 * night})`); mg.addColorStop(0.42, `rgba(150, 70, 160, ${0.42 * night})`); mg.addColorStop(0.5, `rgba(214, 120, 196, ${0.46 * night})`); mg.addColorStop(0.58, `rgba(160, 120, 200, ${0.36 * night})`); mg.addColorStop(0.78, `rgba(52, 70, 140, ${0.2 * night})`); mg.addColorStop(1, "rgba(52, 70, 140, 0)");
        ctx.fillStyle = mg; ctx.fillRect(-L / 2, -bw / 2, L, bw);
        const core = ctx.createLinearGradient(0, -bw * 0.1, 0, bw * 0.1);
        core.addColorStop(0, "rgba(255, 226, 244, 0)"); core.addColorStop(0.5, `rgba(255, 226, 244, ${0.2 * night})`); core.addColorStop(1, "rgba(255, 226, 244, 0)");
        ctx.fillStyle = core; ctx.fillRect(-L / 2, -bw * 0.1, L, bw * 0.2);
        // a darker dust lane along one edge of the heart
        const dust = ctx.createLinearGradient(0, bw * 0.02, 0, bw * 0.12);
        dust.addColorStop(0, "rgba(10, 12, 30, 0)"); dust.addColorStop(0.5, `rgba(10, 12, 30, ${0.28 * night})`); dust.addColorStop(1, "rgba(10, 12, 30, 0)");
        ctx.fillStyle = dust; ctx.fillRect(-L / 2, bw * 0.02, L, bw * 0.1);
        for (let c = 0; c < 3; c++) {
          ctx.fillStyle = css(TINTS[c]);
          for (const b of band) { if (b.c !== c) continue; ctx.globalAlpha = b.a * night; ctx.fillRect((b.u - 0.5) * L, b.v * bw * 0.42, b.s, b.s); }
        }
        ctx.restore(); ctx.globalAlpha = 1;
        // the star field, drifting slowly up as the page scrolls (nearer stars faster)
        const span = H * 1.6;
        for (let c = 0; c < 3; c++) {
          ctx.fillStyle = css(TINTS[c]);
          for (const st of stars) {
            if (st.c !== c) continue;
            let y = (st.y - state.scroll * 0.05 * st.d) % span; if (y < 0) y += span;
            if (y > H) continue;
            ctx.globalAlpha = st.a * tw(st.f, st.p) * night;
            if (st.s < 1.1) ctx.fillRect(st.x, y, st.s, st.s); else { ctx.beginPath(); ctx.arc(st.x, y, st.s * 0.6, 0, 6.283); ctx.fill(); }
          }
        }
        ctx.globalAlpha = 1;
        // sparkle stars: four points with a soft glow
        for (const k of sparkles) {
          const a = (animate ? 0.6 + 0.4 * Math.sin(now * 0.001 * k.f + k.p) : 0.85) * night, sz = k.s * (0.85 + 0.25 * a);
          ctx.save(); ctx.translate(k.x, k.y); ctx.globalAlpha = a;
          ctx.shadowColor = css(k.c, 1); ctx.shadowBlur = sz * 3; ctx.fillStyle = css(k.c);
          ctx.beginPath(); ctx.moveTo(0, -sz * 1.6); ctx.quadraticCurveTo(0, 0, sz, 0); ctx.quadraticCurveTo(0, 0, 0, sz * 1.6); ctx.quadraticCurveTo(0, 0, -sz, 0); ctx.quadraticCurveTo(0, 0, 0, -sz * 1.6); ctx.fill();
          ctx.restore();
        }
        // two glowing planets
        for (const p of planets) {
          const px = p.x * W, py = p.y * H - state.scroll * 0.02, pr = p.r * Math.min(1.4, Math.max(0.8, W / 1200));
          const pg = ctx.createRadialGradient(px, py, 0, px, py, pr * 4);
          pg.addColorStop(0, css(p.c, 0.55 * night)); pg.addColorStop(0.3, css(p.c, 0.18 * night)); pg.addColorStop(1, css(p.c, 0));
          ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, pr * 4, 0, 6.283); ctx.fill();
          ctx.fillStyle = css(mix(p.c, [255, 255, 255], 0.35), night); ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.283); ctx.fill();
        }
        // the moon, setting as the night ends
        const mx = W * (W < 700 ? 0.12 : 0.1), my = H * 0.17 + (1 - night) * H * 0.35;
        const mg2 = ctx.createRadialGradient(mx, my, 0, mx, my, moon.r * 3.2);
        mg2.addColorStop(0, `rgba(243, 239, 214, ${0.22 * night})`); mg2.addColorStop(1, "rgba(243, 239, 214, 0)");
        ctx.fillStyle = mg2; ctx.beginPath(); ctx.arc(mx, my, moon.r * 3.2, 0, 6.283); ctx.fill();
        ctx.globalAlpha = night; ctx.drawImage(moon.img, mx - moon.r - 1, my - moon.r - 1, moon.r * 2 + 2, moon.r * 2 + 2); ctx.globalAlpha = 1;
        // shooting stars
        if (animate) {
          if (!nextMeteor) nextMeteor = now + 600;
          if (now >= nextMeteor && night > 0.25 && meteors.length < 3) spawn(now, night);
        }
      }
      if (meteors.length) {
        ctx.lineCap = "round";
        meteors = meteors.filter((m) => {
          const age = now - m.born; if (age > m.life || !animate) return false;
          const k = age / m.life, fade = Math.min(1, k / 0.12) * (1 - smooth((k - 0.6) / 0.4)) * Math.max(night, 0.0001);
          const hx = m.x + m.dx * m.sp * age, hy = m.y + m.dy * m.sp * age, tail = m.len * Math.min(1, age / 220);
          const tx = hx - m.dx * tail, ty = hy - m.dy * tail;
          const lg = ctx.createLinearGradient(hx, hy, tx, ty);
          const tc = m.pink ? "255, 150, 220" : "190, 210, 255";
          lg.addColorStop(0, `rgba(255, 255, 255, ${0.95 * fade})`); lg.addColorStop(0.25, `rgba(${tc}, ${0.55 * fade})`); lg.addColorStop(1, `rgba(${tc}, 0)`);
          ctx.strokeStyle = lg; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
          const hg2 = ctx.createRadialGradient(hx, hy, 0, hx, hy, 9);
          hg2.addColorStop(0, `rgba(255, 255, 255, ${0.9 * fade})`); hg2.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = hg2; ctx.beginPath(); ctx.arc(hx, hy, 9, 0, 6.283); ctx.fill();
          return true;
        });
      }
      // the sun rises out of the dawn glow toward the top right, glowing; the finale draws its own, so it hands over
      const rise = smooth((t - 0.26) / 0.56), sunA = clamp01((t - 0.22) / 0.12) * state.sun;
      if (sunA > 0.01) {
        const phone = W < 700, sr = phone ? 18 : Math.max(26, Math.min(62, Math.min(W, H) * 0.055)), sx = W * (phone ? 0.93 : 0.82), sy = lerp(H * 1.12, H * (phone ? 0.16 : 0.2), rise);   // on a phone, small and at the edge, clear of the text
        const halo = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 7);
        halo.addColorStop(0, `rgba(255, 226, 140, ${0.5 * sunA})`); halo.addColorStop(0.35, `rgba(255, 214, 120, ${0.16 * sunA})`); halo.addColorStop(1, "rgba(255, 214, 120, 0)");
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sx, sy, sr * 7, 0, 6.283); ctx.fill();
        const disc = ctx.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, 0, sx, sy, sr);
        disc.addColorStop(0, `rgba(255, 246, 196, ${sunA})`); disc.addColorStop(1, `rgba(255, 200, 40, ${sunA})`);
        ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 6.283); ctx.fill();
      }
      // clouds drift across the day
      if (day > 0.01) {
        for (const c of clouds) {
          if (animate) c.x = (c.x + c.v * 0.016) % (W + c.w);
          ctx.globalAlpha = c.a * day; ctx.drawImage(c.img, c.x - c.w, c.y - state.scroll * 0.03 % H, c.w, c.h);
        }
        ctx.globalAlpha = 1;
      }
    }

    build();
    return {
      set(o) { Object.assign(state, o); },
      resize: build,
      draw,
      state,
    };
  }
  return { create, stops, colourAt, KEYS };
})();
