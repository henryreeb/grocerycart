(function () {
  const gc = globalThis.GroceryCartExtension;
  if (location.hostname === "www.kroger.com" && location.pathname.includes("recent")) {
    const send = () => gc.extensionApi.sendMessage({ type: "COLLECTED_EVIDENCE", evidenceType: "purchase_import", body: gc.parseRecentPurchases(document) });
    send();
    new MutationObserver(() => send()).observe(document.body, { childList: true, subtree: true });
  } else {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.type !== "GC_PAIR") return;
      gc.extensionApi.sendMessage({ type: "PAIR", code: event.data.code, appOrigin: location.origin });
    });
  }
})();
