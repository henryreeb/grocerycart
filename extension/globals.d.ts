export {};

declare global {
  var GroceryCartExtension: {
    validateEnvelope(value: unknown, now?: Date): Record<string, unknown>;
    canonicalEnvelope(value: unknown): string;
    parseRecentPurchases(document: Document, now?: Date, sourceUrl?: string): Array<Record<string, unknown>>;
    parseCoupons(document: Document): Array<Record<string, unknown>>;
    parseCart(document: Document): Array<Record<string, unknown>>;
    expandCollapsedCart(document: Document): boolean;
    productIdFrom(node: Element): string | null;
  };
}
