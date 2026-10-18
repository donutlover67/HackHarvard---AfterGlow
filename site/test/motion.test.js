// The motion layer's pure parts: count-up text, easing, the 3D decision, scroll progress, feature checks.
// The moves themselves are checked in the browser. Run: bun test site/test
import { test, expect } from "bun:test";

const root = new URL("..", import.meta.url).pathname;
const win = { matchMedia: () => ({ matches: false, addEventListener() {} }), location: { search: "" } };
new Function("window", await Bun.file(root + "js/motion.js").text())(win);
const { parseCount, formatCount, easeOut, progressOf, supports } = win.SSMotion;

test("count-ups keep every non-numeric character and scale each number", () => {
  expect(formatCount(parseCount("80–88%"), 0.5)).toBe("40–44%");
  expect(formatCount(parseCount("80–88%"), 1)).toBe("80–88%");
  expect(formatCount(parseCount("+37.1%"), 0)).toBe("+0.0%");
  expect(formatCount(parseCount("$17–34"), 1)).toBe("$17–34");
  expect(formatCount(parseCount("about 1%"), 0)).toBe("about 0%");
  expect(formatCount(parseCount("2.04 W"), 0.5)).toBe("1.02 W");
  expect(formatCount(parseCount("no number"), 0.5)).toBe("no number");
});

test("easeOut is a cubic ease-out", () => {
  expect(easeOut(0)).toBe(0);
  expect(easeOut(1)).toBe(1);
  expect(easeOut(0.5)).toBeCloseTo(0.875);
});


test("progressOf maps a pinned region's scroll into 0..1", () => {
  expect(progressOf({ top: 0, height: 1800 }, 900)).toBe(0);
  expect(progressOf({ top: -450, height: 1800 }, 900)).toBe(0.5);
  expect(progressOf({ top: -900, height: 1800 }, 900)).toBe(1);
  expect(progressOf({ top: 100, height: 1800 }, 900)).toBe(0);
  expect(progressOf({ top: -2000, height: 1800 }, 900)).toBe(1);
  expect(progressOf({ top: -10, height: 900 }, 900)).toBe(1);
});

test("supports reports what the browser offers", () => {
  expect(supports({})).toEqual({ io: false, idle: false, viewTransitions: false, fonts: false });
  expect(supports({ IntersectionObserver: function () {}, requestIdleCallback: function () {}, document: { startViewTransition() {}, fonts: {} } })).toEqual({ io: true, idle: true, viewTransitions: true, fonts: true });
});

test("the time of day blends across each section boundary, and night is told by luminance", () => {
  const M = win.SSMotion;
  const r = (t, b) => ({ top: t, bottom: b, height: b - t });
  const rects = [r(0, 800), r(800, 1600), r(1600, 2400)], days = [0, 0.3, 1];
  expect(M.dayAt(rects, days, 100, 800)).toBe(0);
  expect(M.dayAt(rects, days, 1200, 800)).toBe(0.3);
  const mid = M.dayAt(rects, days, 800, 800);
  expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(0.3);
  expect(M.luminance([7, 16, 30])).toBeLessThan(M.NIGHT);
  expect(M.luminance([199, 223, 244])).toBeGreaterThan(M.NIGHT);
});

test("the sky's colours run from deep night to a light day", async () => {
  const w2 = {};
  new Function("window", await Bun.file(root + "js/sky.js").text())(w2);
  const S = w2.SSSky, M = win.SSMotion;
  expect(M.luminance(S.colourAt(0, 0.5))).toBeLessThan(0.01);
  expect(M.luminance(S.colourAt(0.3, 0.5))).toBeLessThan(M.NIGHT);
  expect(M.luminance(S.colourAt(0.72, 0))).toBeGreaterThan(0.4);   // navy text reads at the top of a morning sky
  expect(M.luminance(S.colourAt(1, 0.5))).toBeGreaterThan(0.7);
});
