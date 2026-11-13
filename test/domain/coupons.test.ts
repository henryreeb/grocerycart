import { describe, expect, test } from "vitest";
import { couponState } from "../../src/domain/coupons";

const item = { upc: "0001", quantity: 2 };
const observedAt = "2026-11-12T15:00:00Z";
const now = new Date("2026-11-12T15:04:00Z");

describe("coupon state", () => {
  test("uses gray with no evidence and amber for incomplete or stale evidence", () => {
    expect(couponState(null, item, now)).toBe("gray");
    expect(couponState({ observedAt, clipped: true, exactEligible: null, minimumQuantity: null, cartDiscountCents: null, expired: false }, item, now)).toBe("amber");
    expect(couponState({ observedAt: "2026-11-12T14:54:59Z", clipped: true, exactEligible: true, minimumQuantity: 1, cartDiscountCents: null, expired: false }, item, now)).toBe("amber");
  });

  test("uses green only when clipped, exact, current, and quantity satisfied", () => {
    expect(couponState({ observedAt, clipped: true, exactEligible: true, minimumQuantity: 2, cartDiscountCents: null, expired: false }, item, now)).toBe("green");
  });

  test("uses blue for a displayed cart discount and red for contradiction", () => {
    expect(couponState({ observedAt, clipped: true, exactEligible: true, minimumQuantity: 2, cartDiscountCents: 100, expired: false }, item, now)).toBe("blue");
    expect(couponState({ observedAt, clipped: true, exactEligible: false, minimumQuantity: 2, cartDiscountCents: null, expired: false }, item, now)).toBe("red");
    expect(couponState({ observedAt, clipped: true, exactEligible: true, minimumQuantity: 3, cartDiscountCents: null, expired: false }, item, now)).toBe("red");
  });
});
