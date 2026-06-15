import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
};

const missingPublicEnv = Object.entries(publicEnv)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (process.env.NETLIFY === "true" && missingPublicEnv.length) {
  throw new Error(
    `Deploy cancelado: cadastre estas variáveis na Netlify antes de publicar: ${missingPublicEnv.join(", ")}`
  );
}

await writeFile(
  join(output, "env.js"),
  `window.__ENV__ = ${JSON.stringify(publicEnv, null, 2)};\n`,
  "utf8"
);

console.log(`Build criado em ${output}`);
console.log(`Supabase configurado: ${Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY)}`);
