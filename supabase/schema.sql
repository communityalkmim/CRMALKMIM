-- Execute este arquivo no Supabase: SQL Editor > New query > Run.

create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  origin text,
  entry_date date,
  status text not null default 'Novo',
  commission numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  lead_id uuid references public.leads(id) on delete set null,
  date date not null,
  time time,
  reminder integer not null default 30,
  notes text,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.pending_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null,
  description text,
  due_date date,
  priority text not null default 'Média',
  status text not null default 'Pendente',
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text,
  category text,
  lead_id uuid references public.leads(id) on delete set null,
  date date not null,
  time time,
  priority text not null default 'Média',
  status text not null default 'Pendente',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text,
  status text not null default 'Planejada',
  deadline date,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  message text not null,
  channel text not null default 'WhatsApp',
  status text not null default 'Rascunho',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.option_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  field text not null,
  value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, module, field, value)
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text,
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists leads_user_status_idx on public.leads(user_id, status);
create index if not exists appointments_user_date_idx on public.appointments(user_id, date);
create index if not exists pending_user_due_idx on public.pending_items(user_id, due_date);
create index if not exists tasks_user_date_idx on public.tasks(user_id, date);
create index if not exists options_user_group_idx on public.option_values(user_id, module, field, sort_order);

alter table public.leads enable row level security;
alter table public.appointments enable row level security;
alter table public.pending_items enable row level security;
alter table public.tasks enable row level security;
alter table public.marketing enable row level security;
alter table public.followups enable row level security;
alter table public.option_values enable row level security;
alter table public.app_settings enable row level security;

grant select, insert, update, delete on table
  public.leads,
  public.appointments,
  public.pending_items,
  public.tasks,
  public.marketing,
  public.followups,
  public.option_values,
  public.app_settings
to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'leads', 'appointments', 'pending_items', 'tasks',
    'marketing', 'followups', 'option_values', 'app_settings'
  ]
  loop
    execute format('drop policy if exists "owner_all" on public.%I', table_name);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      table_name
    );
  end loop;
end $$;

create or replace function public.rename_option_value(p_option_id uuid, p_new_value text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_option public.option_values%rowtype;
  clean_value text := btrim(p_new_value);
begin
  select * into current_option
  from public.option_values
  where id = p_option_id and user_id = auth.uid();

  if current_option.id is null then
    raise exception 'Opção não encontrada';
  end if;
  if clean_value = '' then
    raise exception 'Informe o novo nome';
  end if;

  if current_option.module = 'leads' and current_option.field = 'origin' then
    update public.leads set origin = clean_value
    where user_id = auth.uid() and origin = current_option.value;
  elsif current_option.module = 'leads' and current_option.field = 'status' then
    update public.leads set status = clean_value, updated_at = now()
    where user_id = auth.uid() and status = current_option.value;
  elsif current_option.module = 'pending' and current_option.field = 'type' then
    update public.pending_items set type = clean_value
    where user_id = auth.uid() and type = current_option.value;
  elsif current_option.module = 'pending' and current_option.field = 'status' then
    update public.pending_items set status = clean_value
    where user_id = auth.uid() and status = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'type' then
    update public.tasks set type = clean_value
    where user_id = auth.uid() and type = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'category' then
    update public.tasks set category = clean_value
    where user_id = auth.uid() and category = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'priority' then
    update public.tasks set priority = clean_value
    where user_id = auth.uid() and priority = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'status' then
    update public.tasks set status = clean_value
    where user_id = auth.uid() and status = current_option.value;
  end if;

  update public.option_values
  set value = clean_value
  where id = current_option.id and user_id = auth.uid();
end;
$$;

create or replace function public.delete_option_value(p_option_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_option public.option_values%rowtype;
  usage_count integer := 0;
  group_count integer := 0;
begin
  select * into current_option
  from public.option_values
  where id = p_option_id and user_id = auth.uid();

  if current_option.id is null then
    raise exception 'Opção não encontrada';
  end if;

  select count(*) into group_count
  from public.option_values
  where user_id = auth.uid()
    and module = current_option.module
    and field = current_option.field;

  if group_count <= 1 then
    raise exception 'Mantenha pelo menos uma opção neste grupo';
  end if;

  if current_option.module = 'leads' and current_option.field = 'origin' then
    select count(*) into usage_count from public.leads where user_id = auth.uid() and origin = current_option.value;
  elsif current_option.module = 'leads' and current_option.field = 'status' then
    select count(*) into usage_count from public.leads where user_id = auth.uid() and status = current_option.value;
  elsif current_option.module = 'pending' and current_option.field = 'type' then
    select count(*) into usage_count from public.pending_items where user_id = auth.uid() and type = current_option.value;
  elsif current_option.module = 'pending' and current_option.field = 'status' then
    select count(*) into usage_count from public.pending_items where user_id = auth.uid() and status = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'type' then
    select count(*) into usage_count from public.tasks where user_id = auth.uid() and type = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'category' then
    select count(*) into usage_count from public.tasks where user_id = auth.uid() and category = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'priority' then
    select count(*) into usage_count from public.tasks where user_id = auth.uid() and priority = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'status' then
    select count(*) into usage_count from public.tasks where user_id = auth.uid() and status = current_option.value;
  end if;

  if usage_count > 0 then
    raise exception 'Esta opção está sendo usada em % registro(s)', usage_count;
  end if;

  delete from public.option_values
  where id = current_option.id and user_id = auth.uid();
end;
$$;

grant execute on function public.rename_option_value(uuid, text) to authenticated;
grant execute on function public.delete_option_value(uuid) to authenticated;
