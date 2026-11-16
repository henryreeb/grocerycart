(function () {
  const gc = globalThis.GroceryCartExtension;
  if (location.hostname === "www.kroger.com") {
    let last = "";
    let lastSentAt = 0;
    let timer;
    const collect = () => {
      let evidenceType;
      let body;
      if (location.pathname.startsWith("/mypurchases/detail/")) [evidenceType, body] = ["purchase_import", gc.parseRecentPurchases(document, new Date(), location.href)];
      else if (/coupon|saving/i.test(location.pathname)) [evidenceType, body] = ["coupon_evidence", { sourceUrl: location.href, coupons: gc.parseCoupons(document) }];
      else if (location.pathname.includes("cart")) {
        if (gc.expandCollapsedCart(document)) return;
        [evidenceType, body] = ["cart_snapshot", gc.parseCart(document)];
      }
      if (!evidenceType || body?.status === "unknown") return;
      const current = JSON.stringify([evidenceType, body]);
      if (current === last && Date.now() - lastSentAt < 4 * 60_000) return;
      last = current;
      lastSentAt = Date.now();
      gc.extensionApi.sendMessage({ type: "COLLECTED_EVIDENCE", evidenceType, body });
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(collect, 500); };
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    collect();
    setInterval(collect, 4 * 60_000);
  } else {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.type !== "GC_PAIR") return;
      gc.extensionApi.sendMessage({ type: "PAIR", code: event.data.code, appOrigin: location.origin })
        .then(() => window.postMessage({ type: "GC_PAIR_RESULT", ok: true }, location.origin))
        .catch((error) => window.postMessage({ type: "GC_PAIR_RESULT", ok: false, error: error.message }, location.origin));
    });
  }
})();
