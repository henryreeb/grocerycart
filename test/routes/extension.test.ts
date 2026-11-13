import { describe, expect, test } from "vitest";
import { canonicalEnvelope, hashCredential, signEnvelope, verifyEnvelopeAuth } from "../../src/routes/extension";

const now = new Date("2026-11-12T15:00:00Z");
const envelope = { version: 1, type: "purchase_import", installationId: "ext", timestamp: now.toISOString(), nonce: "nonce-1234567890", body: [] } as const;

describe("extension evidence authentication", () => {
  test("accepts a current envelope signed by the paired credential", async () => {
    const credential = "credential-secret";
    const signature = await signEnvelope(credential, canonicalEnvelope(envelope));

    await expect(verifyEnvelopeAuth({ envelope, credential, credentialHash: await hashCredential(credential), signature, nonceUsed: false, now })).resolves.toEqual(envelope);
  });

  test("rejects the wrong credential and replayed nonce", async () => {
    const signature = await signEnvelope("credential-secret", canonicalEnvelope(envelope));
    await expect(verifyEnvelopeAuth({ envelope, credential: "wrong", credentialHash: await hashCredential("credential-secret"), signature, nonceUsed: false, now })).rejects.toThrow("credential");
    await expect(verifyEnvelopeAuth({ envelope, credential: "credential-secret", credentialHash: await hashCredential("credential-secret"), signature, nonceUsed: true, now })).rejects.toThrow("replay");
  });
});
