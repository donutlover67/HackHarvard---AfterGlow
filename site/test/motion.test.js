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

test("the sky blends between section colours across each boundary, and night is told by luminance", () => {
  const M = win.SSMotion;
  const r = (t, b) => ({ top: t, bottom: b, height: b - t });
  const rects = [r(0, 800), r(800, 1600), r(1600, 2400)];
  const cols = ["#070c22", "#f4c9a4", "#fbfcfd"].map(M.hexRgb);
  expect(M.skyColour(rects, cols, 100, 800)).toEqual(cols[0]);           // inside the first section, its own colour
  expect(M.skyColour(rects, cols, 1200, 800)).toEqual(cols[1]);          // the middle of the second
  const mid = M.skyColour(rects, cols, 800, 800);                        // on the boundary: half way
  expect(mid[0]).toBeGreaterThan(cols[0][0]); expect(mid[0]).toBeLessThan(cols[1][0]);
  expect(M.luminance(cols[0])).toBeLessThan(M.NIGHT);
  expect(M.luminance(cols[1])).toBeGreaterThan(M.NIGHT);
});
