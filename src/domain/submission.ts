export interface CartItemSnapshot {
  upc: string;
  description: string;
  quantity: number;
}

export interface CartSnapshot {
  id: string;
  observedAt: string;
  items: CartItemSnapshot[];
}

export interface SubmissionDraft {
  id: number;
  status: string;
  items: CartItemSnapshot[];
}

export interface SubmissionStore {
  loadDraft(draftId: number): Promise<SubmissionDraft | null>;
  loadSnapshot(snapshotId: string): Promise<CartSnapshot | null>;
  begin(draftId: number, snapshotId: string): Promise<string>;
  batchComplete(operationId: string, batch: number): Promise<void>;
  finish(operationId: string, status: "complete" | "partial" | "failed"): Promise<void>;
}

export function assertFreshSnapshot(snapshot: CartSnapshot | null, now = new Date()): asserts snapshot is CartSnapshot {
  if (!snapshot) throw new Error("A cart snapshot is required");
  const age = now.getTime() - new Date(snapshot.observedAt).getTime();
  if (!Number.isFinite(age) || age < -60_000 || age > 5 * 60_000) throw new Error("A fresh cart snapshot is required");
}

export function findDuplicates(draftItems: CartItemSnapshot[], snapshot: CartSnapshot): Array<{ upc: string; description: string; existingQuantity: number; proposedQuantity: number }> {
  const existing = new Map(snapshot.items.map((item) => [item.upc, item]));
  return draftItems.flatMap((item) => {
    const match = existing.get(item.upc);
    return match ? [{ upc: item.upc, description: item.description, existingQuantity: match.quantity, proposedQuantity: item.quantity }] : [];
  });
}

export async function submitDraft(
  store: SubmissionStore,
  addBatch: (items: Array<{ upc: string; quantity: number }>) => Promise<void>,
  draftId: number,
  snapshotId: string,
  duplicateConfirmation: boolean,
  now = new Date()
): Promise<{ status: "complete" | "confirmation_required"; duplicates: ReturnType<typeof findDuplicates> }> {
  const draft = await store.loadDraft(draftId);
  if (!draft) throw new Error("Draft not found");
  if (draft.status !== "draft") throw new Error("Draft was already submitted or is in progress");
  const snapshot = await store.loadSnapshot(snapshotId);
  assertFreshSnapshot(snapshot, now);
  const duplicates = findDuplicates(draft.items, snapshot);
  if (duplicates.length > 0 && !duplicateConfirmation) return { status: "confirmation_required", duplicates };
  const operationId = await store.begin(draftId, snapshotId);
  const batches = Array.from({ length: Math.ceil(draft.items.length / 50) }, (_, index) => draft.items.slice(index * 50, (index + 1) * 50));
  try {
    for (const [index, batch] of batches.entries()) {
      await addBatch(batch.map(({ upc, quantity }) => ({ upc, quantity })));
      await store.batchComplete(operationId, index);
    }
    await store.finish(operationId, "complete");
    return { status: "complete", duplicates };
  } catch (error) {
    await store.finish(operationId, "partial");
    throw error;
  }
}
