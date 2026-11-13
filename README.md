# GroceryCart

A private Cloudflare Worker that prepares a Thursday Kroger pickup draft, shows current and prior prices, imports recent purchases through a Firefox/Chrome extension, verifies coupon/cart evidence, and adds approved products through Kroger's official Cart API.

The app never places or checks out an order. A family member reviews the draft, opens Kroger's cart for a fresh scan, confirms exact UPC duplicates, and finishes pickup details on Kroger.

## Local setup

Requirements: Node 22+, npm 11+, a Cloudflare account, and Kroger developer credentials with Product, Cart, and OAuth access.

1. Run `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and replace every value. Keep that file private.
3. Create the local database: `npx wrangler d1 execute grocerycart --local --file=src/db/schema.sql`.
4. In PowerShell, read the password without displaying or saving it in history, hash it, then clear the temporary variable: `$secure = Read-Host -AsSecureString; $env:HOUSEHOLD_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)); npm run hash-password; Remove-Item Env:HOUSEHOLD_PASSWORD`. Insert the output and your pickup store ID:
   `npx wrangler d1 execute grocerycart --local --command "INSERT INTO households (id,password_hash,preferred_store_id) VALUES (1,'HASH','STORE_ID')"`.
5. Run `npm run dev`, sign in, and connect Kroger.
6. Package the extensions with `$env:APP_ORIGIN='http://localhost:8787'; npm run package:extensions`. Load `dist/chrome` as an unpacked Chrome extension or `dist/firefox` temporarily from `about:debugging`.

The extension only collects visible signed-in Kroger pages. For the initial two-month import, open Recent Purchases and scroll or page through the history. Open Kroger's coupon page to refresh coupon evidence and its cart page immediately before sending a draft.

## Cloudflare deployment

1. Create a D1 database named `grocerycart`, replace `LOCAL_REPLACE_ME` in `wrangler.jsonc` with its ID, and apply `src/db/schema.sql` with `npx wrangler d1 execute grocerycart --remote --file=src/db/schema.sql`.
2. Set `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `KROGER_CLIENT_ID`, and `KROGER_CLIENT_SECRET` with `npx wrangler secret put NAME`. Use at least 32 random bytes for the session secret. Generate the required base64url-encoded 32-byte AES key in PowerShell with `[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).TrimEnd('=').Replace('+','-').Replace('/','_')`.
3. Put the production HTTPS URL in `APP_ORIGIN` and `KROGER_REDIRECT_URI` in `wrangler.jsonc` vars, or as secrets. Register the exact `/api/oauth/callback` URL with Kroger. The requested OAuth access must cover product lookup and pickup Cart writes.
4. Generate the household password hash locally and insert the household row into remote D1 as shown above. Do not put the plaintext password in shell history.
5. Run `npx wrangler deploy`. In Cloudflare, verify the `0 * * * THU` trigger exists; the worker checks America/New_York and prepares once Thursday reaches 9:00 AM, including DST changes.
6. Build production extensions with `$env:APP_ORIGIN='https://your-worker.example'; npm run package:extensions` in PowerShell. Firefox can use a signed unlisted add-on for private distribution; Chrome can stay unpacked for family devices or use an unlisted/private Web Store listing.

Before updating production, export household data from the page and retain the prior Worker deployment. Roll back with Cloudflare's deployment history; restore D1 from its backup/time-travel facilities if a schema/data operation failed. The JSON export intentionally excludes password hashes, OAuth ciphertext, extension credentials, replay nonces, and app secrets.

## Verification and first live run

Run `npm test`, `npm run typecheck`, and `npm run package:extensions`. After deployment, use health, login, Kroger connection, product search, and **Prepare now** as non-destructive smoke checks. Confirm the Thursday trigger metadata in Cloudflare.

For the first real cart write, stay signed into Kroger, use a small pickup draft, open the Kroger cart so the extension produces a scan less than five minutes old, review coupon colors and exact duplicate warnings, then send. Confirm Kroger appended the expected UPCs. Do not automate checkout.

The extension's Kroger DOM selectors must be rechecked whenever Kroger changes its rendered pages. Fixture tests prove normalization, but only a signed-in browser can confirm current production markup and account-specific discounts.
