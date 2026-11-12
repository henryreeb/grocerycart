import { decodeBase64Url, encodeBase64Url } from "../auth/encoding";

const AUTHORIZE_URL = "https://api.kroger.com/v1/connect/oauth2/authorize";
const TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token";

export interface Pkce {
  verifier: string;
  challenge: string;
}

export async function createPkce(random = crypto.getRandomValues(new Uint8Array(32))): Promise<Pkce> {
  const verifier = encodeBase64Url(random);
  const challengeBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge: encodeBase64Url(challengeBytes) };
}

export function buildAuthorizationUrl(input: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "cart.basic:write product.compact profile.compact",
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256"
  }).toString();
  return url.toString();
}

async function encryptionKey(encodedKey: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new Uint8Array([...decodeBase64Url(encodedKey)]), "AES-GCM", false, usage);
}

export async function encryptToken(token: string, encodedKey: string, suppliedIv?: Uint8Array): Promise<string> {
  const iv = suppliedIv ?? crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: new Uint8Array([...iv]) }, await encryptionKey(encodedKey, ["encrypt"]), new TextEncoder().encode(token));
  return `${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptToken(value: string, encodedKey: string): Promise<string> {
  const [encodedIv, encodedCiphertext] = value.split(".");
  if (!encodedIv || !encodedCiphertext) throw new Error("Malformed encrypted token");
  const cleartext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array([...decodeBase64Url(encodedIv)]) }, await encryptionKey(encodedKey, ["decrypt"]), new Uint8Array([...decodeBase64Url(encodedCiphertext)]));
  return new TextDecoder().decode(cleartext);
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface StateRecord {
  state: string;
  expiresAt: string;
}

export function validateOAuthState(actual: string | null, record: StateRecord | null, now = new Date()): void {
  if (!actual || !record || actual !== record.state) throw new Error("Invalid OAuth state");
  if (new Date(record.expiresAt).getTime() < now.getTime()) throw new Error("OAuth state expired");
}

async function tokenRequest(body: URLSearchParams, clientId: string, clientSecret: string, fetcher: typeof fetch): Promise<OAuthTokens> {
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  if (!response.ok) throw new Error(`Kroger OAuth token request failed (${response.status})`);
  const value = await response.json<{ access_token?: string; refresh_token?: string; expires_in?: number }>();
  if (typeof value.access_token !== "string" || typeof value.refresh_token !== "string" || typeof value.expires_in !== "number") throw new Error("Malformed Kroger OAuth response");
  return { accessToken: value.access_token, refreshToken: value.refresh_token, expiresIn: value.expires_in };
}

export async function exchangeAuthorizationCode(input: { code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string }, fetcher: typeof fetch = fetch): Promise<OAuthTokens> {
  return tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code: input.code, code_verifier: input.verifier, redirect_uri: input.redirectUri }), input.clientId, input.clientSecret, fetcher);
}

export async function refreshAccessToken(input: { refreshToken: string; clientId: string; clientSecret: string }, fetcher: typeof fetch = fetch): Promise<OAuthTokens> {
  return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: input.refreshToken }), input.clientId, input.clientSecret, fetcher);
}
