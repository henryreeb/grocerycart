import { describe, expect, test } from "vitest";
import { prepareWeeklyDraft, type PreparedItem, type WeeklyDraftStore } from "../../src/domain/schedule";

function memoryStore(): WeeklyDraftStore & { createCount: number; items: PreparedItem[] } {
  let draft: { id: number; draftWeek: string } | null = null;
  return {
    createCount: 0,
    items: [],
    async findDraft() { return draft; },
    async activeStaples() { return [{ productId: "milk", quantity: 1, previousPriceCents: 399 }]; },
    async createDraft(week) { this.createCount += 1; draft = { id: 1, draftWeek: week }; return draft; },
    async addItem(_draftId, item) { this.items.push(item); }
  };
}

describe("weekly draft preparation", () => {
  test("is idempotent across repeated triggers", async () => {
    const store = memoryStore();
    const loadProduct = async () => ({ id: "milk", upc: "0001", description: "Milk", brand: "Kroger", size: "1 gal", available: true, regularPriceCents: 399, promoPriceCents: 349, weightPriceCents: null, weightUnit: null });

    await prepareWeeklyDraft(store, loadProduct, new Date("2026-11-12T14:00:00Z"));
    await prepareWeeklyDraft(store, loadProduct, new Date("2026-11-12T15:00:00Z"));

    expect(store.createCount).toBe(1);
    expect(store.items).toHaveLength(1);
  });

  test("retains the prior price and marks stale when Kroger fails", async () => {
    const store = memoryStore();

    await prepareWeeklyDraft(store, async () => { throw new Error("Kroger unavailable"); }, new Date("2026-11-12T14:00:00Z"));

    expect(store.items[0]).toMatchObject({ productId: "milk", currentPriceCents: 399, previousPriceCents: 399, stale: true });
  });

  test("allows an authenticated manual preparation outside Thursday morning", async () => {
    const store = memoryStore();
    const loadProduct = async () => ({ id: "milk", upc: "0001", description: "Milk", brand: "Kroger", size: "1 gal", available: true, regularPriceCents: 399, promoPriceCents: null, weightPriceCents: null, weightUnit: null });

    const result = await prepareWeeklyDraft(store, loadProduct, new Date("2026-11-11T14:00:00Z"), true);

    expect(result).toMatchObject({ id: 1 });
  });
});
