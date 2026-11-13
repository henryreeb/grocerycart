(function (scope) {
  function productIdFrom(node) {
    const explicit = node.getAttribute("data-product-id") || node.getAttribute("data-upc");
    if (explicit) return explicit;
    const link = node.querySelector?.('a[href*="/p/"]')?.getAttribute("href") ?? "";
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
      clipped: node.getAttribute("data-clipped") === "true" || /clipped/i.test(node.querySelector?.("button")?.textContent || ""),
      eligibleUpcs: [...new Set([
        ...(node.getAttribute("data-eligible-upcs") || "").split(",").map((upc) => upc.trim()).filter(Boolean),
        ...[...node.querySelectorAll?.('a[href*="/p/"]') || []].map(productIdFrom).filter(Boolean)
      ])],
      minimumQuantity: Number(node.getAttribute("data-min-quantity") || node.textContent?.match(/buy\s+(\d+)/i)?.[1] || 1),
      expired: node.getAttribute("data-expired") === "true" || /expired/i.test(node.textContent || "")
    })).filter((coupon) => coupon.couponKey);
  }

  function parseCart(document) {
    return [...document.querySelectorAll("[data-gc-cart-item], [data-testid*='cart-item']")].map((node) => ({
      upc: productIdFrom(node),
      description: node.getAttribute("data-description") || node.textContent?.trim() || "Cart item",
      quantity: Number(node.getAttribute("data-quantity") || 1),
      discountCents: node.hasAttribute("data-discount-cents") ? Number(node.getAttribute("data-discount-cents")) : (() => {
        const value = node.querySelector?.("[data-testid*='discount']")?.textContent?.match(/\$([0-9]+(?:\.[0-9]{2})?)/)?.[1];
        return value ? Math.round(Number(value) * 100) : null;
      })()
    })).filter((item) => item.upc);
  }

  scope.GroceryCartExtension = { ...scope.GroceryCartExtension, parseRecentPurchases, parseCoupons, parseCart, productIdFrom };
})(globalThis);
