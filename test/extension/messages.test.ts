import { describe, expect, test } from "vitest";
import "../../extension/shared/messages.js";

const { validateEnvelope } = globalThis.GroceryCartExtension;

const now = new Date("2026-11-12T15:00:00Z");

describe("extension messages", () => {
  test("accepts a current version-1 known message", () => {
    expect(validateEnvelope({ version: 1, type: "purchase_import", installationId: "ext", timestamp: now.toISOString(), nonce: "nonce-1234567890", body: [] }, now)).toMatchObject({ type: "purchase_import" });
  });

  test("rejects unknown versions, message types, and stale timestamps", () => {
    expect(() => validateEnvelope({ version: 2, type: "purchase_import", installationId: "ext", timestamp: now.toISOString(), nonce: "nonce-1234567890", body: [] }, now)).toThrow("version");
    expect(() => validateEnvelope({ version: 1, type: "unknown", installationId: "ext", timestamp: now.toISOString(), nonce: "nonce-1234567890", body: [] }, now)).toThrow("type");
    expect(() => validateEnvelope({ version: 1, type: "purchase_import", installationId: "ext", timestamp: "2026-11-12T14:54:59Z", nonce: "nonce-1234567890", body: [] }, now)).toThrow("stale");
  });
});
