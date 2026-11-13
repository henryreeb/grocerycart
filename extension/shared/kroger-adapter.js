(function (scope) {
  function productIdFrom(node) {
    const explicit = node.getAttribute("data-product-id") || node.getAttribute("data-upc");
    if (explicit) return explicit;
    const link = (node.matches?.('a[href*="/p/"]') ? node : node.querySelector?.('a[href*="/p/"]'))?.getAttribute("href") ?? "";
    return link.match(/\/(\d{10,14})(?:\?|$)/)?.[1] ?? null;
  }

  function parseRecentPurchases(document, now = new Date()) {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 2);
    const nodes = document.querySelectorAll("[data-gc-purchase], [data-testid*='purchase-item'], [data-testid*='product-card']");
    const unique = new Map();
    for (const node of nodes) {
      const order = node.closest?.("[data-order-id]") ?? node;
      const orderId = node.getAttribute("data-order-id") || order.getAttribute?.("data-order-id");
      const orderedAt = node.getAttribute("data-ordered-at") || order.getAttribute?.("data-ordered-at");
      const description = node.getAttribute("data-description") || node.querySelector?.("h2,h3,[data-testid*='description']")?.textContent?.trim();
      if (!orderId || !orderedAt || !description || new Date(orderedAt).getTime() < cutoff.getTime()) continue;
      const record = {
        orderId,
        orderedAt,
        productId: productIdFrom(node),
        description,
        size: node.getAttribute("data-size") || node.querySelector?.("[data-testid*='size']")?.textContent?.trim() || null,
        quantity: Number(node.getAttribute("data-quantity") || 1)
      };
      const key = `${record.orderId}:${record.productId ?? record.description}:${record.size ?? ""}`;
      unique.set(key, record);
    }
    return [...unique.values()];
  }

  function parseCoupons(document) {
    return [...document.querySelectorAll("[data-gc-coupon], [data-testid*='coupon']")].map((node) => ({
      couponKey: node.getAttribute("data-coupon-key") || node.getAttribute("data-coupon-id") || node.id || null,
      label: node.getAttribute("data-label") || node.textContent?.trim() || "Coupon",
      clipped: node.getAttribute("data-clipped") === "true" || /^clipped$/i.test(node.querySelector?.("button")?.textContent?.trim() || ""),
      eligibleUpcs: [...new Set([
        ...(node.getAttribute("data-eligible-upcs") || "").split(",").map((upc) => upc.trim()).filter(Boolean),
        ...[...node.querySelectorAll?.('a[href*="/p/"]') || []].map(productIdFrom).filter(Boolean)
      ])],
      minimumQuantity: (() => { const value = node.getAttribute("data-min-quantity") || node.textContent?.match(/buy\s+(\d+)/i)?.[1]; return value ? Number(value) : null; })(),
      expired: node.getAttribute("data-expired") === "true" || /expired/i.test(node.textContent || "")
    })).filter((coupon) => coupon.couponKey);
  }

  function cartExpansionControl(document) {
    if (!document.querySelector("[data-testid='CartHeader']")) return null;
    return [...document.querySelectorAll("button")].find((button) => !button.hidden && button.getAttribute("aria-hidden") !== "true" && /^show all items$/i.test(button.textContent?.trim() || "")) ?? null;
  }

  function expandCollapsedCart(document) {
    const control = cartExpansionControl(document);
    if (!control || control.hasAttribute("data-gc-expansion-attempted")) return false;
    control.setAttribute("data-gc-expansion-attempted", "true");
    control.click();
    return true;
  }

  function parseCart(document) {
    const ready = document.querySelector("[data-gc-cart-ready='true'], [data-testid='cart-page'], [data-testid='empty-cart'], [data-testid='CartHeader']");
    if (!ready) return { status: "unknown", items: [] };
    if (cartExpansionControl(document)) return { status: "unknown", items: [] };
    const currentNodes = [...document.querySelectorAll("[data-testid='cart-page-item-description']")].map((description) => {
      let node = description.parentElement;
      while (node && !(productIdFrom(node) && node.querySelector("[data-testid='citrus-QuantityStepper-input']"))) node = node.parentElement;
      return node;
    }).filter(Boolean);
    const nodes = [...new Set([...document.querySelectorAll("[data-gc-cart-item], [data-testid*='cart-item']"), ...currentNodes])];
    const items = nodes.map((node) => ({
      upc: productIdFrom(node),
      description: node.getAttribute("data-description") || node.querySelector?.("[data-testid='cart-page-item-description']")?.textContent?.trim() || node.textContent?.trim() || "Cart item",
      quantity: Number(node.getAttribute("data-quantity") || node.querySelector?.('[data-testid="citrus-QuantityStepper-input"], input[name*="quantity"], input[aria-label*="quantity" i]')?.value || 1),
      discountCents: node.hasAttribute("data-discount-cents") ? Number(node.getAttribute("data-discount-cents")) : (() => {
        const value = node.querySelector?.("[data-testid*='discount']")?.textContent?.match(/\$([0-9]+(?:\.[0-9]{2})?)/)?.[1];
        return value ? Math.round(Number(value) * 100) : null;
      })()
    }));
    if (items.some((item) => !item.upc || !Number.isInteger(item.quantity) || item.quantity < 1)) return { status: "unknown", items: [] };
    return { status: "complete", items };
  }

  scope.GroceryCartExtension = { ...scope.GroceryCartExtension, parseRecentPurchases, parseCoupons, parseCart, expandCollapsedCart, productIdFrom };
})(globalThis);
