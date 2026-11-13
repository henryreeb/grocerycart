if (typeof importScripts === "function") importScripts("shared/messages.js");

const extensionApi = globalThis.browser ?? globalThis.chrome;

function bytes(value) { return new TextEncoder().encode(value); }
function base64url(value) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function postEvidence(evidenceType, body) {
  const { installationId, credential, appOrigin } = await extensionApi.storage.local.get(["installationId", "credential", "appOrigin"]);
  if (!installationId || !credential || !appOrigin) return;
  const envelope = { version: 1, type: evidenceType, installationId, timestamp: new Date().toISOString(), nonce: crypto.randomUUID(), body };
  const key = await crypto.subtle.importKey("raw", bytes(credential), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes(globalThis.GroceryCartExtension.canonicalEnvelope(envelope)))));
  const response = await fetch(`${appOrigin}/api/extension/evidence`, { method: "POST", headers: { "content-type": "application/json", "x-extension-credential": credential, "x-extension-signature": signature }, body: JSON.stringify(envelope) });
  if (!response.ok) throw new Error((await response.json()).error || "Evidence upload failed");
}

extensionApi.runtime.onMessage.addListener(async (message) => {
  if (message?.type === "PAIR") {
    const response = await fetch(`${message.appOrigin}/api/extension/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: message.code }) });
    if (!response.ok) throw new Error("Pairing failed");
    await extensionApi.storage.local.set({ ...(await response.json()), appOrigin: message.appOrigin });
    return { ok: true };
  }
  if (message?.type === "COLLECTED_EVIDENCE") {
    await postEvidence(message.evidenceType, message.body);
    return { ok: true };
  }
});
