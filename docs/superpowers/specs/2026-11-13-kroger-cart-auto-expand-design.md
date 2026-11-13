# Kroger cart auto-expansion design

## Intent

Prevent incomplete duplicate checks when Kroger initially renders the cart as a collapsed carousel. The household should be able to open the cart and let the extension prepare a complete snapshot without an extra click.

## Behavior

On `www.kroger.com/cart`, the content script detects Kroger's visible **Show all items** button and clicks it once. The existing mutation observer waits for the expanded DOM, then the adapter accepts a snapshot only when the collapse control is absent and each item has an exact UPC and positive integer quantity. An explicit Kroger empty-cart marker remains the only accepted zero-item cart.

The extension does not add, remove, or change quantities and does not automate checkout. If expansion fails or the markup is not recognized, it uploads no snapshot.

## Approaches considered

- **Automatic expansion (selected):** smoothest household workflow while retaining fail-closed validation.
- **Manual expansion:** simpler and less coupled to Kroger's button, but adds a required weekly step.
- **Parse the carousel:** rejected because it can omit existing items and defeat duplicate warnings.

## Verification

Add focused tests proving the collapsed cart is not accepted and that the content script clicks expansion only once before collecting. Run the complete test suite, type-check, and rebuild both production extension packages.
