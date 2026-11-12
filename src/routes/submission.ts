import type { Env } from "../config";
import { verifyCsrfToken } from "../auth/csrf";
import { readSessionCookie, verifySession } from "../auth/session";
import { submitDraft, type CartSnapshot, type SubmissionStore } from "../domain/submission";
import { loadKrogerClient } from "./products";

function d1SubmissionStore(env: Env): SubmissionStore {
  return {
    async loadDraft(draftId) {
      const draft = await env.DB.prepare("SELECT id, status FROM weekly_drafts WHERE id = ?").bind(draftId).first<{ id: number; status: string }>();
      if (!draft) return null;
      const rows = await env.DB.prepare("SELECT p.upc, p.description, di.quantity FROM draft_items di JOIN products p ON p.id = di.product_id WHERE di.draft_id = ? ORDER BY di.id").bind(draftId).all<{ upc: string; description: string; quantity: number }>();
      return { id: draft.id, status: draft.status, items: rows.results };
    },
    async loadSnapshot(snapshotId) {
      const row = await env.DB.prepare("SELECT id, payload_json, observed_at FROM cart_snapshots WHERE id = ?").bind(snapshotId).first<{ id: string; payload_json: string; observed_at: string }>();
      if (!row) return null;
      const payload = JSON.parse(row.payload_json) as Pick<CartSnapshot, "items">;
      if (!Array.isArray(payload.items)) throw new Error("Malformed cart snapshot");
      return { id: row.id, observedAt: row.observed_at, items: payload.items };
    },
    async begin(draftId, snapshotId) {
      const operationId = crypto.randomUUID();
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE weekly_drafts SET status = 'submitting' WHERE id = ? AND status = 'draft'").bind(draftId),
        env.DB.prepare("INSERT INTO submission_operations (id, draft_id, snapshot_id, status, result_json) VALUES (?, ?, ?, 'pending', '[]')").bind(operationId, draftId, snapshotId)
      ]);
      if (!results.every((result) => result.success)) throw new Error("Submission could not start");
      return operationId;
    },
    async batchComplete(operationId, batch) {
      const row = await env.DB.prepare("SELECT result_json FROM submission_operations WHERE id = ?").bind(operationId).first<{ result_json: string }>();
      const completed = row ? JSON.parse(row.result_json) as number[] : [];
      completed.push(batch);
      await env.DB.prepare("UPDATE submission_operations SET result_json = ? WHERE id = ?").bind(JSON.stringify(completed), operationId).run();
    },
    async finish(operationId, status) {
      await env.DB.prepare("UPDATE submission_operations SET status = ? WHERE id = ?").bind(status, operationId).run();
      await env.DB.prepare(`UPDATE weekly_drafts SET status = ?, submitted_at = CASE WHEN ? = 'complete' THEN CURRENT_TIMESTAMP ELSE submitted_at END WHERE id = (SELECT draft_id FROM submission_operations WHERE id = ?)`)
        .bind(status === "complete" ? "submitted" : "draft", status, operationId).run();
    }
  };
}

export async function handleSubmission(request: Request, env: Env): Promise<Response> {
  const session = readSessionCookie(request);
  if (!session || !(await verifySession(env.SESSION_SECRET, session))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const csrf = request.headers.get("x-csrf-token");
  if (!csrf || !(await verifyCsrfToken(env.SESSION_SECRET, session, csrf))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const match = new URL(request.url).pathname.match(/^\/api\/drafts\/(\d+)\/submit$/);
  if (request.method !== "POST" || !match) return Response.json({ error: "Not found" }, { status: 404 });
  const body: { snapshotId?: string; confirmDuplicates?: boolean } = await request.json<{ snapshotId?: string; confirmDuplicates?: boolean }>().catch(() => ({}));
  if (!body.snapshotId) return Response.json({ error: "A fresh cart snapshot is required" }, { status: 400 });
  try {
    const client = await loadKrogerClient(env);
    const result = await submitDraft(d1SubmissionStore(env), (items) => client.addToCart(items), Number(match[1]), body.snapshotId, body.confirmDuplicates === true);
    return Response.json(result, { status: result.status === "confirmation_required" ? 409 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Submission failed" }, { status: 409 });
  }
}
