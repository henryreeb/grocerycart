import { describe, expect, test } from "vitest";
import { handleSubmission } from "../../src/routes/submission";

describe("submission route", () => {
  test("requires a household session before reading cart state", async () => {
    const response = await handleSubmission(new Request("https://cart.example/api/drafts/1/submit", { method: "POST" }), { SESSION_SECRET: "secret" } as never);

    expect(response.status).toBe(401);
  });
});
