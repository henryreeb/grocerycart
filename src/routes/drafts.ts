import type { Env } from "../config";
import { verifyCsrfToken } from "../auth/csrf";
import { readSessionCookie, verifySession } from "../auth/session";
import { draftItemInput, ensureDraftEditable } from "../domain/drafts";
import { effectivePrice } from "../domain/prices";
import type { KrogerClientLoader } from "./products";
import { loadKrogerClient } from "./products";
import { couponState, type CouponEvidence } from "../domain/coupons";

export async function handleDrafts(request: Request, env: Env, loadClient: KrogerClientLoader = loadKrogerClient): Promise<Response> {
  const session = readSessionCookie(request);
  if (!session || !(await verifySession(env.SESSION_SECRET, session))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (request.method !== "GET") {
    const csrf = request.headers.get("x-csrf-token");
    if (!csrf || !(await verifyCsrfToken(env.SESSION_SECRET, session, csrf))) return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === "/api/drafts/current") {
    const draft = await env.DB.prepare("SELECT id, draft_week, status FROM weekly_drafts ORDER BY created_at DESC LIMIT 1").first<{ id: number; draft_week: string; status: string }>();
    if (!draft) return Response.json({ draft: null });
    const rows = await env.DB.prepare("SELECT di.id, di.product_id, di.quantity, di.current_price_cents, di.previous_price_cents, di.weight_price_cents, di.weight_unit, di.available, di.stale, p.upc, p.description, p.brand, p.size FROM draft_items di JOIN products p ON p.id = di.product_id WHERE di.draft_id = ? ORDER BY p.description").bind(draft.id).all<Record<string, unknown>>();
    const evidenceRows = await env.DB.prepare("SELECT ce.* FROM coupon_evidence ce JOIN draft_items di ON di.id = ce.draft_item_id WHERE di.draft_id = ? ORDER BY ce.observed_at DESC").bind(draft.id).all<Record<string, unknown>>();
    const latestEvidence = new Map<number, Record<string, unknown>>();
    for (const evidence of evidenceRows.results) if (!latestEvidence.has(Number(evidence.draft_item_id))) latestEvidence.set(Number(evidence.draft_item_id), evidence);
    const items = rows.results.map((row) => ({
      productId: row.product_id,
      upc: row.upc,
      description: row.description,
      brand: row.brand,
      size: row.size,
      quantity: row.quantity,
      currentPriceCents: row.current_price_cents,
      previousPriceCents: row.previous_price_cents,
      weightPriceCents: row.weight_price_cents,
      weightUnit: row.weight_unit,
      available: row.available === 1,
      stale: row.stale === 1,
      ...(() => {
        const evidence = latestEvidence.get(Number(row.id));
        if (!evidence) return { coupon: null, couponState: "gray" };
        const normalized: CouponEvidence = { observedAt: String(evidence.observed_at), clipped: evidence.clipped === 1, exactEligible: evidence.exact_eligible === null ? null : evidence.exact_eligible === 1, minimumQuantity: evidence.minimum_quantity === null ? null : Number(evidence.minimum_quantity), cartDiscountCents: evidence.cart_discount_cents === null ? null : Number(evidence.cart_discount_cents), expired: evidence.expired === 1 };
        return { coupon: { label: evidence.label, ...normalized }, couponState: couponState(normalized, { quantity: Number(row.quantity) }) };
      })()
    }));
    return Response.json({ draft: { id: draft.id, draftWeek: draft.draft_week, status: draft.status, items } }, { headers: { "cache-control": "no-store" } });
  }
  const deleteMatch = path.match(/^\/api\/drafts\/(\d+)\/items\/([^/]+)$/);
  if (request.method === "DELETE" && deleteMatch) {
    const draftId = Number(deleteMatch[1]);
    const draft = await env.DB.prepare("SELECT status FROM weekly_drafts WHERE id = ?").bind(draftId).first<{ status: string }>();
    if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });
    try {
      ensureDraftEditable(draft.status);
    } catch {
      return Response.json({ error: "Draft is not editable" }, { status: 409 });
    }
    await env.DB.prepare("DELETE FROM draft_items WHERE draft_id = ? AND product_id = ?").bind(draftId, decodeURIComponent(deleteMatch[2]!)).run();
    return new Response(null, { status: 204 });
  }
  const match = path.match(/^\/api\/drafts\/(\d+)\/items$/);
  if (request.method !== "POST" || !match) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const draftId = Number(match[1]);
    const input = draftItemInput(await request.json());
    const draft = await env.DB.prepare("SELECT status FROM weekly_drafts WHERE id = ?").bind(draftId).first<{ status: string }>();
    if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });
    try {
      ensureDraftEditable(draft.status);
    } catch {
      return Response.json({ error: "Draft is not editable" }, { status: 409 });
    }
    const household = await env.DB.prepare("SELECT preferred_store_id FROM households WHERE id = 1").bind().first<{ preferred_store_id: string | null }>();
    if (!household?.preferred_store_id) return Response.json({ error: "Preferred store is not configured" }, { status: 409 });
    const product = await (await loadClient(env)).getProduct(input.productId, household.preferred_store_id);
    await env.DB.prepare("INSERT INTO products (id, upc, description, brand, size, weight_unit) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET upc = excluded.upc, description = excluded.description, brand = excluded.brand, size = excluded.size, weight_unit = excluded.weight_unit, updated_at = CURRENT_TIMESTAMP")
      .bind(product.id, product.upc, product.description, product.brand, product.size, product.weightUnit).run();
    await env.DB.prepare("INSERT INTO draft_items (draft_id, product_id, quantity, source, current_price_cents, weight_price_cents, weight_unit, available) VALUES (?, ?, ?, 'search', ?, ?, ?, ?) ON CONFLICT(draft_id, product_id) DO UPDATE SET quantity = excluded.quantity, current_price_cents = excluded.current_price_cents, weight_price_cents = excluded.weight_price_cents, weight_unit = excluded.weight_unit, available = excluded.available")
      .bind(draftId, product.id, input.quantity, effectivePrice(product), product.weightPriceCents, product.weightUnit, product.available ? 1 : 0).run();
    return Response.json({ item: { ...product, quantity: input.quantity } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid draft item" }, { status: 400 });
  }
}
