import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, test } from "vitest";
import "../../extension/shared/kroger-adapter.js";

describe("cart adapter", () => {
  test("expands a recognized collapsed cart exactly once", () => {
    const { document } = parseHTML(`<!doctype html><html><body>
      <header data-testid="CartHeader"></header>
      <button> Show all items </button>
    </body></html>`);
    const button = document.querySelector("button")!;
    let clicks = 0;
    button.addEventListener("click", () => { clicks += 1; button.remove(); });

    expect(globalThis.GroceryCartExtension.expandCollapsedCart(document)).toBe(true);
    expect(globalThis.GroceryCartExtension.expandCollapsedCart(document)).toBe(false);
    expect(clicks).toBe(1);
  });

  test("rejects a partial cart while its expansion control remains", () => {
    const { document } = parseHTML(`<!doctype html><html><body>
      <header data-testid="CartHeader"></header>
      <button>Show all items</button>
      <article data-gc-cart-item data-upc="0001" data-description="Milk" data-quantity="1"></article>
    </body></html>`);

    expect(globalThis.GroceryCartExtension.parseCart(document)).toEqual({ status: "unknown", items: [] });
  });

  test("does not repeatedly click an expansion control Kroger leaves in place", () => {
    const { document } = parseHTML("<html><body><header data-testid='CartHeader'></header><button>Show all items</button></body></html>");
    const button = document.querySelector("button")!;
    let clicks = 0;
    button.addEventListener("click", () => { clicks += 1; });

    expect(globalThis.GroceryCartExtension.expandCollapsedCart(document)).toBe(true);
    expect(globalThis.GroceryCartExtension.expandCollapsedCart(document)).toBe(false);
    expect(clicks).toBe(1);
    expect(globalThis.GroceryCartExtension.parseCart(document)).toEqual({ status: "unknown", items: [] });
  });

  test("ignores similarly labeled controls outside a recognized cart", () => {
    const { document } = parseHTML("<html><body><button>Show all items</button></body></html>");
    expect(globalThis.GroceryCartExtension.expandCollapsedCart(document)).toBe(false);
  });

  test("accepts Kroger's explicit empty cart", () => {
    const { document } = parseHTML("<html><body><div data-testid='empty-cart'></div></body></html>");
    expect(globalThis.GroceryCartExtension.parseCart(document)).toEqual({ status: "complete", items: [] });
  });

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
