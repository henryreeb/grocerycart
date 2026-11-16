import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, test } from "vitest";
import "../../extension/shared/kroger-adapter.js";

const { parseRecentPurchases } = globalThis.GroceryCartExtension;

describe("Recent Purchases adapter", () => {
  test("parses Kroger's current purchase-detail cards using order metadata from the URL", () => {
    const { document } = parseHTML(`<!doctype html><html><body>
      <article data-testid="list-style-product-card-0">
        <a href="/p/kroger-2-reduced-fat-milk-gallon/0001111041700?fulfillment=PICKUP"></a>
        <span data-testid="cart-page-item-description">Kroger 2% Milk</span>
        <span data-testid="product-item-sizing">1 gal</span>
        <input data-testid="citrus-QuantityStepper-input" value="2">
      </article>
      <article data-testid="list-style-product-card-1">
        <a href="/p/kroger-2-reduced-fat-milk-gallon/0001111041700?fulfillment=PICKUP"></a>
        <span data-testid="cart-page-item-description">Kroger 2% Milk</span>
        <span data-testid="product-item-sizing">1 gal</span>
        <input data-testid="citrus-QuantityStepper-input" value="2">
      </article>
    </body></html>`);

    expect(parseRecentPurchases(document, new Date("2026-11-13T12:00:00Z"), "https://www.kroger.com/mypurchases/detail/2026-11-06_016_00569_1460_1441557?source=history")).toEqual([
      { orderId: "2026-11-06_016_00569_1460_1441557", orderedAt: "2026-11-06T12:00:00Z", productId: "0001111041700", description: "Kroger 2% Milk", size: "1 gal", quantity: 2 }
    ]);
  });

  test("fails closed for malformed detail dates or product cards", () => {
    const { document } = parseHTML(`<article data-testid="list-style-product-card-0"><span data-testid="cart-page-item-description">Milk</span><input data-testid="citrus-QuantityStepper-input" value="1"></article>`);
    expect(parseRecentPurchases(document, new Date("2026-11-13T12:00:00Z"), "https://www.kroger.com/mypurchases/detail/2026-99-99_order")).toEqual([]);
    expect(parseRecentPurchases(document, new Date("2026-11-13T12:00:00Z"), "https://www.kroger.com/mypurchases/detail/2026-11-06_order")).toEqual([]);
  });

  test("ignores current detail orders older than two calendar months", () => {
    const { document } = parseHTML(`<article data-testid="list-style-product-card-0"><a href="/p/old/0001111041700"></a><span data-testid="cart-page-item-description">Old</span><input data-testid="citrus-QuantityStepper-input" value="1"></article>`);
    expect(parseRecentPurchases(document, new Date("2026-11-13T12:00:00Z"), "https://www.kroger.com/mypurchases/detail/2026-08-31_order")).toEqual([]);
  });

  test("decodes order keys safely and uses calendar-month boundaries", () => {
    const { document } = parseHTML(`<article data-testid="list-style-product-card-0"><a href="/p/milk/0001111041700"></a><span data-testid="cart-page-item-description">Milk</span><input data-testid="citrus-QuantityStepper-input" value="1"></article>`);
    expect(parseRecentPurchases(document, new Date("2026-04-30T23:00:00Z"), "https://www.kroger.com/mypurchases/detail/2026-02-01%5Forder-1")).toMatchObject([{ orderId: "2026-02-01_order-1" }]);
    expect(parseRecentPurchases(document, new Date("2026-04-30T23:00:00Z"), "https://www.kroger.com/mypurchases/detail/2026-02-01_order%ZZ")).toEqual([]);
  });

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
