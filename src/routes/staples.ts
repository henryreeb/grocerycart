import type { Env } from "../config";
import { verifyCsrfToken } from "../auth/csrf";
import { readSessionCookie, verifySession } from "../auth/session";
import { suggestStaples, type PurchaseRecord } from "../domain/staples";

export async function handleStaples(request: Request, env: Env, now = new Date()): Promise<Response> {
  const session = readSessionCookie(request);
  if (!session || !(await verifySession(env.SESSION_SECRET, session))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const csrf = request.headers.get("x-csrf-token");
  if (!csrf || !(await verifyCsrfToken(env.SESSION_SECRET, session, csrf))) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (request.method !== "POST" || new URL(request.url).pathname !== "/api/staples/suggest") return Response.json({ error: "Not found" }, { status: 404 });
  const body: { purchases?: PurchaseRecord[] } = await request.json<{ purchases?: PurchaseRecord[] }>().catch(() => ({}));
  if (!Array.isArray(body.purchases) || body.purchases.length > 2_000) return Response.json({ error: "Invalid purchase import" }, { status: 400 });
  for (const record of body.purchases) {
    if (!record || typeof record.orderId !== "string" || typeof record.orderedAt !== "string" || typeof record.description !== "string" || (record.productId !== null && typeof record.productId !== "string")) {
      return Response.json({ error: "Invalid purchase record" }, { status: 400 });
    }
  }
  return Response.json({ suggestions: suggestStaples(body.purchases, now) });
}
