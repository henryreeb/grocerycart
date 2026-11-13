export {};

declare global {
  var GroceryCartExtension: {
    validateEnvelope(value: unknown, now?: Date): Record<string, unknown>;
    canonicalEnvelope(value: unknown): string;
    parseRecentPurchases(document: Document, now?: Date): Array<Record<string, unknown>>;
    productIdFrom(node: Element): string | null;
  };
}
