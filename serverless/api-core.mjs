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
const ACCESS_MAX_AGE = 60 * 55;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

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

function authCookies(session) {
  return [
    cookie(ACCESS_COOKIE, session.access_token, ACCESS_MAX_AGE),
    cookie(REFRESH_COOKIE, session.refresh_token, REFRESH_MAX_AGE)
  ];
}

function clearCookies() {
  return [
    cookie(ACCESS_COOKIE, "", 0),
    cookie(REFRESH_COOKIE, "", 0)
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
  const setCookies = [];
  if (!accessToken && !refreshToken) throw new Error("Sessão expirada. Entre novamente.");

  try {
    const user = await getUserByToken(accessToken);
    return { accessToken, refreshToken, user, setCookies };
  } catch (error) {
    if (!refreshToken) throw error;
  }

  const refreshed = await authRequest("/auth/v1/token?grant_type=refresh_token", { refresh_token: refreshToken });
  accessToken = refreshed.access_token;
  setCookies.push(...authCookies(refreshed));
  const user = await getUserByToken(accessToken);
  return { accessToken, refreshToken: refreshed.refresh_token, user, setCookies };
}

function parseBody(rawBody) {
  if (!rawBody) return {};
  return typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
}

function restValue(value) {
  return typeof value === "string" ? value.replace(/"/g, '\\"') : value;
}

async function restSelect(table, token, { select = "*", order = [], filters = {}, limit } = {}) {
  const query = { select };
  Object.entries(filters).forEach(([column, value]) => {
    query[column] = `eq.${restValue(value)}`;
  });
  if (order.length) query.order = order.join(",");
  if (limit) query.limit = limit;
  return supabaseRequest(`/rest/v1/${table}`, { token, query });
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

async function selectEntity(entity, token) {
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
  const data = await restSelect(table, token, { select: relationSelect[entity] || "*", order });
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

async function applyPlanRule(token, payload) {
  if (!Object.prototype.hasOwnProperty.call(payload, "plan_id")) return payload;
  if (!payload.plan_id) {
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
  const plans = await restSelect("plans", token, {
    select: "id,name,commission_percent",
    filters: { id: payload.plan_id },
    limit: 1
  });
  const plan = plans?.[0];
  if (!plan) throw new Error("Plano não encontrado.");
  const planValue = Number(payload.plan_value || 0);
  if (planValue <= 0) throw new Error("Informe o valor fechado do plano.");
  const commissionPercent = Number(plan.commission_percent || 0);
  const hasBonus = Boolean(payload.has_bonus);
  const bonusValue = hasBonus ? Number(payload.bonus_value || 0) : 0;
  if (hasBonus && bonusValue <= 0) throw new Error("Informe o valor da premiação.");
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

async function createEntity(entity, body, session) {
  const table = entityConfig[entity].table;
  let payload = { ...body, user_id: session.user.id };
  if (entity === "leads") payload = await applyPlanRule(session.accessToken, payload);
  if (entity === "appointments") payload.completed = Boolean(body.completed);
  const data = await restInsert(table, session.accessToken, payload);
  return { id: data.id };
}

async function updateEntity(entity, id, body, session) {
  const table = entityConfig[entity].table;
  let payload = { ...body };
  if (entity === "leads") payload = await applyPlanRule(session.accessToken, payload);
  if (entity === "appointments" && "completed" in payload) payload.completed = Boolean(payload.completed);
  if (["plans", "leads"].includes(entity)) payload.updated_at = new Date().toISOString();
  return restUpdate(table, session.accessToken, id, payload);
}

async function deleteEntity(entity, id, session) {
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
  const existing = await restSelect("option_values", session.accessToken, {
    select: "sort_order",
    filters: { module: body.module, field: body.field },
    order: ["sort_order.desc"],
    limit: 1
  });
  const sort_order = existing?.[0] ? Number(existing[0].sort_order) + 1 : 0;
  const value = String(body.value || "").trim();
  if (!value) throw new Error("Informe o nome da opção.");
  const data = await restInsert("option_values", session.accessToken, {
    user_id: session.user.id,
    module: body.module,
    field: body.field,
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

async function route(path, method, body, session) {
  if (path === "/api/session" && method === "GET") {
    await ensureDefaultOptions(session.accessToken, session.user.id);
    return { user: publicUser(session.user) };
  }
  if (path === "/api/dashboard" && method === "GET") return dashboardData(session);
  if (path === "/api/options" && method === "GET") return listOptions(session);
  if (path === "/api/options" && method === "POST") return createOption(body, session);

  const optionMatch = path.match(/^\/api\/options\/([^/]+)$/);
  if (optionMatch && method === "PUT") {
    return rpc("rename_option_value", session.accessToken, {
      p_option_id: optionMatch[1],
      p_new_value: String(body.value || "").trim()
    });
  }
  if (optionMatch && method === "DELETE") {
    return rpc("delete_option_value", session.accessToken, { p_option_id: optionMatch[1] });
  }

  const entityMatch = path.match(/^\/api\/(plans|leads|appointments|pending|tasks|followups)(?:\/([^/]+))?$/);
  if (!entityMatch) throw new Error("Rota não encontrada.");
  const [, entity, id] = entityMatch;
  if (method === "GET" && !id) return selectEntity(entity, session.accessToken);
  if (method === "POST" && !id) return createEntity(entity, body, session);
  if (method === "PUT" && id) return updateEntity(entity, id, body, session);
  if (method === "DELETE" && id) return deleteEntity(entity, id, session);
  throw new Error("Método não permitido.");
}

export async function handleApiRequest({ path, method, headers = {}, body }) {
  try {
    const normalizedPath = path.startsWith("/api") ? path : `/api${path.startsWith("/") ? path : `/${path}`}`;
    const normalizedMethod = String(method || "GET").toUpperCase();
    const payload = parseBody(body);

    if (normalizedPath === "/api/login" && normalizedMethod === "POST") {
      const email = String(payload.username || "").trim();
      const password = payload.password || "";
      const session = await authRequest("/auth/v1/token?grant_type=password", { email, password });
      await ensureDefaultOptions(session.access_token, session.user.id);
      return json(200, { user: publicUser(session.user) }, authCookies(session));
    }

    if (normalizedPath === "/api/logout" && normalizedMethod === "POST") {
      const cookies = parseCookies(headers.cookie || headers.Cookie || "");
      if (cookies[ACCESS_COOKIE]) {
        await authRequest("/auth/v1/logout", {}, cookies[ACCESS_COOKIE]).catch(() => null);
      }
      return json(200, { ok: true }, clearCookies());
    }

    const session = await readSession(headers.cookie || headers.Cookie || "");
    const data = await route(normalizedPath, normalizedMethod, payload, session);
    return json(200, data, session.setCookies);
  } catch (error) {
    const status = error?.status === 401 || /sessão|session|jwt/i.test(error?.message || "") ? 401 : 400;
    const cookies = status === 401 ? clearCookies() : [];
    return json(status, apiError(error), cookies);
  }
}
