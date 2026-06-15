import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv
} from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const PORT = Number(process.env.PORT || 4173);

mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, "crm.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    origin TEXT,
    entry_date TEXT,
    status TEXT NOT NULL DEFAULT 'Novo',
    commission REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    lead_id INTEGER,
    date TEXT NOT NULL,
    time TEXT,
    reminder INTEGER NOT NULL DEFAULT 30,
    notes TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS pending_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'Média',
    status TEXT NOT NULL DEFAULT 'Pendente',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT,
    category TEXT,
    lead_id INTEGER,
    date TEXT NOT NULL,
    time TEXT,
    priority TEXT NOT NULL DEFAULT 'Média',
    status TEXT NOT NULL DEFAULT 'Pendente',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS marketing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT,
    status TEXT NOT NULL DEFAULT 'Planejada',
    deadline TEXT,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'WhatsApp',
    status TEXT NOT NULL DEFAULT 'Rascunho',
    scheduled_at TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS option_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT NOT NULL,
    field TEXT NOT NULL,
    value TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(module, field, value)
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
  CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
  CREATE INDEX IF NOT EXISTS idx_pending_due ON pending_items(due_date);
  CREATE INDEX IF NOT EXISTS idx_options_group ON option_values(module, field, sort_order);
`);

const optionDefaults = {
  "leads.origin": ["Indicação", "Instagram", "Facebook", "Google", "WhatsApp", "Site", "Outro"],
  "leads.status": ["Novo", "Em contato", "Proposta", "Negociação", "Fechado", "Perdido"],
  "pending.type": ["Documentos", "Retorno", "Assinatura", "Pagamento", "Informação", "Outro"],
  "pending.status": ["Pendente", "Em andamento", "Concluída"],
  "tasks.type": ["Ligação", "Reunião", "E-mail", "Administrativa", "Atendimento", "Outro"],
  "tasks.category": ["Comercial", "Operacional", "Financeiro", "Relacionamento", "Pessoal"],
  "tasks.priority": ["Baixa", "Média", "Alta"],
  "tasks.status": ["Pendente", "Em andamento", "Concluída"]
};

const insertOption = db.prepare(
  "INSERT OR IGNORE INTO option_values (module, field, value, sort_order) VALUES (?, ?, ?, ?)"
);
for (const [group, values] of Object.entries(optionDefaults)) {
  const [module, field] = group.split(".");
  values.forEach((value, index) => insertOption.run(module, field, value, index));
}

db.prepare(
  "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('openai_model', 'gpt-5.5')"
).run();

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

const existingUser = db.prepare("SELECT id FROM users WHERE username = ?").get("MAIKONSAUDE");
if (!existingUser) {
  const salt = randomBytes(16).toString("hex");
  db.prepare(
    "INSERT INTO users (username, password_hash, salt, name) VALUES (?, ?, ?, ?)"
  ).run("MAIKONSAUDE", hashPassword("ABC123", salt), salt, "Maikon");
}

const sessions = new Map();
const optionUsage = {
  "leads.origin": { table: "leads", column: "origin" },
  "leads.status": { table: "leads", column: "status" },
  "pending.type": { table: "pending_items", column: "type" },
  "pending.status": { table: "pending_items", column: "status" },
  "tasks.type": { table: "tasks", column: "type" },
  "tasks.category": { table: "tasks", column: "category" },
  "tasks.priority": { table: "tasks", column: "priority" },
  "tasks.status": { table: "tasks", column: "status" }
};

const secretKeyPath = join(DATA_DIR, ".crm-secret");

function getSecretKey() {
  if (!existsSync(secretKeyPath)) {
    writeFileSync(secretKeyPath, randomBytes(32));
  }
  const key = readFileSync(secretKeyPath);
  if (key.length !== 32) throw new Error("Chave interna de segurança inválida.");
  return key;
}

function encryptSecret(value) {
  if (!value) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".");
}

function decryptSecret(value) {
  if (!value) return "";
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getSecretKey(),
    Buffer.from(ivRaw, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function getSetting(key) {
  return db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key)?.value || "";
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
}

function getOptions() {
  const rows = db.prepare(
    "SELECT id, module, field, value, sort_order FROM option_values ORDER BY module, field, sort_order, id"
  ).all();
  return rows.reduce((groups, row) => {
    const key = `${row.module}.${row.field}`;
    (groups[key] ||= []).push(row);
    return groups;
  }, {});
}

function getOpenAIConfig() {
  const encryptedKey = getSetting("openai_api_key");
  return {
    configured: Boolean(encryptedKey),
    apiKeyMasked: encryptedKey ? "••••••••••••••••" : "",
    model: getSetting("openai_model") || "gpt-5.5"
  };
}

async function callOpenAI(apiKey, model, input) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input,
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      max_output_tokens: 300
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error?.message || `Falha HTTP ${response.status}`;
    const error = new Error(`OpenAI: ${detail}`);
    if (response.status === 429 && /quota|billing|credit/i.test(detail)) {
      error.code = "openai_quota";
      error.userMessage = "Créditos da API esgotados ou limite mensal atingido.";
      error.actionUrl = "https://platform.openai.com/settings/organization/billing/overview";
    } else if (response.status === 429) {
      error.code = "openai_rate_limit";
      error.userMessage = "Muitas solicitações em pouco tempo. Aguarde um momento e tente novamente.";
    } else if (response.status === 401) {
      error.code = "openai_auth";
      error.userMessage = "A chave da API é inválida, expirou ou pertence a outro projeto.";
      error.actionUrl = "https://platform.openai.com/api-keys";
    } else {
      error.code = "openai_error";
      error.userMessage = detail;
    }
    throw error;
  }
  const message = data.output_text ||
    data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!message?.trim()) throw new Error("A OpenAI não retornou uma mensagem.");
  return message.trim();
}

const entities = {
  leads: {
    table: "leads",
    fields: ["name", "phone", "email", "origin", "entry_date", "status", "commission", "notes"],
    required: ["name"]
  },
  appointments: {
    table: "appointments",
    fields: ["title", "lead_id", "date", "time", "reminder", "notes", "completed"],
    required: ["title", "date"]
  },
  pending: {
    table: "pending_items",
    fields: ["lead_id", "type", "description", "due_date", "priority", "status"],
    required: ["lead_id", "type"]
  },
  tasks: {
    table: "tasks",
    fields: ["title", "type", "category", "lead_id", "date", "time", "priority", "status", "notes"],
    required: ["title", "date"]
  },
  marketing: {
    table: "marketing",
    fields: ["title", "type", "status", "deadline", "description"],
    required: ["title"]
  },
  followups: {
    table: "followups",
    fields: ["lead_id", "message", "channel", "status", "scheduled_at", "sent_at"],
    required: ["lead_id", "message"]
  }
};

function json(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Payload muito grande.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Dados inválidos.");
  }
}

function getCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim().split("="))
      .filter(([key]) => key)
  );
}

function currentUser(req) {
  const sid = getCookies(req).crm_session;
  const session = sid && sessions.get(sid);
  if (!session || session.expires < Date.now()) {
    if (sid) sessions.delete(sid);
    return null;
  }
  session.expires = Date.now() + 12 * 60 * 60 * 1000;
  return session.user;
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a), "hex");
  const right = Buffer.from(String(b), "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function cleanValue(value) {
  if (value === undefined) return null;
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function selectAll(entity) {
  const table = entities[entity].table;
  const joins = {
    appointments: "SELECT a.*, l.name AS lead_name FROM appointments a LEFT JOIN leads l ON l.id = a.lead_id ORDER BY a.date, a.time",
    pending: "SELECT p.*, l.name AS lead_name, l.phone AS lead_phone FROM pending_items p JOIN leads l ON l.id = p.lead_id ORDER BY CASE p.status WHEN 'Pendente' THEN 0 ELSE 1 END, p.due_date",
    tasks: "SELECT t.*, l.name AS lead_name FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id ORDER BY t.date, t.time",
    followups: "SELECT f.*, l.name AS lead_name, l.phone AS lead_phone, l.status AS lead_status FROM followups f JOIN leads l ON l.id = f.lead_id ORDER BY f.created_at DESC"
  };
  const sql = joins[entity] || `SELECT * FROM ${table} ORDER BY created_at DESC`;
  return db.prepare(sql).all();
}

function createEntity(entity, data) {
  const config = entities[entity];
  for (const field of config.required) {
    if (data[field] === undefined || data[field] === null || String(data[field]).trim() === "") {
      throw new Error(`O campo ${field} é obrigatório.`);
    }
  }
  const fields = config.fields.filter((field) => data[field] !== undefined);
  const values = fields.map((field) => cleanValue(data[field]));
  const placeholders = fields.map(() => "?").join(", ");
  const result = db.prepare(
    `INSERT INTO ${config.table} (${fields.join(", ")}) VALUES (${placeholders})`
  ).run(...values);
  return Number(result.lastInsertRowid);
}

function updateEntity(entity, id, data) {
  const config = entities[entity];
  const fields = config.fields.filter((field) => data[field] !== undefined);
  if (!fields.length) throw new Error("Nenhuma alteração informada.");
  const assignments = fields.map((field) => `${field} = ?`);
  if (entity === "leads") assignments.push("updated_at = CURRENT_TIMESTAMP");
  const values = fields.map((field) => cleanValue(data[field]));
  const result = db.prepare(
    `UPDATE ${config.table} SET ${assignments.join(", ")} WHERE id = ?`
  ).run(...values, id);
  if (!result.changes) throw new Error("Registro não encontrado.");
}

function deleteEntity(entity, id) {
  const result = db.prepare(`DELETE FROM ${entities[entity].table} WHERE id = ?`).run(id);
  if (!result.changes) throw new Error("Registro não encontrado.");
}

function dashboardData() {
  const leadStatuses = getOptions()["leads.status"] || [];
  const pendingStatuses = getOptions()["pending.status"] || [];
  const taskStatuses = getOptions()["tasks.status"] || [];
  const activeLeadStatuses = leadStatuses.slice(0, 2).map((item) => item.value);
  const finalPendingStatus = pendingStatuses.at(-1)?.value || "Concluída";
  const finalTaskStatus = taskStatuses.at(-1)?.value || "Concluída";
  const stats = {
    leads: db.prepare("SELECT COUNT(*) AS value FROM leads").get().value,
    newLeads: activeLeadStatuses.length
      ? db.prepare(`SELECT COUNT(*) AS value FROM leads WHERE status IN (${activeLeadStatuses.map(() => "?").join(",")})`).get(...activeLeadStatuses).value
      : 0,
    pending: db.prepare("SELECT COUNT(*) AS value FROM pending_items WHERE status != ?").get(finalPendingStatus).value,
    tasksToday: db.prepare("SELECT COUNT(*) AS value FROM tasks WHERE date = date('now', 'localtime') AND status != ?").get(finalTaskStatus).value,
    commission: db.prepare("SELECT COALESCE(SUM(commission), 0) AS value FROM leads WHERE status IN ('Fechado', 'Convertido')").get().value
  };
  const funnel = db.prepare(
    "SELECT status AS label, COUNT(*) AS value FROM leads GROUP BY status ORDER BY value DESC"
  ).all();
  const origins = db.prepare(
    "SELECT COALESCE(NULLIF(origin, ''), 'Não informada') AS label, COUNT(*) AS value FROM leads GROUP BY label ORDER BY value DESC LIMIT 6"
  ).all();
  const agenda = db.prepare(`
    SELECT 'appointment' AS kind, a.id, a.title, a.date, a.time, a.completed AS done, l.name AS lead_name
    FROM appointments a LEFT JOIN leads l ON l.id = a.lead_id
    WHERE a.date >= date('now', 'localtime')
    UNION ALL
    SELECT 'task' AS kind, t.id, t.title, t.date, t.time, CASE WHEN t.status = 'Concluída' THEN 1 ELSE 0 END AS done, l.name AS lead_name
    FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id
    WHERE t.date >= date('now', 'localtime')
    ORDER BY date, time LIMIT 7
  `).all();
  return { stats, funnel, origins, agenda };
}

function localSuggestion(lead, context = "", tone = "Profissional") {
  const firstName = lead.name.trim().split(/\s+/)[0];
  const detail = context.trim() ? ` sobre ${context.trim()}` : "";
  const templates = {
    Novo: `Olá, ${firstName}! Tudo bem? Meu nome é Maikon. Recebi seu contato${detail} e estou à disposição para entender o que você precisa. Qual é o melhor horário para conversarmos?`,
    "Em contato": `Olá, ${firstName}! Passando para dar continuidade ao nosso atendimento${detail}. Ficou alguma dúvida em que eu possa ajudar?`,
    Proposta: `Olá, ${firstName}! Tudo bem? Gostaria de saber se conseguiu analisar a proposta que enviei${detail}. Posso esclarecer algum ponto para facilitar sua decisão?`,
    Negociação: `Olá, ${firstName}! Estou acompanhando nossa negociação${detail} e queria entender como podemos avançar. Há algum ponto que você gostaria de ajustar ou conversar melhor?`,
    Fechado: `Olá, ${firstName}! Obrigado pela confiança. Estou passando para confirmar se está tudo certo com seu atendimento${detail}. Conte comigo sempre que precisar.`,
    Perdido: `Olá, ${firstName}! Tudo bem? Nosso último contato ficou em aberto${detail}. Caso ainda faça sentido para você, posso retomar o atendimento e ajudar com as opções disponíveis.`
  };
  let message = templates[lead.status] || templates["Em contato"];
  if (tone === "Direto") message = message.replace("Tudo bem? ", "").replace("Estou passando para ", "");
  if (tone === "Amigável") message = message.replace("Olá,", "Oi,").replace("Meu nome é Maikon.", "Aqui é o Maikon.");
  return message;
}

async function aiSuggestion(lead, context, tone) {
  const fallback = localSuggestion(lead, context, tone);
  const encryptedKey = getSetting("openai_api_key");
  const apiKey = process.env.OPENAI_API_KEY || (encryptedKey ? decryptSecret(encryptedKey) : "");
  const model = process.env.OPENAI_MODEL || getSetting("openai_model") || "gpt-5.5";
  if (!apiKey) return { message: fallback, source: "modelo_local" };
  try {
    const message = await callOpenAI(
      apiKey,
      model,
      `Crie uma única mensagem curta de follow-up em português brasileiro para WhatsApp.
Cliente: ${lead.name}
Status atual: ${lead.status}
Tom: ${tone}
Contexto: ${context || "sem contexto adicional"}
Resultado esperado: texto natural, útil e pronto para envio, sem markdown, sem inventar informações e com no máximo 80 palavras.`
    );
    return { message, source: "openai", model };
  } catch (error) {
    return {
      message: fallback,
      source: "modelo_local",
      warning: error.userMessage || error.message,
      warningCode: error.code || "openai_error",
      actionUrl: error.actionUrl || ""
    };
  }
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(body.username || "");
    const valid = user && safeCompare(user.password_hash, hashPassword(body.password || "", user.salt));
    if (!valid) return json(res, 401, { error: "Login ou senha inválidos." });
    const sid = randomBytes(32).toString("hex");
    const publicUser = { id: user.id, name: user.name, username: user.username };
    sessions.set(sid, { user: publicUser, expires: Date.now() + 12 * 60 * 60 * 1000 });
    return json(res, 200, { user: publicUser }, {
      "Set-Cookie": `crm_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`
    });
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const sid = getCookies(req).crm_session;
    if (sid) sessions.delete(sid);
    return json(res, 200, { ok: true }, {
      "Set-Cookie": "crm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
    });
  }

  const user = currentUser(req);
  if (!user) return json(res, 401, { error: "Sessão expirada. Entre novamente." });

  if (req.method === "GET" && url.pathname === "/api/session") {
    return json(res, 200, { user });
  }
  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    return json(res, 200, dashboardData());
  }
  if (req.method === "GET" && url.pathname === "/api/options") {
    return json(res, 200, getOptions());
  }
  if (req.method === "POST" && url.pathname === "/api/options") {
    const body = await readBody(req);
    const group = `${body.module}.${body.field}`;
    if (!optionUsage[group]) return json(res, 400, { error: "Grupo de opções inválido." });
    const value = String(body.value || "").trim();
    if (!value) return json(res, 400, { error: "Informe o nome da opção." });
    const next = db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM option_values WHERE module = ? AND field = ?"
    ).get(body.module, body.field).value;
    try {
      const result = db.prepare(
        "INSERT INTO option_values (module, field, value, sort_order) VALUES (?, ?, ?, ?)"
      ).run(body.module, body.field, value, next);
      return json(res, 201, { id: Number(result.lastInsertRowid) });
    } catch {
      return json(res, 409, { error: "Essa opção já existe." });
    }
  }

  const optionMatch = url.pathname.match(/^\/api\/options\/(\d+)$/);
  if (optionMatch && req.method === "PUT") {
    const id = Number(optionMatch[1]);
    const current = db.prepare("SELECT * FROM option_values WHERE id = ?").get(id);
    if (!current) return json(res, 404, { error: "Opção não encontrada." });
    const value = String((await readBody(req)).value || "").trim();
    if (!value) return json(res, 400, { error: "Informe o novo nome." });
    const usage = optionUsage[`${current.module}.${current.field}`];
    try {
      db.exec("BEGIN IMMEDIATE");
      db.prepare(
        `UPDATE ${usage.table} SET ${usage.column} = ? WHERE ${usage.column} = ?`
      ).run(value, current.value);
      db.prepare("UPDATE option_values SET value = ? WHERE id = ?").run(value, id);
      db.exec("COMMIT");
      return json(res, 200, { ok: true });
    } catch {
      db.exec("ROLLBACK");
      return json(res, 409, { error: "Já existe uma opção com esse nome." });
    }
  }
  if (optionMatch && req.method === "DELETE") {
    const id = Number(optionMatch[1]);
    const current = db.prepare("SELECT * FROM option_values WHERE id = ?").get(id);
    if (!current) return json(res, 404, { error: "Opção não encontrada." });
    const group = `${current.module}.${current.field}`;
    const usage = optionUsage[group];
    const used = db.prepare(
      `SELECT COUNT(*) AS value FROM ${usage.table} WHERE ${usage.column} = ?`
    ).get(current.value).value;
    const groupCount = db.prepare(
      "SELECT COUNT(*) AS value FROM option_values WHERE module = ? AND field = ?"
    ).get(current.module, current.field).value;
    if (used) {
      return json(res, 409, {
        error: `Esta opção está sendo usada em ${used} registro(s). Renomeie ou altere esses registros antes de excluir.`
      });
    }
    if (groupCount <= 1) {
      return json(res, 409, { error: "Mantenha pelo menos uma opção neste grupo." });
    }
    db.prepare("DELETE FROM option_values WHERE id = ?").run(id);
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    return json(res, 200, { openai: getOpenAIConfig() });
  }
  if (req.method === "PUT" && url.pathname === "/api/settings/openai") {
    const body = await readBody(req);
    const model = String(body.model || "gpt-5.5").trim();
    if (!model) return json(res, 400, { error: "Informe o modelo da OpenAI." });
    setSetting("openai_model", model);
    if (body.removeKey) {
      setSetting("openai_api_key", "");
    } else if (String(body.apiKey || "").trim()) {
      const apiKey = String(body.apiKey).trim();
      if (!apiKey.startsWith("sk-")) {
        return json(res, 400, { error: "A chave deve começar com sk-." });
      }
      setSetting("openai_api_key", encryptSecret(apiKey));
    }
    return json(res, 200, { openai: getOpenAIConfig() });
  }
  if (req.method === "POST" && url.pathname === "/api/settings/openai/test") {
    const body = await readBody(req);
    const stored = getSetting("openai_api_key");
    const apiKey = String(body.apiKey || "").trim() || (stored ? decryptSecret(stored) : "");
    const model = String(body.model || getSetting("openai_model") || "gpt-5.5").trim();
    if (!apiKey) return json(res, 400, { error: "Informe e salve uma chave da OpenAI." });
    const message = await callOpenAI(
      apiKey,
      model,
      "Responda somente com: Integração funcionando"
    );
    return json(res, 200, { ok: true, message, model });
  }
  if (req.method === "POST" && url.pathname === "/api/followups/suggest") {
    const body = await readBody(req);
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(body.lead_id);
    if (!lead) return json(res, 404, { error: "Lead não encontrado." });
    return json(res, 200, await aiSuggestion(lead, body.context || "", body.tone || "Profissional"));
  }

  const match = url.pathname.match(/^\/api\/(leads|appointments|pending|tasks|marketing|followups)(?:\/(\d+))?$/);
  if (!match) return json(res, 404, { error: "Rota não encontrada." });
  const [, entity, rawId] = match;
  const id = rawId ? Number(rawId) : null;

  if (req.method === "GET" && !id) return json(res, 200, selectAll(entity));
  if (req.method === "POST" && !id) {
    const body = await readBody(req);
    const createdId = createEntity(entity, body);
    return json(res, 201, { id: createdId });
  }
  if (req.method === "PUT" && id) {
    updateEntity(entity, id, await readBody(req));
    return json(res, 200, { ok: true });
  }
  if (req.method === "DELETE" && id) {
    deleteEntity(entity, id);
    return json(res, 200, { ok: true });
  }
  return json(res, 405, { error: "Método não permitido." });
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Acesso negado");
  }
  if (!existsSync(filePath)) filePath = join(PUBLIC_DIR, "index.html");
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Arquivo não encontrado");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (error) {
    console.error(error);
    json(res, 400, {
      error: error.userMessage || error.message || "Não foi possível concluir a operação.",
      code: error.code || "",
      actionUrl: error.actionUrl || ""
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Maikon CRM disponível em http://127.0.0.1:${PORT}`);
  console.log(`Banco de dados: ${join(DATA_DIR, "crm.db")}`);
});
