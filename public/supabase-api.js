const env = window.__ENV__ || {};

export const isSupabaseConfigured = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const optionDefaults = {
  "leads.origin": ["Indicação", "Instagram", "Facebook", "Google", "WhatsApp", "Site", "Outro"],
  "leads.status": ["Novo", "Em contato", "Proposta", "Negociação", "Fechado", "Perdido"],
  "pending.type": ["Documentos", "Retorno", "Assinatura", "Pagamento", "Informação", "Outro"],
  "pending.status": ["Pendente", "Em andamento", "Concluída"],
  "tasks.type": ["Ligação", "Reunião", "E-mail", "Administrativa", "Atendimento", "Outro"],
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

let clientPromise;

async function getClient() {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  if (!clientPromise) {
    clientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")
      .then(({ createClient }) => createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      ));
  }
  return clientPromise;
}

function parseBody(options = {}) {
  if (!options.body) return {};
  return typeof options.body === "string" ? JSON.parse(options.body) : options.body;
}

function apiError(error, fallback = "Não foi possível concluir a operação.") {
  const message = error?.message || fallback;
  const isSchemaError = ["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code)
    || /schema cache|does not exist|column .* not found|relation .* not found/i.test(message);
  const translated = isSchemaError
    ? "O banco Supabase precisa ser atualizado. Execute supabase/ATUALIZAR-BANCO.sql no SQL Editor."
    : message
      .replace("Invalid login credentials", "E-mail ou senha inválidos.")
      .replace("Email not confirmed", "Confirme seu e-mail antes de entrar.")
      .replace("User already registered", "Este e-mail já está cadastrado.");
  const result = new Error(translated);
  result.code = error?.code || "";
  return result;
}

async function getAuthUser() {
  const client = await getClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw apiError(error, "Sessão expirada. Entre novamente.");
  return data.user;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário",
    username: user.email
  };
}

async function ensureDefaultOptions(userId) {
  const client = await getClient();
  const { data: existing, error } = await client
    .from("option_values")
    .select("module, field, value");
  if (error) throw apiError(error);
  const known = new Set((existing || []).map((item) => `${item.module}.${item.field}.${item.value}`));

  const rows = [];
  for (const [group, values] of Object.entries(optionDefaults)) {
    const [module, field] = group.split(".");
    values.forEach((value, sortOrder) => {
      if (!known.has(`${module}.${field}.${value}`)) {
        rows.push({ user_id: userId, module, field, value, sort_order: sortOrder });
      }
    });
  }
  if (!rows.length) return;
  const { error: insertError } = await client.from("option_values").insert(rows);
  if (insertError && insertError.code !== "23505") throw apiError(insertError);
}

async function selectEntity(entity) {
  const client = await getClient();
  const table = entityConfig[entity].table;
  const relationSelect = {
    appointments: "*, leads(name)",
    pending: "*, leads(name, phone)",
    tasks: "*, leads(name)",
    followups: "*, leads(name, phone, status)"
  };
  let query = client.from(table).select(relationSelect[entity] || "*");
  if (entity === "plans") query = query.order("name");
  else if (entity === "appointments" || entity === "tasks") query = query.order("date").order("time");
  else if (entity === "pending") query = query.order("due_date");
  else query = query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw apiError(error);

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

async function applyPlanRule(payload) {
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
  const client = await getClient();
  const { data: plan, error } = await client
    .from("plans")
    .select("id, name, commission_percent")
    .eq("id", payload.plan_id)
    .single();
  if (error || !plan) throw apiError(error, "Plano não encontrado.");
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

async function createEntity(entity, body) {
  const client = await getClient();
  const user = await getAuthUser();
  const table = entityConfig[entity].table;
  let payload = { ...body, user_id: user.id };
  if (entity === "leads") payload = await applyPlanRule(payload);
  if (entity === "appointments") payload.completed = Boolean(body.completed);
  const { data, error } = await client.from(table).insert(payload).select("id").single();
  if (error) throw apiError(error);
  return { id: data.id };
}

async function updateEntity(entity, id, body) {
  const client = await getClient();
  const table = entityConfig[entity].table;
  let payload = { ...body };
  if (entity === "leads") payload = await applyPlanRule(payload);
  if (entity === "appointments" && "completed" in payload) payload.completed = Boolean(payload.completed);
  if (entity === "plans") payload.updated_at = new Date().toISOString();
  if (entity === "leads") payload.updated_at = new Date().toISOString();
  const { error } = await client.from(table).update(payload).eq("id", id);
  if (error) throw apiError(error);
  return { ok: true };
}

async function deleteEntity(entity, id) {
  const client = await getClient();
  const { error } = await client.from(entityConfig[entity].table).delete().eq("id", id);
  if (error?.code === "23503" && entity === "plans") {
    throw new Error("Este plano está vinculado a um ou mais leads e não pode ser excluído.");
  }
  if (error) throw apiError(error);
  return { ok: true };
}

async function listOptions() {
  const client = await getClient();
  const user = await getAuthUser();
  await ensureDefaultOptions(user.id);
  const { data, error } = await client
    .from("option_values")
    .select("id, module, field, value, sort_order")
    .order("module")
    .order("field")
    .order("sort_order");
  if (error) throw apiError(error);
  return (data || []).reduce((groups, row) => {
    const key = `${row.module}.${row.field}`;
    (groups[key] ||= []).push(row);
    return groups;
  }, {});
}

async function createOption(body) {
  const client = await getClient();
  const user = await getAuthUser();
  const { data: existing, error: listError } = await client
    .from("option_values")
    .select("sort_order")
    .eq("module", body.module)
    .eq("field", body.field)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (listError) throw apiError(listError);
  const sortOrder = existing?.[0] ? existing[0].sort_order + 1 : 0;
  const value = String(body.value || "").trim();
  if (!value) throw new Error("Informe o nome da opção.");
  const { data, error } = await client
    .from("option_values")
    .insert({
      user_id: user.id,
      module: body.module,
      field: body.field,
      value,
      sort_order: sortOrder
    })
    .select("id")
    .single();
  if (error) throw apiError(error);
  return { id: data.id };
}

async function dashboardData() {
  const [leads, pending, tasks, appointments, options] = await Promise.all([
    selectEntity("leads"),
    selectEntity("pending"),
    selectEntity("tasks"),
    selectEntity("appointments"),
    listOptions()
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

export async function supabaseApi(path, options = {}) {
  const client = await getClient();
  const method = (options.method || "GET").toUpperCase();
  const body = parseBody(options);

  if (path === "/api/login" && method === "POST") {
    const { data, error } = await client.auth.signInWithPassword({
      email: String(body.username || "").trim(),
      password: body.password || ""
    });
    if (error) throw apiError(error);
    await ensureDefaultOptions(data.user.id);
    return { user: publicUser(data.user) };
  }
  if (path === "/api/logout" && method === "POST") {
    const { error } = await client.auth.signOut();
    if (error) throw apiError(error);
    return { ok: true };
  }
  if (path === "/api/session" && method === "GET") {
    const user = await getAuthUser();
    await ensureDefaultOptions(user.id);
    return { user: publicUser(user) };
  }
  if (path === "/api/dashboard" && method === "GET") return dashboardData();
  if (path === "/api/options" && method === "GET") return listOptions();
  if (path === "/api/options" && method === "POST") return createOption(body);

  const optionMatch = path.match(/^\/api\/options\/([^/]+)$/);
  if (optionMatch && method === "PUT") {
    const { error } = await client.rpc("rename_option_value", {
      p_option_id: optionMatch[1],
      p_new_value: String(body.value || "").trim()
    });
    if (error) throw apiError(error);
    return { ok: true };
  }
  if (optionMatch && method === "DELETE") {
    const { error } = await client.rpc("delete_option_value", { p_option_id: optionMatch[1] });
    if (error) throw apiError(error);
    return { ok: true };
  }

  const entityMatch = path.match(/^\/api\/(plans|leads|appointments|pending|tasks|followups)(?:\/([^/]+))?$/);
  if (!entityMatch) throw new Error("Rota não encontrada.");
  const [, entity, id] = entityMatch;
  if (method === "GET" && !id) return selectEntity(entity);
  if (method === "POST" && !id) return createEntity(entity, body);
  if (method === "PUT" && id) return updateEntity(entity, id, body);
  if (method === "DELETE" && id) return deleteEntity(entity, id);
  throw new Error("Método não permitido.");
}
