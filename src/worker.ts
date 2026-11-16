import type { Env } from "./config";
import { handleAuth } from "./routes/auth";
import { handleOAuth } from "./routes/oauth";
import { handleProducts } from "./routes/products";
import { handleDrafts } from "./routes/drafts";
import { handleStaples } from "./routes/staples";
import { handleSchedule, prepareFromEnv } from "./routes/schedule";
import { handleSubmission } from "./routes/submission";
import { handleExtension } from "./routes/extension";
import { handleHouseholdData } from "./routes/household-data";

function secure(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", "default-src 'self'; connect-src 'self' https://api.kroger.com; img-src 'self' data: https:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  headers.set("x-frame-options", "DENY");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const extensionRoute = url.pathname === "/api/extension/pair" || url.pathname === "/api/extension/evidence";
    if (!extensionRoute && !["GET", "HEAD", "OPTIONS"].includes(request.method) && origin && origin !== (env.APP_ORIGIN || url.origin)) return secure(Response.json({ error: "Cross-origin request rejected" }, { status: 403 }));
    let response: Response;
    if (url.pathname === "/api/health") {
      response = Response.json({ ok: true, krogerConfigured: Boolean(env.KROGER_CLIENT_ID?.trim() && env.KROGER_CLIENT_SECRET?.trim()) });
    } else if (url.pathname === "/api/household-data") {
      response = await handleHouseholdData(request, env);
    } else if (["/api/login", "/api/logout", "/api/session"].includes(url.pathname)) {
      response = await handleAuth(request, env);
    } else if (url.pathname.startsWith("/api/oauth/")) {
      response = await handleOAuth(request, env);
    } else if (url.pathname === "/api/products") {
      response = await handleProducts(request, env);
    } else if (url.pathname === "/api/drafts/prepare" && request.method === "POST") {
      response = await handleSchedule(request, env);
    } else if (/^\/api\/drafts\/\d+\/submit$/.test(url.pathname)) {
      response = await handleSubmission(request, env);
    } else if (url.pathname.startsWith("/api/drafts/")) {
      response = await handleDrafts(request, env);
    } else if (url.pathname.startsWith("/api/staples/")) {
      response = await handleStaples(request, env);
    } else if (url.pathname.startsWith("/api/extension/")) {
      response = await handleExtension(request, env);
    } else {
      response = await env.ASSETS.fetch(request);
    }
    return secure(response);
  },
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await prepareFromEnv(env);
  }
} satisfies ExportedHandler<Env>;
