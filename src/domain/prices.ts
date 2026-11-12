export function effectivePrice(product: { regularPriceCents: number | null; promoPriceCents: number | null }): number | null {
  return product.promoPriceCents ?? product.regularPriceCents;
}

export function comparePrice(current: number | null, previous: number | null): { changeCents: number | null; direction: "up" | "down" | "same" | "unknown" } {
  if (current === null || previous === null) return { changeCents: null, direction: "unknown" };
  const changeCents = current - previous;
  return { changeCents, direction: changeCents > 0 ? "up" : changeCents < 0 ? "down" : "same" };
}

export function estimateTotal(items: Array<{ quantity: number; effectivePriceCents: number | null; variableWeight: boolean }>): { pricedTotalCents: number; unresolvedWeightedItems: number } {
  return items.reduce((total, item) => {
    if (item.effectivePriceCents === null) {
      if (item.variableWeight) total.unresolvedWeightedItems += 1;
      return total;
    }
    total.pricedTotalCents += item.effectivePriceCents * item.quantity;
    return total;
  }, { pricedTotalCents: 0, unresolvedWeightedItems: 0 });
}
