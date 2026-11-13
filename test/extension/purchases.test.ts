import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, test } from "vitest";
import "../../extension/shared/kroger-adapter.js";

const { parseRecentPurchases } = globalThis.GroceryCartExtension;

describe("Recent Purchases adapter", () => {
  test("normalizes visible exact products and deduplicates lazy-loaded cards", () => {
    const { document } = parseHTML(readFileSync("extension/fixtures/recent-purchases.html", "utf8"));

    const records = parseRecentPurchases(document, new Date("2026-11-12T12:00:00Z"));

    expect(records).toEqual([
      { orderId: "order-a", orderedAt: "2026-11-01T12:00:00Z", productId: "0001", description: "Whole Milk", size: "1 gal", quantity: 2 },
      { orderId: "order-b", orderedAt: "2026-10-20T12:00:00Z", productId: null, description: "Loose Bananas", size: "per lb", quantity: 1 }
    ]);
  });

  test("ignores records older than two calendar months", () => {
    const { document } = parseHTML('<article data-gc-purchase data-order-id="old" data-ordered-at="2026-08-01T12:00:00Z" data-product-id="1" data-description="Old"></article>');

    expect(parseRecentPurchases(document, new Date("2026-11-12T12:00:00Z"))).toEqual([]);
  });
});
