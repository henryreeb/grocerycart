import { describe, expect, test } from "vitest";
import { couponState } from "../../src/domain/coupons";
import { prepareWeeklyDraft, type PreparedItem, type WeeklyDraftStore } from "../../src/domain/schedule";
import { suggestStaples } from "../../src/domain/staples";
import { submitDraft, type CartSnapshot, type SubmissionStore } from "../../src/domain/submission";

test("two months of purchases become a Thursday draft that requires duplicate confirmation and locks after submission", async () => {
  const suggestions = suggestStaples([
    { orderId: "a", orderedAt: "2026-10-01T12:00:00Z", productId: "milk", description: "Milk" },
    { orderId: "b", orderedAt: "2026-10-15T12:00:00Z", productId: "milk", description: "Milk" },
    { orderId: "c", orderedAt: "2026-11-01T12:00:00Z", productId: "milk", description: "Milk" }
  ], new Date("2026-11-12T15:00:00Z"));
  expect(suggestions[0]?.category).toBe("core");

  const prepared: PreparedItem[] = [];
  const draftStore: WeeklyDraftStore = {
    async findDraft() { return null; },
    async activeStaples() { return [{ productId: "milk", quantity: 2, previousPriceCents: 399 }]; },
    async createDraft(week) { return { id: 1, draftWeek: week }; },
    async addItem(_id, item) { prepared.push(item); }
    ,async completeDraft() {}
  };
  await prepareWeeklyDraft(draftStore, async () => ({ id: "milk", upc: "0001", description: "Milk", brand: "Kroger", size: "1 gal", available: true, regularPriceCents: 429, promoPriceCents: 349, weightPriceCents: null, weightUnit: null }), new Date("2026-11-12T15:00:00Z"));
  expect(prepared[0]).toMatchObject({ currentPriceCents: 349, previousPriceCents: 399 });
  expect(couponState({ observedAt: "2026-11-12T15:00:00Z", clipped: true, exactEligible: true, minimumQuantity: 2, cartDiscountCents: 100, expired: false }, { quantity: 2 }, new Date("2026-11-12T15:04:00Z"))).toBe("blue");

  const snapshot: CartSnapshot = { id: "scan", observedAt: "2026-11-12T15:00:00Z", items: [{ upc: "0001", description: "Milk", quantity: 1 }] };
  let status = "draft";
  let added = 0;
  const submissionStore: SubmissionStore = {
    async loadDraft() { return { id: 1, status, revision: 0, items: [{ upc: "0001", description: "Milk", quantity: 2 }] }; },
    async loadSnapshot() { return snapshot; },
    async begin() { status = "submitting"; return "op"; },
    async batchComplete() {},
    async finish() { status = "submitted"; }
  };
  expect((await submitDraft(submissionStore, async () => { added += 1; }, 1, "scan", false, new Date("2026-11-12T15:04:00Z"))).status).toBe("confirmation_required");
  await submitDraft(submissionStore, async () => { added += 1; }, 1, "scan", true, new Date("2026-11-12T15:04:00Z"));
  expect(added).toBe(1);
  await expect(submitDraft(submissionStore, async () => {}, 1, "scan", true, new Date("2026-11-12T15:04:00Z"))).rejects.toThrow("already submitted");
});
