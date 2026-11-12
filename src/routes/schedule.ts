import type { Env } from "../config";
import { verifyCsrfToken } from "../auth/csrf";
import { readSessionCookie, verifySession } from "../auth/session";
import { prepareWeeklyDraft, type PreparedItem, type WeeklyDraftStore } from "../domain/schedule";
import { loadKrogerClient } from "./products";

function d1Store(env: Env): WeeklyDraftStore {
  return {
    async findDraft(week) {
      const row = await env.DB.prepare("SELECT id, draft_week FROM weekly_drafts WHERE draft_week = ?").bind(week).first<{ id: number; draft_week: string }>();
      return row ? { id: row.id, draftWeek: row.draft_week } : null;
    },
    async activeStaples() {
      const rows = await env.DB.prepare("SELECT s.product_id, s.default_quantity, (SELECT COALESCE(ps.promo_price_cents, ps.regular_price_cents) FROM price_snapshots ps WHERE ps.product_id = s.product_id AND ps.store_id = h.preferred_store_id ORDER BY ps.observed_at DESC LIMIT 1) previous_price_cents FROM staples s CROSS JOIN households h WHERE s.active = 1 AND h.id = 1").all<{ product_id: string; default_quantity: number; previous_price_cents: number | null }>();
      return rows.results.map((row) => ({ productId: row.product_id, quantity: row.default_quantity, previousPriceCents: row.previous_price_cents }));
    },
    async createDraft(week) {
      const row = await env.DB.prepare("INSERT INTO weekly_drafts (draft_week, status) VALUES (?, 'draft') RETURNING id").bind(week).first<{ id: number }>();
      if (!row) throw new Error("Draft was not created");
      return { id: row.id, draftWeek: week };
    },
    async addItem(draftId: number, item: PreparedItem) {
      if (item.product) {
        await env.DB.prepare("INSERT INTO products (id, upc, description, brand, size, weight_unit) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET upc = excluded.upc, description = excluded.description, brand = excluded.brand, size = excluded.size, weight_unit = excluded.weight_unit, updated_at = CURRENT_TIMESTAMP")
          .bind(item.product.id, item.product.upc, item.product.description, item.product.brand, item.product.size, item.product.weightUnit).run();
      }
      await env.DB.prepare("INSERT INTO draft_items (draft_id, product_id, quantity, source, current_price_cents, previous_price_cents, weight_price_cents, weight_unit, available, stale) VALUES (?, ?, ?, 'staple', ?, ?, ?, ?, ?, ?)")
        .bind(draftId, item.productId, item.quantity, item.currentPriceCents, item.previousPriceCents, item.product?.weightPriceCents ?? null, item.product?.weightUnit ?? null, item.available ? 1 : 0, item.stale ? 1 : 0).run();
      if (item.product) {
        const household = await env.DB.prepare("SELECT preferred_store_id FROM households WHERE id = 1").first<{ preferred_store_id: string }>();
        if (household?.preferred_store_id) await env.DB.prepare("INSERT INTO price_snapshots (product_id, store_id, regular_price_cents, promo_price_cents, observed_at) VALUES (?, ?, ?, ?, ?)").bind(item.productId, household.preferred_store_id, item.product.regularPriceCents, item.product.promoPriceCents, new Date().toISOString()).run();
      }
    }
  };
}

export async function prepareFromEnv(env: Env, now = new Date(), force = false): Promise<{ id: number; draftWeek: string } | null> {
  const household = await env.DB.prepare("SELECT preferred_store_id FROM households WHERE id = 1").first<{ preferred_store_id: string | null }>();
  if (!household?.preferred_store_id) throw new Error("Preferred store is not configured");
  const client = await loadKrogerClient(env);
  return prepareWeeklyDraft(d1Store(env), (productId) => client.getProduct(productId, household.preferred_store_id!), now, force);
}

export async function handleSchedule(request: Request, env: Env): Promise<Response> {
  const session = readSessionCookie(request);
  const csrf = request.headers.get("x-csrf-token");
  if (!session || !(await verifySession(env.SESSION_SECRET, session))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!csrf || !(await verifyCsrfToken(env.SESSION_SECRET, session, csrf))) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    return Response.json({ draft: await prepareFromEnv(env, new Date(), true) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Draft preparation failed" }, { status: 503 });
  }
}
