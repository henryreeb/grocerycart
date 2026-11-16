# Product Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display canonical Kroger product thumbnails on search results, staged items, and recent-purchase suggestions.

**Architecture:** Normalize one HTTPS image URL into the existing `Product` model, persist it as nullable product metadata, and carry purchase-card images through staple suggestions. Render every product through one small frontend image helper with lazy loading and failure fallback.

**Tech Stack:** TypeScript, Cloudflare Workers/D1, browser-extension JavaScript, vanilla DOM/CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-11-16-product-images-design.md`

## Global Constraints

- Store URLs only; do not proxy, download, or persist image binaries.
- Accept only syntactically valid HTTPS URLs.
- Existing products and records with no image remain valid.
- Images are decorative; text remains the accessible product identity.
- Add no dependency or extra Kroger request during rendering.
- Commit and push each completed task checkpoint to `main`.

## Review Focus

- Malformed image arrays and non-HTTPS URLs must normalize to `null`, not break product results.
- Default/front perspective and medium-size preference must be deterministic when arrays are reordered.
- A missing migration must never be hidden by deploying code before remote D1 is updated.
- Imported purchase cards with failed/missing images must still produce valid suggestions.
- Broken image loads and narrow mobile layouts must preserve text and controls without layout overflow.

---

### Task 1: Normalize Kroger product images

**Files:**
- Modify: `src/kroger/types.ts`
- Modify: `src/kroger/client.ts`
- Test: `test/kroger/client.test.ts`
- Update product fixtures in tests that construct `Product` values.

**Produces:** `Product.imageUrl: string | null`, selected from a default/front image and preferred medium HTTPS size.

- [ ] Add failing normalization tests covering deterministic perspective/size selection and invalid/non-HTTPS fallback.
- [ ] Run the focused client tests and verify RED.
- [ ] Implement the smallest image selector inside the existing normalizer and update typed fixtures.
- [ ] Run focused tests and type-check; verify GREEN.
- [ ] Commit and push `feat: normalize Kroger product images`.

### Task 2: Persist and expose product images

**Files:**
- Modify: `src/db/schema.sql`
- Create: `src/db/migrations/2026-11-16-product-image.sql`
- Modify: `src/routes/drafts.ts`
- Modify: `src/routes/schedule.ts`
- Modify: `src/routes/household-data.ts`
- Test: `test/db/schema.test.ts`, `test/routes/drafts.test.ts`, `test/routes/household-data.test.ts`, scheduled-worker tests.

**Consumes:** Task 1's `Product.imageUrl`.
**Produces:** nullable `products.image_url`, refreshed on product upserts and exposed as `imageUrl` on current draft/export payloads.

- [ ] Add failing schema and route-propagation tests.
- [ ] Run focused tests and verify RED.
- [ ] Add the nullable column, migration, upsert bindings, draft selection/mapping, and export field.
- [ ] Run focused tests, full tests, and type-check.
- [ ] Commit and push `feat: persist product image URLs`.
- [ ] Apply the checked-in migration to remote D1 and verify `image_url` exists before any Worker deployment.

### Task 3: Carry purchase images into suggestions

**Files:**
- Modify: `extension/shared/kroger-adapter.js`
- Modify: `src/domain/staples.ts`
- Test: `test/extension/purchases.test.ts`, `test/domain/staples.test.ts`, `test/routes/staples.test.ts`.

**Produces:** optional `PurchaseRecord.imageUrl` and `StapleSuggestion.imageUrl`, retaining the first valid HTTPS image for a grouped product.

- [ ] Add failing tests for visible HTTPS card images, invalid URL rejection, and grouped suggestion propagation.
- [ ] Run focused tests and verify RED.
- [ ] Extend the existing purchase parser and grouping without changing order-frequency behavior.
- [ ] Run focused tests and type-check.
- [ ] Commit and push `feat: include images in purchase suggestions`.

### Task 4: Render thumbnails everywhere applicable

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Test: add a focused LinkeDOM/VM frontend test if the helper introduces non-trivial fallback logic.
- Generated: `dist/chrome/*`, `dist/firefox/*` (ignored).

**Consumes:** `imageUrl` from search products, current draft items, and staple suggestions.

- [ ] Add one reusable `productImage(imageUrl)` DOM helper that returns a lazy decorative image or neutral placeholder and collapses failed loads safely.
- [ ] Place it beside text in search results, staged item cards, and recent-purchase suggestions; add fixed-size responsive CSS.
- [ ] Run full tests, type-check, and production extension packaging; verify both manifests use the production origin.
- [ ] Perform a rendered desktop/mobile smoke check for image, missing-image, and broken-image cases.
- [ ] Request one fresh read-only whole-change review; fix Critical/Important findings through RED→GREEN tests.
- [ ] Deploy the Worker, verify health, commit and push `feat: show product images`, and confirm local `main` equals `origin/main`.
