import { describe, expect, test } from "vitest";
import { draftItemInput, ensureDraftEditable } from "../../src/domain/drafts";

describe("draft editing", () => {
  test("accepts a positive integer quantity", () => {
    expect(draftItemInput({ productId: "p1", quantity: 2 })).toEqual({ productId: "p1", quantity: 2 });
  });

  test("rejects zero, fractional, and missing identifiers", () => {
    expect(() => draftItemInput({ productId: "p1", quantity: 0 })).toThrow("quantity");
    expect(() => draftItemInput({ productId: "p1", quantity: 1.5 })).toThrow("quantity");
    expect(() => draftItemInput({ productId: "", quantity: 1 })).toThrow("product");
  });

  test("prevents edits after submission starts", () => {
    expect(() => ensureDraftEditable("submitting")).toThrow("editable");
    expect(() => ensureDraftEditable("submitted")).toThrow("editable");
    expect(() => ensureDraftEditable("draft")).not.toThrow();
  });
});
