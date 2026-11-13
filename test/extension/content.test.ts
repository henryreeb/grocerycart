import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import { expect, test } from "vitest";

test("expands a collapsed Kroger cart before uploading its snapshot", () => {
  const messages: unknown[] = [];
  const timers: Array<() => void> = [];
  let mutation: () => void = () => {};
  const { document } = parseHTML(`<html><body>
    <header data-testid="CartHeader"></header>
    <button>Show all items</button>
  </body></html>`);
  document.querySelector("button")!.addEventListener("click", () => {
    document.querySelector("button")!.remove();
    document.body.insertAdjacentHTML("beforeend", `<article data-gc-cart-item data-upc="0001" data-description="Milk" data-quantity="1"></article>`);
    mutation();
  });
  const context = {
    GroceryCartExtension: {
      extensionApi: { sendMessage(message: unknown) { messages.push(message); return Promise.resolve({ ok: true }); } }
    },
    location: { hostname: "www.kroger.com", pathname: "/cart" },
    document,
    MutationObserver: class { constructor(callback: () => void) { mutation = callback; } observe() {} },
    setTimeout(callback: () => void) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    setInterval() {}
  };

  vm.runInNewContext(readFileSync("extension/shared/kroger-adapter.js", "utf8"), context);
  vm.runInNewContext(readFileSync("extension/content.js", "utf8"), context);
  expect(messages).toEqual([]);

  timers.shift()?.();
  expect(messages).toEqual([{ type: "COLLECTED_EVIDENCE", evidenceType: "cart_snapshot", body: { status: "complete", items: [{ upc: "0001", description: "Milk", quantity: 1, discountCents: null }] } }]);
});
