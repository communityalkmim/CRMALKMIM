import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("página financeira possui controle para ocultar valores", async () => {
  const [html, app, styles] = await Promise.all([
    readFile(new URL("public/index.html", root), "utf8"),
    readFile(new URL("public/app.js", root), "utf8"),
    readFile(new URL("public/styles.css", root), "utf8")
  ]);

  assert.match(html, /id="financial-values-toggle"/);
  assert.match(app, /financialValuesVisible/);
  assert.match(app, /state\.view !== "payments"/);
  assert.match(styles, /financial-values-hidden/);
  assert.doesNotMatch(app, /localStorage.*financialValuesVisible/);
});
