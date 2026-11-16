import { describe, expect, test } from "vitest";
import { prepareWeeklyDraft, type PreparedItem, type WeeklyDraftStore } from "../../src/domain/schedule";
import { createCsrfToken } from "../../src/auth/csrf";
import { createSession, sessionCookie } from "../../src/auth/session";
import worker from "../../src/worker";

function memoryStore(): WeeklyDraftStore & { createCount: number; items: PreparedItem[] } {
  let draft: { id: number; draftWeek: string } | null = null;
  let complete = false;
  return {
    createCount: 0,
    items: [],
    async findDraft() { return complete ? draft : null; },
    async activeStaples() { return [{ productId: "milk", quantity: 1, previousPriceCents: 399 }]; },
    async createDraft(week) { this.createCount += 1; complete = false; draft = { id: 1, draftWeek: week }; return draft; },
    async addItem(_draftId, item) { this.items.push(item); }
    ,async completeDraft() { complete = true; }
  };
}

describe("weekly draft preparation", () => {
  test("routes manual preparation to the scheduler", async () => {
    const secret = "a-test-secret-long-enough-for-hmac";
    const token = await createSession(secret);
    const request = new Request("https://cart.example/api/drafts/prepare", { method: "POST", headers: { cookie: sessionCookie(token).split(";")[0]!, "x-csrf-token": await createCsrfToken(secret, token) } });
    const db = { prepare: () => ({ first: async () => null }) };

    const response = await worker.fetch(request, { DB: db, SESSION_SECRET: secret, APP_ORIGIN: "https://cart.example" } as never, {} as never);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Preferred store is not configured" });
  });

  test("is idempotent across repeated triggers", async () => {
    const store = memoryStore();
    const loadProduct = async () => ({ id: "milk", upc: "0001", description: "Milk", imageUrl: null, brand: "Kroger", size: "1 gal", available: true, regularPriceCents: 399, promoPriceCents: 349, weightPriceCents: null, weightUnit: null });

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
    const loadProduct = async () => ({ id: "milk", upc: "0001", description: "Milk", imageUrl: null, brand: "Kroger", size: "1 gal", available: true, regularPriceCents: 399, promoPriceCents: null, weightPriceCents: null, weightUnit: null });

    const result = await prepareWeeklyDraft(store, loadProduct, new Date("2026-11-11T14:00:00Z"), true);

    expect(result).toMatchObject({ id: 1 });
  });

  test("does not report an interrupted preparation as complete", async () => {
    const store = memoryStore();
    store.activeStaples = async () => { throw new Error("database interrupted"); };
    await expect(prepareWeeklyDraft(store, async () => { throw new Error("unused"); }, new Date("2026-11-12T15:00:00Z"))).rejects.toThrow("interrupted");
    store.activeStaples = async () => [{ productId: "milk", quantity: 1, previousPriceCents: 399 }];
    await prepareWeeklyDraft(store, async () => ({ id: "milk", upc: "0001", description: "Milk", imageUrl: null, brand: "Kroger", size: "1 gal", available: true, regularPriceCents: 399, promoPriceCents: null, weightPriceCents: null, weightUnit: null }), new Date("2026-11-12T15:01:00Z"));
    expect(store.items).toHaveLength(1);
  });
});
