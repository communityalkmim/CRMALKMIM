import assert from "node:assert/strict";
import test from "node:test";

import { activePaymentTotal, fortnightRanges, groupPaymentsByLead } from "../public/payment-utils.js";

test("groupPaymentsByLead cria uma linha por cliente e preserva os flags", () => {
  const groups = groupPaymentsByLead([
    { id: "p1", lead_id: "l1", lead_name: "Cliente", kind: "commission", installment: 1, amount: 100, status: "Recebido" },
    { id: "p2", lead_id: "l1", lead_name: "Cliente", kind: "commission", installment: 2, amount: 50, status: "A receber" },
    { id: "b1", lead_id: "l1", lead_name: "Cliente", kind: "bonus", installment: 0, amount: 25, status: "Recebido" }
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].commissions[1].status, "Recebido");
  assert.equal(groups[0].commissions[2].status, "A receber");
  assert.equal(groups[0].bonus.status, "Recebido");
  assert.equal(activePaymentTotal(groups[0]), 175);
});

test("activePaymentTotal ignora pagamentos cancelados", () => {
  const [group] = groupPaymentsByLead([
    { id: "p1", lead_id: "l1", kind: "commission", installment: 1, amount: 100, status: "Recebido" },
    { id: "p2", lead_id: "l1", kind: "commission", installment: 2, amount: 50, status: "Cancelado" }
  ]);
  assert.equal(activePaymentTotal(group), 100);
});

test("fortnightRanges calcula quinzena atual e próxima", () => {
  assert.deepEqual(fortnightRanges("2026-07-08"), {
    current: { from: "2026-07-01", to: "2026-07-15" },
    next: { from: "2026-07-16", to: "2026-07-31" }
  });
  assert.deepEqual(fortnightRanges("2026-07-20"), {
    current: { from: "2026-07-16", to: "2026-07-31" },
    next: { from: "2026-08-01", to: "2026-08-15" }
  });
});
