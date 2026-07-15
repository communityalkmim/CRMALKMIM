export function groupPaymentsByLead(payments = []) {
  const groups = new Map();
  for (const payment of payments) {
    const key = String(payment.lead_id || payment.id);
    if (!groups.has(key)) {
      groups.set(key, {
        lead_id: payment.lead_id,
        lead_name: payment.lead_name,
        lead_phone: payment.lead_phone,
        effective_date: payment.effective_date,
        plan_name: payment.plan_name,
        plan_segment: payment.plan_segment,
        plan_value: payment.plan_value,
        bonus_description: payment.bonus_description,
        payments: [],
        commissions: {},
        bonus: null
      });
    }
    const group = groups.get(key);
    group.payments.push(payment);
    if (payment.kind === "commission") group.commissions[Number(payment.installment)] = payment;
    if (payment.kind === "bonus") group.bonus = payment;
  }
  return [...groups.values()].sort((left, right) =>
    String(left.lead_name || "").localeCompare(String(right.lead_name || ""), "pt-BR")
  );
}

export function activePaymentTotal(group) {
  return group.payments
    .filter((payment) => payment.status !== "Cancelado")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}
