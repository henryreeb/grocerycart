import type { Env } from "../config";
import { verifyCsrfToken } from "../auth/csrf";
import { readSessionCookie, verifySession } from "../auth/session";
import { verifyPassword } from "../auth/password";

async function rows(db: D1Database, sql: string): Promise<unknown[]> {
  return (await db.prepare(sql).all()).results;
}

export async function handleHouseholdData(request: Request, env: Env): Promise<Response> {
  const session = readSessionCookie(request);
  if (!session || !(await verifySession(env.SESSION_SECRET, session))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (request.method === "GET") {
    const data = {
      exportedAt: new Date().toISOString(),
      products: await rows(env.DB, "SELECT id, upc, description, brand, size, weight_unit FROM products"),
      staples: await rows(env.DB, "SELECT product_id, default_quantity, purchase_frequency, active FROM staples"),
      drafts: await rows(env.DB, "SELECT id, draft_week, status, estimated_total_cents, created_at, submitted_at FROM weekly_drafts"),
      draftItems: await rows(env.DB, "SELECT draft_id, product_id, quantity, source, current_price_cents, previous_price_cents, weight_price_cents, weight_unit, available, stale FROM draft_items"),
      priceHistory: await rows(env.DB, "SELECT product_id, store_id, regular_price_cents, promo_price_cents, observed_at FROM price_snapshots"),
      purchaseImports: await rows(env.DB, "SELECT payload_json, observed_at FROM purchase_imports")
    };
    return Response.json(data, { headers: { "content-disposition": `attachment; filename="grocerycart-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
  }
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const csrf = request.headers.get("x-csrf-token");
  if (!csrf || !(await verifyCsrfToken(env.SESSION_SECRET, session, csrf))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body: { password?: string; confirmation?: string } = await request.json<{ password?: string; confirmation?: string }>().catch(() => ({}));
  if (body.confirmation !== "DELETE") return Response.json({ error: "Type DELETE to confirm" }, { status: 400 });
  const household = await env.DB.prepare("SELECT password_hash FROM households WHERE id = 1").first<{ password_hash: string | null }>();
  if (!household?.password_hash || typeof body.password !== "string" || !(await verifyPassword(body.password, household.password_hash))) return Response.json({ error: "Invalid credentials" }, { status: 401 });
  const statements = ["submission_operations", "coupon_evidence", "cart_snapshots", "extension_nonces", "extension_pairing_codes", "extension_installations", "purchase_imports", "draft_items", "weekly_drafts", "staples", "price_snapshots", "products", "oauth_states", "oauth_tokens", "login_attempts", "households"]
    .map((table) => env.DB.prepare(`DELETE FROM ${table}`));
  const results = await env.DB.batch(statements);
  if (!results.every((result) => result.success)) return Response.json({ error: "Deletion failed" }, { status: 500 });
  return new Response(null, { status: 204, headers: { "set-cookie": "household_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict" } });
}
