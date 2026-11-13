import { decodeBase64Url, encodeBase64Url, equalBytes } from "./encoding";

const ITERATIONS = 100_000;

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array([...salt]), iterations: ITERATIONS }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, suppliedSalt?: Uint8Array): Promise<string> {
  const salt = suppliedSalt ?? crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `pbkdf2-sha256$${ITERATIONS}$${encodeBase64Url(salt)}$${encodeBase64Url(hash)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterations, salt, expected] = encoded.split("$");
  if (algorithm !== "pbkdf2-sha256" || Number(iterations) !== ITERATIONS || !salt || !expected) return false;
  return equalBytes(await derive(password, decodeBase64Url(salt)), decodeBase64Url(expected));
}
