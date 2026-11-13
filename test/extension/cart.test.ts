import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, test } from "vitest";
import "../../extension/shared/kroger-adapter.js";

describe("cart adapter", () => {
  test("extracts exact UPCs, quantities, and visible discounts", () => {
    const { document } = parseHTML(readFileSync("extension/fixtures/cart.html", "utf8"));

    expect(globalThis.GroceryCartExtension.parseCart(document)).toEqual({ status: "complete", items: [
      { upc: "0001", description: "Milk", quantity: 2, discountCents: 100 },
      { upc: "0009", description: "Bread", quantity: 1, discountCents: null }
    ] });
  });

  test("fails closed when Kroger cart loading state is not recognized", () => {
    const { document } = parseHTML("<html><body><p>Loading cart…</p></body></html>");
    expect(globalThis.GroceryCartExtension.parseCart(document)).toEqual({ status: "unknown", items: [] });
  });
});
