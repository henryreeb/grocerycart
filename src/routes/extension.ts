import type { Env } from "../config";
import { decodeBase64Url, encodeBase64Url, equalBytes } from "../auth/encoding";
import { verifyCsrfToken } from "../auth/csrf";
import { readSessionCookie, verifySession } from "../auth/session";

export interface ExtensionEnvelope {
  version: 1;
  type: "purchase_import" | "cart_snapshot" | "coupon_evidence";
  installationId: string;
  timestamp: string;
  nonce: string;
  body: unknown;
}

export function canonicalEnvelope(envelope: ExtensionEnvelope): string {
  return JSON.stringify({ installationId: envelope.installationId, timestamp: envelope.timestamp, nonce: envelope.nonce, type: envelope.type, body: envelope.body });
}

export async function hashCredential(credential: string): Promise<string> {
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(credential))));
}

export async function signEnvelope(credential: string, canonical: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(credential), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encodeBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical))));
}

function validateEnvelope(envelope: ExtensionEnvelope, now: Date): void {
  if (envelope.version !== 1) throw new Error("Unknown extension version");
  if (!["purchase_import", "cart_snapshot", "coupon_evidence"].includes(envelope.type)) throw new Error("Unknown extension message type");
  if (!envelope.installationId || !envelope.nonce || envelope.nonce.length < 12) throw new Error("Malformed extension envelope");
  const age = now.getTime() - new Date(envelope.timestamp).getTime();
  if (!Number.isFinite(age) || age < -60_000 || age > 5 * 60_000) throw new Error("Extension message is stale");
}

export async function verifyEnvelopeAuth(input: { envelope: ExtensionEnvelope; credential: string; credentialHash: string; signature: string; nonceUsed: boolean; now?: Date }): Promise<ExtensionEnvelope> {
  validateEnvelope(input.envelope, input.now ?? new Date());
  if (!equalBytes(decodeBase64Url(await hashCredential(input.credential)), decodeBase64Url(input.credentialHash))) throw new Error("Invalid extension credential");
  if (input.nonceUsed) throw new Error("Extension message replay detected");
  const expected = await signEnvelope(input.credential, canonicalEnvelope(input.envelope));
  if (!equalBytes(decodeBase64Url(expected), decodeBase64Url(input.signature))) throw new Error("Invalid extension signature");
  return input.envelope;
}

type CouponObservation = { couponKey: string; label: string; clipped: boolean; eligibleUpcs: string[]; minimumQuantity: number; expired: boolean };

function couponBody(value: unknown): { sourceUrl: string; coupons: CouponObservation[] } {
  if (!value || typeof value !== "object") throw new Error("Invalid coupon evidence");
  const input = value as { sourceUrl?: unknown; coupons?: unknown };
  if (typeof input.sourceUrl !== "string" || !Array.isArray(input.coupons) || input.coupons.length > 500) throw new Error("Invalid coupon evidence");
  const coupons = input.coupons.filter((coupon): coupon is CouponObservation => {
    if (!coupon || typeof coupon !== "object") return false;
    const item = coupon as Partial<CouponObservation>;
    return typeof item.couponKey === "string" && typeof item.label === "string" && typeof item.clipped === "boolean" && Array.isArray(item.eligibleUpcs)
      && item.eligibleUpcs.every((upc) => typeof upc === "string") && Number.isInteger(item.minimumQuantity) && Number(item.minimumQuantity) > 0 && typeof item.expired === "boolean";
  });
  if (coupons.length !== input.coupons.length) throw new Error("Invalid coupon evidence");
  return { sourceUrl: input.sourceUrl, coupons };
}

export async function persistExtensionEvidence(db: D1Database, envelope: ExtensionEnvelope, createId: () => string = crypto.randomUUID): Promise<{ snapshotId?: string }> {
  if (envelope.type === "purchase_import") {
    if (!Array.isArray(envelope.body) || envelope.body.length > 2_000) throw new Error("Invalid purchase import");
    await db.prepare("INSERT INTO purchase_imports (id, payload_json, observed_at) VALUES (?, ?, ?)").bind(createId(), JSON.stringify(envelope.body), envelope.timestamp).run();
    return {};
  }
  if (envelope.type === "cart_snapshot") {
    if (!Array.isArray(envelope.body) || envelope.body.length > 500) throw new Error("Invalid cart snapshot");
    const snapshotId = createId();
    await db.prepare("INSERT INTO cart_snapshots (id, installation_id, payload_json, observed_at) VALUES (?, ?, ?, ?)").bind(snapshotId, envelope.installationId, JSON.stringify({ items: envelope.body }), envelope.timestamp).run();
    return { snapshotId };
  }
  const body = couponBody(envelope.body);
  const rows = await db.prepare("SELECT di.id, di.quantity, p.upc FROM draft_items di JOIN products p ON p.id = di.product_id JOIN weekly_drafts d ON d.id = di.draft_id WHERE d.status = 'draft'").all<{ id: number; quantity: number; upc: string }>();
  for (const item of rows.results) {
    for (const coupon of body.coupons) {
      if (!coupon.eligibleUpcs.includes(item.upc)) continue;
      await db.prepare("INSERT INTO coupon_evidence (draft_item_id, coupon_key, label, clipped, exact_eligible, minimum_quantity, quantity_satisfied, expired, source_url, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(item.id, coupon.couponKey, coupon.label, coupon.clipped ? 1 : 0, 1, coupon.minimumQuantity, item.quantity >= coupon.minimumQuantity ? 1 : 0, coupon.expired ? 1 : 0, body.sourceUrl, envelope.timestamp).run();
    }
  }
  return {};
}

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "content-type,x-extension-credential,x-extension-signature");
  headers.set("access-control-allow-methods", "POST,OPTIONS");
  return new Response(response.body, { status: response.status, headers });
}

export async function handleExtension(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
  if (path === "/api/extension/latest-cart" && request.method === "GET") {
    const session = readSessionCookie(request);
    if (!session || !(await verifySession(env.SESSION_SECRET, session))) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const row = await env.DB.prepare("SELECT id, payload_json, observed_at FROM cart_snapshots ORDER BY observed_at DESC LIMIT 1").first<{ id: string; payload_json: string; observed_at: string }>();
    if (!row) return Response.json({ snapshot: null });
    return Response.json({ snapshot: { id: row.id, observedAt: row.observed_at, ...JSON.parse(row.payload_json) as object } }, { headers: { "cache-control": "no-store" } });
  }
  if (path === "/api/extension/pair-code" && request.method === "POST") {
    const session = readSessionCookie(request);
    const csrf = request.headers.get("x-csrf-token");
    if (!session || !(await verifySession(env.SESSION_SECRET, session))) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!csrf || !(await verifyCsrfToken(env.SESSION_SECRET, session, csrf))) return Response.json({ error: "Forbidden" }, { status: 403 });
    const code = encodeBase64Url(crypto.getRandomValues(new Uint8Array(18)));
    await env.DB.prepare("INSERT INTO extension_pairing_codes (code, expires_at) VALUES (?, ?)").bind(code, new Date(Date.now() + 5 * 60_000).toISOString()).run();
    return Response.json({ code });
  }
  if (path === "/api/extension/pair" && request.method === "POST") {
    const body: { code?: string } = await request.json<{ code?: string }>().catch(() => ({}));
    const record = body.code ? await env.DB.prepare("SELECT code, expires_at FROM extension_pairing_codes WHERE code = ?").bind(body.code).first<{ code: string; expires_at: string }>() : null;
    if (!record || new Date(record.expires_at).getTime() < Date.now()) return cors(Response.json({ error: "Invalid pairing code" }, { status: 401 }));
    const installationId = crypto.randomUUID();
    const credential = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare("INSERT INTO extension_installations (id, credential_hash) VALUES (?, ?)").bind(installationId, await hashCredential(credential)).run();
    await env.DB.prepare("DELETE FROM extension_pairing_codes WHERE code = ?").bind(record.code).run();
    return cors(Response.json({ installationId, credential }));
  }
  if (path === "/api/extension/evidence" && request.method === "POST") {
    const text = await request.text();
    if (text.length > 256_000) return cors(Response.json({ error: "Payload too large" }, { status: 413 }));
    try {
      const envelope = JSON.parse(text) as ExtensionEnvelope;
      const installation = await env.DB.prepare("SELECT credential_hash FROM extension_installations WHERE id = ?").bind(envelope.installationId).first<{ credential_hash: string }>();
      const nonce = installation ? await env.DB.prepare("SELECT nonce FROM extension_nonces WHERE installation_id = ? AND nonce = ?").bind(envelope.installationId, envelope.nonce).first<{ nonce: string }>() : null;
      if (!installation) throw new Error("Unknown extension installation");
      await verifyEnvelopeAuth({ envelope, credential: request.headers.get("x-extension-credential") ?? "", credentialHash: installation.credential_hash, signature: request.headers.get("x-extension-signature") ?? "", nonceUsed: Boolean(nonce) });
      await env.DB.prepare("INSERT INTO extension_nonces (installation_id, nonce, used_at) VALUES (?, ?, ?)").bind(envelope.installationId, envelope.nonce, envelope.timestamp).run();
      const result = await persistExtensionEvidence(env.DB, envelope);
      return cors(Response.json({ ok: true, ...result }));
    } catch (error) {
      return cors(Response.json({ error: error instanceof Error ? error.message : "Invalid extension evidence" }, { status: 401 }));
    }
  }
  return Response.json({ error: "Not found" }, { status: 404 });
}
