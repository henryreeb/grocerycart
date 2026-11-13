(function () {
  const gc = globalThis.GroceryCartExtension;
  if (location.hostname === "www.kroger.com") {
    let last = "";
    let timer;
    const collect = () => {
      let evidenceType;
      let body;
      if (location.pathname.includes("recent")) [evidenceType, body] = ["purchase_import", gc.parseRecentPurchases(document)];
      else if (/coupon|saving/i.test(location.pathname)) [evidenceType, body] = ["coupon_evidence", { sourceUrl: location.href, coupons: gc.parseCoupons(document) }];
      else if (location.pathname.includes("cart")) [evidenceType, body] = ["cart_snapshot", gc.parseCart(document)];
      if (!evidenceType) return;
      const current = JSON.stringify([evidenceType, body]);
      if (current === last) return;
      last = current;
      gc.extensionApi.sendMessage({ type: "COLLECTED_EVIDENCE", evidenceType, body });
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(collect, 500); };
    collect();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  } else {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.type !== "GC_PAIR") return;
      gc.extensionApi.sendMessage({ type: "PAIR", code: event.data.code, appOrigin: location.origin });
    });
  }
})();
