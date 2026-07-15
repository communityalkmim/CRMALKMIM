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

function isoDate(year, month, day) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

export function fortnightRanges(dateValue) {
  const source = new Date(`${dateValue}T12:00:00Z`);
  if (Number.isNaN(source.getTime())) return { current: null, next: null };
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (day <= 15) {
    return {
      current: { from: isoDate(year, month, 1), to: isoDate(year, month, 15) },
      next: { from: isoDate(year, month, 16), to: isoDate(year, month, lastDay) }
    };
  }
  return {
    current: { from: isoDate(year, month, 16), to: isoDate(year, month, lastDay) },
    next: { from: isoDate(year, month + 1, 1), to: isoDate(year, month + 1, 15) }
  };
}
