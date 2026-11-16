import type { CartItemInput, Product, ProductPage } from "./types";

const API_BASE = "https://api.kroger.com/v1";

export class KrogerApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function cents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : null;
}

function productImage(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const candidates = value.flatMap((image) => {
    if (!image || typeof image !== "object") return [];
    const raw = image as Record<string, unknown>;
    const perspective = typeof raw.perspective === "string" ? raw.perspective.toLowerCase() : "";
    const imageRank = raw.default === true ? 0 : perspective === "front" ? 1 : 2;
    return (Array.isArray(raw.sizes) ? raw.sizes : []).flatMap((size) => {
      if (!size || typeof size !== "object") return [];
      const entry = size as Record<string, unknown>;
      if (typeof entry.url !== "string") return [];
      try {
        const url = new URL(entry.url);
        if (url.protocol !== "https:") return [];
        const label = typeof entry.size === "string" ? entry.size.toLowerCase() : "";
        const sizeRank = label === "medium" ? 0 : label === "small" ? 1 : label === "large" ? 2 : 3;
        return [{ url: url.toString(), imageRank, sizeRank }];
      } catch { return []; }
    });
  });
  candidates.sort((left, right) => left.imageRank - right.imageRank || left.sizeRank - right.sizeRank || left.url.localeCompare(right.url));
  return candidates[0]?.url ?? null;
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
    imageUrl: productImage(raw.images),
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

  async searchProducts(term: string, locationId: string, limit = 10, start = 0): Promise<ProductPage> {
    const query = new URLSearchParams({
      "filter.term": term,
      "filter.locationId": locationId,
      "filter.fulfillment": "csp",
      "filter.limit": String(limit),
      "filter.start": String(start)
    });
    const body = await (await this.request(`/products?${query}`)).json<{ data?: unknown[]; meta?: { pagination?: Record<string, unknown> } }>();
    if (!Array.isArray(body.data)) throw new Error("Malformed Kroger product response");
    const products = body.data.map(normalizeProduct);
    const pagination = body.meta?.pagination;
    if (!pagination || !Number.isInteger(pagination.start) || !Number.isInteger(pagination.limit) || !Number.isInteger(pagination.total)
      || (pagination.start as number) < 0 || (pagination.limit as number) < 1 || (pagination.total as number) < 0) {
      throw new Error("Malformed Kroger pagination");
    }
    return { products, start: pagination.start as number, limit: pagination.limit as number, total: pagination.total as number };
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
