import type { Env } from "./config";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true });
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(): Promise<void> {
    // Weekly preparation is added in Task 5.
  }
} satisfies ExportedHandler<Env>;
