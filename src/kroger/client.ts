import type { CartItemInput, Product } from "./types";

const API_BASE = "https://api.kroger.com/v1";

export class KrogerApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function cents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : null;
}

function normalizeProduct(value: unknown): Product {
  if (!value || typeof value !== "object") throw new Error("Malformed Kroger product");
  const raw = value as Record<string, unknown>;
  const id = raw.productId;
  const upc = raw.upc;
  if (typeof id !== "string" || typeof upc !== "string" || typeof raw.description !== "string") throw new Error("Malformed Kroger product");
  const itemValues = Array.isArray(raw.items) ? raw.items.flat() : [];
  const item = (itemValues[0] ?? {}) as Record<string, unknown>;
  const inventory = (item.inventory ?? {}) as Record<string, unknown>;
  const fulfillment = (item.fulfillment ?? {}) as Record<string, unknown>;
  const price = (item.price ?? {}) as Record<string, unknown>;
  return {
    id,
    upc,
    description: raw.description,
    brand: typeof raw.brand === "string" ? raw.brand : null,
    size: typeof item.size === "string" ? item.size : null,
    available: fulfillment.curbside === true && inventory.stockLevel !== "TEMPORARILY_OUT_OF_STOCK",
    regularPriceCents: cents(price.regular),
    promoPriceCents: cents(price.promo),
    weightPriceCents: cents(price.unit),
    weightUnit: typeof price.unitOfMeasure === "string" ? price.unitOfMeasure : null
  };
}

export class KrogerClient {
  constructor(private readonly accessToken: string, private readonly fetcher: typeof fetch = fetch) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const fetcher = this.fetcher;
    const response = await fetcher(`${API_BASE}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json", ...init.headers }
    });
    if (!response.ok) throw new KrogerApiError(response.status, `Kroger API request failed (${response.status})`);
    return response;
  }

  async searchProducts(term: string, locationId: string, limit = 10): Promise<Product[]> {
    const query = new URLSearchParams({
      "filter.term": term,
      "filter.locationId": locationId,
      "filter.fulfillment": "csp",
      "filter.limit": String(limit)
    });
    const body = await (await this.request(`/products?${query}`)).json<{ data?: unknown[] }>();
    if (!Array.isArray(body.data)) throw new Error("Malformed Kroger product response");
    return body.data.map(normalizeProduct);
  }

  async getProduct(productId: string, locationId: string): Promise<Product> {
    const query = new URLSearchParams({ "filter.locationId": locationId });
    const body = await (await this.request(`/products/${encodeURIComponent(productId)}?${query}`)).json<{ data?: unknown }>();
    return normalizeProduct(body.data);
  }

  async addToCart(items: CartItemInput[]): Promise<void> {
    await this.request("/cart/add", {
      method: "PUT",
      body: JSON.stringify({ items: items.map(({ upc, quantity }) => ({ upc, quantity, modality: "PICKUP" })) })
    });
  }
}
