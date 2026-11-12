export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  KROGER_CLIENT_ID: string;
  KROGER_CLIENT_SECRET: string;
  KROGER_REDIRECT_URI: string;
  APP_ORIGIN: string;
}

export const TIME_ZONE = "America/New_York";
export const PICKUP_FULFILLMENT = "csp";
export const PICKUP_MODALITY = "PICKUP";
