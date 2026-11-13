import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test, vi } from "vitest";

test("expands a collapsed Kroger cart before uploading its snapshot", () => {
  const messages: unknown[] = [];
  const timers: Array<() => void> = [];
  let mutation: () => void = () => {};
  let collapsed = true;
  const parseCart = vi.fn(() => ({ status: "complete", items: [{ upc: "0001", description: "Milk", quantity: 1 }] }));
  const context = {
    GroceryCartExtension: {
      expandCollapsedCart: vi.fn(() => {
        if (!collapsed) return false;
        collapsed = false;
        return true;
      }),
      parseCart,
      extensionApi: { sendMessage(message: unknown) { messages.push(message); return Promise.resolve({ ok: true }); } }
    },
    location: { hostname: "www.kroger.com", pathname: "/cart" },
    document: { body: {} },
    MutationObserver: class { constructor(callback: () => void) { mutation = callback; } observe() {} },
    setTimeout(callback: () => void) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    setInterval() {}
  };

  vm.runInNewContext(readFileSync("extension/content.js", "utf8"), context);
  expect(parseCart).not.toHaveBeenCalled();
  expect(messages).toEqual([]);

  mutation();
  timers.shift()?.();
  expect(messages).toEqual([{ type: "COLLECTED_EVIDENCE", evidenceType: "cart_snapshot", body: { status: "complete", items: [{ upc: "0001", description: "Milk", quantity: 1 }] } }]);
});
