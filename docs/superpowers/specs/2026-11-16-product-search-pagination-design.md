# Product search pagination design

## Intent

Let household members reach Kroger products beyond the first ten search matches without loading a long result list up front. Typing a term and pressing Enter must start the search; clicking Search remains an equivalent accessible option.

## Behavior

- A new search requests the first 10 results and replaces any prior result list.
- Pressing Enter in the search input uses the form's native submit behavior; no special keyboard shortcut or button click is required.
- When Kroger reports additional matches, a **Load more** button appears below the results.
- **Load more** requests the next 10 matches and appends them without duplicating product IDs or losing existing action buttons.
- The button is disabled while loading and disappears when no further results remain.
- Starting a new search resets pagination. A late response from an older search must not append to the newer query.
- Empty pages and API errors leave already displayed results intact and show the existing status message.

## API shape

The Kroger client reads `meta.pagination` and returns normalized `products` plus `start`, `limit`, and `total`. The app endpoint accepts validated `start` and `limit` query parameters and returns those pagination fields with the products. `start` is a non-negative integer; page size stays capped at 50, with the UI fixed at 10.

## Scope

This changes product-store search only. It does not paginate staged items, purchase suggestions, or the Kroger cart. No dependency or database migration is required.

## Verification

Tests cover pagination metadata, validated offsets, append/deduplication behavior, end-of-results behavior, stale searches, and native form submission from the input. Run the full test/type-check suite, deploy the Worker, and push each completed checkpoint to `main`.
