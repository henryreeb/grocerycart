export interface DraftItemInput {
  productId: string;
  quantity: number;
}

export function draftItemInput(value: unknown): DraftItemInput {
  if (!value || typeof value !== "object") throw new Error("Invalid draft item");
  const raw = value as Record<string, unknown>;
  if (typeof raw.productId !== "string" || raw.productId.trim() === "") throw new Error("Invalid product identifier");
  if (typeof raw.quantity !== "number" || !Number.isInteger(raw.quantity) || raw.quantity <= 0) throw new Error("Invalid quantity");
  return { productId: raw.productId, quantity: raw.quantity };
}

export function ensureDraftEditable(status: string): void {
  if (status !== "draft") throw new Error("Draft is not editable");
}
