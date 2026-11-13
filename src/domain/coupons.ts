export interface CouponEvidence {
  observedAt: string;
  clipped: boolean;
  exactEligible: boolean | null;
  minimumQuantity: number | null;
  cartDiscountCents: number | null;
  expired: boolean;
}

export type CouponState = "gray" | "amber" | "green" | "blue" | "red";

export function couponState(evidence: CouponEvidence | null, item: { quantity: number }, now = new Date()): CouponState {
  if (!evidence) return "gray";
  const age = now.getTime() - new Date(evidence.observedAt).getTime();
  if (!Number.isFinite(age) || age < -60_000 || age > 5 * 60_000) return "amber";
  if (evidence.expired || evidence.exactEligible === false || (evidence.minimumQuantity !== null && item.quantity < evidence.minimumQuantity)) return "red";
  if ((evidence.cartDiscountCents ?? 0) > 0) return "blue";
  if (evidence.clipped && evidence.exactEligible === true && evidence.minimumQuantity !== null) return "green";
  return "amber";
}
