import type { Env } from "../config";
import { verifyCsrfToken } from "../auth/csrf";
import { readSessionCookie, verifySession } from "../auth/session";
import { suggestStaples, type PurchaseRecord } from "../domain/staples";

export async function handleStaples(request: Request, env: Env, now = new Date()): Promise<Response> {
  const session = readSessionCookie(request);
  if (!session || !(await verifySession(env.SESSION_SECRET, session))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === "/api/staples/suggestions") {
    const imports = await env.DB.prepare("SELECT payload_json FROM purchase_imports ORDER BY observed_at DESC").all<{ payload_json: string }>();
    const purchases = imports.results.flatMap((row) => {
      try { const value = JSON.parse(row.payload_json); return Array.isArray(value) ? value : []; } catch { return []; }
    }) as PurchaseRecord[];
    return Response.json({ suggestions: suggestStaples(purchases, now) });
  }
  const csrf = request.headers.get("x-csrf-token");
  if (!csrf || !(await verifyCsrfToken(env.SESSION_SECRET, session, csrf))) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (request.method === "POST" && path === "/api/staples") {
    const body: { productId?: string; quantity?: number } = await request.json<{ productId?: string; quantity?: number }>().catch(() => ({}));
    if (!body.productId || !Number.isInteger(body.quantity) || Number(body.quantity) < 1) return Response.json({ error: "Invalid staple" }, { status: 400 });
    const product = await env.DB.prepare("SELECT id FROM products WHERE id = ?").bind(body.productId).first<{ id: string }>();
    if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
    await env.DB.prepare("INSERT INTO staples (product_id, default_quantity, active) VALUES (?, ?, 1) ON CONFLICT(product_id) DO UPDATE SET default_quantity = excluded.default_quantity, active = 1").bind(body.productId, body.quantity).run();
    return Response.json({ staple: { productId: body.productId, quantity: body.quantity } }, { status: 201 });
  }
  if (request.method !== "POST" || path !== "/api/staples/suggest") return Response.json({ error: "Not found" }, { status: 404 });
  const body: { purchases?: PurchaseRecord[] } = await request.json<{ purchases?: PurchaseRecord[] }>().catch(() => ({}));
  if (!Array.isArray(body.purchases) || body.purchases.length > 2_000) return Response.json({ error: "Invalid purchase import" }, { status: 400 });
  for (const record of body.purchases) {
    if (!record || typeof record.orderId !== "string" || typeof record.orderedAt !== "string" || typeof record.description !== "string" || (record.productId !== null && typeof record.productId !== "string")) {
      return Response.json({ error: "Invalid purchase record" }, { status: 400 });
    }
  }
  return Response.json({ suggestions: suggestStaples(body.purchases, now) });
}
