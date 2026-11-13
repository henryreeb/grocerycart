# Kroger Purchase-Detail Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import exact products from manually opened Kroger purchase-detail pages into recent-purchase staple suggestions.

**Architecture:** Extend the existing Kroger DOM adapter with an optional source URL so it can derive order identity and date from `/mypurchases/detail/<order-key>`. Keep routing in the content script and evidence persistence unchanged; only detail pages emit `purchase_import` evidence.

**Tech Stack:** Browser extension JavaScript, LinkeDOM fixtures, Vitest, Cloudflare Worker evidence endpoint

**Spec:** `docs/superpowers/specs/2026-11-13-kroger-purchase-detail-import-design.md`

## Global Constraints

- Do not navigate Kroger or open tabs automatically.
- Do not import from `/mypurchases` summary pages.
- Require exact UPC, description, and positive integer quantity for every imported detail card.
- Reject malformed detail URLs or partially parsed orders.
- Add no dependency or configuration option.
- Commit and push every completed task checkpoint to `main` so work is recoverable across usage windows.

## Review Focus

- URL-encoded or query-suffixed order keys must still produce the stable detail path segment.
- Invalid calendar dates in an otherwise matching URL must not import.
- One malformed product card must reject the whole order rather than produce partial history.
- Duplicate/lazy-rendered cards in one order must deduplicate by order ID and product identity.
- The two-calendar-month cutoff must handle month boundaries without importing older orders.

---

### Task 1: Parse current Kroger purchase details

**Files:**
- Modify: `extension/shared/kroger-adapter.js`
- Modify: `extension/globals.d.ts`
- Test: `test/extension/purchases.test.ts`

**Interfaces:**
- Consumes: current `productIdFrom(node)` and legacy purchase fixture behavior.
- Produces: `parseRecentPurchases(document, now?, sourceUrl?)`, returning normalized records or `[]` when a current detail order cannot be parsed completely.

- [ ] Write failing tests for the supplied `/mypurchases/detail/2026-11-06_016_00569_1460_1441557` URL and `list-style-product-card-*` markup, malformed URL/date/card rejection, same-order card deduplication, and the month cutoff.
- [ ] Run `npm test -- test/extension/purchases.test.ts` and confirm the new cases fail for the expected missing current-markup behavior.
- [ ] Implement the minimal URL-derived order metadata and exact card parsing while preserving legacy fixture tests; update the global declaration.
- [ ] Rerun the focused test and confirm all purchase adapter cases pass.
- [ ] Commit and push this parser checkpoint to `main` with `fix: parse current Kroger purchase details`.

### Task 2: Route detail pages into evidence collection

**Files:**
- Modify: `extension/content.js`
- Test: `test/extension/content.test.ts`
- Generated: `dist/chrome/*`, `dist/firefox/*` (ignored packaging outputs)

**Interfaces:**
- Consumes: Task 1's `parseRecentPurchases(document, now?, sourceUrl?)`.
- Produces: `purchase_import` messages only for `/mypurchases/detail/*`, passing `location.href` to the adapter.

- [ ] Add a failing content integration test proving a detail page emits `purchase_import` with its URL and the `/mypurchases` summary page emits nothing.
- [ ] Run `npm test -- test/extension/content.test.ts` and confirm failure under the old `recent` route check.
- [ ] Replace the obsolete route check with the exact detail-path condition and pass `location.href` into the adapter.
- [ ] Run focused tests, `npm test`, and `npm run typecheck`; require zero failures.
- [ ] Rebuild both extension packages with production `APP_ORIGIN` and verify both manifests contain `https://grocerycart.henryreeb3.workers.dev`.
- [ ] Request a fresh read-only review covering the Review Focus; fix all Critical/Important findings through RED→GREEN tests.
- [ ] Commit and push the verified integration to `main` with `fix: import Kroger purchase detail pages`.
