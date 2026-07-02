import { isSupabaseConfigured, supabaseApi } from "./supabase-api.js?v=20260702-payment-status";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const hasMissingProductionConfig = !isLocalHost && !isSupabaseConfigured;

const state = {
  user: null,
  view: "dashboard",
  leads: [],
  plans: [],
  options: {},
  collections: {},
  databaseNeedsUpdate: false,
  selectedDate: new Date().toISOString().slice(0, 10),
  settingsSection: "leads",
  quickFilters: {},
  globalLeadSearch: ""
};

const icons = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  alert: '<path d="M10.3 2.86 1.82 17a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 2.86a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/>',
  check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.7 10.7 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-2.1 3.2M6.6 6.6C3.5 8.6 2 12 2 12s3.5 8 10 8c1.7 0 3.2-.5 4.5-1.2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1Z"/>',
  money: '<circle cx="12" cy="12" r="9"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 6v12"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21h-3.4"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>'
};

const navItems = [
  ["dashboard", "Painel", "dashboard"],
  ["day", "Meu dia", "calendar"],
  ["leads", "Leads", "users"],
  ["kanban", "Kanban", "kanban"],
  ["pending", "Pendências", "alert"],
  ["followup", "Follow-up", "message"],
  ["tasks", "Tarefas", "check"],
  ["payments", "Pagamentos e Premiações", "money"],
  ["reports", "Relatórios", "dashboard"],
  ["backup", "Backup", "download"],
  ["settings", "Configurações", "settings"]
];

const viewInfo = {
  dashboard: { title: "Painel", kicker: "Visão geral", action: "Novo lead", entity: "leads" },
  day: { title: "Meu dia", kicker: "Agenda e lembretes", action: "Novo compromisso", entity: "appointments" },
  leads: { title: "Leads", kicker: "Gestão comercial", action: "Novo lead", entity: "leads" },
  kanban: { title: "Kanban", kicker: "Fluxo comercial", action: "Novo lead", entity: "leads" },
  pending: { title: "Pendências", kicker: "Documentos e retornos", action: "Nova pendência", entity: "pending" },
  followup: { title: "Follow-up", kicker: "Relacionamento com clientes", action: "Criar mensagem", entity: null },
  tasks: { title: "Tarefas", kicker: "Organização do trabalho", action: "Nova tarefa", entity: "tasks" },
  payments: { title: "Pagamentos e Premiações", kicker: "Controle financeiro", action: "", entity: null },
  reports: { title: "Relatórios", kicker: "Análise mensal", action: "", entity: null },
  backup: { title: "Backup", kicker: "Exportação de dados", action: "", entity: null },
  settings: { title: "Configurações", kicker: "Personalização do CRM", action: "", entity: null }
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.check}</svg>`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "--";
}

function sameId(left, right) {
  return String(left) === String(right);
}

function formatDate(value, options = {}) {
  if (!value) return "Sem data";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", options.year ? options : { day: "2-digit", month: "short" }).format(date);
}

function formatDateTime(value) {
  if (!value) return "Agora";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z")));
}

function compactCalendarDate(date, time = "") {
  return `${String(date || "").replaceAll("-", "")}${time ? `T${String(time).replace(":", "")}00` : ""}`;
}

function addMinutesToTask(date, time, minutes) {
  const value = new Date(`${date}T${time}:00`);
  value.setMinutes(value.getMinutes() + minutes);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}00`;
}

function nextCalendarDay(date) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + 1);
  return `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, "0")}${String(value.getDate()).padStart(2, "0")}`;
}

function googleCalendarUrl(task) {
  const start = compactCalendarDate(task.date, task.time);
  const end = task.time ? addMinutesToTask(task.date, task.time, 60) : nextCalendarDay(task.date);
  const details = [
    task.notes,
    task.lead_name ? `Cliente: ${task.lead_name}` : "",
    task.type ? `Tipo: ${task.type}` : "",
    task.category ? `Categoria: ${task.category}` : "",
    task.priority ? `Prioridade: ${task.priority}` : ""
  ].filter(Boolean).join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: task.title,
    dates: `${start}/${end}`,
    details,
    ctz: "America/Sao_Paulo"
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function badge(status = "") {
  const value = status || "Não informado";
  const green = ["Fechado", "Convertido", "Concluída", "Concluído", "Ativa", "Enviado", "Recebido"];
  const red = ["Perdido", "Cancelada", "Cancelado", "Atrasada", "Alta"];
  const blue = ["Novo", "Em contato", "Em andamento", "Agendada"];
  const cls = green.includes(value) ? "badge-green" : red.includes(value) ? "badge-red" : blue.includes(value) ? "badge-blue" : "badge-yellow";
  return `<span class="badge ${cls}">${escapeHtml(value)}</span>`;
}

function priority(value = "Média") {
  const colors = { Alta: "#df6969", Média: "#e3aa48", Baixa: "#65a994" };
  return `<span class="priority" style="--priority-color:${colors[value] || colors.Média}">${escapeHtml(value)}</span>`;
}

async function api(path, options = {}) {
  if (isSupabaseConfigured) {
    try {
      return await supabaseApi(path, options);
    } catch (error) {
      if (path !== "/api/login" && /sessão|session|jwt/i.test(error.message)) showLogin();
      throw error;
    }
  }
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  let data = {};
  try {
    data = await response.json();
  } catch {}
  if (response.status === 401 && path !== "/api/login") {
    showLogin();
    throw new Error(data.error || "Sua sessão expirou.");
  }
  if (!response.ok) {
    const error = new Error(data.error || "Não foi possível concluir a operação.");
    error.code = data.code || "";
    error.actionUrl = data.actionUrl || "";
    throw error;
  }
  return data;
}

function showToast(message, type = "success") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast show ${type === "error" ? "error" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = "toast"; }, 3200);
}

function loading() {
  $("#content").innerHTML = '<div class="loading"><div><div class="spinner"></div>Carregando informações...</div></div>';
}

function isDatabaseSchemaError(error) {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code)
    || /schema cache|does not exist|não existe|coluna|column|relation/i.test(error?.message || "");
}

function databaseUpdateNotice() {
  if (!state.databaseNeedsUpdate) return "";
  return `<div class="database-notice">
    <strong>O banco Supabase precisa ser atualizado.</strong>
    <span>Execute o arquivo <b>supabase/ATUALIZAR-BANCO.sql</b> no SQL Editor. Os dados existentes serão preservados.</span>
  </div>`;
}

function renderNav() {
  $("#main-nav").innerHTML = navItems.map(([id, label, iconName]) => `
    <button class="nav-item ${state.view === id ? "active" : ""}" data-view="${id}">
      <span class="nav-icon">${icon(iconName)}</span>
      <span>${label}</span>
    </button>
  `).join("");
}

function updateHeader() {
  const info = viewInfo[state.view];
  $("#page-title").textContent = info.title;
  $("#page-kicker").textContent = info.kicker;
  const action = $("#primary-action");
  action.innerHTML = info.action ? `${icon("plus")}<span>${info.action}</span>` : "";
  action.hidden = !info.action;
}

async function navigate(view) {
  state.view = view;
  renderNav();
  updateHeader();
  $("#app").classList.remove("sidebar-open");
  loading();
  try {
    const renderers = {
      dashboard: renderDashboard,
      day: renderDay,
      leads: renderLeads,
      kanban: renderKanban,
      pending: renderPending,
      followup: renderFollowup,
      tasks: renderTasks,
      payments: renderPayments,
      reports: renderReports,
      backup: renderBackup,
      settings: renderSettings
    };
    await renderers[view]();
    $("#content").focus();
  } catch (error) {
    $("#content").innerHTML = `<div class="empty-state"><div><h3>Algo não saiu como esperado</h3><p>${escapeHtml(error.message)}</p><button class="button button-secondary" data-retry>Carregar novamente</button></div></div>`;
  }
}

async function ensureLeads(refresh = false) {
  if (refresh || !state.leads.length) state.leads = await api("/api/leads");
  return state.leads;
}

async function ensurePlans(refresh = false) {
  if (refresh || !state.plans.length) {
    try {
      state.plans = await api("/api/plans");
      state.databaseNeedsUpdate = false;
    } catch (error) {
      if (!isDatabaseSchemaError(error)) throw error;
      state.plans = [];
      state.databaseNeedsUpdate = true;
    }
  }
  return state.plans;
}

async function ensureOptions(refresh = false) {
  if (refresh || !Object.keys(state.options).length) state.options = await api("/api/options");
  return state.options;
}

function optionValues(group) {
  return (state.options[group] || []).map((item) => item.value);
}

function terminalOption(group, fallback) {
  return optionValues(group).at(-1) || fallback;
}

function emptyState(title, description, entity, iconName = "plus") {
  return `<div class="empty-state"><div>
    <div class="empty-icon">${icon(iconName)}</div>
    <h3>${title}</h3>
    <p>${description}</p>
    ${entity ? `<button class="button button-primary" data-new="${entity}">${icon("plus")} Adicionar agora</button>` : ""}
  </div></div>`;
}

async function renderDashboard() {
  await ensureOptions();
  const [data, leads, tasks, pending] = await Promise.all([
    api("/api/dashboard"),
    ensureLeads(true),
    api("/api/tasks"),
    api("/api/pending")
  ]);
  const maxFunnel = Math.max(...data.funnel.map((item) => Number(item.value)), 1);
  const colors = ["#245c54", "#6b9fed", "#eeb85d", "#74b7a8", "#e67979", "#9b7bd4"];
  const alerts = dashboardAlerts(leads, tasks, pending);
  $("#content").innerHTML = `
    <div class="welcome-row">
      <div>
        <h2>Olá, ${escapeHtml(state.user?.name || "Maikon")}.</h2>
        <p>Aqui está o que merece sua atenção hoje.</p>
      </div>
      <button class="text-button" data-view="day">Ver agenda completa ${icon("chevron")}</button>
    </div>
    <section class="stats-grid">
      ${statCard("Total de leads", data.stats.leads, "Base de contatos", "users", "#d9eee8", 'data-view="leads"')}
      ${statCard("Em negociação", data.stats.newLeads, "Novos e em contato", "message", "#e9f0fb", 'data-quick-filter="lead-active"')}
      ${statCard("Pendências", data.stats.pending, "Aguardando solução", "alert", "#fff0d8", 'data-quick-filter="pending-open"')}
      ${statCard("Tarefas hoje", data.stats.tasksToday, "Itens ainda abertos", "check", "#f2eafb", 'data-quick-filter="tasks-today"')}
      ${statCard("Comissões", currency(data.stats.commission), "Leads fechados", "money", "#e2f1c4", 'data-view="payments"')}
    </section>
    ${renderDashboardAlerts(alerts)}
    <section class="dashboard-grid">
      <div class="panel">
        <div class="panel-header">
          <div><h3>Funil de oportunidades</h3><p>Distribuição atual dos seus leads</p></div>
          <button class="text-button" data-view="leads">Gerenciar leads</button>
        </div>
        ${data.funnel.length ? `<div class="funnel-list">${data.funnel.map((item) => `
          <div class="funnel-row">
            <span>${escapeHtml(item.label)}</span>
            <div class="progress"><span style="width:${Math.max(8, Number(item.value) / maxFunnel * 100)}%"></span></div>
            <strong>${item.value}</strong>
          </div>`).join("")}</div>` : emptyMini("Cadastre leads para visualizar seu funil.")}
      </div>
      <div class="panel">
        <div class="panel-header"><div><h3>Origem dos leads</h3><p>Canais que mais geram contatos</p></div></div>
        ${data.origins.length ? `<div class="origin-list">${data.origins.map((item, index) => `
          <div class="origin-row" style="--origin-color:${colors[index % colors.length]}">
            <i></i><span>${escapeHtml(item.label)}</span><strong>${item.value}</strong>
          </div>`).join("")}</div>` : emptyMini("As origens aparecerão aqui.")}
      </div>
      <div class="panel">
        <div class="panel-header">
          <div><h3>Próximos compromissos</h3><p>Sua agenda em ordem cronológica</p></div>
          <button class="text-button" data-new="appointments">Adicionar</button>
        </div>
        ${data.agenda.length ? `<div class="timeline">${data.agenda.map((item) => `
          <div class="timeline-item">
            <span class="timeline-time">${item.time || "--:--"}</span>
            <div class="timeline-detail"><strong>${escapeHtml(item.title)}</strong><span>${formatDate(item.date)}${item.lead_name ? ` · ${escapeHtml(item.lead_name)}` : ""}</span></div>
            ${item.done ? badge("Concluída") : badge(item.kind === "task" ? "Tarefa" : "Agenda")}
          </div>`).join("")}</div>` : emptyMini("Nenhum compromisso futuro.")}
      </div>
      <div class="panel">
        <div class="panel-header"><div><h3>Atalhos rápidos</h3><p>Registre uma atividade sem perder tempo</p></div></div>
        <div class="button-row">
          <button class="button button-secondary" data-new="leads">${icon("users")} Lead</button>
          <button class="button button-secondary" data-quick-filter="lead-no-contact">${icon("phone")} Sem contato</button>
          <button class="button button-secondary" data-new="tasks">${icon("check")} Tarefa</button>
          <button class="button button-secondary" data-new="pending">${icon("alert")} Pendência</button>
          <button class="button button-secondary" data-view="followup">${icon("message")} Follow-up</button>
        </div>
      </div>
    </section>
  `;
}

function statCard(label, value, note, iconName, color, attrs = "") {
  return `<article class="stat-card ${attrs ? "clickable-card" : ""}" style="--stat-color:${color}" ${attrs}>
    <div class="stat-top"><span>${label}</span><span class="stat-icon">${icon(iconName)}</span></div>
    <strong>${value}</strong><small>${note}</small>
  </article>`;
}

function dashboardAlerts(leads, tasks, pending) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date(`${today}T12:00:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  const finalTask = terminalOption("tasks.status", "Concluída");
  const finalPending = terminalOption("pending.status", "Concluída");
  return [
    { label: "Tarefas vencidas", value: tasks.filter((item) => item.date < today && item.status !== finalTask).length, filter: "tasks-overdue" },
    { label: "Tarefas de hoje", value: tasks.filter((item) => item.date === today && item.status !== finalTask).length, filter: "tasks-today" },
    { label: "Pendências vencidas", value: pending.filter((item) => item.due_date && item.due_date < today && item.status !== finalPending).length, filter: "pending-overdue" },
    { label: "Vigências até amanhã", value: leads.filter((item) => item.effective_date && item.effective_date >= today && item.effective_date <= tomorrow).length, filter: "lead-renewal" }
  ];
}

function renderDashboardAlerts(alerts) {
  return `<section class="panel alerts-panel">
    <div class="panel-header"><div><h3>Alertas rápidos</h3><p>Itens que merecem atenção agora</p></div></div>
    <div class="alerts-grid">${alerts.map((item) => `
      <button class="alert-card" data-quick-filter="${item.filter}">
        <span>${escapeHtml(item.label)}</span>
        <strong>${item.value}</strong>
      </button>`).join("")}</div>
  </section>`;
}

function applyQuickFilter(filter) {
  state.quickFilters = {};
  const map = {
    "lead-active": ["leads", "active"],
    "lead-no-contact": ["leads", "no-contact"],
    "lead-renewal": ["leads", "renewal"],
    "pending-open": ["pending", "open"],
    "pending-overdue": ["pending", "overdue"],
    "tasks-today": ["tasks", "today"],
    "tasks-overdue": ["tasks", "overdue"]
  };
  const target = map[filter];
  if (!target) return;
  state.quickFilters[target[0]] = target[1];
  navigate(target[0]);
}

function emptyMini(text) {
  return `<p class="muted" style="font-size:11px;margin:0">${text}</p>`;
}

async function renderDay() {
  await ensureOptions();
  const [appointments, tasks] = await Promise.all([api("/api/appointments"), api("/api/tasks")]);
  state.collections.appointments = appointments;
  state.collections.tasks = tasks;
  const selected = state.selectedDate;
  const selectedAppointments = appointments.filter((item) => item.date === selected).map((item) => ({ ...item, day_kind: "appointment" }));
  const selectedTasks = tasks.filter((item) => item.date === selected).map((item) => ({ ...item, day_kind: "task" }));
  const selectedItems = [...selectedAppointments, ...selectedTasks]
    .sort((left, right) => `${left.time || "99:99"}${left.title}`.localeCompare(`${right.time || "99:99"}${right.title}`));
  const openTasks = selectedTasks.filter((item) => item.status !== terminalOption("tasks.status", "Concluída")).length;
  $("#content").innerHTML = `
    <div class="section-toolbar">
      <div><strong>${formatDate(selected, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</strong><p class="muted" style="font-size:11px;margin:4px 0 0">${selectedAppointments.length} compromisso(s) · ${selectedTasks.length} tarefa(s) · ${openTasks} aberta(s)</p></div>
      <button class="button button-secondary" data-today>Ir para hoje</button>
    </div>
    <section class="agenda-layout">
      ${renderCalendar(selected)}
      <div class="panel agenda-panel">
        <div class="panel-header"><div><h3>Agenda e tarefas do dia</h3><p>Compromissos, lembretes e atividades programadas</p></div></div>
        ${selectedItems.length ? `<div class="card-list">${selectedItems.map(renderDayItem).join("")}</div>` :
          emptyState("Dia livre na agenda", "Nenhum compromisso ou tarefa foi cadastrado para esta data.", "appointments", "calendar")}
      </div>
    </section>
  `;
}

function renderCalendar(selected) {
  const current = new Date(`${selected}T12:00:00`);
  const year = current.getFullYear();
  const month = current.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const today = new Date().toISOString().slice(0, 10);
  const days = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    days.push(`<button class="${iso === today ? "today" : ""} ${iso === selected ? "selected" : ""} ${day.getMonth() !== month ? "outside" : ""}" data-date="${iso}">${day.getDate()}</button>`);
  }
  return `<aside class="mini-calendar">
    <div class="calendar-header"><strong>${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(current)}</strong></div>
    <div class="calendar-grid"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>${days.join("")}</div>
  </aside>`;
}

function renderAppointment(item) {
  return `<article class="agenda-card">
    <div class="agenda-time">${escapeHtml(item.time || "--:--")}</div>
    <i class="agenda-stripe" style="background:${item.completed ? "#65a994" : "#eeb85d"}"></i>
    <div class="agenda-detail">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${item.lead_name ? escapeHtml(item.lead_name) + " · " : ""}Lembrete ${item.reminder || 0} min antes${item.notes ? ` · ${escapeHtml(item.notes)}` : ""}</span>
    </div>
    <div class="actions">
      <button class="icon-button" data-toggle-appointment="${item.id}" title="${item.completed ? "Reabrir" : "Concluir"}">${icon("check")}</button>
      <button class="icon-button" data-edit="appointments" data-id="${item.id}" title="Editar">${icon("edit")}</button>
      <button class="icon-button" data-delete="appointments" data-id="${item.id}" title="Excluir">${icon("trash")}</button>
    </div>
  </article>`;
}

function renderDayItem(item) {
  return item.day_kind === "task" ? renderDayTask(item) : renderAppointment(item);
}

function renderDayTask(item) {
  const done = item.status === terminalOption("tasks.status", "Concluída");
  return `<article class="agenda-card task-agenda-card">
    <div class="agenda-time">${escapeHtml(item.time || "--:--")}</div>
    <i class="agenda-stripe" style="background:${done ? "#65a994" : item.priority === "Alta" ? "#df6969" : "#6b9fed"}"></i>
    <div class="agenda-detail">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.lead_name || "Sem cliente")} · ${escapeHtml(item.type || "Tarefa")}${item.category ? ` · ${escapeHtml(item.category)}` : ""}${item.notes ? ` · ${escapeHtml(item.notes)}` : ""}</span>
    </div>
    <div class="actions">
      <button class="icon-button google-calendar-button" data-google-calendar="${item.id}" title="Adicionar ao Google Agenda" aria-label="Adicionar ${escapeHtml(item.title)} ao Google Agenda">${icon("calendar")}</button>
      ${!done ? `<button class="icon-button" data-complete-task="${item.id}" title="Concluir tarefa">${icon("check")}</button>` : ""}
      <button class="icon-button" data-edit="tasks" data-id="${item.id}" title="Editar tarefa">${icon("edit")}</button>
      <button class="icon-button" data-delete="tasks" data-id="${item.id}" title="Excluir tarefa">${icon("trash")}</button>
    </div>
  </article>`;
}

async function renderLeads() {
  const [leads] = await Promise.all([ensureLeads(true), ensureOptions(), ensurePlans()]);
  state.collections.leads = leads;
  $("#content").innerHTML = `
    ${databaseUpdateNotice()}
    <div class="section-toolbar">
      <div class="filter-group">
        <div class="search-field">${icon("search")}<input id="lead-search" placeholder="Buscar por nome, telefone ou e-mail" value="${escapeHtml(state.globalLeadSearch)}" /></div>
        <select id="lead-status-filter" class="filter-select">
          <option value="">Todos os status</option>
          ${optionValues("leads.status").map((s) => `<option>${escapeHtml(s)}</option>`).join("")}
        </select>
      </div>
      <span class="muted" id="lead-count" style="font-size:11px">${leads.length} lead(s)</span>
    </div>
    <div id="leads-table">${renderLeadsTable(leads)}</div>
  `;
  const filter = () => {
    const term = $("#lead-search").value.toLowerCase();
    const status = $("#lead-status-filter").value;
    const today = new Date().toISOString().slice(0, 10);
    const tomorrowDate = new Date(`${today}T12:00:00`);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);
    const filtered = leads.filter((lead) => {
      const haystack = `${lead.name} ${lead.phone || ""} ${lead.email || ""} ${lead.plan_name || ""}`.toLowerCase();
      const quick = state.quickFilters.leads;
      return haystack.includes(term)
        && (!status || lead.status === status)
        && (quick !== "active" || optionValues("leads.status").slice(0, 2).includes(lead.status))
        && (quick !== "no-contact" || !lead.contact_date)
        && (quick !== "renewal" || (lead.effective_date && lead.effective_date >= today && lead.effective_date <= tomorrow));
    });
    $("#leads-table").innerHTML = renderLeadsTable(filtered);
    $("#lead-count").textContent = `${filtered.length} lead(s)`;
  };
  $("#lead-search").addEventListener("input", filter);
  $("#lead-status-filter").addEventListener("change", filter);
  if (state.quickFilters.leads || state.globalLeadSearch) filter();
}

function renderLeadsTable(leads) {
  if (!leads.length) return emptyState("Nenhum lead encontrado", "Cadastre seu primeiro contato ou ajuste os filtros da busca.", "leads", "users");
  return `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Lead</th><th>Contato</th><th>Origem</th><th>Data contato</th><th>Vigência</th><th>Plano</th><th>Status</th><th>Comissão</th><th></th></tr></thead>
    <tbody>${leads.map((lead) => `<tr>
      <td><div class="lead-cell"><span class="lead-avatar">${initials(lead.name)}</span><div><strong>${escapeHtml(lead.name)}</strong><span>${escapeHtml(lead.email || "E-mail não informado")}</span></div></div></td>
      <td>${escapeHtml(lead.phone || "-")}</td>
      <td>${escapeHtml(lead.origin || "-")}</td>
      <td>${formatDate(lead.contact_date)}</td>
      <td>${formatDate(lead.effective_date)}</td>
      <td><strong>${escapeHtml(lead.plan_name || "-")}</strong>${lead.plan_name ? `<br><span class="muted">${currency(lead.plan_value)} · ${Number(lead.commission_percent || 0)}%</span>` : ""}</td>
      <td>${badge(lead.status)}</td>
      <td><strong>${currency(lead.commission)}</strong>${lead.has_bonus ? `<br><span class="bonus-label">+ ${currency(lead.bonus_value)} · ${escapeHtml(lead.bonus_description || "Premiação")}</span>` : ""}</td>
      <td><div class="actions">
        <button class="icon-button" data-convert-lead="${lead.id}" title="Converter em cliente">${icon("check")}</button>
        <button class="icon-button" data-schedule-return="${lead.id}" title="Agendar retorno">${icon("clock")}</button>
        <button class="icon-button" data-history-lead="${lead.id}" title="Histórico do lead">${icon("dashboard")}</button>
        <button class="icon-button" data-followup-lead="${lead.id}" title="Criar follow-up">${icon("message")}</button>
        <button class="icon-button" data-edit="leads" data-id="${lead.id}" title="Editar">${icon("edit")}</button>
        <button class="icon-button" data-delete="leads" data-id="${lead.id}" title="Excluir">${icon("trash")}</button>
      </div></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

async function renderKanban() {
  const [leads] = await Promise.all([ensureLeads(true), ensureOptions()]);
  state.collections.leads = leads;
  const columns = state.options["leads.status"] || [];
  $("#content").innerHTML = `
    <div class="section-toolbar">
      <div>
        <strong>Fluxo dos leads</strong>
        <p class="muted" style="font-size:11px;margin:4px 0 0">Arraste os cartões para mudar o status. Edite o nome da coluna pelo lápis.</p>
      </div>
      <button class="button button-secondary" data-view="settings">${icon("settings")} Configurar colunas</button>
    </div>
    <div class="kanban-board">
      ${columns.map((column) => {
        const cards = leads.filter((lead) => lead.status === column.value);
        return `<section class="kanban-column" data-kanban-status="${escapeHtml(column.value)}">
          <header class="kanban-header">
            <div><strong>${escapeHtml(column.value)}</strong><span>${cards.length}</span></div>
            <button class="icon-button" data-rename-option="${column.id}" data-option-value="${escapeHtml(column.value)}" title="Renomear coluna">${icon("edit")}</button>
          </header>
          <div class="kanban-cards">
            ${cards.length ? cards.map((lead) => `<article class="kanban-card" draggable="true" data-lead-id="${lead.id}">
              <div class="lead-cell"><span class="lead-avatar">${initials(lead.name)}</span><div><strong>${escapeHtml(lead.name)}</strong><span>${escapeHtml(lead.origin || "Origem não informada")}</span></div></div>
              <div class="kanban-contact">${icon("phone")} ${escapeHtml(lead.phone || "Sem telefone")}</div>
              ${lead.plan_name ? `<div class="kanban-plan">${escapeHtml(lead.plan_name)} · ${Number(lead.commission_percent || 0)}%</div>` : ""}
              <footer>
                <strong>${currency(lead.commission)}</strong>
                <select class="kanban-move" data-kanban-move="${lead.id}" aria-label="Mover ${escapeHtml(lead.name)} para">
                  ${columns.map((target) => `<option value="${escapeHtml(target.value)}" ${target.value === lead.status ? "selected" : ""}>${escapeHtml(target.value)}</option>`).join("")}
                </select>
                <button class="icon-button" data-edit="leads" data-id="${lead.id}" title="Editar">${icon("edit")}</button>
              </footer>
            </article>`).join("") : '<div class="kanban-empty">Arraste um lead para cá</div>'}
          </div>
        </section>`;
      }).join("")}
      <button class="kanban-add-column" data-view="settings">${icon("plus")} Nova coluna</button>
    </div>
  `;
  bindKanbanEvents();
}

function bindKanbanEvents() {
  let draggedId = null;
  $$(".kanban-card").forEach((card) => {
    card.addEventListener("dragstart", () => {
      draggedId = card.dataset.leadId;
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      $$(".kanban-column").forEach((column) => column.classList.remove("drag-over"));
    });
  });
  $$(".kanban-column").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("drag-over");
    });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      column.classList.remove("drag-over");
      const lead = state.leads.find((item) => sameId(item.id, draggedId));
      const status = column.dataset.kanbanStatus;
      if (!lead || lead.status === status) return;
      try {
        await api(`/api/leads/${lead.id}`, {
          method: "PUT",
          body: JSON.stringify({ status })
        });
        state.leads = [];
        showToast(`${lead.name} movido para ${status}.`);
        await renderKanban();
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
  $$(".kanban-move").forEach((select) => {
    select.addEventListener("change", async () => {
      const lead = state.leads.find((item) => sameId(item.id, select.dataset.kanbanMove));
      if (!lead || lead.status === select.value) return;
      try {
        await api(`/api/leads/${lead.id}`, {
          method: "PUT",
          body: JSON.stringify({ status: select.value })
        });
        state.leads = [];
        showToast(`${lead.name} movido para ${select.value}.`);
        await renderKanban();
      } catch (error) {
        showToast(error.message, "error");
        select.value = lead.status;
      }
    });
  });
}

async function renderPending() {
  await Promise.all([ensureLeads(), ensureOptions()]);
  const items = await api("/api/pending");
  state.collections.pending = items;
  $("#content").innerHTML = `
    <div class="section-toolbar">
      <div class="filter-group">
        <div class="search-field">${icon("search")}<input id="pending-search" placeholder="Buscar pendência ou cliente" /></div>
        <select id="pending-filter" class="filter-select"><option value="">Todos os status</option>${optionValues("pending.status").map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select>
      </div>
      <span class="muted" style="font-size:11px">${items.filter((item) => item.status !== terminalOption("pending.status", "Concluída")).length} em aberto</span>
    </div>
    <div id="pending-list">${renderPendingCards(items)}</div>
  `;
  const apply = () => {
    const term = $("#pending-search").value.toLowerCase();
    const status = $("#pending-filter").value;
    const today = new Date().toISOString().slice(0, 10);
    const quick = state.quickFilters.pending;
    const finalPending = terminalOption("pending.status", "Concluída");
    const filtered = items.filter((item) => `${item.type} ${item.description || ""} ${item.lead_name}`.toLowerCase().includes(term)
      && (!status || item.status === status)
      && (quick !== "open" || item.status !== finalPending)
      && (quick !== "overdue" || (item.due_date && item.due_date < today && item.status !== finalPending)));
    $("#pending-list").innerHTML = renderPendingCards(filtered);
  };
  $("#pending-search").addEventListener("input", apply);
  $("#pending-filter").addEventListener("change", apply);
  if (state.quickFilters.pending) apply();
}

function renderPendingCards(items) {
  if (!items.length) return emptyState("Nenhuma pendência", "Registre documentos, retornos e outros itens ligados aos seus leads.", "pending", "alert");
  return `<div class="cards-grid">${items.map((item) => `<article class="data-card">
    <div class="card-top"><div>${badge(item.status)}<h3>${escapeHtml(item.type)}</h3><div class="card-meta"><span>${escapeHtml(item.lead_name)}</span><span>${formatDate(item.due_date)}</span></div></div>
      <div class="actions"><button class="icon-button" data-edit="pending" data-id="${item.id}">${icon("edit")}</button><button class="icon-button" data-delete="pending" data-id="${item.id}">${icon("trash")}</button></div>
    </div>
    <p class="card-description">${escapeHtml(item.description || "Sem observações adicionais.")}</p>
    <div class="card-footer">${priority(item.priority)}<button class="text-button" data-followup-lead="${item.lead_id}">Contatar cliente</button></div>
  </article>`).join("")}</div>`;
}

async function renderTasks() {
  await Promise.all([ensureLeads(), ensureOptions()]);
  const items = await api("/api/tasks");
  state.collections.tasks = items;
  $("#content").innerHTML = `
    <div class="section-toolbar">
      <div class="filter-group">
        <div class="search-field">${icon("search")}<input id="task-search" placeholder="Buscar tarefa ou cliente" /></div>
        <select id="task-filter" class="filter-select"><option value="">Todos os status</option>${optionValues("tasks.status").map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select>
      </div>
      <span class="muted" style="font-size:11px">${items.filter((item) => item.status !== terminalOption("tasks.status", "Concluída")).length} tarefa(s) aberta(s)</span>
    </div>
    <div id="tasks-table">${renderTasksTable(items)}</div>
  `;
  const apply = () => {
    const term = $("#task-search").value.toLowerCase();
    const status = $("#task-filter").value;
    const today = new Date().toISOString().slice(0, 10);
    const finalTask = terminalOption("tasks.status", "Concluída");
    const quick = state.quickFilters.tasks;
    $("#tasks-table").innerHTML = renderTasksTable(items.filter((item) => `${item.title} ${item.category || ""} ${item.lead_name || ""}`.toLowerCase().includes(term)
      && (!status || item.status === status)
      && (quick !== "today" || (item.date === today && item.status !== finalTask))
      && (quick !== "overdue" || (item.date < today && item.status !== finalTask))));
  };
  $("#task-search").addEventListener("input", apply);
  $("#task-filter").addEventListener("change", apply);
  if (state.quickFilters.tasks) apply();
}

function renderTasksTable(items) {
  if (!items.length) return emptyState("Nenhuma tarefa encontrada", "Cadastre atividades com data, prioridade e cliente relacionado.", "tasks", "check");
  return `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Tarefa</th><th>Tipo / categoria</th><th>Cliente</th><th>Data e horário</th><th>Prioridade</th><th>Status</th><th></th></tr></thead>
    <tbody>${items.map((item) => `<tr>
      <td><strong>${escapeHtml(item.title)}</strong><div class="muted" style="font-size:9px;margin-top:3px;max-width:220px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.notes || "")}</div></td>
      <td>${escapeHtml(item.type || "-")}<br><span class="muted">${escapeHtml(item.category || "")}</span></td>
      <td>${escapeHtml(item.lead_name || "-")}</td>
      <td>${formatDate(item.date)} · ${escapeHtml(item.time || "--:--")}</td>
      <td>${priority(item.priority)}</td>
      <td>${badge(item.status)}</td>
      <td><div class="actions">
        <button class="icon-button google-calendar-button" data-google-calendar="${item.id}" title="Adicionar ao Google Agenda" aria-label="Adicionar ${escapeHtml(item.title)} ao Google Agenda">${icon("calendar")}</button>
        ${item.status !== terminalOption("tasks.status", "Concluída") ? `<button class="icon-button" data-complete-task="${item.id}" title="Concluir">${icon("check")}</button>` : ""}
        <button class="icon-button" data-edit="tasks" data-id="${item.id}">${icon("edit")}</button>
        <button class="icon-button" data-delete="tasks" data-id="${item.id}">${icon("trash")}</button>
      </div></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function paymentTotal(lead) {
  return Number(lead.commission || 0) + (lead.has_bonus ? Number(lead.bonus_value || 0) : 0);
}

function paymentStatus(lead) {
  return lead.payment_status || "A receber";
}

function isPaymentReceived(lead) {
  return paymentStatus(lead).toLowerCase() === "recebido";
}

function isPaymentReceivable(lead) {
  return paymentStatus(lead).toLowerCase() === "a receber";
}

function paymentDate(lead) {
  return lead.contact_date || lead.entry_date || "";
}

async function renderPayments() {
  const [leads, plans] = await Promise.all([ensureLeads(true), ensurePlans(), ensureOptions()]);
  const payments = leads
    .filter((lead) => lead.plan_name || lead.plan_id)
    .sort((left, right) => paymentDate(right).localeCompare(paymentDate(left)));
  state.collections.payments = payments;
  $("#content").innerHTML = `
    ${databaseUpdateNotice()}
    <section id="payments-summary" class="payment-stats-grid"></section>
    <div class="section-toolbar payment-toolbar">
      <div class="payment-filters">
        <select id="payment-search-field" class="filter-select">
          <option value="all">Todos</option>
          <option value="client">Nome do cliente</option>
          <option value="plan">Plano</option>
          <option value="effective">Vigência</option>
        </select>
        <div class="search-field">${icon("search")}<input id="payment-search" placeholder="Pesquisar em todos os campos" /></div>
        <select id="payment-plan-filter" class="filter-select">
          <option value="">Todos os planos</option>
          ${plans.map((plan) => `<option value="${escapeHtml(plan.name)}">${escapeHtml(plan.name)}</option>`).join("")}
        </select>
        <select id="payment-status-filter" class="filter-select">
          <option value="">Todos os status financeiros</option>
          ${optionValues("payments.status").map((status) => `<option>${escapeHtml(status)}</option>`).join("")}
        </select>
        <label class="date-filter"><span>De</span><input id="payment-date-from" type="date" /></label>
        <label class="date-filter"><span>Até</span><input id="payment-date-to" type="date" /></label>
      </div>
      <button class="button button-secondary" id="export-payments">${icon("download")} Exportar Excel</button>
    </div>
    <div id="payments-table"></div>
  `;

  const applyFilters = () => {
    const field = $("#payment-search-field").value;
    const term = $("#payment-search").value.trim().toLowerCase();
    const plan = $("#payment-plan-filter").value;
    const paymentStatus = $("#payment-status-filter").value;
    const from = $("#payment-date-from").value;
    const to = $("#payment-date-to").value;
    const filtered = payments.filter((lead) => {
      const date = paymentDate(lead);
      const values = {
        client: lead.name || "",
        plan: lead.plan_name || "",
        effective: `${lead.effective_date || ""} ${formatDate(lead.effective_date)}`
      };
      const haystack = field === "all"
        ? `${values.client} ${values.plan} ${values.effective} ${lead.contact_date || ""}`
        : values[field] || "";
      return (!term || haystack.toLowerCase().includes(term))
        && (!plan || lead.plan_name === plan)
        && (!paymentStatus || (lead.payment_status || "A receber") === paymentStatus)
        && (!from || date >= from)
        && (!to || date <= to);
    });
    state.collections.filteredPayments = filtered;
    renderPaymentsSummary(filtered);
    $("#payments-table").innerHTML = renderPaymentsTable(filtered);
  };

  ["payment-search-field", "payment-search", "payment-plan-filter", "payment-status-filter", "payment-date-from", "payment-date-to"]
    .forEach((id) => $(`#${id}`).addEventListener(id === "payment-search" ? "input" : "change", applyFilters));
  $("#payment-search-field").addEventListener("change", () => {
    const labels = {
      all: "Pesquisar em todos os campos",
      client: "Digite o nome do cliente",
      plan: "Digite o nome do plano",
      effective: "Digite a data ou vigência"
    };
    $("#payment-search").placeholder = labels[$("#payment-search-field").value];
  });
  $("#export-payments").addEventListener("click", () => exportPaymentsXls(state.collections.filteredPayments || []));
  $("#payments-table").addEventListener("change", async (event) => {
    const toggle = event.target.closest("[data-payment-status-toggle]");
    if (!toggle) return;
    const lead = state.collections.payments.find((item) => sameId(item.id, toggle.dataset.paymentStatusToggle));
    if (!lead) return showToast("Pagamento não encontrado.", "error");
    const previous = paymentStatus(lead);
    const next = toggle.checked ? "Recebido" : "A receber";
    lead.payment_status = next;
    state.leads = state.leads.map((item) => sameId(item.id, lead.id) ? { ...item, payment_status: next } : item);
    try {
      await api(`/api/leads/${lead.id}`, {
        method: "PUT",
        body: JSON.stringify({ payment_status: next })
      });
      showToast(`Status financeiro alterado para ${next}.`);
      applyFilters();
    } catch (error) {
      lead.payment_status = previous;
      toggle.checked = previous.toLowerCase() === "recebido";
      showToast(error.message, "error");
      applyFilters();
    }
  });
  applyFilters();
}

function renderPaymentsSummary(items) {
  const receivable = items.filter(isPaymentReceivable).reduce((sum, item) => sum + paymentTotal(item), 0);
  const received = items.filter(isPaymentReceived).reduce((sum, item) => sum + paymentTotal(item), 0);
  $("#payments-summary").innerHTML = `
    ${statCard("A receber", currency(receivable), "Pagamentos ainda abertos", "money", "#fff0d8")}
    ${statCard("Recebido", currency(received), "Pagamentos marcados como recebidos", "check", "#d9eee8")}
    ${statCard("Total geral", currency(receivable + received), "A receber + recebido", "dashboard", "#e2f1c4")}
  `;
}

function renderPaymentsTable(items) {
  if (!items.length) return emptyState("Nenhum pagamento encontrado", "Ajuste os filtros ou vincule um plano a um lead.", null, "money");
  return `<div class="table-wrap"><table class="data-table payment-table">
    <thead><tr><th>Data de contato</th><th>Cliente</th><th>Plano</th><th>Vigência</th><th>Status financeiro</th><th>Valor do plano</th><th>Percentual</th><th>Comissão</th><th>Premiação</th><th>Total</th></tr></thead>
    <tbody>${items.map((lead) => `<tr>
      <td>${formatDate(paymentDate(lead))}</td>
      <td><strong>${escapeHtml(lead.name)}</strong><br><span class="muted">${escapeHtml(lead.phone || "")}</span></td>
      <td>${escapeHtml(lead.plan_name || "-")}</td>
      <td>${formatDate(lead.effective_date)}</td>
      <td>
        <label class="payment-status-toggle">
          <input type="checkbox" data-payment-status-toggle="${lead.id}" ${isPaymentReceived(lead) ? "checked" : ""} />
          <span class="toggle-track"></span>
          <strong>${escapeHtml(paymentStatus(lead))}</strong>
        </label>
      </td>
      <td>${currency(lead.plan_value)}</td>
      <td>${Number(lead.commission_percent || 0)}%</td>
      <td><strong>${currency(lead.commission)}</strong></td>
      <td>${lead.has_bonus ? `<strong>${currency(lead.bonus_value)}</strong><br><span class="muted">${escapeHtml(lead.bonus_description || "Premiação")}</span>` : currency(0)}</td>
      <td><strong class="payment-total">${currency(paymentTotal(lead))}</strong></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function excelEscape(value) {
  return escapeHtml(value == null ? "" : value);
}

function exportPaymentsXls(items) {
  if (!items.length) return showToast("Não há pagamentos no filtro atual para exportar.", "error");
  const commission = items.reduce((sum, item) => sum + Number(item.commission || 0), 0);
  const bonuses = items.reduce((sum, item) => sum + (item.has_bonus ? Number(item.bonus_value || 0) : 0), 0);
  const rows = items.map((lead) => `<tr>
    <td class="date">${excelEscape(formatDate(paymentDate(lead), { day: "2-digit", month: "2-digit", year: "numeric" }))}</td>
    <td>${excelEscape(lead.name)}</td>
    <td>${excelEscape(lead.plan_name || "")}</td>
    <td class="date">${excelEscape(formatDate(lead.effective_date, { day: "2-digit", month: "2-digit", year: "numeric" }))}</td>
    <td>${excelEscape(lead.payment_status || "A receber")}</td>
    <td class="money">${Number(lead.plan_value || 0)}</td>
    <td class="percent">${Number(lead.commission_percent || 0) / 100}</td>
    <td class="money">${Number(lead.commission || 0)}</td>
    <td class="money">${lead.has_bonus ? Number(lead.bonus_value || 0) : 0}</td>
    <td>${excelEscape(lead.has_bonus ? lead.bonus_description || "Premiação" : "")}</td>
    <td class="money">${paymentTotal(lead)}</td>
  </tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="UTF-8"><style>
    table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt}
    th{background:#245c54;color:#fff;font-weight:bold}
    th,td{border:1px solid #b7c7c2;padding:7px}
    .title{background:#163f39;color:#fff;font-size:16pt}
    .summary{background:#e8f3ef;font-weight:bold}
    .money{mso-number-format:"R\\$ #,##0.00"}
    .percent{mso-number-format:"0.00%"}
    .date{mso-number-format:"dd/mm/yyyy"}
  </style></head><body><table>
    <tr><th class="title" colspan="11">Pagamentos e Premiações</th></tr>
    <tr class="summary"><td colspan="2">Total de comissões</td><td class="money">${commission}</td><td colspan="2">Total de premiações</td><td class="money">${bonuses}</td><td colspan="2">Total geral</td><td class="money">${commission + bonuses}</td><td colspan="2"></td></tr>
    <tr><th>Data de contato</th><th>Cliente</th><th>Plano</th><th>Vigência</th><th>Status financeiro</th><th>Valor do plano</th><th>Percentual</th><th>Comissão</th><th>Premiação</th><th>Descrição da premiação</th><th>Total</th></tr>
    ${rows}
  </table></body></html>`;
  const blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pagamentos-premiacoes-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Planilha Excel exportada.");
}

async function renderReports() {
  const leads = await ensureLeads(true);
  const months = [...new Set(leads.map((lead) => String(paymentDate(lead) || lead.entry_date || "").slice(0, 7)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));
  const selected = state.reportMonth || months[0] || new Date().toISOString().slice(0, 7);
  state.reportMonth = selected;
  const items = leads.filter((lead) => String(paymentDate(lead) || lead.entry_date || "").startsWith(selected));
  state.collections.reportItems = items;
  $("#content").innerHTML = `
    <div class="section-toolbar">
      <div><strong>Relatório mensal</strong><p class="muted" style="font-size:11px;margin:4px 0 0">Comissões, planos vendidos e origens do mês.</p></div>
      <div class="payment-filters">
        <input id="report-month" type="month" value="${escapeHtml(selected)}" />
        <button class="button button-secondary" id="export-report">${icon("download")} Exportar relatório</button>
      </div>
    </div>
    <section class="payment-stats-grid">
      ${statCard("Leads no mês", items.length, "Entradas e contatos", "users", "#d9eee8")}
      ${statCard("Comissões", currency(items.reduce((sum, item) => sum + Number(item.commission || 0), 0)), "Total calculado", "money", "#e2f1c4")}
      ${statCard("Premiações", currency(items.reduce((sum, item) => sum + (item.has_bonus ? Number(item.bonus_value || 0) : 0), 0)), "Valores adicionais", "check", "#fff0d8")}
    </section>
    <section class="dashboard-grid">
      <div class="panel"><div class="panel-header"><div><h3>Planos vendidos</h3><p>Quantidade por plano</p></div></div>${renderCountList(countByField(items, "plan_name", "Sem plano"))}</div>
      <div class="panel"><div class="panel-header"><div><h3>Status dos leads</h3><p>Distribuição do mês</p></div></div>${renderCountList(countByField(items, "status", "Sem status"))}</div>
      <div class="panel"><div class="panel-header"><div><h3>Origem dos leads</h3><p>Canais que trouxeram clientes</p></div></div>${renderCountList(countByField(items, "origin", "Não informada"))}</div>
    </section>
  `;
  $("#report-month").addEventListener("change", (event) => {
    state.reportMonth = event.target.value;
    renderReports();
  });
  $("#export-report").addEventListener("click", () => exportReportXls(state.collections.reportItems || [], state.reportMonth));
}

function countByField(items, field, fallback) {
  const counts = new Map();
  items.forEach((item) => {
    const key = item[field] || fallback;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function renderCountList(items) {
  if (!items.length) return emptyMini("Sem dados para o filtro atual.");
  return `<div class="origin-list">${items.map((item) => `<div class="origin-row"><i></i><span>${escapeHtml(item.label)}</span><strong>${item.value}</strong></div>`).join("")}</div>`;
}

function exportReportXls(items, month) {
  if (!items.length) return showToast("Não há dados para exportar neste mês.", "error");
  exportSimpleXls(`relatorio-${month}.xls`, "Relatório mensal", [
    ["Cliente", "Plano", "Data contato", "Vigência", "Status", "Status financeiro", "Valor", "Comissão", "Premiação", "Total"],
    ...items.map((lead) => [
      lead.name, lead.plan_name || "", formatDate(paymentDate(lead)), formatDate(lead.effective_date),
      lead.status, lead.payment_status || "A receber", currency(lead.plan_value),
      currency(lead.commission), currency(lead.has_bonus ? lead.bonus_value : 0), currency(paymentTotal(lead))
    ])
  ]);
}

async function renderBackup() {
  $("#content").innerHTML = `
    <section class="panel backup-panel">
      <div class="panel-header"><div><h3>Backup dos dados</h3><p>Exporta os principais cadastros do CRM para Excel.</p></div><span class="stat-icon">${icon("download")}</span></div>
      <p class="muted">Use antes de grandes alterações no Supabase ou como cópia periódica de segurança. O arquivo gerado não apaga nem altera nenhum dado.</p>
      <div class="button-row">
        <button class="button button-primary" id="export-backup">${icon("download")} Exportar backup geral</button>
        <button class="button button-secondary" data-view="reports">${icon("dashboard")} Ver relatórios</button>
      </div>
    </section>
  `;
  $("#export-backup").addEventListener("click", exportBackupXls);
}

async function exportBackupXls() {
  const [leads, plans, tasks, pending, appointments, followups] = await Promise.all([
    ensureLeads(true),
    ensurePlans(true),
    api("/api/tasks"),
    api("/api/pending"),
    api("/api/appointments"),
    api("/api/followups")
  ]);
  const sections = [
    ["Leads", ["Nome", "Telefone", "E-mail", "Origem", "Status", "Plano", "Valor", "Comissão", "Premiação"], leads.map((item) => [item.name, item.phone, item.email, item.origin, item.status, item.plan_name, currency(item.plan_value), currency(item.commission), currency(item.has_bonus ? item.bonus_value : 0)])],
    ["Planos", ["Nome", "Comissão %"], plans.map((item) => [item.name, item.commission_percent])],
    ["Tarefas", ["Título", "Cliente", "Data", "Hora", "Prioridade", "Status"], tasks.map((item) => [item.title, item.lead_name, item.date, item.time, item.priority, item.status])],
    ["Pendências", ["Tipo", "Cliente", "Prazo", "Prioridade", "Status"], pending.map((item) => [item.type, item.lead_name, item.due_date, item.priority, item.status])],
    ["Agenda", ["Título", "Cliente", "Data", "Hora", "Concluído"], appointments.map((item) => [item.title, item.lead_name, item.date, item.time, item.completed ? "Sim" : "Não"])],
    ["Follow-ups", ["Cliente", "Canal", "Status", "Mensagem", "Criado em"], followups.map((item) => [item.lead_name, item.channel, item.status, item.message, formatDateTime(item.created_at)])]
  ];
  exportMultiSectionXls(`backup-crm-${new Date().toISOString().slice(0, 10)}.xls`, sections);
  showToast("Backup exportado.");
}

function exportSimpleXls(filename, title, rows) {
  exportMultiSectionXls(filename, [[title, rows[0], rows.slice(1)]]);
}

function exportMultiSectionXls(filename, sections) {
  const tables = sections.map(([title, headers, rows]) => `
    <tr><th class="title" colspan="${headers.length}">${excelEscape(title)}</th></tr>
    <tr>${headers.map((head) => `<th>${excelEscape(head)}</th>`).join("")}</tr>
    ${rows.map((row) => `<tr>${row.map((cell) => `<td>${excelEscape(cell)}</td>`).join("")}</tr>`).join("")}
    <tr>${headers.map(() => "<td></td>").join("")}</tr>
  `).join("");
  const html = `<!doctype html><html><head><meta charset="UTF-8"><style>
    table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt}
    th{background:#245c54;color:#fff;font-weight:bold}
    th,td{border:1px solid #b7c7c2;padding:7px}
    .title{background:#163f39;color:#fff;font-size:15pt}
  </style></head><body><table>${tables}</table></body></html>`;
  const blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function renderFollowup(preselectedLead = null) {
  const [leads, history] = await Promise.all([ensureLeads(), api("/api/followups"), ensureOptions()]);
  state.collections.followups = history;
  const selected = preselectedLead || state.followupLead || leads[0]?.id || "";
  state.followupLead = selected;
  $("#content").innerHTML = `
    <section class="followup-layout">
      <div class="panel followup-builder">
        <div class="panel-header"><div><h3>Mensagem para o cliente</h3><p>Escreva, salve e envie pelo WhatsApp</p></div><span class="stat-icon">${icon("message")}</span></div>
        ${leads.length ? `<div class="form-stack">
          <label><span>Cliente</span><select id="followup-lead">${leads.map((lead) => `<option value="${lead.id}" ${sameId(selected, lead.id) ? "selected" : ""}>${escapeHtml(lead.name)} · ${escapeHtml(lead.status)}</option>`).join("")}</select></label>
          <label><span>Modelo de mensagem</span><select id="followup-template"><option value="">Escrever do zero</option>${optionValues("followup.template").map((template) => `<option value="${escapeHtml(template)}">${escapeHtml(template.slice(0, 80))}${template.length > 80 ? "..." : ""}</option>`).join("")}</select></label>
          <label><span>Mensagem</span><textarea id="followup-message" placeholder="Digite a mensagem para o cliente."></textarea></label>
          <div class="button-row">
            <button class="button button-secondary" id="copy-message">${icon("copy")} Copiar</button>
            <button class="button button-secondary" id="save-followup">${icon("check")} Salvar histórico</button>
            <button class="button whatsapp-button" id="send-whatsapp">${icon("send")} Abrir WhatsApp</button>
          </div>
        </div>` : emptyState("Cadastre um lead primeiro", "As mensagens de follow-up precisam estar ligadas a um cliente.", "leads", "users")}
      </div>
      <div class="panel">
        <div class="panel-header"><div><h3>Histórico de follow-ups</h3><p>Mensagens criadas e contatos realizados</p></div></div>
        ${history.length ? `<div class="card-list">${history.map((item) => `<article class="history-item">
          <div class="card-top"><div class="lead-cell"><span class="lead-avatar">${initials(item.lead_name)}</span><div><strong>${escapeHtml(item.lead_name)}</strong><span>${escapeHtml(item.channel)}</span></div></div>${badge(item.status)}</div>
          <p class="history-message">${escapeHtml(item.message)}</p>
          <div class="history-meta"><span>${formatDateTime(item.created_at)}</span><div class="actions"><button class="icon-button" data-history-whatsapp="${item.id}" title="Abrir no WhatsApp">${icon("phone")}</button><button class="icon-button" data-delete="followups" data-id="${item.id}">${icon("trash")}</button></div></div>
        </article>`).join("")}</div>` : emptyState("Histórico vazio", "Crie e salve uma mensagem para começar o acompanhamento.", null, "message")}
      </div>
    </section>
  `;
  bindFollowupEvents();
}

function bindFollowupEvents() {
  if (!$("#followup-lead")) return;
  $("#followup-lead").addEventListener("change", (event) => { state.followupLead = event.target.value; });
  $("#followup-template")?.addEventListener("change", () => {
    const template = $("#followup-template").value;
    if (!template) return;
    const lead = state.leads.find((item) => sameId(item.id, $("#followup-lead").value));
    $("#followup-message").value = applyMessageTemplate(template, lead);
  });
  $("#copy-message").addEventListener("click", async () => {
    const text = $("#followup-message").value.trim();
    if (!text) return showToast("Crie uma mensagem primeiro.", "error");
    await navigator.clipboard.writeText(text);
    showToast("Mensagem copiada.");
  });
  $("#save-followup").addEventListener("click", async () => {
    const text = $("#followup-message").value.trim();
    if (!text) return showToast("Crie uma mensagem primeiro.", "error");
    try {
      await api("/api/followups", { method: "POST", body: JSON.stringify({ lead_id: $("#followup-lead").value, message: text, status: "Rascunho", channel: "WhatsApp" }) });
      showToast("Follow-up salvo no histórico.");
      await renderFollowup($("#followup-lead").value);
    } catch (error) {
      showToast(error.message, "error");
    }
  });
  $("#send-whatsapp").addEventListener("click", () => openWhatsApp($("#followup-lead").value, $("#followup-message").value));
}

function applyMessageTemplate(template, lead = {}) {
  return String(template || "")
    .replaceAll("{nome}", lead.name || "")
    .replaceAll("{plano}", lead.plan_name || "")
    .replaceAll("{vigencia}", formatDate(lead.effective_date))
    .replaceAll("{valor}", currency(lead.plan_value || 0));
}

function openWhatsApp(leadId, message) {
  const lead = state.leads.find((item) => sameId(item.id, leadId));
  if (!lead) return showToast("Lead não encontrado.", "error");
  if (!message?.trim()) return showToast("Crie uma mensagem primeiro.", "error");
  let phone = String(lead.phone || "").replace(/\D/g, "");
  if (!phone) return showToast("Este lead não possui telefone cadastrado.", "error");
  if (phone.length <= 11) phone = `55${phone}`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message.trim())}`, "_blank", "noopener,noreferrer");
}

const optionGroups = [
  ["leads.origin", "Leads", "Origens", "Canais de entrada dos leads"],
  ["leads.status", "Leads e Kanban", "Status / colunas", "Etapas do fluxo comercial"],
  ["pending.type", "Pendências", "Tipos", "Tipos de documentos e retornos"],
  ["pending.status", "Pendências", "Status", "Situações das pendências"],
  ["tasks.type", "Tarefas", "Tipos", "Tipos de atividade"],
  ["tasks.category", "Tarefas", "Categorias", "Áreas de organização"],
  ["tasks.priority", "Tarefas", "Prioridades", "Níveis de importância"],
  ["tasks.status", "Tarefas", "Status", "Situações das tarefas"],
  ["payments.status", "Pagamentos", "Status financeiro", "Situações de recebimento"],
  ["followup.template", "Follow-up", "Modelos de mensagem", "Textos prontos para WhatsApp"]
];

const settingsSections = [
  ["leads", "Leads", "Origens e etapas do Kanban", "users"],
  ["plans", "Planos", "Nome e comissão", "money"],
  ["payments", "Pagamentos", "Status financeiro", "money"],
  ["followup", "Follow-up", "Modelos de mensagem", "message"],
  ["pending", "Pendências", "Tipos e status", "alert"],
  ["tasks", "Tarefas", "Tipos, categorias e status", "check"]
];

async function renderSettings() {
  const [options, plans] = await Promise.all([ensureOptions(true), ensurePlans(true)]);
  state.options = options;
  state.plans = plans;
  state.collections.plans = plans;
  $("#content").innerHTML = `
    ${databaseUpdateNotice()}
    <section class="settings-layout">
      <aside class="settings-menu panel">
        <div class="settings-menu-heading">
          <span class="eyebrow eyebrow-dark">Acessos</span>
          <h2>Configurações</h2>
        </div>
        <nav class="settings-nav" aria-label="Áreas de configurações">
          ${settingsSections.map(([id, title, description, iconName]) => `
            <button class="settings-nav-item ${state.settingsSection === id ? "active" : ""}" data-settings-section="${id}">
              <span class="settings-nav-icon">${icon(iconName)}</span>
              <span><strong>${title}</strong><small>${description}</small></span>
              ${icon("chevron")}
            </button>
          `).join("")}
        </nav>
      </aside>
      <div class="settings-content">
        ${renderSettingsSection()}
      </div>
    </section>
  `;
  $$(".settings-nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.settingsSection = button.dataset.settingsSection;
      renderSettings();
    });
  });
  bindSettingsEvents();
}

function renderSettingsSection() {
  if (state.settingsSection === "plans") {
    return `
      <div class="settings-section-header settings-section-actions">
        <div>
          <span class="eyebrow eyebrow-dark">Regras comerciais</span>
          <h2>Planos</h2>
          <p class="muted">Cadastre somente o nome do plano e o percentual de comissão.</p>
        </div>
        <button class="button button-primary" data-new="plans">${icon("plus")} Novo plano</button>
      </div>
      <div class="plan-grid">
        ${state.plans.length ? state.plans.map(renderPlanCard).join("") : `
          <div class="panel empty-state"><div><h3>Nenhum plano cadastrado</h3><p>Cadastre o primeiro plano para vinculá-lo aos leads.</p><button class="button button-primary" data-new="plans">Cadastrar plano</button></div></div>
        `}
      </div>
    `;
  }
  const groups = optionGroups.filter(([group]) => group.startsWith(`${state.settingsSection}.`));
  const section = settingsSections.find(([id]) => id === state.settingsSection);
  return `
    <div class="settings-section-header">
      <span class="eyebrow eyebrow-dark">Campos personalizados</span>
      <h2>${escapeHtml(section?.[1] || "Opções")}</h2>
      <p class="muted">Adicione, renomeie ou exclua as opções usadas nos cadastros.</p>
    </div>
    <div class="settings-groups">
      ${groups.map(([group, module, title, description]) => renderOptionGroup(group, module, title, description)).join("")}
    </div>
  `;
}

function renderPlanCard(plan) {
  return `<article class="panel plan-card">
    <div class="card-top">
      <div>
        <span class="settings-module">Plano</span>
        <h3>${escapeHtml(plan.name)}</h3>
      </div>
      <div class="actions">
        <button class="icon-button" data-edit="plans" data-id="${plan.id}" title="Editar plano">${icon("edit")}</button>
        <button class="icon-button" data-delete="plans" data-id="${plan.id}" title="Excluir plano">${icon("trash")}</button>
      </div>
    </div>
    <div class="plan-values">
      <div><span>Comissão</span><strong>${Number(plan.commission_percent || 0)}%</strong></div>
      <div><span>Cálculo</span><strong>Sobre o valor do lead</strong></div>
    </div>
  </article>`;
}

function renderOptionGroup(group, module, title, description) {
  const values = state.options[group] || [];
  return `<article class="panel option-panel" data-option-group="${group}">
    <div class="panel-header"><div><span class="settings-module">${module}</span><h3>${title}</h3><p>${description}</p></div></div>
    <div class="option-list">
      ${values.map((item) => `<div class="option-row">
        <input value="${escapeHtml(item.value)}" data-option-input="${item.id}" aria-label="Nome da opção ${escapeHtml(item.value)}" />
        <button class="icon-button" data-save-option="${item.id}" title="Salvar nome">${icon("check")}</button>
        <button class="icon-button" data-delete-option="${item.id}" title="Excluir opção">${icon("trash")}</button>
      </div>`).join("")}
    </div>
    <form class="option-add-form" data-add-option="${group}">
      <input name="value" placeholder="Nova opção" required />
      <button class="button button-secondary button-small" type="submit">${icon("plus")} Adicionar</button>
    </form>
  </article>`;
}

function bindSettingsEvents() {
  $$(".option-add-form").forEach((optionForm) => {
    optionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const [module, field] = optionForm.dataset.addOption.split(".");
      const value = new FormData(optionForm).get("value");
      try {
        await api("/api/options", {
          method: "POST",
          body: JSON.stringify({ module, field, value })
        });
        showToast("Opção adicionada.");
        await renderSettings();
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

const schemas = {
  plans: {
    title: "Plano",
    endpoint: "plans",
    fields: [
      ["name", "Nome do plano", "text", true],
      ["commission_percent", "Percentual de comissão (%)", "number", true]
    ]
  },
  leads: {
    title: "Lead",
    endpoint: "leads",
    fields: [
      ["name", "Nome", "text", true],
      ["phone", "Telefone", "tel"],
      ["email", "E-mail", "email"],
      ["origin", "Origem", "option", false, "leads.origin"],
      ["entry_date", "Data de entrada", "date", true],
      ["contact_date", "Data de contato", "date"],
      ["effective_date", "Data de vigência", "date"],
      ["plan_id", "Plano escolhido", "plan"],
      ["plan_value", "Valor fechado do plano (R$)", "number"],
      ["has_bonus", "Possui premiação?", "select", true, [["0", "Não"], ["1", "Sim"]]],
      ["bonus_description", "Descrição da premiação", "text"],
      ["bonus_value", "Valor da premiação (R$)", "number"],
      ["payment_status", "Status financeiro", "option", true, "payments.status"],
      ["status", "Status", "option", true, "leads.status"],
      ["notes", "Observações", "textarea", false, null, "full"]
    ]
  },
  appointments: {
    title: "Compromisso",
    endpoint: "appointments",
    fields: [
      ["title", "Título", "text", true],
      ["lead_id", "Cliente relacionado", "lead"],
      ["date", "Data", "date", true],
      ["time", "Horário", "time"],
      ["reminder", "Lembrete", "select", false, [["0", "No horário"], ["10", "10 minutos antes"], ["30", "30 minutos antes"], ["60", "1 hora antes"], ["1440", "1 dia antes"]]],
      ["completed", "Status", "select", false, [["0", "Pendente"], ["1", "Concluído"]]],
      ["notes", "Observações", "textarea", false, null, "full"]
    ]
  },
  pending: {
    title: "Pendência",
    endpoint: "pending",
    fields: [
      ["lead_id", "Lead", "lead", true],
      ["type", "Tipo", "option", true, "pending.type"],
      ["due_date", "Prazo", "date"],
      ["priority", "Prioridade", "select", true, ["Baixa", "Média", "Alta"]],
      ["status", "Status", "option", true, "pending.status"],
      ["description", "Descrição", "textarea", false, null, "full"]
    ]
  },
  tasks: {
    title: "Tarefa",
    endpoint: "tasks",
    fields: [
      ["title", "Título", "text", true],
      ["type", "Tipo", "option", false, "tasks.type"],
      ["category", "Categoria", "option", false, "tasks.category"],
      ["lead_id", "Cliente", "lead"],
      ["date", "Data", "date", true],
      ["time", "Horário", "time"],
      ["priority", "Prioridade", "option", true, "tasks.priority"],
      ["status", "Status", "option", true, "tasks.status"],
      ["notes", "Observação", "textarea", false, null, "full"]
    ]
  }
};

async function openEntityForm(entity, item = null) {
  const schema = schemas[entity];
  if (!schema) return;
  if (schema.fields.some((field) => field[2] === "option")) await ensureOptions();
  if (schema.fields.some((field) => field[2] === "lead")) await ensureLeads();
  if (schema.fields.some((field) => field[2] === "plan")) await ensurePlans();
  $("#modal-title").textContent = `${item ? "Editar" : "Novo"} ${schema.title.toLowerCase()}`;
  $("#modal-body").innerHTML = `<form id="entity-form" class="entity-form">
    <div class="form-grid">${schema.fields.map((field) => renderField(field, item || {})).join("")}</div>
    ${entity === "leads" ? '<div id="lead-plan-preview"></div>' : ""}
    <div class="form-actions">
      <button type="button" class="button button-secondary" data-close-modal>Cancelar</button>
      <button type="submit" class="button button-primary">${item ? "Salvar alterações" : "Cadastrar"}</button>
    </div>
  </form>`;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#entity-form input, #entity-form select")?.focus(), 20);
  if (entity === "leads") {
    ["plan_id", "plan_value", "has_bonus", "bonus_description", "bonus_value"].forEach((name) => {
      $(`#entity-form [name="${name}"]`)?.addEventListener(name === "bonus_description" || name === "plan_value" || name === "bonus_value" ? "input" : "change", updateLeadPlanPreview);
    });
    updateLeadPlanPreview();
  }
  $("#entity-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    submit.disabled = true;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    ["reminder", "completed"].forEach((key) => {
      if (key in data) data[key] = data[key] === "" ? null : Number(data[key]);
    });
    if ("lead_id" in data) data.lead_id = data.lead_id || null;
    if ("plan_id" in data) data.plan_id = data.plan_id || null;
    ["plan_value", "commission_percent", "bonus_value"].forEach((key) => {
      if (key in data) data[key] = Number(String(data[key]).replace(",", ".") || 0);
    });
    if ("has_bonus" in data) data.has_bonus = data.has_bonus === "1";
    if (entity === "leads" && data.plan_id && data.plan_value <= 0) {
      showToast("Informe o valor fechado do plano.", "error");
      submit.disabled = false;
      return;
    }
    if (entity === "leads" && data.has_bonus && data.bonus_value <= 0) {
      showToast("Informe o valor da premiação.", "error");
      submit.disabled = false;
      return;
    }
    try {
      await api(`/api/${schema.endpoint}${item ? `/${item.id}` : ""}`, {
        method: item ? "PUT" : "POST",
        body: JSON.stringify(data)
      });
      closeModal();
      if (entity === "leads") state.leads = [];
      if (entity === "plans") state.plans = [];
      showToast(`${schema.title} ${item ? "atualizado" : "cadastrado"} com sucesso.`);
      await navigate(state.view);
    } catch (error) {
      showToast(error.message, "error");
      submit.disabled = false;
    }
  });
}

function renderField(field, item) {
  const [name, label, type, required, options, width] = field;
  const defaults = {
    entry_date: new Date().toISOString().slice(0, 10),
    contact_date: new Date().toISOString().slice(0, 10),
    date: state.selectedDate,
    status: name === "status" ? undefined : "",
    priority: "Média",
    reminder: 30,
    completed: 0,
    has_bonus: 0
  };
  const value = name === "has_bonus"
    ? (item[name] ? "1" : "0")
    : item[name] ?? defaults[name] ?? "";
  const cls = width === "full" ? "field-full" : "";
  if (type === "textarea") {
    return `<label class="${cls}"><span>${label}</span><textarea name="${name}" ${required ? "required" : ""}>${escapeHtml(value)}</textarea></label>`;
  }
  if (type === "select" || type === "lead" || type === "option" || type === "plan") {
    const rawOptions = type === "lead"
      ? state.leads.map((lead) => [String(lead.id), lead.name])
      : type === "plan"
        ? state.plans.map((plan) => [
          String(plan.id),
          `${plan.name} · ${Number(plan.commission_percent || 0)}%`
        ])
      : type === "option"
        ? optionValues(options)
        : options || [];
    const normalized = rawOptions.map((option) => Array.isArray(option) ? option : [option, option]);
    return `<label class="${cls}"><span>${label}</span><select name="${name}" ${required ? "required" : ""}>
      ${!required ? '<option value="">Não informado</option>' : ""}
      ${normalized.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${String(value) === String(optionValue) ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}
    </select></label>`;
  }
  return `<label class="${cls}"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? "required" : ""} ${type === "number" ? 'step="0.01" min="0"' : ""} /></label>`;
}

function renderLeadPlanPreview(planId, planValue = 0, hasBonus = false, bonusDescription = "", bonusValue = 0) {
  const plan = state.plans.find((item) => sameId(item.id, planId));
  if (!plan) {
    return `<div class="commission-preview muted">Selecione um plano e informe o valor fechado para calcular a comissão.</div>`;
  }
  const commission = Number(planValue || 0) * Number(plan.commission_percent || 0) / 100;
  return `<div class="commission-preview">
    <div><span>Valor fechado</span><strong>${currency(planValue)}</strong></div>
    <div><span>Percentual</span><strong>${Number(plan.commission_percent || 0)}%</strong></div>
    <div><span>Comissão calculada</span><strong>${currency(commission)}</strong></div>
    <div><span>Premiação</span><strong>${hasBonus ? `${currency(bonusValue)} · ${escapeHtml(bonusDescription || "Premiação")}` : "Não"}</strong></div>
  </div>`;
}

function updateLeadPlanPreview() {
  const form = $("#entity-form");
  const preview = $("#lead-plan-preview");
  if (!form || !preview) return;
  preview.innerHTML = renderLeadPlanPreview(
    form.elements.plan_id?.value,
    Number(String(form.elements.plan_value?.value || 0).replace(",", ".")),
    form.elements.has_bonus?.value === "1",
    form.elements.bonus_description?.value || "",
    Number(String(form.elements.bonus_value?.value || 0).replace(",", "."))
  );
}

function closeModal() {
  $("#modal").hidden = true;
  $("#modal-body").innerHTML = "";
  document.body.style.overflow = "";
}

async function deleteRecord(entity, id) {
  const label = schemas[entity]?.title || "Registro";
  if (!window.confirm(`Excluir este ${label.toLowerCase()}? Esta ação não poderá ser desfeita.`)) return;
  try {
    await api(`/api/${entity}/${id}`, { method: "DELETE" });
    if (entity === "leads") state.leads = [];
    if (entity === "plans") state.plans = [];
    showToast(`${label} excluído.`);
    await navigate(state.view);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function convertLead(id) {
  const lead = state.leads.find((item) => sameId(item.id, id));
  if (!lead) return showToast("Lead não encontrado.", "error");
  const closedStatus = optionValues("leads.status").find((item) => ["Fechado", "Convertido", "Cliente"].includes(item)) || "Fechado";
  await api(`/api/leads/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status: closedStatus, payment_status: lead.payment_status || "A receber" })
  });
  state.leads = [];
  showToast(`${lead.name} convertido em cliente.`);
  await navigate(state.view);
}

async function scheduleReturn(id) {
  const lead = state.leads.find((item) => sameId(item.id, id));
  if (!lead) return showToast("Lead não encontrado.", "error");
  const date = window.prompt("Data do retorno (AAAA-MM-DD):", new Date().toISOString().slice(0, 10))?.trim();
  if (!date) return;
  const time = window.prompt("Horário do retorno (HH:MM):", "09:00")?.trim() || "09:00";
  await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: `Retorno para ${lead.name}`,
      type: "Ligação",
      category: "Relacionamento",
      lead_id: lead.id,
      date,
      time,
      priority: "Média",
      status: terminalOption("tasks.status", "Pendente"),
      notes: "Retorno agendado pelo cadastro do lead."
    })
  });
  showToast("Retorno agendado em Tarefas e Meu dia.");
}

async function openLeadHistory(id) {
  const lead = state.leads.find((item) => sameId(item.id, id));
  if (!lead) return showToast("Lead não encontrado.", "error");
  const [tasks, pending, followups] = await Promise.all([
    api("/api/tasks"),
    api("/api/pending"),
    api("/api/followups")
  ]);
  state.collections.tasks = tasks;
  state.collections.pending = pending;
  state.collections.followups = followups;
  const events = [
    { date: lead.entry_date || lead.created_at, title: "Entrada do lead", text: `${lead.origin || "Origem não informada"} · ${lead.status}` },
    lead.contact_date ? { date: lead.contact_date, title: "Contato", text: "Data de contato registrada" } : null,
    lead.effective_date ? { date: lead.effective_date, title: "Vigência", text: lead.plan_name || "Sem plano" } : null,
    ...tasks.filter((item) => sameId(item.lead_id, id)).map((item) => ({ date: item.date, title: `Tarefa: ${item.title}`, text: `${item.status} · ${item.priority}` })),
    ...pending.filter((item) => sameId(item.lead_id, id)).map((item) => ({ date: item.due_date || item.created_at, title: `Pendência: ${item.type}`, text: `${item.status} · ${item.description || ""}` })),
    ...followups.filter((item) => sameId(item.lead_id, id)).map((item) => ({ date: item.created_at, title: "Follow-up", text: item.message }))
  ].filter(Boolean).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  $("#modal-title").textContent = `Histórico de ${lead.name}`;
  $("#modal-body").innerHTML = `<div class="history-panel">
    <div class="lead-summary">
      <strong>${escapeHtml(lead.name)}</strong>
      <span>${escapeHtml(lead.phone || "Sem telefone")} · ${escapeHtml(lead.email || "Sem e-mail")}</span>
      <span>${escapeHtml(lead.plan_name || "Sem plano")} · ${currency(lead.plan_value)} · ${badge(lead.payment_status || "A receber")}</span>
    </div>
    <div class="timeline">${events.map((item) => `<div class="timeline-item">
      <span class="timeline-time">${formatDate(item.date)}</span>
      <div class="timeline-detail"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text || "")}</span></div>
    </div>`).join("")}</div>
  </div>`;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
}

function showLogin() {
  state.user = null;
  $("#app").hidden = true;
  $("#login-screen").hidden = false;
}

function showApp(user) {
  state.user = user;
  $("#sidebar-user").textContent = user.name;
  $("#login-screen").hidden = true;
  $("#app").hidden = false;
  navigate("dashboard");
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = event.submitter;
  const error = $("#login-error");
  if (hasMissingProductionConfig) {
    error.textContent = "O Supabase não foi configurado neste deploy.";
    return;
  }
  error.textContent = "";
  button.disabled = true;
  button.innerHTML = "Entrando...";
  try {
    const payload = Object.fromEntries(new FormData(form));
    const data = await api("/api/login", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    showApp(data.user);
  } catch (err) {
    error.textContent = err.message;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Entrar no CRM <span aria-hidden="true">→</span>';
  }
});

$("#toggle-password").innerHTML = icon("eye");
$("#toggle-password").addEventListener("click", () => {
  const input = $("#password");
  input.type = input.type === "password" ? "text" : "password";
  $("#toggle-password").innerHTML = icon(input.type === "password" ? "eye" : "eyeOff");
});

$("#logout-button").innerHTML = icon("logout");
$("#menu-button").innerHTML = icon("menu");
$$("[data-close-modal]").forEach((button) => { button.innerHTML = button.classList.contains("icon-button") ? icon("close") : button.innerHTML; });

$("#logout-button").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  showLogin();
});

$("#menu-button").addEventListener("click", () => $("#app").classList.add("sidebar-open"));
$("#sidebar-overlay").addEventListener("click", () => $("#app").classList.remove("sidebar-open"));

$("#main-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) navigate(button.dataset.view);
});

$("#primary-action").addEventListener("click", () => {
  const info = viewInfo[state.view];
  if (state.view === "followup") {
    $("#followup-lead")?.focus();
  } else if (info.entity) {
    openEntityForm(info.entity);
  }
});

$("#global-search")?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const value = event.currentTarget.value.trim();
  if (!value) return;
  state.globalLeadSearch = value;
  state.quickFilters = {};
  navigate("leads");
});

$("#content").addEventListener("click", async (event) => {
  const quickFilter = event.target.closest("[data-quick-filter]");
  if (quickFilter) {
    applyQuickFilter(quickFilter.dataset.quickFilter);
    return;
  }
  const googleCalendar = event.target.closest("[data-google-calendar]");
  if (googleCalendar) {
    const task = state.collections.tasks?.find(
      (item) => sameId(item.id, googleCalendar.dataset.googleCalendar)
    );
    if (!task) return showToast("Tarefa não encontrada.", "error");
    window.open(googleCalendarUrl(task), "_blank", "noopener,noreferrer");
    showToast("Google Agenda aberto. Confirme o evento para salvar.");
    return;
  }
  const renameOption = event.target.closest("[data-rename-option]");
  if (renameOption) {
    const current = renameOption.dataset.optionValue;
    const value = window.prompt("Novo nome da coluna:", current)?.trim();
    if (!value || value === current) return;
    try {
      await api(`/api/options/${renameOption.dataset.renameOption}`, {
        method: "PUT",
        body: JSON.stringify({ value })
      });
      state.options = {};
      state.leads = [];
      showToast("Coluna renomeada e leads atualizados.");
      return navigate(state.view);
    } catch (error) {
      return showToast(error.message, "error");
    }
  }
  const saveOption = event.target.closest("[data-save-option]");
  if (saveOption) {
    const input = $(`[data-option-input="${saveOption.dataset.saveOption}"]`);
    try {
      await api(`/api/options/${saveOption.dataset.saveOption}`, {
        method: "PUT",
        body: JSON.stringify({ value: input.value })
      });
      state.options = {};
      state.leads = [];
      showToast("Opção atualizada.");
      return renderSettings();
    } catch (error) {
      return showToast(error.message, "error");
    }
  }
  const deleteOption = event.target.closest("[data-delete-option]");
  if (deleteOption) {
    if (!window.confirm("Excluir esta opção?")) return;
    try {
      await api(`/api/options/${deleteOption.dataset.deleteOption}`, { method: "DELETE" });
      state.options = {};
      showToast("Opção excluída.");
      return renderSettings();
    } catch (error) {
      return showToast(error.message, "error");
    }
  }
  const view = event.target.closest("[data-view]");
  if (view) return navigate(view.dataset.view);
  const add = event.target.closest("[data-new]");
  if (add) return openEntityForm(add.dataset.new);
  const edit = event.target.closest("[data-edit]");
  if (edit) {
    const collection = state.collections[edit.dataset.edit] || [];
    const item = collection.find((entry) => sameId(entry.id, edit.dataset.id));
    return openEntityForm(edit.dataset.edit, item);
  }
  const remove = event.target.closest("[data-delete]");
  if (remove) return deleteRecord(remove.dataset.delete, remove.dataset.id);
  const convert = event.target.closest("[data-convert-lead]");
  if (convert) return convertLead(convert.dataset.convertLead);
  const schedule = event.target.closest("[data-schedule-return]");
  if (schedule) return scheduleReturn(schedule.dataset.scheduleReturn);
  const history = event.target.closest("[data-history-lead]");
  if (history) return openLeadHistory(history.dataset.historyLead);
  const followup = event.target.closest("[data-followup-lead]");
  if (followup) {
    state.followupLead = followup.dataset.followupLead;
    await navigate("followup");
    return;
  }
  const historyWhatsApp = event.target.closest("[data-history-whatsapp]");
  if (historyWhatsApp) {
    const item = state.collections.followups.find((entry) => sameId(entry.id, historyWhatsApp.dataset.historyWhatsapp));
    return item && openWhatsApp(item.lead_id, item.message);
  }
  const date = event.target.closest("[data-date]");
  if (date) {
    state.selectedDate = date.dataset.date;
    return renderDay();
  }
  if (event.target.closest("[data-today]")) {
    state.selectedDate = new Date().toISOString().slice(0, 10);
    return renderDay();
  }
  const appointment = event.target.closest("[data-toggle-appointment]");
  if (appointment) {
    const item = state.collections.appointments.find((entry) => sameId(entry.id, appointment.dataset.toggleAppointment));
    await api(`/api/appointments/${item.id}`, { method: "PUT", body: JSON.stringify({ completed: item.completed ? 0 : 1 }) });
    showToast(item.completed ? "Compromisso reaberto." : "Compromisso concluído.");
    return renderDay();
  }
  const task = event.target.closest("[data-complete-task]");
  if (task) {
    await api(`/api/tasks/${task.dataset.completeTask}`, {
      method: "PUT",
      body: JSON.stringify({ status: terminalOption("tasks.status", "Concluída") })
    });
    showToast("Tarefa concluída.");
    return state.view === "day" ? renderDay() : renderTasks();
  }
  if (event.target.closest("[data-retry]")) return navigate(state.view);
});

$("#modal").addEventListener("click", (event) => {
  if (event.target.closest("[data-close-modal]")) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#modal").hidden) closeModal();
});

$("#today-chip").textContent = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long", day: "2-digit", month: "long"
}).format(new Date());

if (isSupabaseConfigured) {
  $("#login-label").textContent = "E-mail";
  const usernameInput = $('#login-form input[name="username"]');
  usernameInput.type = "email";
  usernameInput.autocomplete = "email";
  usernameInput.placeholder = "Digite o e-mail de usuário";
  $("#login-help").textContent = "";
} else if (hasMissingProductionConfig) {
  $("#login-error").textContent = "O Supabase não foi configurado neste deploy.";
  $("#login-help").innerHTML =
    "Cadastre <strong>NEXT_PUBLIC_SUPABASE_URL</strong> e <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong> na Netlify e faça um novo deploy.";
}

if (hasMissingProductionConfig) {
  showLogin();
} else {
  try {
    const session = await api("/api/session");
    showApp(session.user);
  } catch {
    showLogin();
  }
}
