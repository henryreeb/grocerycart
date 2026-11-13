# Kroger Cart Auto-Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Kroger's collapsed cart before producing the complete snapshot used for duplicate checks.

**Architecture:** Keep Kroger DOM knowledge in the existing adapter. Export one small function that clicks the exact **Show all items** button once; the content script calls it before parsing, while `parseCart` rejects any page where that control is still present.

**Tech Stack:** Browser extension JavaScript, LinkeDOM fixtures, Vitest, Chrome/Firefox Manifest V3 packaging

**Spec:** `docs/superpowers/specs/2026-11-13-kroger-cart-auto-expand-design.md`

## Global Constraints

- Do not add, remove, or change Kroger cart items, quantities, pickup settings, or checkout state.
- Upload no snapshot when expansion fails or cart markup is unrecognized.
- Accept a zero-item cart only through Kroger's explicit empty-cart marker.
- Add no dependency or configuration option.

## Review Focus

- A similarly labeled recommendation control must not cause a partial snapshot; match the exact normalized **Show all items** text on a recognized cart page.
- A still-visible expansion control must make `parseCart` return `unknown`.
- Repeated collection cycles must not repeatedly click after the control disappears.
- A failed click must leave the scan fail-closed.
- Explicit empty-cart markup without an expansion control must remain a complete empty snapshot.

---

### Task 1: Expand and validate the complete Kroger cart

**Files:**
- Modify: `extension/shared/kroger-adapter.js`
- Modify: `extension/content.js`
- Test: `test/extension/cart.test.ts`
- Test: `test/extension/content.test.ts`

**Interfaces:**
- Consumes: the existing `GroceryCartExtension` global and `parseCart(document)` result contract.
- Produces: `GroceryCartExtension.expandCollapsedCart(document): boolean`, returning `true` only when it found and clicked the exact cart expansion control.

- [ ] **Step 1: Write failing adapter tests**

Add tests asserting that a recognized collapsed cart returns `unknown`, `expandCollapsedCart` clicks the exact **Show all items** button once, unrelated buttons are ignored, and explicit empty-cart markup returns `{ status: "complete", items: [] }`.

- [ ] **Step 2: Run the adapter tests and verify RED**

Run: `npm test -- test/extension/cart.test.ts`

Expected: FAIL because `expandCollapsedCart` is absent and the collapsed cart is currently accepted.

- [ ] **Step 3: Implement the adapter behavior**

In `extension/shared/kroger-adapter.js`, add `expandCollapsedCart(document): boolean`, export it on the existing global, and make `parseCart(document)` return `unknown` while the exact expansion control remains visible.

- [ ] **Step 4: Run the adapter tests and verify GREEN**

Run: `npm test -- test/extension/cart.test.ts`

Expected: all adapter tests pass.

- [ ] **Step 5: Write a failing content-script integration test**

Create `test/extension/content.test.ts` with mocked extension messaging and timers. Assert that a cart collection cycle calls expansion and sends no `COLLECTED_EVIDENCE` message while expansion occurs, then sends the complete snapshot after the simulated DOM update removes the control.

- [ ] **Step 6: Run the content test and verify RED**

Run: `npm test -- test/extension/content.test.ts`

Expected: FAIL because `content.js` parses before requesting expansion.

- [ ] **Step 7: Call expansion before parsing**

In the cart branch of `extension/content.js`, return from the collection cycle when `gc.expandCollapsedCart(document)` is `true`; let the existing mutation observer schedule the next scan.

- [ ] **Step 8: Run focused and full verification**

Run: `npm test -- test/extension/cart.test.ts test/extension/content.test.ts`, `npm test`, and `npm run typecheck`.

Expected: focused tests pass; the complete suite has zero failures; TypeScript exits successfully.

- [ ] **Step 9: Rebuild production packages and commit**

Run in PowerShell: `$env:APP_ORIGIN='https://grocerycart.henryreeb3.workers.dev'; npm run package:extensions; Remove-Item Env:APP_ORIGIN`.

Verify both generated manifests contain the production origin, then commit the spec, plan, adapter, content script, and tests with `fix: expand collapsed Kroger cart before scan` and push `main`.
