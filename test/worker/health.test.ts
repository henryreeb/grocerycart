import { describe, expect, test } from "vitest";
import worker from "../../src/worker";

describe("worker shell", () => {
  test("returns a minimal health response", async () => {
    const response = await worker.fetch(new Request("https://cart.example/api/health"), {} as never, {} as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("falls back to the static app binding", async () => {
    const assets = { fetch: () => Promise.resolve(new Response("app shell")) };
    const response = await worker.fetch(new Request("https://cart.example/"), { ASSETS: assets } as never, {} as never);

    expect(await response.text()).toBe("app shell");
  });
});
