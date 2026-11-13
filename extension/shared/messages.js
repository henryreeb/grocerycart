(function (scope) {
  const knownTypes = new Set(["purchase_import", "cart_snapshot", "coupon_evidence"]);

  function validateEnvelope(value, now = new Date()) {
    if (!value || typeof value !== "object") throw new Error("Invalid envelope");
    if (value.version !== 1) throw new Error("Unknown message version");
    if (!knownTypes.has(value.type)) throw new Error("Unknown message type");
    if (typeof value.installationId !== "string" || !value.installationId) throw new Error("Missing installation");
    if (typeof value.nonce !== "string" || value.nonce.length < 12) throw new Error("Invalid nonce");
    const age = now.getTime() - new Date(value.timestamp).getTime();
    if (!Number.isFinite(age) || age < -60_000 || age > 5 * 60_000) throw new Error("Message is stale");
    return value;
  }

  function canonicalEnvelope(envelope) {
    return JSON.stringify({ installationId: envelope.installationId, timestamp: envelope.timestamp, nonce: envelope.nonce, type: envelope.type, body: envelope.body });
  }

  scope.GroceryCartExtension = { ...scope.GroceryCartExtension, validateEnvelope, canonicalEnvelope };
})(globalThis);
