export interface PurchaseRecord {
  orderId: string;
  orderedAt: string;
  productId: string | null;
  description: string;
}

export interface StapleSuggestion {
  productId: string | null;
  description: string;
  orderCount: number;
  category: "core" | "occasional" | "review";
}

export function suggestStaples(records: PurchaseRecord[], now = new Date()): StapleSuggestion[] {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 2);
  const groups = new Map<string, { productId: string | null; description: string; orders: Set<string> }>();
  for (const record of records) {
    if (new Date(record.orderedAt).getTime() < cutoff.getTime()) continue;
    const key = record.productId ?? `?${record.description}`;
    const group = groups.get(key) ?? { productId: record.productId, description: record.description, orders: new Set<string>() };
    group.orders.add(record.orderId);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ productId, description, orders }) => ({
      productId,
      description,
      orderCount: orders.size,
      category: productId === null ? "review" as const : orders.size >= 3 ? "core" as const : "occasional" as const
    }))
    .sort((left, right) => (left.productId ?? "").localeCompare(right.productId ?? ""));
}
