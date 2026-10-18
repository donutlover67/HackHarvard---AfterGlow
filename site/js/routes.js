// The route table: which hash opens which page, and which nav link lights up.
// Printed QR cards depend on #/p/<ID>; the front page is #/ and every hash nothing else claims.
window.SSRoutes = (function () {
  const safeDecode = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };
  // pages in nav order; passport pages and the print sheet belong to the passports section
  const ORDER = { front: 0, passports: 1, passport: 1, print: 1, build: 2, impact: 3, reuse: 4 };

  function parse(hash) {
    const h = typeof hash === "string" ? hash : "";
    if (h.startsWith("#/p/")) return { page: "passport", id: safeDecode(h.slice(4)), nav: "passports" };
    if (h.startsWith("#/passports")) return { page: "passports", id: null, nav: "passports" };
    if (h.startsWith("#/build")) return { page: "build", id: null, nav: "build" };
    if (h.startsWith("#/impact")) return { page: "impact", id: null, nav: "impact" };
    if (h === "#/reuse" || h.startsWith("#/reuse/")) return { page: "reuse", id: h.length > 8 ? safeDecode(h.slice(8)) : null, nav: "reuse" };
    if (h.startsWith("#/print")) return { page: "print", id: null, nav: "passports" };
    return { page: "front", id: null, nav: null };
  }
  // a move to a later page slides forward, to an earlier one back
  function direction(from, to) { return (ORDER[to] || 0) >= (ORDER[from] || 0) ? "fwd" : "back"; }

  return { parse, direction };
})();
