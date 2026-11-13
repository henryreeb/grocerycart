import { hashPassword } from "../src/auth/password.ts";

const password = process.env.HOUSEHOLD_PASSWORD ?? "";
if (password.length < 12) throw new Error("Use at least 12 characters");
console.log(await hashPassword(password));
