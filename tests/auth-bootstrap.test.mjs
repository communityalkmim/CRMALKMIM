import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("inicialização não exibe o login antes de validar a sessão", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("public/index.html", root), "utf8"),
    readFile(new URL("public/app.js", root), "utf8")
  ]);

  assert.match(html, /id="session-loading"/);
  assert.match(html, /id="login-screen" class="login-screen" hidden/);
  assert.match(app, /\$\("#session-loading"\)\.hidden = true/);
});
