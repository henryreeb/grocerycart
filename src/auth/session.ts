import { decodeBase64Url, encodeBase64Url, equalBytes } from "./encoding";

export interface Session {
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

async function sign(secret: string, body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

export async function createSession(secret: string, now = new Date()): Promise<string> {
  const session: Session = {
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    nonce: encodeBase64Url(crypto.getRandomValues(new Uint8Array(16)))
  };
  const body = encodeBase64Url(new TextEncoder().encode(JSON.stringify(session)));
  return `${body}.${encodeBase64Url(await sign(secret, body))}`;
}

export async function verifySession(secret: string, token: string, now = new Date()): Promise<Session | null> {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature || !equalBytes(await sign(secret, body), decodeBase64Url(signature))) return null;
    const session = JSON.parse(new TextDecoder().decode(decodeBase64Url(body))) as Session;
    if (!session.expiresAt || new Date(session.expiresAt).getTime() < now.getTime()) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return `household_session=${token}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Strict`;
}

export function readSessionCookie(request: Request): string | null {
  const match = request.headers.get("cookie")?.match(/(?:^|;\s*)household_session=([^;]+)/);
  return match?.[1] ?? null;
}
