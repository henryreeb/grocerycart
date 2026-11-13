import type { Product } from "../kroger/types";
import { effectivePrice } from "./prices";

const TIME_ZONE = "America/New_York";

function localParts(now: Date): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
}

export function shouldPrepare(now: Date): boolean {
  const parts = localParts(now);
  return parts.weekday === "Thu" && Number(parts.hour) >= 9;
}

export function draftWeek(now: Date): string {
  const parts = localParts(now);
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const daysFromMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);
  return date.toISOString().slice(0, 10);
}

export interface ActiveStaple {
  productId: string;
  quantity: number;
  previousPriceCents: number | null;
}

export interface PreparedItem {
  productId: string;
  quantity: number;
  currentPriceCents: number | null;
  previousPriceCents: number | null;
  available: boolean;
  stale: boolean;
  product?: Product;
}

export interface WeeklyDraftStore {
  findDraft(week: string): Promise<{ id: number; draftWeek: string } | null>;
  activeStaples(): Promise<ActiveStaple[]>;
  createDraft(week: string): Promise<{ id: number; draftWeek: string }>;
  addItem(draftId: number, item: PreparedItem): Promise<void>;
  completeDraft(draftId: number): Promise<void>;
}

export async function prepareWeeklyDraft(store: WeeklyDraftStore, loadProduct: (productId: string) => Promise<Product>, now = new Date(), force = false): Promise<{ id: number; draftWeek: string } | null> {
  if (!force && !shouldPrepare(now)) return null;
  const week = draftWeek(now);
  const existing = await store.findDraft(week);
  if (existing) return existing;
  const draft = await store.createDraft(week);
  for (const staple of await store.activeStaples()) {
    let item: PreparedItem;
    try {
      const product = await loadProduct(staple.productId);
      item = { productId: staple.productId, quantity: staple.quantity, currentPriceCents: effectivePrice(product), previousPriceCents: staple.previousPriceCents, available: product.available, stale: false, product };
    } catch {
      item = { productId: staple.productId, quantity: staple.quantity, currentPriceCents: staple.previousPriceCents, previousPriceCents: staple.previousPriceCents, available: true, stale: true };
    }
    await store.addItem(draft.id, item);
  }
  await store.completeDraft(draft.id);
  return draft;
}
