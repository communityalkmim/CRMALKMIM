import assert from "node:assert/strict";
import test from "node:test";

import { normalizeLeadBonusInput } from "../public/lead-utils.js";

test("normalizeLeadBonusInput ativa premiacao ao digitar valor", () => {
  assert.deepEqual(
    normalizeLeadBonusInput({ has_bonus: "0", bonus_value: "250,50", bonus_description: " Campanha " }),
    { has_bonus: true, bonus_value: 250.5, bonus_description: "Campanha" }
  );
});

test("normalizeLeadBonusInput limpa campos sem premiacao", () => {
  assert.deepEqual(
    normalizeLeadBonusInput({ has_bonus: "0", bonus_value: "", bonus_description: "Texto antigo" }),
    { has_bonus: false, bonus_value: 0, bonus_description: "" }
  );
});
