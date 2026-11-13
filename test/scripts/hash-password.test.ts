import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { verifyPassword } from "../../src/auth/password";

describe("password setup helper", () => {
  test("prints a Cloudflare-compatible hash that the app verifies", async () => {
    const result = spawnSync(process.execPath, ["scripts/hash-password.mjs"], { encoding: "utf8", env: { ...process.env, HOUSEHOLD_PASSWORD: "correct horse battery staple" } });
    expect(result.status, result.stderr).toBe(0);
    const hash = result.stdout.trim();
    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });
});
