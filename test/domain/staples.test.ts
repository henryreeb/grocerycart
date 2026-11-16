import { describe, expect, test } from "vitest";
import { suggestStaples } from "../../src/domain/staples";

describe("staple suggestions", () => {
  test("counts distinct orders in the last two months", () => {
    const suggestions = suggestStaples([
      { orderId: "a", orderedAt: "2026-11-01T12:00:00Z", productId: "milk", description: "Milk" },
      { orderId: "a", orderedAt: "2026-11-01T12:00:00Z", productId: "milk", description: "Milk" },
      { orderId: "b", orderedAt: "2026-10-20T12:00:00Z", productId: "milk", description: "Milk" },
      { orderId: "c", orderedAt: "2026-10-05T12:00:00Z", productId: "milk", description: "Milk" },
      { orderId: "old", orderedAt: "2026-08-01T12:00:00Z", productId: "milk", description: "Milk" }
    ], new Date("2026-11-12T12:00:00Z"));

    expect(suggestions).toEqual([{ productId: "milk", description: "Milk", orderCount: 3, category: "core" }]);
  });

  test("keeps exact variants separate and flags missing identifiers", () => {
    const suggestions = suggestStaples([
      { orderId: "a", orderedAt: "2026-11-01T12:00:00Z", productId: "small", description: "Small Coffee" },
      { orderId: "b", orderedAt: "2026-11-02T12:00:00Z", productId: "large", description: "Large Coffee" },
      { orderId: "c", orderedAt: "2026-11-03T12:00:00Z", productId: null, description: "Unknown Produce" }
    ], new Date("2026-11-12T12:00:00Z"));

    expect(suggestions.map(({ productId, category }) => ({ productId, category }))).toEqual([
      { productId: null, category: "review" },
      { productId: "large", category: "occasional" },
      { productId: "small", category: "occasional" }
    ]);
  });

  test("starts the two-month window on the first calendar day", () => {
    const suggestions = suggestStaples([
      { orderId: "edge", orderedAt: "2026-02-01T00:00:00Z", productId: "milk", description: "Milk" },
      { orderId: "old", orderedAt: "2026-01-31T23:59:59Z", productId: "bread", description: "Bread" }
    ], new Date("2026-04-30T23:00:00Z"));

    expect(suggestions).toEqual([{ productId: "milk", description: "Milk", orderCount: 1, category: "occasional" }]);
  });
});
