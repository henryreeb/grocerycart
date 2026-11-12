# Kroger Weekly Cart Design

## Intent

Build a private household web app that prepares a Kroger grocery draft every Thursday morning, lets the family review prices and edit the list, assists with coupon verification through a Firefox extension, and sends only explicitly approved items to the shared Kroger cart. Kroger remains the source of truth for checkout, final prices, substitutions, and applied savings.

## Goals

- Prepare one weekly draft by 9:00 AM Eastern each Thursday for one shared Kroger account and preferred store.
- Seed the household staples list from up to two months of signed-in Kroger purchase history when possible, with a manual fallback.
- Display each item's current regular or promotional price and its price from the preceding weekly snapshot.
- Let family members search the preferred store's pickup catalog and stage arbitrary products, including variable-weight products, in the weekly draft.
- Let the family change quantities, remove items, and approve the complete draft before any Kroger cart mutation.
- Assist coupon review with explicit evidence states for clipping, product eligibility, quantity eligibility, and a Kroger-displayed cart discount.
- Add the approved draft to the shared Kroger cart using Kroger's public Cart API.
- Run reliably on a free private-cloud tier without depending on a family computer being awake.

## Non-goals

- Completing checkout, reserving pickup or delivery slots, choosing substitutions, or submitting payment.
- Automatically clipping coupons.
- Claiming a final coupon-adjusted total before Kroger confirms it.
- Supporting multiple Kroger accounts, stores, households, roles, or public registration.
- Supporting browsers other than current Firefox and Chrome in the first version.
- Keeping the cloud app synchronized with cart changes made directly on Kroger after submission.

## Anti-goals

- Do not scrape or depend on undocumented Kroger background APIs.
- Do not collect the Kroger password, payment data, or browser cookies.
- Do not add items to Kroger before an explicit household approval action.
- Do not represent a text or brand similarity as confirmed coupon eligibility.

## Chosen Approach

Use a Cloudflare Worker with static assets for the private web app, a D1 database for household state and price history, a Cron Trigger for weekly preparation, and Worker secrets for Kroger OAuth credentials and application secrets. Use one Manifest V3 WebExtension codebase packaged for Firefox and Chrome, restricted to Kroger and the household app origins, to read user-visible Kroger purchase, coupon, eligibility, and cart-savings state.

The app owns the editable weekly draft. Kroger is mutated once, only after approval. This avoids duplicates and reconciliation problems caused by the public Cart API's add-oriented interface.

## Approaches Considered

### Staged draft with a Firefox/Chrome companion — selected

All edits happen in the household draft. The extension imports visible purchase history and verifies visible coupon/cart evidence. An explicit action sends the approved list to Kroger. This provides the strongest available confirmation without handling Kroger credentials or relying on undocumented interfaces.

### Extension-free coupon checklist

The page would link to Kroger coupon searches and rely on the user to mark coupons as clipped. This is simpler but cannot independently distinguish a clipped coupon, an eligible exact product, or a satisfied quantity requirement.

### Immediate per-item Kroger mutation

Each search result would add directly to Kroger. This shortens one interaction but makes accidental duplicates and quantity corrections difficult because the public API does not provide a dependable full reconciliation workflow. It was rejected in favor of staging.

## System Components

### Private web app

The responsive household page has four focused areas:

1. **Weekly draft:** product cards with description, brand, size, quantity, current price, previous-week price, price change, availability, and coupon state.
2. **Add products:** Kroger product search limited to the preferred store. Selecting an exact variant and quantity stages it in the draft.
3. **Coupon review:** filters items needing review and opens the relevant Kroger coupon experience. Extension results update the item cards.
4. **Approval:** summarizes estimated merchandise total and known promotional savings, warns about unresolved items, and sends the approved list to Kroger after confirmation.

Variable-weight product cards show Kroger's current price per weight unit, the requested item count, and an explicit note that final weight and cost are determined during fulfillment. They do not invent an exact extended price when Kroger does not provide one.

The page uses one shared household login. There is no registration flow. The password is stored only as a slow password hash. Authentication uses secure, HTTP-only, same-site cookies with session expiry. A recovery secret is managed out of band as a Cloudflare secret.

### Cloudflare Worker

The Worker serves the page and a small JSON API. It:

- authenticates the household session;
- performs Kroger OAuth authorization-code and refresh-token handling;
- searches products and reads store-specific prices through official Kroger APIs;
- creates weekly drafts and price snapshots;
- validates extension submissions;
- records approval and cart-submission results;
- adds approved UPCs and quantities through Kroger's official Cart API.

Kroger refresh tokens are encrypted before database storage with a key held in Worker secrets. OAuth state and PKCE are required. No Kroger credentials other than issued OAuth tokens are stored.

### D1 database

Keep the schema small:

- `household`: preferred store, timezone, schedule, and password hash.
- `products`: Kroger product/UPC identity and last known display metadata.
- `staples`: product, default quantity, active state, and purchase frequency.
- `weekly_drafts`: week, status, timestamps, estimated total, and submission marker.
- `draft_items`: product, quantity, current price, previous price, availability, source, and review state.
- `price_snapshots`: product, store, observed price, promo price, and observation time.
- `coupon_evidence`: draft item, coupon label/identifier when visible, clipped state, exact-item eligibility, quantity eligibility, cart-discount evidence, and observation time.
- `oauth_tokens`: encrypted Kroger refresh token and metadata.

Use unique constraints on draft week and on `(draft_id, product_id)` so scheduled retries and repeated additions remain idempotent.

### Firefox and Chrome extension

The extension requests access only to `https://www.kroger.com/*` and the exact household-app origin. It does not request cookie access, password access, or broad browsing permissions. Firefox and Chrome packages share all product logic, Kroger adapters, tests, and assets. Browser differences are limited to two small manifests and a thin promise-based WebExtension API adapter; do not fork the feature implementation by browser.

Content scripts read only rendered, user-visible Kroger pages and report normalized facts to the extension background process. The extension sends signed, origin-bound messages to the authenticated household app. The app rejects unknown origins, stale messages, unknown draft items, and malformed evidence.

The extension supports three tasks:

1. **Purchase import:** while the user visits Kroger Recent Purchases, collect visible products from up to two months, including identifiers when exposed, descriptions, sizes, quantities, order dates, and occurrence counts.
2. **Coupon evidence:** observe whether Kroger shows a coupon as clipped, follow its visible "Shop All Items" association, and match an exact product identifier where available. Parse quantity requirements only when Kroger displays them clearly.
3. **Cart evidence:** before submission, inspect the visible Kroger cart and return exact product identifiers and quantities for duplicate detection. After submission, observe Kroger's visible cart savings and associate a displayed discount with a draft item only when identifiers or an unambiguous Kroger association permit it.

DOM selectors and parsing live in isolated Kroger adapter modules with fixture-based tests so page changes are localized.

During development, load the extension temporarily in Firefox and unpacked in Chrome. For durable household installation, distribute a Mozilla-signed unlisted Firefox `.xpi`. Chrome can initially remain a trusted unpacked installation; a durable one-click Chrome install requires Chrome Web Store signing and either private or unlisted distribution, including Google's developer registration and review.

## Purchase Import and Staples

The initial setup offers a user-initiated import from up to two months of signed-in Kroger Recent Purchases. Lazy-loaded or paginated history may require the user to advance or scroll through Kroger pages while the extension collects visible entries.

The app groups exact product variants by Kroger identifier or UPC. It suggests:

- **Core staple:** present in at least three distinct orders.
- **Occasional:** present in one or two orders.
- **Review required:** missing identifier, ambiguous size, or likely substitution.

Nothing becomes an active staple until the user approves it and confirms the default weekly quantity. Ambiguous variants may be manually merged. If import is unavailable, the same screen supports building staples through Kroger product search.

## Weekly Draft Workflow

1. A Cloudflare Cron Trigger ensures the draft is available by 9:00 AM Thursday in `America/New_York`. Because Cloudflare cron expressions use UTC, the handler checks local time and the current draft week before creating anything. The unique week constraint prevents duplicates across daylight-saving transitions and retries.
2. The Worker creates the draft from active staples.
3. It fetches current store-specific pickup product details and price data from Kroger, recording availability, regular price, promotional price, and weight-unit pricing when Kroger provides it.
4. It compares the current effective price with the most recent prior weekly snapshot for the same product and store. Missing comparisons display as "No prior price."
5. Family members visit the page, search and stage additions, edit quantities, or remove items.
6. Coupon review opens Kroger in Firefox. Extension evidence updates each item.
7. The approval screen shows the current estimated merchandise total. Coupon savings are included only when the amount and qualifying quantity are known; otherwise they remain labeled pending.
8. An authenticated user starts "Send approved items to Kroger." The extension opens or inspects the signed-in Kroger cart and returns a fresh exact-product snapshot. If a staged UPC already exists, the page warns with the existing and proposed quantities and requires confirmation. If there are no duplicates, submission proceeds without an empty-cart warning. If the cart cannot be freshly inspected, submission pauses and asks the user to open the Kroger cart rather than guessing.
9. The server freezes a submission snapshot and calls the Cart API using Kroger's pickup modality. Existing nonduplicate Kroger cart items remain untouched; approved draft items are appended.
10. The app records the API result and prevents automatic resubmission. Any retry requires a fresh cart inspection and an explicit warning for detected duplicates.
11. The user completes review, pickup scheduling, substitutions, variable-weight fulfillment, and checkout on Kroger.

No email notification is sent; the family visits the webpage.

## Coupon State Model

- **Gray — not checked:** no extension evidence exists.
- **Amber — review needed:** a possible coupon exists, the coupon is clipped without an exact item match, or the cart quantity does not yet satisfy the requirement.
- **Green — eligible and clipped:** Kroger visibly reports the coupon clipped, the exact product is in Kroger's eligible-items view, and the draft quantity satisfies the visible requirement.
- **Blue — discount displayed by Kroger:** Kroger's cart visibly associates a discount with the item after submission.
- **Red — not eligible:** Kroger's visible eligible-items or quantity requirement contradicts the draft item.

Each colored state includes text and an icon; color alone is never the only signal. Green means Kroger-confirmed eligibility, not guaranteed final checkout pricing.

## Price Semantics

The current price is the store-specific promotional price when Kroger returns one; otherwise it is the regular price. The previous price is the effective price captured in the immediately preceding available weekly snapshot for the same store and exact product. Receipt prices from the initial import do not seed weekly comparisons.

For variable-weight products, show Kroger's price per pound or other supplied weight unit. The requested quantity remains the item count accepted by Kroger; final fulfilled weight and extended cost stay pending unless Kroger supplies an estimate. Estimated totals exclude tax, fees, substitutions, unresolved weighted-item costs, and unconfirmed coupons. The UI states this next to the total.

## Cart Submission Safety

- Submission requires a recent authenticated session and a confirmation dialog showing item count and estimated total.
- The server validates positive integer quantities and valid Kroger identifiers at the trust boundary.
- Submission requires a fresh extension snapshot of the signed-in Kroger cart. Exact UPC matches trigger a duplicate warning; nonmatching existing items do not block appending the draft.
- A draft receives a one-way `submitted` marker before or atomically with the outbound operation record.
- The UI disables ordinary resubmission. A manual retry explains duplicate risk and requires a second confirmation.
- Partial failures are recorded per item/batch and shown without silently retrying successful items.
- Direct changes made later on Kroger are outside the app's source of truth.

## Security and Privacy

- Minimize collected data to grocery products, prices, coupon evidence, order dates needed for the two-month import, and Kroger OAuth tokens.
- Do not store receipt payment details, addresses, full receipt images, passwords, or cookies.
- Encrypt Kroger refresh tokens at rest; keep encryption and session secrets in Cloudflare secrets.
- Use CSP, CSRF protection, strict CORS allowlists, secure cookies, request size limits, and rate limits on login and extension endpoints.
- Require reauthentication before changing the shared password or reconnecting Kroger.
- Provide a household-data export and delete operation before considering the app complete.

## Reliability and Recovery

- Scheduled preparation is idempotent and also available through a "Prepare now" button.
- Show the last successful price refresh, last extension sync, and last Kroger submission time.
- Use D1 Time Travel for short-term recovery and provide a manual JSON export for household-owned backup.
- If Kroger is unavailable, retain the draft and show a retryable error; never replace valid stored prices with missing values.
- If the extension breaks after a Kroger page change, the draft and official API cart workflow continue; coupon states remain unverified rather than guessed. Shared adapters ensure a Kroger selector fix reaches Firefox and Chrome together.

## Verification

- Unit tests for price selection/comparison, weight-unit display, staple frequency grouping, coupon-state transitions, quantity requirements, login/session validation, duplicate detection, and submission idempotency.
- Contract fixtures for representative Kroger public API responses.
- Sanitized HTML fixtures for Recent Purchases, coupon eligibility, clipped state, and cart savings adapters.
- Integration tests against local Worker/D1 emulation for 9:00 AM Eastern Thursday draft creation across daylight-saving boundaries, manual additions, existing-cart duplicate and nonduplicate cases, variable-weight items, approval, partial Cart API failure, and retry warnings.
- Run the shared extension fixture suite once, plus browser-specific smoke tests in current Firefox and Chrome.
- Manually test temporary loading in Firefox and unpacked loading in Chrome before producing the signed private Firefox `.xpi` and Chrome household package.
- Production smoke test with a non-destructive product search first; the first real cart submission requires the user's supervision.

## Constraints and Known Risks

- Kroger can change rendered page structure, requiring extension adapter updates.
- Kroger's public API does not expose purchase history or coupon status; those features require the user to open Kroger pages in the extension-enabled browser.
- Coupon application can still change because of expiration, limits, substitutions, fulfillment method, or Kroger checkout rules.
- Free cloud tiers have no formal uptime SLA and their limits or terms may change.
- Firefox extensions require Mozilla signing for durable installation in standard Firefox, even when privately distributed.
- Chrome permits trusted unpacked loading for household development use, but durable direct installation on ordinary Windows or macOS Chrome requires Chrome Web Store distribution and its registration/review process.

## Builder Decisions Left Open

- Select a minimal Worker-compatible UI approach during implementation; prefer server-rendered HTML or a small static client over a large framework.
- Choose the exact password-hashing implementation supported by the Worker runtime without weakening the slow-hash requirement.
- Determine the smallest signed message protocol between the extension and app that preserves origin binding, freshness, and replay protection.
- Confirm the Kroger developer application's approved scopes and redirect URL before implementation begins.
