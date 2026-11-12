import { describe, expect, test } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/password";

describe("password hashing", () => {
  test("accepts the original password and rejects a different password", async () => {
    const encoded = await hashPassword("correct horse battery staple", new Uint8Array(16).fill(7));

    expect(await verifyPassword("correct horse battery staple", encoded)).toBe(true);
    expect(await verifyPassword("wrong", encoded)).toBe(false);
  });

  test("rejects malformed encoded hashes", async () => {
    await expect(verifyPassword("anything", "pbkdf2$bad")).resolves.toBe(false);
  });
});
