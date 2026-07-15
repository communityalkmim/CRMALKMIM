import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

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

const defaultPlanNames = [
  "Amil", "Vera Cruz", "Hapvida", "Medsênior", "SulAmérica",
  "Bradesco Saúde", "Porto Saúde", "Uniodonto", "Amil Dental", "Santa Tereza"
];
const planSegments = new Set(["Adesão/PF", "PME"]);
const financialStatuses = new Set(["A receber", "Recebido", "Cancelado"]);

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
const UPSTREAM_TIMEOUT_MS = 12_000;
const SESSION_CACHE_TTL_MS = 30_000;
const SESSION_CACHE_MAX = 200;
const userSessionCache = new Map();

export function initialLeadStatus(optionRows = []) {
  return optionRows[0]?.value || "Novo";
}

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
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0"
    },
    setCookies,
    body: JSON.stringify(payload)
  };
}

function tokenCacheKey(token) {
  return createHash("sha256").update(token).digest("hex");
}

function pruneSessionCache(now = Date.now()) {
  for (const [key, entry] of userSessionCache) {
    if (entry.expiresAt <= now) userSessionCache.delete(key);
  }
  while (userSessionCache.size > SESSION_CACHE_MAX) {
    userSessionCache.delete(userSessionCache.keys().next().value);
  }
}

async function fetchUpstream(url, options = {}, { retries = 0 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (attempt < retries && [429, 502, 503, 504].includes(response.status)) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        if (error?.name === "AbortError") {
          throw httpError("O serviço demorou para responder. Tente novamente.", 504);
        }
        throw httpError("Não foi possível conectar ao serviço de dados.", 503);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
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
  const response = await fetchUpstream(target, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  }, { retries: method === "GET" ? 1 : 0 });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    if (!response.ok) throw httpError("O serviço de dados retornou uma resposta inválida.", 502);
  }
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
  const response = await fetchUpstream(`${url}${path}`, {
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
  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw httpError("Sessão expirada. Entre novamente.", 401);
  }
  const now = Date.now();
  const cacheKey = tokenCacheKey(token);
  const cached = userSessionCache.get(cacheKey);
  if (cached?.expiresAt > now) return cached.user;
  if (cached) userSessionCache.delete(cacheKey);

  const { url, key } = requireConfig();
  const response = await fetchUpstream(`${url}/auth/v1/user`, {
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${token}`
    }
  }, { retries: 1 });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.msg || data.message || data.error || "Sessão expirada. Entre novamente.");
    error.status = response.status;
    throw error;
  }
  userSessionCache.set(cacheKey, { user: data, expiresAt: now + SESSION_CACHE_TTL_MS });
  pruneSessionCache(now);
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

  if (accessToken) {
    try {
      const user = await getUserByToken(accessToken);
      return { accessToken, refreshToken, csrfToken: csrf, user, setCookies };
    } catch (error) {
      if (!refreshToken) throw error;
    }
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

export function verifySameOriginRequest({ method, headers = {} }) {
  if (!MUTATING_METHODS.has(method)) return;
  const fetchSite = String(headerValue(headers, "sec-fetch-site") || "").toLowerCase();
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw httpError("Requisição de outra origem bloqueada.", 403);
  }

  const origin = headerValue(headers, "origin");
  const forwardedHost = String(headerValue(headers, "x-forwarded-host") || "").split(",")[0].trim();
  const host = forwardedHost || headerValue(headers, "host");
  if (origin && host) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      throw httpError("Origem da requisição inválida.", 403);
    }
    if (originHost !== host) throw httpError("Requisição de outra origem bloqueada.", 403);
  }
}

export function verifyJsonRequest({ method, headers = {} }) {
  if (!MUTATING_METHODS.has(method)) return;
  const contentType = String(headerValue(headers, "content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw httpError("Envie os dados no formato JSON.", 415);
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
    segment: {
      required: true,
      validate: (value) => {
        const segment = requiredText(value, "segmento", 40);
        if (!planSegments.has(segment)) throw httpError("Segmento de plano inválido.");
        return segment;
      }
    },
    commission_1_percent: { required: true, validate: (value) => numberValue(value, "comissão da parcela 1", { required: true, min: 0, max: 1000 }) },
    commission_2_percent: { required: true, validate: (value) => numberValue(value, "comissão da parcela 2", { required: true, min: 0, max: 1000 }) },
    commission_3_percent: { required: true, validate: (value) => numberValue(value, "comissão da parcela 3", { required: true, min: 0, max: 1000 }) }
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

async function restDeleteWhere(table, token, filters) {
  const query = {};
  Object.entries(filters).forEach(([column, value]) => {
    query[column] = `eq.${restValue(value)}`;
  });
  await supabaseRequest(`/rest/v1/${table}`, {
    method: "DELETE",
    token,
    query,
    prefer: "return=minimal"
  });
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

async function ensureDefaultPlans(token, userId) {
  const existing = await restSelect("plans", token, { select: "id", limit: 1 });
  if (existing?.length) return;
  const rows = [...planSegments].flatMap((segment) => defaultPlanNames.map((name) => ({
    user_id: userId,
    segment,
    name,
    commission_percent: 0,
    commission_1_percent: 0,
    commission_2_percent: 0,
    commission_3_percent: 0
  })));
  await supabaseRequest("/rest/v1/plans", {
    method: "POST",
    token,
    body: rows,
    prefer: "resolution=ignore-duplicates"
  });
}

async function selectEntity(entity, token, { pagination = {}, filters = {}, select } = {}) {
  const table = entityConfig[entity].table;
  const relationSelect = {
    appointments: "*,leads(name)",
    pending: "*,leads(name,phone)",
    tasks: "*,leads(name)",
    followups: "*,leads(name,phone,status)"
  };
  const order = {
    plans: ["segment.asc", "name.asc"],
    appointments: ["date.asc", "time.asc"],
    tasks: ["date.asc", "time.asc"],
    pending: ["due_date.asc"],
    leads: ["created_at.desc"],
    followups: ["created_at.desc"]
  }[entity] || ["created_at.desc"];
  const data = await restSelect(table, token, {
    select: select || relationSelect[entity] || "*",
    order,
    filters,
    ...pagination
  });
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
      plan_segment: null,
      plan_value: 0,
      commission_percent: 0,
      commission_1_percent: 0,
      commission_2_percent: 0,
      commission_3_percent: 0,
      commission: 0,
      commission_1: 0,
      commission_2: 0,
      commission_3: 0,
      has_bonus: false,
      bonus_description: null,
      bonus_value: 0,
      payment_status: "A receber"
    };
  }
  if (!plan) throw new Error("Plano nao encontrado.");
  const planValue = Number(payload.plan_value || 0);
  if (planValue <= 0) throw new Error("Informe o valor fechado do plano.");
  const commissionPercents = [
    Number(plan.commission_1_percent ?? plan.commission_percent ?? 0),
    Number(plan.commission_2_percent || 0),
    Number(plan.commission_3_percent || 0)
  ];
  const commissions = commissionPercents.map((percent) => Math.round(planValue * percent) / 100);
  const commissionPercent = commissionPercents.reduce((sum, percent) => sum + percent, 0);
  const hasBonus = Boolean(payload.has_bonus);
  const bonusValue = hasBonus ? Number(payload.bonus_value || 0) : 0;
  if (hasBonus && bonusValue <= 0) throw new Error("Informe o valor da premiacao.");
  return {
    ...payload,
    plan_name: plan.name,
    plan_segment: plan.segment || "Adesão/PF",
    plan_value: planValue,
    commission_percent: commissionPercent,
    commission_1_percent: commissionPercents[0],
    commission_2_percent: commissionPercents[1],
    commission_3_percent: commissionPercents[2],
    commission: commissions.reduce((sum, value) => sum + value, 0),
    commission_1: commissions[0],
    commission_2: commissions[1],
    commission_3: commissions[2],
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
    select: "id,name,segment,commission_percent,commission_1_percent,commission_2_percent,commission_3_percent",
    filters: { id: payload.plan_id },
    limit: 1
  });
  const plan = plans?.[0];
  return applyPlanRulePayload(payload, plan);
}

export function addMonths(dateValue, months) {
  if (!dateValue) return null;
  const source = new Date(`${dateValue}T12:00:00Z`);
  const originalDay = source.getUTCDate();
  source.setUTCDate(1);
  source.setUTCMonth(source.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0)).getUTCDate();
  source.setUTCDate(Math.min(originalDay, lastDay));
  return source.toISOString().slice(0, 10);
}

export function fortnightPaymentDate(dateValue) {
  if (!dateValue) return null;
  const source = new Date(`${dateValue}T12:00:00Z`);
  if (Number.isNaN(source.getTime())) return null;
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const payoutDay = day <= 15 ? 15 : new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, payoutDay)).toISOString().slice(0, 10);
}

async function syncLeadPayments(token, lead) {
  const baseDate = lead.effective_date || lead.contact_date || lead.entry_date || null;
  if (!lead.plan_id) {
    await restDeleteWhere("lead_payments", token, { lead_id: lead.id, kind: "commission" });
  } else {
    const rows = [1, 2, 3].map((installment) => {
      const dueDate = addMonths(baseDate, installment - 1);
      return {
      user_id: lead.user_id,
      lead_id: lead.id,
      kind: "commission",
      installment,
      due_date: dueDate,
      expected_payment_date: fortnightPaymentDate(dueDate),
      percent: Number(lead[`commission_${installment}_percent`] || 0),
      source_amount: Number(lead.plan_value || 0),
      amount: Number(lead[`commission_${installment}`] || 0),
      updated_at: new Date().toISOString()
      };
    });
    await supabaseRequest("/rest/v1/lead_payments", {
      method: "POST",
      token,
      body: rows,
      query: { on_conflict: "user_id,lead_id,kind,installment" },
      prefer: "resolution=merge-duplicates"
    });
  }

  if (!lead.has_bonus || Number(lead.bonus_value || 0) <= 0) {
    await restDeleteWhere("lead_payments", token, { lead_id: lead.id, kind: "bonus" });
  } else {
    await supabaseRequest("/rest/v1/lead_payments", {
      method: "POST",
      token,
      body: [{
        user_id: lead.user_id,
        lead_id: lead.id,
        kind: "bonus",
        installment: 0,
        due_date: baseDate,
        expected_payment_date: fortnightPaymentDate(baseDate),
        percent: null,
        source_amount: Number(lead.bonus_value),
        amount: Number(lead.bonus_value),
        updated_at: new Date().toISOString()
      }],
      query: { on_conflict: "user_id,lead_id,kind,installment" },
      prefer: "resolution=merge-duplicates"
    });
  }
}

async function createEntity(entity, body, session) {
  const table = entityConfig[entity].table;
  const createBody = entity === "leads" && !Object.prototype.hasOwnProperty.call(body, "status")
    ? { ...body, status: "Novo" }
    : body;
  let payload = { ...validateEntityPayload(entity, createBody), user_id: session.user.id };
  if (entity === "plans") payload.commission_percent = payload.commission_1_percent;
  if (entity === "leads") {
    const statusOptions = await restSelect("option_values", session.accessToken, {
      select: "value",
      filters: { module: "leads", field: "status" },
      order: ["sort_order.asc"],
      limit: 1
    });
    payload.status = initialLeadStatus(statusOptions);
    payload = await applyPlanRule(session.accessToken, payload);
  }
  const data = await restInsert(table, session.accessToken, payload);
  if (entity === "leads") await syncLeadPayments(session.accessToken, { ...payload, id: data.id });
  return { id: data.id };
}

async function updateEntity(entity, id, body, session) {
  uuid(id, "id", { required: true });
  const table = entityConfig[entity].table;
  let payload = validateEntityPayload(entity, body, { partial: true });
  let syncedLead = null;
  if (entity === "plans" && Object.prototype.hasOwnProperty.call(payload, "commission_1_percent")) {
    payload.commission_percent = payload.commission_1_percent;
  }
  if (entity === "leads") {
    const existing = (await restSelect("leads", session.accessToken, { filters: { id }, limit: 1 }))?.[0];
    if (!existing) throw httpError("Lead não encontrado.", 404);
    syncedLead = await applyPlanRule(session.accessToken, { ...existing, ...payload });
    const financialFields = [
      "plan_id", "plan_name", "plan_segment", "plan_value", "commission_percent",
      "commission_1_percent", "commission_2_percent", "commission_3_percent",
      "commission", "commission_1", "commission_2", "commission_3",
      "has_bonus", "bonus_description", "bonus_value", "payment_status"
    ];
    payload = {
      ...payload,
      ...Object.fromEntries(financialFields.map((field) => [field, syncedLead[field]]))
    };
  }
  if (["plans", "leads"].includes(entity)) payload.updated_at = new Date().toISOString();
  const result = await restUpdate(table, session.accessToken, id, payload);
  if (entity === "leads") {
    await syncLeadPayments(session.accessToken, { ...syncedLead, id, user_id: session.user.id, ...payload });
  }
  return result;
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

function businessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
  const [leads, pending, tasks, appointments, options, plans] = await Promise.all([
    selectEntity("leads", session.accessToken),
    selectEntity("pending", session.accessToken, { select: "status,due_date" }),
    selectEntity("tasks", session.accessToken, { select: "id,title,date,time,status,leads(name)" }),
    selectEntity("appointments", session.accessToken, { select: "id,title,date,time,completed,leads(name)" }),
    listOptions(session),
    selectEntity("plans", session.accessToken)
  ]);
  const now = new Date();
  const today = businessDate(now);
  const tomorrow = businessDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));
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
    agenda,
    leads,
    options,
    plans,
    alerts: [
      { label: "Tarefas vencidas", value: tasks.filter((item) => item.date < today && item.status !== finalTask).length, filter: "tasks-overdue" },
      { label: "Tarefas de hoje", value: tasks.filter((item) => item.date === today && item.status !== finalTask).length, filter: "tasks-today" },
      { label: "Pendências vencidas", value: pending.filter((item) => item.due_date && item.due_date < today && item.status !== finalPending).length, filter: "pending-overdue" },
      { label: "Vigências até amanhã", value: leads.filter((item) => item.effective_date && item.effective_date >= today && item.effective_date <= tomorrow).length, filter: "lead-renewal" }
    ]
  };
}

async function listPayments(session) {
  const rows = await restSelect("lead_payments", session.accessToken, {
    select: "*,leads(name,phone,effective_date,plan_name,plan_segment,plan_value,bonus_description)",
    order: ["due_date.asc", "created_at.asc"]
  });
  return (rows || []).map((row) => {
    const lead = row.leads || {};
    const result = {
      ...row,
      lead_name: lead.name,
      lead_phone: lead.phone,
      effective_date: lead.effective_date,
      plan_name: lead.plan_name,
      plan_segment: lead.plan_segment,
      plan_value: lead.plan_value,
      bonus_description: lead.bonus_description
    };
    result.description = row.kind === "bonus" ? lead.bonus_description || "Premiação" : null;
    delete result.leads;
    return result;
  });
}

async function updatePayment(id, body, session) {
  uuid(id, "pagamento", { required: true });
  const status = requiredText(body.status, "status financeiro", 40);
  if (!financialStatuses.has(status)) throw httpError("Status financeiro inválido.");
  const current = (await restSelect("lead_payments", session.accessToken, {
    select: "id,lead_id",
    filters: { id },
    limit: 1
  }))?.[0];
  if (!current) throw httpError("Pagamento não encontrado.", 404);

  const receivedAt = status === "Recebido" ? new Date().toISOString() : null;
  await restUpdate("lead_payments", session.accessToken, id, {
    status,
    received_at: receivedAt,
    updated_at: new Date().toISOString()
  });
  const related = await restSelect("lead_payments", session.accessToken, {
    select: "status,amount",
    filters: { lead_id: current.lead_id }
  });
  const relevant = (related || []).filter((item) => Number(item.amount || 0) > 0);
  const aggregateStatus = relevant.length && relevant.every((item) => item.status === "Recebido")
    ? "Recebido"
    : relevant.length && relevant.every((item) => item.status === "Cancelado")
      ? "Cancelado"
      : "A receber";
  await restUpdate("leads", session.accessToken, current.lead_id, {
    payment_status: aggregateStatus,
    updated_at: new Date().toISOString()
  });
  return { ok: true, status, received_at: receivedAt, aggregateStatus };
}

function entityFilters(entity, searchParams) {
  const filters = {};
  const relationEntities = new Set(["appointments", "pending", "tasks", "followups"]);
  if (relationEntities.has(entity) && searchParams.has("lead_id")) {
    filters.lead_id = uuid(searchParams.get("lead_id"), "lead", { required: true });
  }
  if (["appointments", "tasks"].includes(entity) && searchParams.has("date")) {
    filters.date = dateValue(searchParams.get("date"), "data", { required: true });
  }
  return filters;
}

async function route(path, method, body, session, searchParams = new URLSearchParams()) {
  if (path === "/api/session" && method === "GET") {
    await Promise.all([
      ensureDefaultOptions(session.accessToken, session.user.id),
      ensureDefaultPlans(session.accessToken, session.user.id)
    ]);
    return { user: publicUser(session.user), csrfToken: session.csrfToken };
  }
  if (path === "/api/dashboard" && method === "GET") return dashboardData(session);
  if (path === "/api/options" && method === "GET") return listOptions(session);
  if (path === "/api/options" && method === "POST") return createOption(body, session);
  if (path === "/api/payments" && method === "GET") return listPayments(session);

  const paymentMatch = path.match(/^\/api\/payments\/([^/]+)$/);
  if (paymentMatch && method === "PUT") return updatePayment(paymentMatch[1], body, session);

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
  if (!entityMatch) throw httpError("Rota não encontrada.", 404);
  const [, entity, id] = entityMatch;
  if (method === "GET" && !id) {
    return selectEntity(entity, session.accessToken, {
      pagination: paginationFrom(searchParams),
      filters: entityFilters(entity, searchParams)
    });
  }
  if (method === "POST" && !id) return createEntity(entity, body, session);
  if (method === "PUT" && id) return updateEntity(entity, id, body, session);
  if (method === "DELETE" && id) return deleteEntity(entity, id, session);
  throw httpError("Método não permitido.", 405);
}

export async function handleApiRequest({ path, method, headers = {}, body }) {
  try {
    const parsed = parsePath(path);
    const normalizedPath = parsed.pathname.startsWith("/api") ? parsed.pathname : `/api${parsed.pathname.startsWith("/") ? parsed.pathname : `/${parsed.pathname}`}`;
    const normalizedMethod = String(method || "GET").toUpperCase();
    verifySameOriginRequest({ method: normalizedMethod, headers });
    verifyJsonRequest({ method: normalizedMethod, headers });
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
      await Promise.all([
        ensureDefaultOptions(session.access_token, session.user.id),
        ensureDefaultPlans(session.access_token, session.user.id)
      ]);
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
