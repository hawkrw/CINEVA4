import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "mobile", "www");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const entries = await readdir(root, { withFileTypes: true });
const htmlPages = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
  .map((entry) => entry.name);

for (const file of htmlPages) {
  await cp(path.join(root, file), path.join(output, file));
}

for (const directory of ["assets", "css", "js", "admin"]) {
  const source = path.join(root, directory);
  try {
    await cp(source, path.join(output, directory), { recursive: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

for (const file of ["manifest.webmanifest", "sw.js"]) {
  await cp(path.join(root, file), path.join(output, file));
}

console.log(`Prepared CINEVA mobile web bundle: ${htmlPages.length} HTML pages copied.`);
