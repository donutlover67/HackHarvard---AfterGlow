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
  expect(formatCount(parseCount("€16–31"), 1)).toBe("€16–31");
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
