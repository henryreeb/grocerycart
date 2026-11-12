import { encodeBase64Url, equalBytes, decodeBase64Url } from "./encoding";

async function csrfSignature(secret: string, sessionToken: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`csrf:${sessionToken}`)));
}

export async function createCsrfToken(secret: string, sessionToken: string): Promise<string> {
  return encodeBase64Url(await csrfSignature(secret, sessionToken));
}

export async function verifyCsrfToken(secret: string, sessionToken: string, candidate: string): Promise<boolean> {
  try {
    return equalBytes(await csrfSignature(secret, sessionToken), decodeBase64Url(candidate));
  } catch {
    return false;
  }
}
