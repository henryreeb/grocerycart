import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "extension");
const output = resolve(root, "dist");
const appOrigin = (process.env.APP_ORIGIN ?? "https://grocerycart.example").replace(/\/$/, "");

await rm(output, { recursive: true, force: true });

for (const browser of ["firefox", "chrome"]) {
  const destination = resolve(output, browser);
  await mkdir(destination, { recursive: true });
  await cp(resolve(source, "shared"), resolve(destination, "shared"), { recursive: true });
  await cp(resolve(source, "content.js"), resolve(destination, "content.js"));
  await cp(resolve(source, "background.js"), resolve(destination, "background.js"));
  const manifest = (await readFile(resolve(source, `manifest.${browser}.json`), "utf8")).replaceAll("https://grocerycart.example", appOrigin);
  await writeFile(resolve(destination, "manifest.json"), manifest);
}

console.log(`Packaged Firefox and Chrome extensions for ${appOrigin}`);
