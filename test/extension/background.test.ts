import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "vitest";

test("Firefox background page starts without importScripts", () => {
  const listeners: unknown[] = [];
  const extensionApi = { runtime: { onMessage: { addListener(value: unknown) { listeners.push(value); } } }, storage: { local: { get: async () => ({}), set: async () => {} } } };
  expect(() => vm.runInNewContext(readFileSync("extension/background.js", "utf8"), { globalThis: { browser: extensionApi, GroceryCartExtension: { canonicalEnvelope: JSON.stringify } }, TextEncoder, Uint8Array, btoa, crypto, fetch })).not.toThrow();
  expect(listeners).toHaveLength(1);
});
