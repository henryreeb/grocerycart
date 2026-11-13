import { randomBytes, webcrypto } from "node:crypto";

const password = process.env.HOUSEHOLD_PASSWORD ?? "";
if (password.length < 12) throw new Error("Use at least 12 characters");

const iterations = 100_000;
const salt = randomBytes(16);
const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const hash = new Uint8Array(await webcrypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
console.log(`pbkdf2-sha256$${iterations}$${salt.toString("base64url")}$${Buffer.from(hash).toString("base64url")}`);
