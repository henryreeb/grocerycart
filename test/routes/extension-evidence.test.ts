import { afterEach, describe, expect, test, vi } from "vitest";
import { persistExtensionEvidence, type ExtensionEnvelope } from "../../src/routes/extension";

function evidenceDb() {
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) { values = bound; return this; },
        async all() {
          return { success: true, meta: {}, results: [
            { id: 11, upc: "0001", quantity: 2 },
            { id: 12, upc: "0009", quantity: 1 }
          ] };
        },
        async run() { writes.push({ sql, values }); return { success: true, meta: {} }; }
      };
    }
  };
  return { db: db as unknown as D1Database, writes };
}

const base = { version: 1, installationId: "ext", timestamp: "2026-11-12T15:00:00Z", nonce: "nonce-1234567890" } as const;

describe("extension evidence persistence", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("preserves the Cloudflare crypto receiver when creating snapshot IDs", async () => {
    const { db } = evidenceDb();
    const platformCrypto = {
      randomUUID(this: unknown) {
        if (this !== platformCrypto) throw new TypeError("Illegal invocation");
        return "snapshot-platform";
      }
    };
    vi.stubGlobal("crypto", platformCrypto);

    await expect(persistExtensionEvidence(db, { ...base, type: "cart_snapshot", body: { status: "complete", items: [{ upc: "0001", quantity: 1 }] } })).resolves.toEqual({ snapshotId: "snapshot-platform" });
  });

  test("stores coupon evidence only against draft items with exact eligible UPCs", async () => {
    const { db, writes } = evidenceDb();
    const envelope: ExtensionEnvelope = { ...base, type: "coupon_evidence", body: { sourceUrl: "https://www.kroger.com/savings/cl/coupons", coupons: [
      { couponKey: "coupon-1", label: "$1 off two", clipped: true, eligibleUpcs: ["0001"], minimumQuantity: 2, expired: false },
      { couponKey: "ambiguous", label: "Any Kroger milk", clipped: true, eligibleUpcs: [], minimumQuantity: 1, expired: false }
    ] } };

    await persistExtensionEvidence(db, envelope);

    const couponWrites = writes.filter((write) => write.sql.includes("coupon_evidence"));
    expect(couponWrites).toHaveLength(1);
    expect(couponWrites[0]?.values).toEqual([11, "coupon-1", "$1 off two", 1, 1, 2, 1, 0, "https://www.kroger.com/savings/cl/coupons", base.timestamp]);
  });

  test("returns the stored cart snapshot ID", async () => {
    const { db, writes } = evidenceDb();
    const envelope: ExtensionEnvelope = { ...base, type: "cart_snapshot", body: { status: "complete", items: [{ upc: "0001", description: "Milk", quantity: 2, discountCents: 100 }] } };

    const result = await persistExtensionEvidence(db, envelope, () => "snapshot-1");

    expect(result).toEqual({ snapshotId: "snapshot-1" });
    expect(writes.find((write) => write.sql.includes("cart_snapshots"))?.values).toEqual(["snapshot-1", "ext", JSON.stringify({ items: (envelope.body as { items: unknown[] }).items }), base.timestamp]);
  });

  test("rejects an unrecognized cart as evidence", async () => {
    const { db } = evidenceDb();
    await expect(persistExtensionEvidence(db, { ...base, type: "cart_snapshot", body: { status: "unknown", items: [] } })).rejects.toThrow("recognized");
  });
});
