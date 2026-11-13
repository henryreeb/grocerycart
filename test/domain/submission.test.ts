import { describe, expect, test } from "vitest";
import { assertFreshSnapshot, findDuplicates, submitDraft, type CartSnapshot, type SubmissionStore } from "../../src/domain/submission";

const now = new Date("2026-11-12T15:00:00Z");

describe("cart submission", () => {
  test("warns only for exact UPC duplicates", () => {
    const duplicates = findDuplicates(
      [{ upc: "0001", description: "Kroger Milk", quantity: 2 }, { upc: "0002", description: "Bread", quantity: 1 }],
      { id: "snap", observedAt: now.toISOString(), items: [{ upc: "0001", description: "Different description", quantity: 1 }, { upc: "9999", description: "Kroger Milk", quantity: 1 }] }
    );

    expect(duplicates).toEqual([{ upc: "0001", description: "Kroger Milk", existingQuantity: 1, proposedQuantity: 2 }]);
  });

  test("rejects missing and snapshots older than five minutes", () => {
    expect(() => assertFreshSnapshot(null, now)).toThrow("snapshot");
    expect(() => assertFreshSnapshot({ id: "old", observedAt: "2026-11-12T14:54:59Z", items: [] }, now)).toThrow("fresh");
  });

  test("requires confirmation before adding an exact duplicate", async () => {
    const snapshot: CartSnapshot = { id: "snap", observedAt: now.toISOString(), items: [{ upc: "0001", description: "Milk", quantity: 1 }] };
    const store = memoryStore(snapshot, [{ upc: "0001", description: "Milk", quantity: 2 }]);
    let calls = 0;

    const result = await submitDraft(store, async () => { calls += 1; }, 1, "snap", false, now);

    expect(result.status).toBe("confirmation_required");
    expect(calls).toBe(0);
  });

  test("records partial failure without retrying a successful batch", async () => {
    const items = Array.from({ length: 51 }, (_, index) => ({ upc: String(index).padStart(4, "0"), description: `Item ${index}`, quantity: 1 }));
    const store = memoryStore({ id: "snap", observedAt: now.toISOString(), items: [] }, items);
    let calls = 0;

    await expect(submitDraft(store, async () => { calls += 1; if (calls === 2) throw new Error("failed"); }, 1, "snap", false, now)).rejects.toThrow("failed");

    expect(calls).toBe(2);
    expect(store.status).toBe("partial");
    expect(store.completedBatches).toEqual([0]);
    await submitDraft(store, async () => { calls += 1; }, 1, "snap", false, now);
    expect(calls).toBe(3);
    expect(store.status).toBe("submitted");
  });

  test("resumes after the last completed batch", async () => {
    const items = Array.from({ length: 51 }, (_, index) => ({ upc: String(index), description: `Item ${index}`, quantity: 1 }));
    const store = memoryStore({ id: "snap", observedAt: now.toISOString(), items: [] }, items);
    store.begin = async () => ({ id: "operation", completedBatches: [0] });
    const sent: number[] = [];
    await submitDraft(store, async (batch) => { sent.push(batch.length); }, 1, "snap", false, now);
    expect(sent).toEqual([1]);
  });
});

function memoryStore(snapshot: CartSnapshot, items: Array<{ upc: string; description: string; quantity: number }>): SubmissionStore & { status: string; completedBatches: number[] } {
  return {
    status: "draft",
    completedBatches: [],
    async loadDraft() { return { id: 1, status: this.status, revision: 0, items }; },
    async loadSnapshot() { return snapshot; },
    async begin() { this.status = "submitting"; return { id: "operation", completedBatches: [...this.completedBatches] }; },
    async batchComplete(_operationId, batch) { this.completedBatches.push(batch); },
    async finish(_operationId, status) { this.status = status === "complete" ? "submitted" : status; }
  };
}
