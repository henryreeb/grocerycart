# Kroger purchase-detail import design

## Intent

Populate **Suggested from recent purchases** from the household's visible Kroger order details for the previous two calendar months.

## Behavior

The extension recognizes only `https://www.kroger.com/mypurchases/detail/<order-key>` for purchase imports. It derives the stable order ID and `YYYY-MM-DD` purchase date from the detail URL, then reads each `list-style-product-card-*` container for its exact UPC link, description, size, and positive integer quantity.

The adapter keeps its existing legacy fixture support but fails closed on malformed detail URLs or product cards. It does not import from the `/mypurchases` summary page because that page lacks complete line items. Reopening an order may create another import batch, but staple frequency remains correct because suggestions count distinct order IDs per product.

After visiting each relevant order detail page and returning to GroceryCart, the existing suggestions section displays imported products that match known Kroger product IDs.

## Approaches considered

- **Import manually opened detail pages (selected):** exact, visible data with no automated navigation.
- **Automatically open order pages:** less manual but adds brittle browser navigation and unexpected tabs.
- **Scrape the summary page:** rejected because it does not expose complete item details.

## Safety and verification

The extension does not modify Kroger orders or cart contents. Tests cover the current detail URL and product-card markup, malformed URLs/cards, the two-month cutoff, content-script route selection, and repeat order IDs. Run the full suite, type-check, rebuild both production packages, and verify the production origin in both manifests.
