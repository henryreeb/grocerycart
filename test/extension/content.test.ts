import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import { expect, test, vi } from "vitest";

function purchaseContext(pathname: string) {
  const messages: unknown[] = [];
  const parseRecentPurchases = vi.fn((_document: unknown, _now: Date, _sourceUrl: string) => [{ orderId: "order-1", orderedAt: "2026-11-06T12:00:00Z", productId: "0001", description: "Milk" }]);
  const context = {
    GroceryCartExtension: { parseRecentPurchases, extensionApi: { sendMessage(message: unknown) { messages.push(message); return Promise.resolve({ ok: true }); } } },
    location: { hostname: "www.kroger.com", pathname, href: `https://www.kroger.com${pathname}` },
    document: { body: {} },
    MutationObserver: class { observe() {} },
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() {}
  };
  vm.runInNewContext(readFileSync("extension/content.js", "utf8"), context);
  return { messages, parseRecentPurchases };
}

test("imports purchase details but ignores the purchase summary page", () => {
  const detail = purchaseContext("/mypurchases/detail/2026-11-06_order-1");
  expect(detail.parseRecentPurchases).toHaveBeenCalledTimes(1);
  expect(detail.parseRecentPurchases.mock.calls[0]?.[1].toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(detail.parseRecentPurchases.mock.calls[0]?.[2]).toBe("https://www.kroger.com/mypurchases/detail/2026-11-06_order-1");
  expect(detail.messages).toEqual([{ type: "COLLECTED_EVIDENCE", evidenceType: "purchase_import", body: [{ orderId: "order-1", orderedAt: "2026-11-06T12:00:00Z", productId: "0001", description: "Milk" }] }]);
  expect(purchaseContext("/mypurchases").messages).toEqual([]);
});

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
