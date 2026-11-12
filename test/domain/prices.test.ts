import { describe, expect, test } from "vitest";
import { comparePrice, effectivePrice, estimateTotal } from "../../src/domain/prices";

describe("prices", () => {
  test("prefers a promotional price including zero", () => {
    expect(effectivePrice({ regularPriceCents: 399, promoPriceCents: 349 })).toBe(349);
    expect(effectivePrice({ regularPriceCents: 399, promoPriceCents: 0 })).toBe(0);
  });

  test("reports no comparison without a prior snapshot", () => {
    expect(comparePrice(349, null)).toEqual({ changeCents: null, direction: "unknown" });
  });

  test("excludes unresolved variable-weight items from the total", () => {
    expect(estimateTotal([
      { quantity: 2, effectivePriceCents: 349, variableWeight: false },
      { quantity: 1, effectivePriceCents: null, variableWeight: true }
    ])).toEqual({ pricedTotalCents: 698, unresolvedWeightedItems: 1 });
  });
});
