// The string-sizing script from the ui-refresh branch, loaded the way the page loads it. Run: bun test site/test
import { test, expect } from "bun:test";

const root = new URL("..", import.meta.url).pathname;
const win = {};
new Function("window", await Bun.file(root + "js/sizing.js").text())(win);
const S = win.SSSizing;

test("a device label reads as a number or a range", () => {
  expect(S.parseLabel("12")).toMatchObject({ low: 12 });
  expect(S.parseLabel("9–30")).toMatchObject({ range: true, low: 9, high: 30 });
  expect(S.parseLabel("abc")).toBeFalsy();
});

test("the defaults size a 12 V device from 6.8 V panels without error", () => {
  const r = S.size({ ...S.DEFAULTS }, 6.8);
  expect(r.error).toBeUndefined();
  expect(r.kMin).toBeGreaterThanOrEqual(1);
  expect(r.kMax).toBeGreaterThanOrEqual(r.kMin);
  expect(r.pv.vocCold).toBeGreaterThan(r.pv.voc);
});
