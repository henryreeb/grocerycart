import type { Env } from "./config";
import { handleAuth } from "./routes/auth";
import { handleOAuth } from "./routes/oauth";
import { handleProducts } from "./routes/products";
import { handleDrafts } from "./routes/drafts";
import { handleStaples } from "./routes/staples";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/api/login" || url.pathname === "/api/logout") return handleAuth(request, env);
    if (url.pathname.startsWith("/api/oauth/")) return handleOAuth(request, env);
    if (url.pathname === "/api/products") return handleProducts(request, env);
    if (url.pathname.startsWith("/api/drafts/")) return handleDrafts(request, env);
    if (url.pathname.startsWith("/api/staples/")) return handleStaples(request, env);
    return env.ASSETS.fetch(request);
  },
  async scheduled(): Promise<void> {
    // Weekly preparation is added in Task 5.
  }
} satisfies ExportedHandler<Env>;
