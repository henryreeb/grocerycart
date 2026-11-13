import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, test } from "vitest";
import "../../extension/shared/kroger-adapter.js";

describe("cart adapter", () => {
  test("extracts items from Kroger's current cart markup", () => {
    const { document } = parseHTML(`<!doctype html><html><body>
      <header data-testid="CartHeader"></header>
      <article>
        <a href="/p/kroger-whole-milk/0001111040101"><img data-testid="product-image"></a>
        <span data-testid="cart-page-item-description">Kroger Whole Milk</span>
        <input data-testid="citrus-QuantityStepper-input" value="2">
      </article>
    </body></html>`);

    expect(globalThis.GroceryCartExtension.parseCart(document)).toEqual({ status: "complete", items: [
      { upc: "0001111040101", description: "Kroger Whole Milk", quantity: 2, discountCents: null }
    ] });
  });

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
