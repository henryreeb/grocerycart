import { describe, expect, test } from "vitest";
import { draftWeek, shouldPrepare } from "../../src/domain/schedule";

describe("Thursday schedule", () => {
  test("starts at 9 AM Eastern and not before", () => {
    expect(shouldPrepare(new Date("2026-11-12T13:59:00Z"))).toBe(false);
    expect(shouldPrepare(new Date("2026-11-12T14:00:00Z"))).toBe(true);
  });

  test("accounts for daylight saving time", () => {
    expect(shouldPrepare(new Date("2026-03-12T12:59:00Z"))).toBe(false);
    expect(shouldPrepare(new Date("2026-03-12T13:00:00Z"))).toBe(true);
  });

  test("uses the local Monday as the draft week", () => {
    expect(draftWeek(new Date("2026-11-12T14:00:00Z"))).toBe("2026-11-09");
  });
});
