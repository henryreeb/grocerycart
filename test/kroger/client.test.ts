import { describe, expect, test, vi } from "vitest";
import { KrogerClient, KrogerApiError } from "../../src/kroger/client";

const productResponse = {
  data: [{
    productId: "0001111040101",
    upc: "0001111040101",
    description: "Whole Milk",
    brand: "Kroger",
    images: [
      { perspective: "back", default: false, sizes: [{ size: "medium", url: "https://www.kroger.com/images/back-medium.jpg" }] },
      { perspective: "front", default: true, sizes: [{ size: "large", url: "https://www.kroger.com/images/front-large.jpg" }, { size: "medium", url: "https://www.kroger.com/images/front-medium.jpg" }] }
    ],
    items: [{ itemId: "0001111040101", size: "1 gal", inventory: { stockLevel: "HIGH" }, fulfillment: { curbside: true, delivery: true }, price: { regular: 3.99, promo: 3.49 } }]
  }],
  meta: { pagination: { total: 1, start: 0, limit: 10 } }
};

describe("KrogerClient", () => {
  test("calls the fetcher without changing its receiver", async () => {
    const fetcher = function (this: unknown) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(Response.json(productResponse));
    } as typeof fetch;

    await expect(new KrogerClient("access-token", fetcher).searchProducts("milk", "01400513")).resolves.toHaveLength(1);
  });

  test("searches the configured store for pickup and normalizes cents", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(productResponse));
    const client = new KrogerClient("access-token", fetcher);

    const result = await client.searchProducts("milk", "01400513");

    const url = new URL(fetcher.mock.calls[0]![0] as string);
    expect(url.searchParams.get("filter.locationId")).toBe("01400513");
    expect(url.searchParams.get("filter.fulfillment")).toBe("csp");
    expect(result[0]).toMatchObject({ id: "0001111040101", upc: "0001111040101", regularPriceCents: 399, promoPriceCents: 349, available: true, imageUrl: "https://www.kroger.com/images/front-medium.jpg" });
  });

  test("ignores non-HTTPS and malformed product images", async () => {
    const response = structuredClone(productResponse);
    response.data[0]!.images = [{ perspective: "front", default: true, sizes: [{ size: "medium", url: "http://example.com/milk.jpg" }] }];
    const client = new KrogerClient("access-token", vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)));

    await expect(client.searchProducts("milk", "01400513")).resolves.toMatchObject([{ imageUrl: null }]);
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
