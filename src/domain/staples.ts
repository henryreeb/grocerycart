export interface PurchaseRecord {
  orderId: string;
  orderedAt: string;
  productId: string | null;
  description: string;
  imageUrl?: string | null;
}

export interface StapleSuggestion {
  productId: string | null;
  description: string;
  orderCount: number;
  category: "core" | "occasional" | "review";
  imageUrl: string | null;
}

function httpsImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}

export function suggestStaples(records: PurchaseRecord[], now = new Date()): StapleSuggestion[] {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const groups = new Map<string, { productId: string | null; description: string; imageUrl: string | null; orders: Set<string> }>();
  for (const record of records) {
    if (new Date(record.orderedAt).getTime() < cutoff.getTime()) continue;
    const key = record.productId ?? `?${record.description}`;
    const group = groups.get(key) ?? { productId: record.productId, description: record.description, imageUrl: null, orders: new Set<string>() };
    group.imageUrl ??= httpsImage(record.imageUrl);
    group.orders.add(record.orderId);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ productId, description, imageUrl, orders }) => ({
      productId,
      description,
      orderCount: orders.size,
      category: productId === null ? "review" as const : orders.size >= 3 ? "core" as const : "occasional" as const,
      imageUrl
    }))
    .sort((left, right) => (left.productId ?? "").localeCompare(right.productId ?? ""));
}
