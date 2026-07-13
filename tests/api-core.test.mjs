import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPlanRulePayload,
  checkLoginRateLimit,
  validateEntityPayload
} from "../serverless/api-core.mjs";

const uuid = "11111111-1111-4111-8111-111111111111";

test("applyPlanRulePayload calcula comissao e premiacao do lead", () => {
  const result = applyPlanRulePayload(
    {
      plan_id: uuid,
      plan_value: 1000,
      has_bonus: true,
      bonus_description: "Campanha mensal",
      bonus_value: 250
    },
    { id: uuid, name: "Plano Premium", commission_percent: 150 }
  );

  assert.equal(result.plan_name, "Plano Premium");
  assert.equal(result.commission_percent, 150);
  assert.equal(result.commission, 1500);
  assert.equal(result.bonus_value, 250);
  assert.equal(result.payment_status, "A receber");
});

test("applyPlanRulePayload limpa dados financeiros quando o plano e removido sem valor", () => {
  const result = applyPlanRulePayload({ plan_id: null, plan_value: 0, has_bonus: true, bonus_value: 100 });

  assert.equal(result.plan_name, null);
  assert.equal(result.plan_value, 0);
  assert.equal(result.commission, 0);
  assert.equal(result.has_bonus, false);
  assert.equal(result.bonus_value, 0);
});

test("applyPlanRulePayload bloqueia valor informado sem plano escolhido", () => {
  assert.throws(
    () => applyPlanRulePayload({ plan_id: null, plan_value: 500 }),
    /plano escolhido/i
  );
});

test("applyPlanRulePayload exige valor de premiacao quando flag esta ativa", () => {
  assert.throws(
    () => applyPlanRulePayload({ plan_id: uuid, plan_value: 1000, has_bonus: true }, { name: "Plano", commission_percent: 100 }),
    /premiacao/i
  );
});

test("validateEntityPayload normaliza payload valido de lead", () => {
  const payload = validateEntityPayload("leads", {
    name: "  Cliente Teste  ",
    phone: "11999999999",
    email: "cliente@example.com",
    origin: "Indicacao",
    entry_date: "2026-07-12",
    status: "Novo",
    payment_status: "Recebido"
  });

  assert.equal(payload.name, "Cliente Teste");
  assert.equal(payload.email, "cliente@example.com");
  assert.equal(payload.entry_date, "2026-07-12");
  assert.equal(payload.payment_status, "Recebido");
});

test("validateEntityPayload bloqueia email invalido", () => {
  assert.throws(
    () => validateEntityPayload("leads", {
      name: "Cliente",
      email: "email-invalido",
      entry_date: "2026-07-12",
      status: "Novo"
    }),
    /e-mail/i
  );
});

test("validateEntityPayload aceita edicao parcial com campos permitidos", () => {
  const payload = validateEntityPayload("leads", { payment_status: "Recebido" }, { partial: true });

  assert.deepEqual(payload, { payment_status: "Recebido" });
});

test("checkLoginRateLimit bloqueia excesso de tentativas por chave", () => {
  const key = `test:${Date.now()}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.doesNotThrow(() => checkLoginRateLimit({ key, now: 1000 }));
  }
  assert.throws(() => checkLoginRateLimit({ key, now: 1000 }), /tentativas/i);
  assert.doesNotThrow(() => checkLoginRateLimit({ key, now: 1000 + 15 * 60 * 1000 + 1 }));
});
