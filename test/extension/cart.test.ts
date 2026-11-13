import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, test } from "vitest";
import "../../extension/shared/kroger-adapter.js";

describe("cart adapter", () => {
  test("extracts exact UPCs, quantities, and visible discounts", () => {
    const { document } = parseHTML(readFileSync("extension/fixtures/cart.html", "utf8"));

    expect(globalThis.GroceryCartExtension.parseCart(document)).toEqual([
      { upc: "0001", description: "Milk", quantity: 2, discountCents: 100 },
      { upc: "0009", description: "Bread", quantity: 1, discountCents: null }
    ]);
  });
});
