import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = join(root, "public");
const output = join(root, "dist");

async function loadDotEnv() {
  const file = join(root, ".env");
  if (!existsSync(file)) return {};
  const content = await readFile(file, "utf8");
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
      })
  );
}

const localEnv = await loadDotEnv();
const readEnv = (name) => process.env[name] || localEnv[name] || "";

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

const publicEnv = { SERVER_API_ENABLED: true };

await writeFile(
  join(output, "env.js"),
  `window.__ENV__ = ${JSON.stringify(publicEnv, null, 2)};\n`,
  "utf8"
);

const assetFiles = ["app.js", "styles.css", "supabase-api.js", "env.js"];
const assetContents = await Promise.all(assetFiles.map((name) => readFile(join(output, name), "utf8")));
const buildVersion = createHash("sha256").update(assetContents.join("\n")).digest("hex").slice(0, 12);
for (const name of ["index.html", "app.js"]) {
  const file = join(output, name);
  const content = await readFile(file, "utf8");
  await writeFile(file, content.replaceAll("__BUILD_VERSION__", buildVersion), "utf8");
}

console.log(`Build criado em ${output}`);
console.log(`API server-side habilitada: ${Boolean(publicEnv.SERVER_API_ENABLED)}`);
console.log(`Versão dos arquivos: ${buildVersion}`);
