import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const databasePath = join(root, "data", "crm.db");

function loadDotEnv() {
  const path = join(root, ".env");
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
      })
  );
}

const localEnv = loadDotEnv();
const readEnv = (name) => process.env[name] || localEnv[name] || "";
const url = readEnv("SUPABASE_URL");
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const userId = readEnv("SUPABASE_USER_ID");

if (!url || !serviceKey || !userId) {
  throw new Error(
    "Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_USER_ID antes da migração."
  );
}
if (!existsSync(databasePath)) throw new Error("Banco SQLite não encontrado.");

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
  Prefer: "return=representation"
};

async function insert(table, rows, onConflict = "") {
  if (!rows.length) return [];
  const suffix = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  const response = await fetch(`${url}/rest/v1/${table}${suffix}`, {
    method: "POST",
    headers: { ...headers, ...(onConflict ? { Prefer: "resolution=merge-duplicates,return=representation" } : {}) },
    body: JSON.stringify(rows)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${table}: ${data.message || response.statusText}`);
  return data;
}

const db = new DatabaseSync(databasePath, { readOnly: true });
const all = (sql) => db.prepare(sql).all();
const leadMap = new Map();
const planMap = new Map();
const hasTable = (name) => Boolean(
  db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
);
const leadColumns = new Set(db.prepare("PRAGMA table_info(leads)").all().map((column) => column.name));

if (hasTable("plans")) {
  const plans = all("SELECT * FROM plans ORDER BY id");
  for (const plan of plans) {
    const [created] = await insert("plans", [{
      user_id: userId,
      name: plan.name,
      installment_value: plan.installment_value,
      commission_percent: plan.commission_percent,
      has_bonus: Boolean(plan.has_bonus),
      bonus_description: plan.bonus_description,
      bonus_value: plan.bonus_value,
      created_at: plan.created_at,
      updated_at: plan.updated_at
    }]);
    planMap.set(plan.id, created.id);
  }
}

const leads = all("SELECT * FROM leads ORDER BY id");
for (const lead of leads) {
  const [created] = await insert("leads", [{
    user_id: userId,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    origin: lead.origin,
    entry_date: lead.entry_date,
    contact_date: leadColumns.has("contact_date") ? lead.contact_date : null,
    effective_date: leadColumns.has("effective_date") ? lead.effective_date : null,
    plan_id: leadColumns.has("plan_id") && lead.plan_id ? planMap.get(lead.plan_id) || null : null,
    plan_name: leadColumns.has("plan_name") ? lead.plan_name : null,
    plan_value: leadColumns.has("plan_value") ? lead.plan_value : 0,
    commission_percent: leadColumns.has("commission_percent") ? lead.commission_percent : 0,
    status: lead.status,
    commission: lead.commission,
    has_bonus: leadColumns.has("has_bonus") ? Boolean(lead.has_bonus) : false,
    bonus_description: leadColumns.has("bonus_description") ? lead.bonus_description : null,
    bonus_value: leadColumns.has("bonus_value") ? lead.bonus_value : 0,
    notes: lead.notes,
    created_at: lead.created_at,
    updated_at: lead.updated_at
  }]);
  leadMap.set(lead.id, created.id);
}

const withLead = (rows) => rows.map((row) => ({
  ...row,
  user_id: userId,
  lead_id: row.lead_id ? leadMap.get(row.lead_id) || null : null
}));

await insert("appointments", withLead(all(`
  SELECT title, lead_id, date, time, reminder, notes,
         completed, created_at
  FROM appointments
`)).map((row) => ({ ...row, completed: Boolean(row.completed) })));
await insert("pending_items", withLead(all(`
  SELECT lead_id, type, description, due_date, priority, status, created_at
  FROM pending_items
`)).filter((row) => row.lead_id));
await insert("tasks", withLead(all(`
  SELECT title, type, category, lead_id, date, time, priority, status, notes, created_at
  FROM tasks
`)));
await insert("followups", withLead(all(`
  SELECT lead_id, message, channel, status, scheduled_at, sent_at, created_at
  FROM followups
`)).filter((row) => row.lead_id));
await insert("option_values", all(`
  SELECT module, field, value, sort_order, created_at FROM option_values
`).map((row) => ({ ...row, user_id: userId })), "user_id,module,field,value");

db.close();
console.log(`Migração concluída. Leads migrados: ${leads.length}`);
