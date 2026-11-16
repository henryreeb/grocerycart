# Product Search Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ten-at-a-time product search with native Enter submission and Load more.

**Architecture:** Carry Kroger's pagination metadata through the existing client and product route, then keep one small search state object in `public/app.js` for reset, append, deduplication, and stale-response protection. No persistence or dependency changes.

**Tech Stack:** TypeScript, Cloudflare Worker, vanilla DOM, Vitest/LinkeDOM

**Spec:** `docs/superpowers/specs/2026-11-16-product-search-pagination-design.md`

## Global Constraints

- UI page size is exactly 10; API validation continues to cap page size at 50.
- `start` must be a non-negative integer.
- Existing product results and controls survive Load more failures.
- Native form submission handles Enter; do not add a keydown workaround that can double-submit.
- Commit and push each completed task to `main`.

## Review Focus

- Missing/malformed Kroger pagination metadata must fail safely.
- An exact multiple of 10 must still honor Kroger's reported `total`.
- Duplicate product IDs across pages must render once.
- Late responses from an older query must not modify current results.
- Repeated Load more clicks while a request is pending must not skip or duplicate pages.

---

### Task 1: Carry pagination through the API

**Files:** `src/kroger/client.ts`, `src/routes/products.ts`, `test/kroger/client.test.ts`, `test/routes/products.test.ts`

**Produces:** `searchProducts(...)` returns `{ products, start, limit, total }`; `/api/products` validates/forwards `start` and returns the page metadata.

- [ ] Add failing client and route tests for `filter.start`, normalized metadata, malformed metadata, and offset validation.
- [ ] Implement the smallest typed page result and route propagation.
- [ ] Run focused tests and type-check.
- [ ] Commit and push `feat: paginate Kroger product search API`.

### Task 2: Add native-submit paginated results

**Files:** `public/app.js`, `public/styles.css`, focused frontend test as needed.

**Consumes:** Task 1's `{ products, start, limit, total }` response.

- [ ] Add failing frontend coverage for new-search reset, page append/deduplication, end-of-results, pending-state protection, and form submit behavior.
- [ ] Implement search state, result rendering, explicit `type="submit"`, and Load more button.
- [ ] Run focused tests, full tests, type-check, and production extension packaging.
- [ ] Request fresh read-only review and fix Critical/Important findings through RED→GREEN tests.
- [ ] Deploy, verify production health, commit and push `feat: add product search pagination`, and confirm local/remote `main` match.
