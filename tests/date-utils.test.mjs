import assert from "node:assert/strict";
import test from "node:test";

import { formatDate, formatDateTime, parseDateValue } from "../public/date-utils.js";

test("formatDate aceita data simples e timestamp do Supabase", () => {
  assert.notEqual(formatDate("2026-07-15"), "Data inválida");
  assert.notEqual(formatDate("2026-07-02 20:18:59.183+00"), "Data inválida");
  assert.notEqual(formatDate("2026-07-02T20:18:59.183Z"), "Data inválida");
});

test("formatadores tratam valores ausentes ou inválidos sem lançar erro", () => {
  assert.equal(formatDate(null), "Sem data");
  assert.equal(formatDate("data-quebrada"), "Data inválida");
  assert.equal(formatDateTime("data-quebrada"), "Data inválida");
  assert.equal(parseDateValue("data-quebrada"), null);
});
