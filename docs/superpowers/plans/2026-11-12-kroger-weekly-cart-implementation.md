# Kroger Weekly Cart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private Cloudflare-hosted household app and Firefox/Chrome companion extension that prepares, prices, reviews, coupon-checks, and explicitly submits a weekly pickup draft to Kroger.

**Architecture:** A TypeScript Cloudflare Worker serves a small static client and JSON API, persists household state in D1, runs the Thursday scheduler, and integrates only with Kroger's official OAuth, Products, Locations, and Cart APIs. A shared Manifest V3 extension reads user-visible Kroger pages and reports signed evidence to the app; Firefox and Chrome differ only in manifests and the browser API adapter.

**Tech Stack:** TypeScript, Cloudflare Workers Static Assets, D1/SQLite, Wrangler, Web Crypto, vanilla HTML/CSS/TypeScript, Vitest, Firefox/Chrome Manifest V3 WebExtensions.

**Spec:** `docs/superpowers/specs/2026-11-12-kroger-weekly-cart-design.md`

## Global Constraints

- One household, one shared Kroger account, one preferred store, pickup fulfillment only.
- Draft must be available by 9:00 AM Thursday in `America/New_York`, including daylight-saving transitions.
- All changes stay staged until an explicit authenticated submission.
- Before submission, require a fresh extension cart snapshot; warn only for exact UPC duplicates and append nonduplicates.
- Never store Kroger passwords, cookies, payment data, addresses, or receipt images.
- Encrypt Kroger refresh tokens with a Worker secret; use OAuth state and PKCE.
- Extension host access is limited to `https://www.kroger.com/*` and the exact household-app origin.
- Green coupon state requires clipped, exact-product eligible, and quantity-satisfied evidence; blue requires a Kroger-displayed cart discount.
- Cart snapshots and coupon evidence used operationally must be no more than five minutes old.
- Variable-weight items show Kroger's unit price and leave unresolved extended cost out of totals.
- No checkout, fulfillment-slot selection, automated coupon clipping, public registration, email notifications, or browsers beyond current Firefox and Chrome.
- Keep extension logic self-contained; no remotely hosted executable code.
- This workspace is not currently a Git repository. Run commit steps only if the user initializes or supplies one; do not initialize Git merely to satisfy this plan.

## Review Focus

- A repeated or delayed Thursday trigger must create exactly one draft for the Eastern-local week; Task 5 tests retry and DST boundaries.
- A stale or missing cart snapshot must block submission rather than guessing; Task 6 tests freshness and absence.
- Exact UPC duplicates must warn while similarly named or nonmatching products must append without warning; Task 6 tests both.
- Unknown or ambiguous coupon/product evidence must remain amber or gray, never green; Task 8 tests incomplete and conflicting evidence.
- A variable-weight item without an extended price must remain selectable and must not corrupt the estimated total; Task 4 tests the calculation.

---

## File Structure

```text
package.json                         npm scripts and pinned development tools
tsconfig.json                        shared strict TypeScript configuration
vitest.config.ts                     unit/integration test configuration
wrangler.jsonc                       Worker, assets, D1, cron, and environment bindings
src/worker.ts                        Worker fetch and scheduled entry points
src/config.ts                        environment binding types and fixed app constants
src/db/schema.sql                    D1 schema and constraints
src/db/queries.ts                    typed D1 persistence operations
src/auth/password.ts                 PBKDF2 password hashing and verification
src/auth/session.ts                  signed session creation and verification
src/auth/csrf.ts                     CSRF token generation and validation
src/kroger/oauth.ts                  OAuth state, PKCE, callback, refresh, token encryption
src/kroger/client.ts                 official Kroger HTTP client and response validation
src/kroger/types.ts                  minimal Kroger DTOs used by the app
src/domain/prices.ts                 effective-price and prior-price calculations
src/domain/staples.ts                two-month import grouping and suggestions
src/domain/coupons.ts                coupon evidence state machine
src/domain/drafts.ts                 weekly draft creation and item edits
src/domain/submission.ts             duplicate checks and idempotent cart submission
src/routes/*.ts                      login, setup, products, drafts, extension, OAuth routes
public/index.html                    single household app shell
public/app.ts                        client state, API calls, and view rendering
public/styles.css                    accessible responsive presentation
extension/shared/api.js              Promise-based Firefox/Chrome API adapter
extension/shared/messages.js         strict extension/app message validation
extension/shared/kroger-adapter.js   rendered-page normalization helpers
extension/content.js                 Kroger page observer and evidence collector
extension/background.js              origin checks and app synchronization
extension/manifest.firefox.json      Firefox MV3 packaging metadata
extension/manifest.chrome.json       Chrome MV3 packaging metadata
extension/fixtures/*.html            sanitized Kroger rendered-page fixtures
scripts/package-extension.mjs        deterministic Firefox/Chrome package assembly
test/**/*.test.ts                    Worker/domain/route tests
test/extension/*.test.ts             DOM-fixture extension tests
```

## Task 1: Runnable Worker Shell and D1 Schema

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `wrangler.jsonc`
- Create: `src/config.ts`, `src/worker.ts`, `src/db/schema.sql`, `src/db/queries.ts`
- Create: `public/index.html`, `public/app.ts`, `public/styles.css`
- Test: `test/db/schema.test.ts`, `test/worker/health.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `Env`, `Household`, `Draft`, `DraftItem`; `getHousehold(db)`, `getDraftByWeek(db, week)`, `createDraft(db, input)`; Worker `/api/health` response.

- [ ] **Step 1: Write failing schema and health tests**

Assert migrations create the tables and unique keys named in the spec, `GET /api/health` returns `{ok:true}`, and static asset fallback serves the app shell.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- test/db/schema.test.ts test/worker/health.test.ts`
Expected: FAIL because configuration, schema, and Worker entry point do not exist.

- [ ] **Step 3: Add the minimal Worker project and schema**

Pin only `typescript`, `wrangler`, `vitest`, and the Cloudflare Workers type package. Define D1 tables from the spec, including unique `(draft_week)` and `(draft_id, product_id)` constraints. Keep `/api/health` unauthenticated and reveal no secret or environment detail.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- test/db/schema.test.ts test/worker/health.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck and local Worker smoke test**

Run: `npm run typecheck` then `npm run dev`
Expected: no type errors; `/api/health` returns HTTP 200 and the root serves the app shell.

- [ ] **Step 6: Commit if a repository exists**

Commit message: `feat: scaffold household cart worker`

## Task 2: Shared Household Authentication

**Files:**
- Create: `src/auth/password.ts`, `src/auth/session.ts`, `src/auth/csrf.ts`
- Create: `src/routes/auth.ts`
- Modify: `src/worker.ts`, `src/config.ts`, `src/db/queries.ts`, `public/app.ts`
- Test: `test/auth/password.test.ts`, `test/auth/session.test.ts`, `test/routes/auth.test.ts`

**Interfaces:**
- Consumes: `Env`, `getHousehold(db)` from Task 1.
- Produces: `hashPassword(password, salt?)`, `verifyPassword(password, encodedHash)`, `createSession(secret, now)`, `verifySession(secret, cookie, now)`, `requireSession(request, env)`, `requireCsrf(request, session)`.

- [ ] **Step 1: Write failing password, session, CSRF, and route tests**

Cover correct and incorrect passwords, malformed hashes, expired/tampered cookies, login rate limiting, secure cookie attributes, CSRF rejection, logout, and reauthentication for password change.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- test/auth test/routes/auth.test.ts`
Expected: FAIL because auth modules and routes do not exist.

- [ ] **Step 3: Implement Web Crypto authentication**

Use PBKDF2-SHA-256 with 600,000 iterations, a versioned encoded format, a random 16-byte per-password salt, constant-time byte comparison, an HMAC-signed HTTP-only `Secure; SameSite=Strict` session cookie, and a session-bound CSRF token. Read session and recovery secrets only from Worker bindings.

- [ ] **Step 4: Add the shared-login UI**

Render only login, logout, and authenticated app states. Do not add registration, email recovery, roles, or profiles.

- [ ] **Step 5: Run focused and type tests**

Run: `npm test -- test/auth test/routes/auth.test.ts` then `npm run typecheck`
Expected: PASS with no type errors.

- [ ] **Step 6: Commit if a repository exists**

Commit message: `feat: add shared household authentication`

## Task 3: Kroger OAuth and Official API Client

**Files:**
- Create: `src/kroger/types.ts`, `src/kroger/oauth.ts`, `src/kroger/client.ts`
- Create: `src/routes/oauth.ts`, `src/routes/products.ts`
- Modify: `src/worker.ts`, `src/config.ts`, `src/db/queries.ts`
- Test: `test/kroger/oauth.test.ts`, `test/kroger/client.test.ts`, `test/routes/products.test.ts`

**Interfaces:**
- Consumes: `requireSession`, D1 token persistence, Worker crypto/secrets.
- Produces: `KrogerClient.searchProducts(term, locationId, fulfillment='csp')`, `getProduct(productId, locationId)`, `addToCart(items, modality='PICKUP')`; `beginOAuth(request, env)`, `completeOAuth(request, env)`; encrypted token storage.

- [ ] **Step 1: Write failing OAuth and API contract tests**

Use mocked Kroger responses to assert PKCE/state validation, encrypted refresh-token round trip, refresh on expiry, pickup product filtering, DTO rejection on malformed responses, rate-limit/error preservation, and Cart API request shape.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- test/kroger test/routes/products.test.ts`
Expected: FAIL because Kroger modules do not exist.

- [ ] **Step 3: Implement OAuth with encrypted token persistence**

Use authorization-code + PKCE, one-time state stored with expiry, AES-GCM for refresh tokens, and Web Crypto-generated nonces. Never expose tokens to the browser client or logs.

- [ ] **Step 4: Implement the smallest validated Kroger client**

Support only location-scoped pickup product search/details and add-to-cart. Normalize exact Kroger product ID, UPC, description, brand, size, availability, regular price, promo price, and supplied weight-unit price.

- [ ] **Step 5: Add authenticated product search route**

Validate trimmed search length and result limit, force the configured preferred store and pickup fulfillment, and return only normalized product fields.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm test -- test/kroger test/routes/products.test.ts` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit if a repository exists**

Commit message: `feat: connect official Kroger APIs`

## Task 4: Prices, Staples Import, and Draft Editing

**Files:**
- Create: `src/domain/prices.ts`, `src/domain/staples.ts`, `src/domain/drafts.ts`
- Create: `src/routes/staples.ts`, `src/routes/drafts.ts`
- Modify: `src/db/queries.ts`, `src/worker.ts`, `public/app.ts`, `public/styles.css`
- Test: `test/domain/prices.test.ts`, `test/domain/staples.test.ts`, `test/domain/drafts.test.ts`, `test/routes/drafts.test.ts`

**Interfaces:**
- Consumes: normalized Kroger products, authenticated routes, D1 queries.
- Produces: `effectivePrice(product)`, `comparePrice(current, previous)`, `suggestStaples(purchases)`, `addDraftItem(draftId, product, quantity, source)`, `updateDraftItem`, `removeDraftItem`; draft/staples JSON endpoints.

- [ ] **Step 1: Write failing price and variable-weight tests**

Assert promo-over-regular selection, no-prior-price handling, exact prior-store/product matching, zero-dollar validity, and exclusion of unresolved variable-weight extended cost while preserving unit-price display and selection.

- [ ] **Step 2: Write failing two-month import grouping tests**

Assert three distinct orders suggests core, one/two suggests occasional, duplicate lines in one order count once, older-than-two-month entries are ignored, exact variants remain distinct, and missing IDs require review.

- [ ] **Step 3: Write failing draft route tests**

Cover search result staging, positive integer quantity validation, exact-item deduplication inside a draft, edits/removal, CSRF, unavailable products, and submitted-draft immutability.

- [ ] **Step 4: Run focused tests and verify failure**

Run: `npm test -- test/domain test/routes/drafts.test.ts`
Expected: FAIL because domain functions and routes do not exist.

- [ ] **Step 5: Implement price, staples, and draft domain functions**

Use integer cents for priced amounts, retain Kroger's weight-unit label/value separately, and keep receipt/import prices out of weekly comparison snapshots.

- [ ] **Step 6: Build the draft and product-search UI**

Provide exact variant selection, quantity editing, removal, current/prior price, price-change labels, weight-unit price, availability, and accessible status text. Color may supplement but never replace text/icons.

- [ ] **Step 7: Run focused tests, typecheck, and accessibility smoke check**

Run: `npm test -- test/domain test/routes/drafts.test.ts` then `npm run typecheck`
Expected: PASS; keyboard use reaches every edit/remove/search control with visible focus.

- [ ] **Step 8: Commit if a repository exists**

Commit message: `feat: stage weekly grocery drafts`

## Task 5: Thursday Scheduler and Price Snapshots

**Files:**
- Modify: `src/domain/drafts.ts`, `src/db/queries.ts`, `src/worker.ts`, `wrangler.jsonc`
- Create: `src/routes/schedule.ts`
- Test: `test/domain/schedule.test.ts`, `test/worker/scheduled.test.ts`, `test/routes/schedule.test.ts`

**Interfaces:**
- Consumes: active staples, Kroger product details, `createDraft`, price snapshot queries.
- Produces: `draftWeek(now, timeZone)`, `shouldPrepare(now, timeZone)`, `prepareWeeklyDraft(env, now)`; authenticated `POST /api/drafts/prepare`.

- [ ] **Step 1: Write failing schedule and idempotency tests**

Assert availability by 9:00 AM Thursday Eastern, pre-9 rejection for automatic creation, EST/EDT boundary behavior, repeated triggers creating one draft, delayed trigger recovery, and concurrent unique-key handling.

- [ ] **Step 2: Write failing refresh-failure tests**

Assert Kroger failures retain last valid stored information, mark the affected item stale, and never overwrite a known price with missing data.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- test/domain/schedule.test.ts test/worker/scheduled.test.ts test/routes/schedule.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the scheduled handler and manual preparation route**

Configure `0 * * * THU`; the hourly UTC handler decides using `America/New_York` local time and the draft-week unique key. The manual route is authenticated, CSRF-protected, and idempotent.

- [ ] **Step 5: Store price snapshots and freshness metadata**

Snapshot exact product/store effective prices after successful refresh and expose last refresh time and stale state to the client.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm test -- test/domain/schedule.test.ts test/worker/scheduled.test.ts test/routes/schedule.test.ts` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit if a repository exists**

Commit message: `feat: prepare Thursday cart drafts`

## Task 6: Submission, Existing-Cart Inspection, and Partial Failures

**Files:**
- Create: `src/domain/submission.ts`, `src/routes/submission.ts`
- Modify: `src/db/queries.ts`, `src/worker.ts`, `public/app.ts`, `public/styles.css`
- Test: `test/domain/submission.test.ts`, `test/routes/submission.test.ts`

**Interfaces:**
- Consumes: current draft, fresh extension `CartSnapshot`, `KrogerClient.addToCart`.
- Produces: `findDuplicates(draftItems, cartSnapshot)`, `buildSubmission(draft)`, `submitDraft(env, draftId, cartSnapshotId, duplicateConfirmation)`; submission status endpoint.

- [ ] **Step 1: Write failing duplicate and freshness tests**

Assert exact UPC matches warn with existing/proposed quantities, similar names do not match, nonduplicates append, stale/missing snapshots block, and confirmed duplicates can proceed once.

- [ ] **Step 2: Write failing idempotency and partial-failure tests**

Assert double-clicks create one operation, submitted drafts cannot ordinarily resubmit, successful batches are not repeated after a partial failure, and retries require a fresh cart snapshot plus duplicate confirmation.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- test/domain/submission.test.ts test/routes/submission.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement frozen submission snapshots and operation records**

Use D1 transactions/unique operation keys around state changes, validate positive integer quantities and Kroger IDs again at the server boundary, and call Kroger with pickup modality only.

- [ ] **Step 5: Add approval and result UI**

Show item count, priced subtotal, unresolved weighted items, unresolved coupons, duplicate warnings only when present, per-batch failures, and a link to finish on Kroger.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm test -- test/domain/submission.test.ts test/routes/submission.test.ts` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit if a repository exists**

Commit message: `feat: submit approved pickup carts safely`

## Task 7: Shared Firefox/Chrome Extension Foundation and Purchase Import

**Files:**
- Create: `extension/shared/api.js`, `extension/shared/messages.js`, `extension/shared/kroger-adapter.js`
- Create: `extension/content.js`, `extension/background.js`
- Create: `extension/manifest.firefox.json`, `extension/manifest.chrome.json`
- Create: `extension/fixtures/recent-purchases.html`, `scripts/package-extension.mjs`
- Create: `src/routes/extension.ts`
- Modify: `src/worker.ts`, `src/routes/staples.ts`, `package.json`
- Test: `test/extension/messages.test.ts`, `test/extension/purchases.test.ts`, `test/routes/extension.test.ts`

**Interfaces:**
- Consumes: authenticated household origin, staples import endpoint.
- Produces: version-1 `ExtensionEnvelope<T>`, paired extension installation credential, `PurchaseRecord`, `CartSnapshot`, `CouponEvidence`; deterministic `dist/firefox` and `dist/chrome` packages.

- [ ] **Step 1: Write failing message-boundary tests**

Reject wrong origins, unknown message versions/types, timestamps older than five minutes, replayed nonces, oversized payloads, malformed product IDs, and records older than two months.

- [ ] **Step 2: Write failing Recent Purchases fixture tests**

Assert visible exact IDs, names, sizes, quantities, and dates normalize correctly; lazy/paginated progress merges without double counting; ambiguous/missing IDs are marked for review.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- test/extension/messages.test.ts test/extension/purchases.test.ts test/routes/extension.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the shared adapter and content/background messaging**

Keep selectors in `kroger-adapter.js`; keep all logic packaged locally. Use `browser.*` when available and a Promise wrapper over `chrome.*` otherwise. Do not request cookies, history, all-sites, or native-messaging permission.

- [ ] **Step 5: Implement pairing and signed app ingestion**

An authenticated page creates a one-time, five-minute pairing code. The extension exchanges it once for a random installation credential, stores that credential only in extension local storage, and the server stores only its hash. Sign each version-1 payload with HMAC-SHA-256 over installation ID, timestamp, nonce, message type, and canonical JSON body. Reject invalid signatures, timestamps older than five minutes, and previously used nonces before persisting normalized records.

- [ ] **Step 6: Build both manifests and deterministic packages**

Firefox adds `browser_specific_settings.gecko.id`; Chrome uses a service worker compatible manifest. Both declare only Kroger and the exact app origin host permissions.

- [ ] **Step 7: Run tests, lint package contents, and load both browsers**

Run: `npm test -- test/extension test/routes/extension.test.ts` and `npm run package:extensions`
Expected: PASS; no remote code, extra permissions, source maps containing secrets, or browser-specific feature forks. Load temporarily in Firefox and unpacked in Chrome and import a sanitized fixture page.

- [ ] **Step 8: Commit if a repository exists**

Commit message: `feat: import Kroger purchases from Firefox and Chrome`

## Task 8: Coupon Eligibility and Kroger Cart Evidence

**Files:**
- Create: `src/domain/coupons.ts`
- Modify: `extension/shared/kroger-adapter.js`, `extension/content.js`, `extension/fixtures/*`, `src/routes/extension.ts`, `src/db/queries.ts`, `public/app.ts`, `public/styles.css`
- Test: `test/domain/coupons.test.ts`, `test/extension/coupons.test.ts`, `test/extension/cart.test.ts`, `test/routes/extension-evidence.test.ts`

**Interfaces:**
- Consumes: `CouponEvidence`, `CartSnapshot`, draft quantities and exact IDs.
- Produces: `couponState(evidence, draftItem) -> 'gray'|'amber'|'green'|'blue'|'red'`; fresh stored cart snapshots for Task 6.

- [ ] **Step 1: Write failing coupon-state tests**

Assert gray with no evidence; amber for possible/incomplete/stale evidence; green only for clipped + exact eligible product + satisfied quantity; blue only with Kroger-displayed cart discount; red for explicit product or quantity contradiction.

- [ ] **Step 2: Write failing rendered-page fixture tests**

Cover clipped/unclipped labels, "Shop All Items" exact product associations, quantity requirements, ambiguous brand-only matches, expired coupons, cart UPC/quantity extraction, and visible discount association.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- test/domain/coupons.test.ts test/extension/coupons.test.ts test/extension/cart.test.ts test/routes/extension-evidence.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement evidence normalization and state machine**

Never infer exact eligibility from text similarity. Persist source URL, observation time, exact identifiers, requirement, and visible Kroger status; treat evidence older than five minutes as stale for submission or confirmation.

- [ ] **Step 5: Add accessible evidence UI and cart-scan flow**

Show text/icon plus gray, amber, green, blue, or red styling. "Send approved items" first requests a current Kroger cart scan and clearly directs the user to open the cart when the scan cannot complete.

- [ ] **Step 6: Run focused tests and browser smoke tests**

Run: `npm test -- test/domain/coupons.test.ts test/extension test/routes/extension-evidence.test.ts`
Expected: PASS; the same fixtures produce identical normalized evidence in Firefox and Chrome.

- [ ] **Step 7: Commit if a repository exists**

Commit message: `feat: verify Kroger coupon and cart evidence`

## Task 9: Export/Delete, Production Hardening, and Deployment Proof

**Files:**
- Create: `src/routes/household-data.ts`, `test/routes/household-data.test.ts`
- Modify: `src/worker.ts`, `src/config.ts`, `wrangler.jsonc`, `public/app.ts`, `public/styles.css`, `package.json`
- Create: `README.md`, `.dev.vars.example`
- Test: `test/security/headers.test.ts`, `test/integration/weekly-flow.test.ts`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: authenticated JSON export, confirmed household-data deletion, deployment/runbook documentation, release-ready app and browser packages.

- [ ] **Step 1: Write failing export/delete and security tests**

Assert export excludes password hashes, secrets, OAuth ciphertext, nonces, and session data; delete requires reauthentication plus explicit confirmation; responses set CSP, frame, content-type, referrer, and cache headers; sensitive routes reject cross-origin requests.

- [ ] **Step 2: Write the failing end-to-end integration test**

Exercise login, OAuth mock, two-month import, staples approval, Thursday creation, price comparison, manual search/add, variable-weight display, coupon evidence, existing-cart duplicate scan, confirmation, pickup Cart API submission, and submission lockout.

- [ ] **Step 3: Run the full test suite and verify failure**

Run: `npm test`
Expected: FAIL on missing household-data routes/hardening or integration wiring.

- [ ] **Step 4: Implement export/delete and security headers**

Deletion removes household data and OAuth tokens after reauthentication; it does not call Kroger or alter the Kroger cart. Document recovery/export before deletion.

- [ ] **Step 5: Add deployment and private-extension instructions**

Document Cloudflare account/D1 setup, secret names, Kroger redirect/scopes, schema application, cron verification, Firefox temporary and signed-unlisted installation, Chrome unpacked installation, optional private/unlisted Web Store path, rollback, and JSON export.

- [ ] **Step 6: Run all automated proof**

Run: `npm test && npm run typecheck && npm run package:extensions`
Expected: all tests pass, zero type errors, and both extension packages contain only expected files.

- [ ] **Step 7: Run local visual and browser proof**

Run the Worker locally; verify mobile and desktop layouts, keyboard navigation, exact status text, purchase import, coupon fixtures, and cart scanning in current Firefox and Chrome.
Expected: no console errors or inaccessible controls; browser outputs match.

- [ ] **Step 8: Deploy a non-destructive production smoke test**

Deploy Worker/D1, configure secrets, connect Kroger OAuth, run product search and "Prepare now," and verify scheduler metadata. Do not perform the first real cart submission without the user's supervision.

- [ ] **Step 9: Supervise the first real cart submission**

With the user present, scan the existing cart, verify duplicate warnings, submit a small approved pickup draft, and confirm Kroger displays the appended products. Record any selector/API corrections as focused fixtures/tests.

- [ ] **Step 10: Commit if a repository exists**

Commit message: `feat: harden and document weekly cart app`

## Completion Criteria

- All automated tests, typechecking, and both extension builds pass.
- Thursday scheduling is proven across EST/EDT and duplicate triggers.
- The family can import two months of purchases or build staples manually.
- The private page supports exact product search, staging, editing, prices, prior prices, variable-weight unit prices, and explicit approval.
- Firefox and Chrome produce identical purchase, coupon, and cart evidence from the same fixtures.
- Missing/stale evidence never becomes confirmed eligibility and blocks unsafe cart submission.
- A supervised pickup submission appends nonduplicates and warns on exact existing-cart duplicates.
- Export/delete, recovery notes, and private installation instructions are complete.
