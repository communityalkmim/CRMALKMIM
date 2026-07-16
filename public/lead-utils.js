export function normalizeLeadBonusInput({ has_bonus, bonus_value, bonus_description } = {}) {
  const parsedValue = Number(String(bonus_value ?? "").replace(",", "."));
  const bonusValue = Number.isFinite(parsedValue) ? parsedValue : 0;
  const explicitlyEnabled = [true, 1, "1", "true"].includes(has_bonus);
  const hasBonus = explicitlyEnabled || bonusValue > 0;

  return {
    has_bonus: hasBonus,
    bonus_value: hasBonus ? bonusValue : 0,
    bonus_description: hasBonus ? String(bonus_description || "").trim() : ""
  };
}
