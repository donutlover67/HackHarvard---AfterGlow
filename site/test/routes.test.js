// The route table: which hash opens which page. Run: bun test site/test
import { test, expect } from "bun:test";

const root = new URL("..", import.meta.url).pathname;
const win = {};
new Function("window", await Bun.file(root + "js/routes.js").text())(win);
const { parse, direction } = win.SSRoutes;
const front = { page: "front", id: null, nav: null };

test("the front page is #/ and every unknown hash", () => {
  expect(parse("#/")).toEqual(front);
  expect(parse("")).toEqual(front);
  expect(parse("#")).toEqual(front);
  expect(parse("#/nonsense")).toEqual(front);
  expect(parse(undefined)).toEqual(front);
});

test("the passport index is #/passports, with or without a trailing slash", () => {
  expect(parse("#/passports")).toEqual({ page: "passports", id: null, nav: "passports" });
  expect(parse("#/passports/").page).toBe("passports");
});

test("a passport route decodes its ID and keeps a bad escape raw", () => {
  expect(parse("#/p/SS-0001")).toEqual({ page: "passport", id: "SS-0001", nav: "passports" });
  expect(parse("#/p/SS%2D0001").id).toBe("SS-0001");
  expect(parse("#/p/%E0%A4%A").id).toBe("%E0%A4%A");
});

test("build, impact and print keep their addresses and nav", () => {
  expect(parse("#/build?x=1").page).toBe("build");
  expect(parse("#/build").nav).toBe("build");
  expect(parse("#/impact").nav).toBe("impact");
  expect(parse("#/print")).toEqual({ page: "print", id: null, nav: "passports" });
});

test("direction follows the nav order front, passports, build, impact", () => {
  expect(direction("front", "build")).toBe("fwd");
  expect(direction("impact", "passport")).toBe("back");
  expect(direction("passports", "print")).toBe("fwd");
  expect(direction("build", "front")).toBe("back");
});
