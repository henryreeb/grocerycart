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

  scope.GroceryCartExtension = { ...scope.GroceryCartExtension, parseRecentPurchases, productIdFrom };
})(globalThis);
