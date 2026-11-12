import { describe, expect, test, vi } from "vitest";
import { KrogerClient, KrogerApiError } from "../../src/kroger/client";

const productResponse = {
  data: [{
    productId: "0001111040101",
    upc: "0001111040101",
    description: "Whole Milk",
    brand: "Kroger",
    items: [{ itemId: "0001111040101", size: "1 gal", inventory: { stockLevel: "HIGH" }, fulfillment: { curbside: true, delivery: true }, price: { regular: 3.99, promo: 3.49 } }]
  }],
  meta: { pagination: { total: 1, start: 0, limit: 10 } }
};

describe("KrogerClient", () => {
  test("searches the configured store for pickup and normalizes cents", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(productResponse));
    const client = new KrogerClient("access-token", fetcher);

    const result = await client.searchProducts("milk", "01400513");

    const url = new URL(fetcher.mock.calls[0]![0] as string);
    expect(url.searchParams.get("filter.locationId")).toBe("01400513");
    expect(url.searchParams.get("filter.fulfillment")).toBe("csp");
    expect(result[0]).toMatchObject({ id: "0001111040101", upc: "0001111040101", regularPriceCents: 399, promoPriceCents: 349, available: true });
  });

  test("rejects malformed product responses", async () => {
    const client = new KrogerClient("access-token", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [{ description: "No identifier" }] })));

    await expect(client.searchProducts("milk", "01400513")).rejects.toThrow("Malformed Kroger product");
  });

  test("preserves Kroger rate-limit status", async () => {
    const client = new KrogerClient("access-token", vi.fn<typeof fetch>().mockResolvedValue(new Response("limited", { status: 429 })));

    await expect(client.searchProducts("milk", "01400513")).rejects.toMatchObject({ status: 429 } satisfies Partial<KrogerApiError>);
  });

  test("adds pickup items with UPC and integer quantity", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new KrogerClient("access-token", fetcher);

    await client.addToCart([{ upc: "0001111040101", quantity: 2 }]);

    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ items: [{ upc: "0001111040101", quantity: 2, modality: "PICKUP" }] });
  });
});
