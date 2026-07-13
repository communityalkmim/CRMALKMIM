import { randomBytes, timingSafeEqual } from "node:crypto";

const optionDefaults = {
  "leads.origin": ["Indicação", "Instagram", "Facebook", "Google", "WhatsApp", "Site", "Outro"],
  "leads.status": ["Novo", "Em contato", "Proposta", "Negociação", "Fechado", "Perdido"],
  "pending.type": ["Documentos", "Retorno", "Assinatura", "Pagamento", "Informação", "Outro"],
  "pending.status": ["Pendente", "Em andamento", "Concluída"],
  "tasks.type": ["Ligação", "Reunião", "E-mail", "Administrativa", "Atendimento", "Pessoal"],
  "tasks.category": ["Comercial", "Operacional", "Financeiro", "Relacionamento", "Pessoal"],
  "tasks.priority": ["Baixa", "Média", "Alta"],
  "tasks.status": ["Pendente", "Em andamento", "Concluída"],
  "payments.status": ["A receber", "Recebido", "Cancelado"],
  "followup.template": [
    "Olá, {nome}! Tudo bem? Estou passando para dar continuidade ao seu atendimento.",
    "Olá, {nome}! Consegue me enviar os documentos pendentes para avançarmos?",
    "Olá, {nome}! Sua vigência está próxima. Posso te ajudar com a renovação?"
  ]
};

const entityConfig = {
  plans: { table: "plans" },
  leads: { table: "leads" },
  appointments: { table: "appointments" },
  pending: { table: "pending_items" },
  tasks: { table: "tasks" },
  followups: { table: "followups" }
};

const ACCESS_COOKIE = "__Host-crm_access";
const REFRESH_COOKIE = "__Host-crm_refresh";
const CSRF_COOKIE = "__Host-crm_csrf";
const ACCESS_MAX_AGE = 60 * 55;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;
const CSRF_MAX_AGE = REFRESH_MAX_AGE;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const optionGroups = new Set(Object.keys(optionDefaults));
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const MAX_PAGE_LIMIT = 500;

function env(name) {
  return process.env[name] || "";
}

function requireConfig() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error("Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY nas variáveis do provedor.");
  }
  return { url: url.replace(/\/$/, ""), key };
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        return [
          decodeURIComponent(index >= 0 ? item.slice(0, index) : item),
          decodeURIComponent(index >= 0 ? item.slice(index + 1) : "")
        ];
      })
  );
}

function cookie(name, value, maxAge) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAge}`
  ];
  return parts.join("; ");
}

function csrfToken() {
  return randomBytes(32).toString("base64url");
}

function csrfCookie(token) {
  return cookie(CSRF_COOKIE, token, CSRF_MAX_AGE);
}

function authCookies(session, csrf = csrfToken()) {
  return [
    cookie(ACCESS_COOKIE, session.access_token, ACCESS_MAX_AGE),
    cookie(REFRESH_COOKIE, session.refresh_token, REFRESH_MAX_AGE),
    csrfCookie(csrf)
  ];
}

function clearCookies() {
  return [
    cookie(ACCESS_COOKIE, "", 0),
    cookie(REFRESH_COOKIE, "", 0),
    cookie(CSRF_COOKIE, "", 0)
  ];
}

function json(statusCode, payload, setCookies = []) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0"
    },
    setCookies,
    body: JSON.stringify(payload)
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário",
    username: user.email
  };
}

function apiError(error, fallback = "Não foi possível concluir a operação.") {
  const message = error?.message || error?.msg || fallback;
  const isSchemaError = ["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code)
    || /schema cache|does not exist|column .* not found|relation .* not found/i.test(message);
  return {
    error: isSchemaError
      ? "O banco Supabase precisa ser atualizado. Execute supabase/ATUALIZAR-BANCO.sql no SQL Editor."
      : message
        .replace("Invalid login credentials", "E-mail ou senha inválidos.")
        .replace("Email not confirmed", "Confirme seu e-mail antes de entrar.")
        .replace("User already registered", "Este e-mail já está cadastrado."),
    code: error?.code || ""
  };
}

async function supabaseRequest(path, { method = "GET", token = "", body, query, prefer } = {}) {
  const { url, key } = requireConfig();
  const target = new URL(`${url}${path}`);
  if (query) {
    Object.entries(query).forEach(([name, value]) => {
      if (value !== undefined && value !== null) target.searchParams.set(name, String(value));
    });
  }
  const headers = {
    "apikey": key,
    "Content-Type": "application/json"
  };
  headers.Authorization = `Bearer ${token || key}`;
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(target, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || data?.error || response.statusText);
    error.status = response.status;
    error.code = data?.code || data?.error || "";
    throw error;
  }
  return data;
}

async function authRequest(path, body, token = "") {
  const { url, key } = requireConfig();
  const headers = { "apikey": key, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error_description || data.msg || data.message || data.error || response.statusText);
    error.status = response.status;
    error.code = data.error || "";
    throw error;
  }
  return data;
}

async function getUserByToken(token) {
  const { url, key } = requireConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${token}`
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.msg || data.message || data.error || "Sessão expirada. Entre novamente.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function readSession(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  let accessToken = cookies[ACCESS_COOKIE];
  const refreshToken = cookies[REFRESH_COOKIE];
  const csrf = cookies[CSRF_COOKIE] || csrfToken();
  const setCookies = [];
  if (!cookies[CSRF_COOKIE]) setCookies.push(csrfCookie(csrf));
  if (!accessToken && !refreshToken) throw new Error("Sessão expirada. Entre novamente.");

  try {
    const user = await getUserByToken(accessToken);
    return { accessToken, refreshToken, csrfToken: csrf, user, setCookies };
  } catch (error) {
    if (!refreshToken) throw error;
  }

  const refreshed = await authRequest("/auth/v1/token?grant_type=refresh_token", { refresh_token: refreshToken });
  accessToken = refreshed.access_token;
  setCookies.push(...authCookies(refreshed, csrf));
  const user = await getUserByToken(accessToken);
  return { accessToken, refreshToken: refreshed.refresh_token, csrfToken: csrf, user, setCookies };
}

function parseBody(rawBody) {
  if (!rawBody) return {};
  return typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
}

function parsePath(rawPath = "/api") {
  const url = new URL(rawPath, "https://crm.local");
  return { pathname: url.pathname, searchParams: url.searchParams };
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function headerValue(headers, name) {
  const expected = name.toLowerCase();
  const found = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === expected);
  return found?.[1] || "";
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyCsrf({ path, method, headers, cookies }) {
  if (!MUTATING_METHODS.has(method) || path === "/api/login") return;
  const sent = headerValue(headers, "x-csrf-token");
  const stored = cookies[CSRF_COOKIE];
  if (!sent || !stored || !safeEqual(sent, stored)) {
    throw httpError("Token CSRF inválido. Atualize a página e tente novamente.", 403);
  }
}

function clientIp(headers = {}) {
  const forwarded = String(headerValue(headers, "x-forwarded-for") || "");
  return forwarded.split(",")[0].trim()
    || String(headerValue(headers, "x-real-ip") || "").trim()
    || "unknown";
}

function rateLimitKey(headers, email) {
  return `${clientIp(headers)}:${String(email || "").toLowerCase()}`;
}

export function checkLoginRateLimit({ key, now = Date.now() }) {
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  if (current.count >= LOGIN_MAX_ATTEMPTS) {
    throw httpError("Muitas tentativas de login. Aguarde alguns minutos e tente novamente.", 429);
  }
  current.count += 1;
}

function clearLoginRateLimit(key) {
  loginAttempts.delete(key);
}

function cleanString(value, maxLength, field, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw httpError(`O campo ${field} é obrigatório.`);
    return null;
  }
  const text = String(value).replace(/\u0000/g, "").trim();
  if (!text) {
    if (required) throw httpError(`O campo ${field} é obrigatório.`);
    return null;
  }
  if (text.length > maxLength) throw httpError(`O campo ${field} deve ter no máximo ${maxLength} caracteres.`);
  return text;
}

function requiredText(value, field, maxLength = 120) {
  return cleanString(value, maxLength, field, { required: true });
}

function optionalText(value, field, maxLength = 500) {
  return cleanString(value, maxLength, field);
}

function optionalEmail(value) {
  const email = optionalText(value, "email", 160);
  if (email && !emailPattern.test(email)) throw httpError("Informe um e-mail válido.");
  return email;
}

function uuid(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw httpError(`O campo ${field} é obrigatório.`);
    return null;
  }
  const id = String(value).trim();
  if (!uuidPattern.test(id)) throw httpError(`O campo ${field} é inválido.`);
  return id;
}

function dateValue(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw httpError(`O campo ${field} é obrigatório.`);
    return null;
  }
  const date = String(value).trim();
  if (!datePattern.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) {
    throw httpError(`O campo ${field} deve estar no formato AAAA-MM-DD.`);
  }
  return date;
}

function timeValue(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const time = String(value).trim().slice(0, 5);
  if (!timePattern.test(time)) throw httpError(`O campo ${field} deve estar no formato HH:MM.`);
  return time;
}

function numberValue(value, field, { required = false, min = 0, max = 999999999 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw httpError(`O campo ${field} é obrigatório.`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw httpError(`O campo ${field} possui valor inválido.`);
  }
  return number;
}

function integerValue(value, field, options = {}) {
  const number = numberValue(value, field, options);
  return number === null ? null : Math.trunc(number);
}

function booleanValue(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

const entitySchemas = {
  plans: {
    name: { required: true, validate: (value) => requiredText(value, "nome do plano", 120) },
    commission_percent: { required: true, validate: (value) => numberValue(value, "percentual de comissão", { required: true, min: 0, max: 1000 }) }
  },
  leads: {
    name: { required: true, validate: (value) => requiredText(value, "nome", 160) },
    phone: { validate: (value) => optionalText(value, "telefone", 30) },
    email: { validate: optionalEmail },
    origin: { validate: (value) => optionalText(value, "origem", 80) },
    entry_date: { required: true, validate: (value) => dateValue(value, "data de entrada", { required: true }) },
    contact_date: { validate: (value) => dateValue(value, "data de contato") },
    effective_date: { validate: (value) => dateValue(value, "data de vigência") },
    plan_id: { validate: (value) => uuid(value, "plano") },
    plan_value: { validate: (value) => numberValue(value, "valor do plano", { min: 0, max: 999999999 }) },
    status: { required: true, validate: (value) => requiredText(value, "status", 80) },
    has_bonus: { validate: booleanValue },
    bonus_description: { validate: (value) => optionalText(value, "descrição da premiação", 200) },
    bonus_value: { validate: (value) => numberValue(value, "valor da premiação", { min: 0, max: 999999999 }) },
    payment_status: { validate: (value) => optionalText(value, "status financeiro", 80) || "A receber" },
    notes: { validate: (value) => optionalText(value, "observações", 4000) }
  },
  appointments: {
    title: { required: true, validate: (value) => requiredText(value, "título", 160) },
    lead_id: { validate: (value) => uuid(value, "lead") },
    date: { required: true, validate: (value) => dateValue(value, "data", { required: true }) },
    time: { validate: (value) => timeValue(value, "horário") },
    reminder: { validate: (value) => integerValue(value, "lembrete", { min: 0, max: 10080 }) },
    completed: { validate: booleanValue },
    notes: { validate: (value) => optionalText(value, "observações", 2000) }
  },
  pending: {
    lead_id: { required: true, validate: (value) => uuid(value, "lead", { required: true }) },
    type: { required: true, validate: (value) => requiredText(value, "tipo", 80) },
    due_date: { validate: (value) => dateValue(value, "prazo") },
    priority: { required: true, validate: (value) => requiredText(value, "prioridade", 40) },
    status: { required: true, validate: (value) => requiredText(value, "status", 80) },
    description: { validate: (value) => optionalText(value, "descrição", 4000) }
  },
  tasks: {
    title: { required: true, validate: (value) => requiredText(value, "título", 160) },
    type: { validate: (value) => optionalText(value, "tipo", 80) },
    category: { validate: (value) => optionalText(value, "categoria", 80) },
    lead_id: { validate: (value) => uuid(value, "cliente") },
    date: { required: true, validate: (value) => dateValue(value, "data", { required: true }) },
    time: { validate: (value) => timeValue(value, "horário") },
    priority: { required: true, validate: (value) => requiredText(value, "prioridade", 40) },
    status: { required: true, validate: (value) => requiredText(value, "status", 80) },
    notes: { validate: (value) => optionalText(value, "observação", 3000) }
  },
  followups: {
    lead_id: { required: true, validate: (value) => uuid(value, "lead", { required: true }) },
    message: { required: true, validate: (value) => requiredText(value, "mensagem", 4000) },
    channel: { validate: (value) => optionalText(value, "canal", 40) || "WhatsApp" },
    status: { validate: (value) => optionalText(value, "status", 80) || "Rascunho" }
  }
};

export function validateEntityPayload(entity, body, { partial = false } = {}) {
  const schema = entitySchemas[entity];
  if (!schema) throw httpError("Entidade inválida.");
  const payload = {};
  for (const key of Object.keys(body || {})) {
    if (!schema[key]) throw httpError(`Campo não permitido: ${key}.`);
  }
  for (const [field, config] of Object.entries(schema)) {
    const hasValue = Object.prototype.hasOwnProperty.call(body || {}, field);
    if (!hasValue) {
      if (!partial && config.required) throw httpError(`O campo ${field} é obrigatório.`);
      continue;
    }
    payload[field] = config.validate(body[field]);
  }
  if (partial && !Object.keys(payload).length) throw httpError("Nenhuma alteração informada.");
  return payload;
}

function validateOptionGroup(module, field) {
  const cleanModule = requiredText(module, "módulo", 40);
  const cleanField = requiredText(field, "campo", 40);
  if (!optionGroups.has(`${cleanModule}.${cleanField}`)) throw httpError("Grupo de opção inválido.");
  return { module: cleanModule, field: cleanField };
}

function restValue(value) {
  return typeof value === "string" ? value.replace(/"/g, '\\"') : value;
}

async function restSelect(table, token, { select = "*", order = [], filters = {}, limit, offset } = {}) {
  const query = { select };
  Object.entries(filters).forEach(([column, value]) => {
    query[column] = `eq.${restValue(value)}`;
  });
  if (order.length) query.order = order.join(",");
  if (limit) query.limit = limit;
  if (offset !== undefined) query.offset = offset;
  return supabaseRequest(`/rest/v1/${table}`, { token, query });
}

function paginationFrom(searchParams = new URLSearchParams()) {
  const rawLimit = Number(searchParams.get("limit") || 0);
  const rawPage = Number(searchParams.get("page") || 0);
  const rawOffset = Number(searchParams.get("offset") || 0);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.trunc(rawLimit), MAX_PAGE_LIMIT)
    : undefined;
  if (!limit) return {};
  const offset = Number.isFinite(rawOffset) && rawOffset > 0
    ? Math.trunc(rawOffset)
    : Number.isFinite(rawPage) && rawPage > 1
      ? (Math.trunc(rawPage) - 1) * limit
      : 0;
  return { limit, offset };
}

async function restInsert(table, token, payload, select = "id") {
  const data = await supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    token,
    body: payload,
    query: { select },
    prefer: "return=representation"
  });
  return Array.isArray(data) ? data[0] : data;
}

async function restUpdate(table, token, id, payload) {
  await supabaseRequest(`/rest/v1/${table}`, {
    method: "PATCH",
    token,
    body: payload,
    query: { id: `eq.${id}` },
    prefer: "return=minimal"
  });
  return { ok: true };
}

async function restDelete(table, token, id) {
  await supabaseRequest(`/rest/v1/${table}`, {
    method: "DELETE",
    token,
    query: { id: `eq.${id}` },
    prefer: "return=minimal"
  });
  return { ok: true };
}

async function ensureDefaultOptions(token, userId) {
  const existing = await restSelect("option_values", token, { select: "module,field,value" });
  const known = new Set((existing || []).map((item) => `${item.module}.${item.field}.${item.value}`));
  const rows = [];
  for (const [group, values] of Object.entries(optionDefaults)) {
    const [module, field] = group.split(".");
    values.forEach((value, sort_order) => {
      if (!known.has(`${module}.${field}.${value}`)) {
        rows.push({ user_id: userId, module, field, value, sort_order });
      }
    });
  }
  if (rows.length) {
    await supabaseRequest("/rest/v1/option_values", {
      method: "POST",
      token,
      body: rows,
      prefer: "resolution=ignore-duplicates"
    });
  }
}

async function selectEntity(entity, token, { pagination = {} } = {}) {
  const table = entityConfig[entity].table;
  const relationSelect = {
    appointments: "*,leads(name)",
    pending: "*,leads(name,phone)",
    tasks: "*,leads(name)",
    followups: "*,leads(name,phone,status)"
  };
  const order = {
    plans: ["name.asc"],
    appointments: ["date.asc", "time.asc"],
    tasks: ["date.asc", "time.asc"],
    pending: ["due_date.asc"],
    leads: ["created_at.desc"],
    followups: ["created_at.desc"]
  }[entity] || ["created_at.desc"];
  const data = await restSelect(table, token, { select: relationSelect[entity] || "*", order, ...pagination });
  return (data || []).map((row) => {
    const lead = row.leads;
    const result = { ...row };
    delete result.leads;
    if (lead) {
      result.lead_name = lead.name;
      result.lead_phone = lead.phone;
      result.lead_status = lead.status;
    }
    if (typeof result.time === "string") result.time = result.time.slice(0, 5);
    return result;
  });
}

export function applyPlanRulePayload(payload, plan) {
  if (!payload.plan_id) {
    if (Number(payload.plan_value || 0) > 0) {
      throw httpError("Preencha o plano escolhido antes de salvar o lead.");
    }
    return {
      ...payload,
      plan_id: null,
      plan_name: null,
      plan_value: 0,
      commission_percent: 0,
      commission: 0,
      has_bonus: false,
      bonus_description: null,
      bonus_value: 0,
      payment_status: "A receber"
    };
  }
  if (!plan) throw new Error("Plano nao encontrado.");
  const planValue = Number(payload.plan_value || 0);
  if (planValue <= 0) throw new Error("Informe o valor fechado do plano.");
  const commissionPercent = Number(plan.commission_percent || 0);
  const hasBonus = Boolean(payload.has_bonus);
  const bonusValue = hasBonus ? Number(payload.bonus_value || 0) : 0;
  if (hasBonus && bonusValue <= 0) throw new Error("Informe o valor da premiacao.");
  return {
    ...payload,
    plan_name: plan.name,
    plan_value: planValue,
    commission_percent: commissionPercent,
    commission: Math.round(planValue * commissionPercent) / 100,
    has_bonus: hasBonus,
    bonus_description: hasBonus ? payload.bonus_description || null : null,
    bonus_value: bonusValue,
    payment_status: payload.payment_status || "A receber"
  };
}

async function applyPlanRule(token, payload) {
  if (!Object.prototype.hasOwnProperty.call(payload, "plan_id")) {
    if (Number(payload.plan_value || 0) > 0) {
      throw httpError("Preencha o plano escolhido antes de salvar o lead.");
    }
    return payload;
  }
  if (!payload.plan_id) return applyPlanRulePayload(payload);
  const plans = await restSelect("plans", token, {
    select: "id,name,commission_percent",
    filters: { id: payload.plan_id },
    limit: 1
  });
  const plan = plans?.[0];
  return applyPlanRulePayload(payload, plan);
}

async function createEntity(entity, body, session) {
  const table = entityConfig[entity].table;
  let payload = { ...validateEntityPayload(entity, body), user_id: session.user.id };
  if (entity === "leads") payload = await applyPlanRule(session.accessToken, payload);
  const data = await restInsert(table, session.accessToken, payload);
  return { id: data.id };
}

async function updateEntity(entity, id, body, session) {
  uuid(id, "id", { required: true });
  const table = entityConfig[entity].table;
  let payload = validateEntityPayload(entity, body, { partial: true });
  if (entity === "leads") payload = await applyPlanRule(session.accessToken, payload);
  if (["plans", "leads"].includes(entity)) payload.updated_at = new Date().toISOString();
  return restUpdate(table, session.accessToken, id, payload);
}

async function deleteEntity(entity, id, session) {
  uuid(id, "id", { required: true });
  try {
    return await restDelete(entityConfig[entity].table, session.accessToken, id);
  } catch (error) {
    if (error.code === "23503" && entity === "plans") {
      throw new Error("Este plano está vinculado a um ou mais leads e não pode ser excluído.");
    }
    throw error;
  }
}

async function listOptions(session) {
  await ensureDefaultOptions(session.accessToken, session.user.id);
  const rows = await restSelect("option_values", session.accessToken, {
    select: "id,module,field,value,sort_order",
    order: ["module.asc", "field.asc", "sort_order.asc"]
  });
  return (rows || []).reduce((groups, row) => {
    const key = `${row.module}.${row.field}`;
    (groups[key] ||= []).push(row);
    return groups;
  }, {});
}

async function createOption(body, session) {
  const { module, field } = validateOptionGroup(body.module, body.field);
  const existing = await restSelect("option_values", session.accessToken, {
    select: "sort_order",
    filters: { module, field },
    order: ["sort_order.desc"],
    limit: 1
  });
  const sort_order = existing?.[0] ? Number(existing[0].sort_order) + 1 : 0;
  const value = requiredText(body.value, "opção", 80);
  const data = await restInsert("option_values", session.accessToken, {
    user_id: session.user.id,
    module,
    field,
    value,
    sort_order
  });
  return { id: data.id };
}

async function rpc(name, token, body) {
  await supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    token,
    body,
    prefer: "return=minimal"
  });
  return { ok: true };
}

async function dashboardData(session) {
  const [leads, pending, tasks, appointments, options] = await Promise.all([
    selectEntity("leads", session.accessToken),
    selectEntity("pending", session.accessToken),
    selectEntity("tasks", session.accessToken),
    selectEntity("appointments", session.accessToken),
    listOptions(session)
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const leadStatuses = (options["leads.status"] || []).map((item) => item.value);
  const finalPending = (options["pending.status"] || []).at(-1)?.value || "Concluída";
  const finalTask = (options["tasks.status"] || []).at(-1)?.value || "Concluída";
  const closed = new Set(["Fechado", "Convertido"]);
  const countBy = (items, field, fallback) => {
    const counts = new Map();
    items.forEach((item) => {
      const key = item[field] || fallback;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const agenda = [
    ...appointments.filter((item) => item.date >= today).map((item) => ({
      kind: "appointment", id: item.id, title: item.title, date: item.date,
      time: item.time, done: item.completed, lead_name: item.lead_name
    })),
    ...tasks.filter((item) => item.date >= today).map((item) => ({
      kind: "task", id: item.id, title: item.title, date: item.date,
      time: item.time, done: item.status === finalTask, lead_name: item.lead_name
    }))
  ].sort((a, b) => `${a.date}${a.time || ""}`.localeCompare(`${b.date}${b.time || ""}`)).slice(0, 7);
  return {
    stats: {
      leads: leads.length,
      newLeads: leads.filter((item) => leadStatuses.slice(0, 2).includes(item.status)).length,
      pending: pending.filter((item) => item.status !== finalPending).length,
      tasksToday: tasks.filter((item) => item.date === today && item.status !== finalTask).length,
      commission: leads.filter((item) => closed.has(item.status)).reduce((sum, item) => sum + Number(item.commission || 0), 0)
    },
    funnel: countBy(leads, "status", "Não informado"),
    origins: countBy(leads, "origin", "Não informada").slice(0, 6),
    agenda
  };
}

async function route(path, method, body, session, searchParams = new URLSearchParams()) {
  if (path === "/api/session" && method === "GET") {
    await ensureDefaultOptions(session.accessToken, session.user.id);
    return { user: publicUser(session.user), csrfToken: session.csrfToken };
  }
  if (path === "/api/dashboard" && method === "GET") return dashboardData(session);
  if (path === "/api/options" && method === "GET") return listOptions(session);
  if (path === "/api/options" && method === "POST") return createOption(body, session);

  const optionMatch = path.match(/^\/api\/options\/([^/]+)$/);
  if (optionMatch && method === "PUT") {
    uuid(optionMatch[1], "id", { required: true });
    return rpc("rename_option_value", session.accessToken, {
      p_option_id: optionMatch[1],
      p_new_value: requiredText(body.value, "opção", 80)
    });
  }
  if (optionMatch && method === "DELETE") {
    uuid(optionMatch[1], "id", { required: true });
    return rpc("delete_option_value", session.accessToken, { p_option_id: optionMatch[1] });
  }

  const entityMatch = path.match(/^\/api\/(plans|leads|appointments|pending|tasks|followups)(?:\/([^/]+))?$/);
  if (!entityMatch) throw new Error("Rota não encontrada.");
  const [, entity, id] = entityMatch;
  if (method === "GET" && !id) return selectEntity(entity, session.accessToken, { pagination: paginationFrom(searchParams) });
  if (method === "POST" && !id) return createEntity(entity, body, session);
  if (method === "PUT" && id) return updateEntity(entity, id, body, session);
  if (method === "DELETE" && id) return deleteEntity(entity, id, session);
  throw new Error("Método não permitido.");
}

export async function handleApiRequest({ path, method, headers = {}, body }) {
  try {
    const parsed = parsePath(path);
    const normalizedPath = parsed.pathname.startsWith("/api") ? parsed.pathname : `/api${parsed.pathname.startsWith("/") ? parsed.pathname : `/${parsed.pathname}`}`;
    const normalizedMethod = String(method || "GET").toUpperCase();
    const payload = parseBody(body);
    const cookies = parseCookies(headers.cookie || headers.Cookie || "");

    if (normalizedPath === "/api/login" && normalizedMethod === "POST") {
      const email = String(payload.username || "").trim();
      const password = payload.password || "";
      if (!emailPattern.test(email) || !password) throw httpError("Informe e-mail e senha válidos.");
      const loginKey = rateLimitKey(headers, email);
      checkLoginRateLimit({ key: loginKey });
      const session = await authRequest("/auth/v1/token?grant_type=password", { email, password });
      clearLoginRateLimit(loginKey);
      const csrf = csrfToken();
      await ensureDefaultOptions(session.access_token, session.user.id);
      return json(200, { user: publicUser(session.user), csrfToken: csrf }, authCookies(session, csrf));
    }

    verifyCsrf({ path: normalizedPath, method: normalizedMethod, headers, cookies });

    if (normalizedPath === "/api/logout" && normalizedMethod === "POST") {
      if (cookies[ACCESS_COOKIE]) {
        await authRequest("/auth/v1/logout", {}, cookies[ACCESS_COOKIE]).catch(() => null);
      }
      return json(200, { ok: true }, clearCookies());
    }

    const session = await readSession(headers.cookie || headers.Cookie || "");
    const data = await route(normalizedPath, normalizedMethod, payload, session, parsed.searchParams);
    return json(200, data, session.setCookies);
  } catch (error) {
    const status = error?.status || (/sessão|session|jwt/i.test(error?.message || "") ? 401 : 400);
    const cookies = status === 401 ? clearCookies() : [];
    return json(status, apiError(error), cookies);
  }
}
