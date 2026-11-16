# Product images design

## Intent

Show recognizable Kroger product thumbnails everywhere the app presents a specific product: store search results, staged weekly-draft items, and recent-purchase suggestions. Text, prices, coupon evidence, quantities, and controls remain fully usable when no image is available.

## Image sources

- Kroger Product API results supply `images[]`. Select one canonical HTTPS URL by preferring the default/front perspective and a medium-sized rendition, with the next available HTTPS size as fallback.
- Purchase-detail imports capture the visible HTTPS `product-image` URL from each exact product card. This image travels with the purchase record and staple suggestion.
- No image proxy, downloading, binary storage, or constructed CDN URL is added.

## Persistence and data flow

Add nullable `products.image_url` through a checked-in D1 migration and the base schema. Product searches return `imageUrl`; staging or scheduled refreshes upsert it into `products`; draft reads expose it. Household export includes the field.

Purchase records and staple suggestions gain optional `imageUrl`. When the same product appears in several orders, suggestions retain the first valid HTTPS image without changing distinct-order frequency.

Existing products remain valid with `NULL` images and acquire images on their next Kroger refresh. No destructive backfill or extra Kroger calls are required.

## UI behavior

Use one small reusable DOM helper for decorative, lazy-loaded thumbnails beside existing product text in:

- store search results;
- weekly staged-item cards;
- recent-purchase suggestions.

Images use fixed dimensions and `object-fit: contain` to prevent layout movement. Missing or failed images collapse to a neutral grocery placeholder; product text remains the accessible name. Mobile cards retain their current stacked layout.

## Validation and security

Only syntactically valid `https:` image URLs are accepted from API or page data. Invalid URLs become `null`. The application never accepts user-authored HTML or image markup.

## Approaches considered

- **Store one canonical URL (selected):** fast rendering, low Kroger API use, and coverage for imports.
- **Construct URLs from UPC:** rejected because the CDN pattern is undocumented.
- **Fetch product details during rendering:** rejected because it adds latency and rate-limit pressure.

## Verification and rollout

Tests cover image selection, HTTPS rejection, database/API propagation, purchase suggestion propagation, and rendered image fallbacks. Apply the migration to remote D1 before deploying the Worker, rebuild both extensions for the production origin, run the full test/type-check suite, deploy, and push each completed checkpoint to `main`.
