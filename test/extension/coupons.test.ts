import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, test } from "vitest";
import "../../extension/shared/kroger-adapter.js";

describe("coupon adapter", () => {
  test("normalizes clipped state, exact eligible UPCs, quantity, and expiration", () => {
    const { document } = parseHTML(readFileSync("extension/fixtures/coupons.html", "utf8"));

    expect(globalThis.GroceryCartExtension.parseCoupons(document)).toEqual([
      { couponKey: "coupon-1", label: "$1 off two", clipped: true, eligibleUpcs: ["0001", "0002"], minimumQuantity: 2, expired: false },
      { couponKey: "coupon-2", label: "Expired", clipped: true, eligibleUpcs: ["0003"], minimumQuantity: 1, expired: true }
    ]);
  });

  test("keeps unknown requirements ambiguous and reads an exact product link", () => {
    const { document } = parseHTML('<article data-testid="coupon" data-coupon-id="c3"><a href="/p/milk/0000000000042">Shop item</a><button>Clip</button></article>');
    expect(globalThis.GroceryCartExtension.parseCoupons(document)).toEqual([{ couponKey: "c3", label: "Shop itemClip", clipped: false, eligibleUpcs: ["0000000000042"], minimumQuantity: null, expired: false }]);
  });
});
