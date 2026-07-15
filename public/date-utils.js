export function parseDateValue(value, { assumeUtc = false } = {}) {
  if (!value) return null;
  const rawValue = String(value).trim();
  if (!rawValue) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(rawValue);
  let normalized = dateOnly ? `${rawValue}T12:00:00` : rawValue.replace(" ", "T");
  normalized = normalized.replace(/([+-]\d{2})$/, "$1:00");
  if (assumeUtc && !dateOnly && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) normalized += "Z";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value, options = {}) {
  if (!value) return "Sem data";
  const date = parseDateValue(value);
  if (!date) return "Data inválida";
  const formatOptions = options.year ? options : { day: "2-digit", month: "short" };
  return new Intl.DateTimeFormat("pt-BR", formatOptions).format(date);
}

export function formatDateTime(value) {
  if (!value) return "Agora";
  const date = parseDateValue(value, { assumeUtc: true });
  if (!date) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  }).format(date);
}
