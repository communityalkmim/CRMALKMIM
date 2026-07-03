-- Atualizacao segura do Maikon CRM.
-- Execute no Supabase: SQL Editor > New query > Run.
-- Este script nao apaga os cadastros existentes.

create extension if not exists pgcrypto;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  commission_percent numeric(6,2) not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.leads add column if not exists contact_date date;
alter table public.leads add column if not exists effective_date date;
alter table public.leads add column if not exists plan_id uuid;
alter table public.leads add column if not exists plan_name text;
alter table public.leads add column if not exists plan_value numeric(12,2) not null default 0;
alter table public.leads add column if not exists commission_percent numeric(6,2) not null default 0;
alter table public.leads add column if not exists has_bonus boolean not null default false;
alter table public.leads add column if not exists bonus_description text;
alter table public.leads add column if not exists bonus_value numeric(12,2) not null default 0;
alter table public.leads add column if not exists payment_status text not null default 'A receber';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_plan_id_fkey'
  ) then
    alter table public.leads
      add constraint leads_plan_id_fkey
      foreign key (plan_id) references public.plans(id) on delete restrict;
  end if;
end $$;

create index if not exists leads_user_plan_idx on public.leads(user_id, plan_id);
create index if not exists plans_user_name_idx on public.plans(user_id, name);

alter table public.plans enable row level security;
alter table public.leads enable row level security;
alter table public.appointments enable row level security;
alter table public.pending_items enable row level security;
alter table public.tasks enable row level security;
alter table public.followups enable row level security;
alter table public.option_values enable row level security;

grant select, insert, update, delete on table
  public.plans,
  public.leads,
  public.appointments,
  public.pending_items,
  public.tasks,
  public.followups,
  public.option_values
to authenticated;

-- Cada usuario autenticado acessa somente registros vinculados ao proprio user_id.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'plans', 'leads', 'appointments', 'pending_items', 'tasks',
    'followups', 'option_values'
  ]
  loop
    execute format('drop policy if exists "owner_all" on public.%I', table_name);
    execute format('drop policy if exists "team_all" on public.%I', table_name);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
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
  where id = p_option_id;

  if current_option.id is null then
    raise exception 'Opcao nao encontrada';
  end if;
  if clean_value = '' then
    raise exception 'Informe o novo nome';
  end if;

  if current_option.module = 'leads' and current_option.field = 'origin' then
    update public.leads set origin = clean_value
    where origin = current_option.value;
  elsif current_option.module = 'leads' and current_option.field = 'status' then
    update public.leads set status = clean_value, updated_at = now()
    where status = current_option.value;
  elsif current_option.module = 'pending' and current_option.field = 'type' then
    update public.pending_items set type = clean_value
    where type = current_option.value;
  elsif current_option.module = 'pending' and current_option.field = 'status' then
    update public.pending_items set status = clean_value
    where status = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'type' then
    update public.tasks set type = clean_value
    where type = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'category' then
    update public.tasks set category = clean_value
    where category = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'priority' then
    update public.tasks set priority = clean_value
    where priority = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'status' then
    update public.tasks set status = clean_value
    where status = current_option.value;
  elsif current_option.module = 'payments' and current_option.field = 'status' then
    update public.leads set payment_status = clean_value, updated_at = now()
    where payment_status = current_option.value;
  end if;

  update public.option_values
  set value = clean_value
  where id = current_option.id;
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
  where id = p_option_id;

  if current_option.id is null then
    raise exception 'Opcao nao encontrada';
  end if;

  select count(*) into group_count
  from public.option_values
  where module = current_option.module
    and field = current_option.field;

  if group_count <= 1 then
    raise exception 'Mantenha pelo menos uma opcao neste grupo';
  end if;

  if current_option.module = 'leads' and current_option.field = 'origin' then
    select count(*) into usage_count from public.leads where origin = current_option.value;
  elsif current_option.module = 'leads' and current_option.field = 'status' then
    select count(*) into usage_count from public.leads where status = current_option.value;
  elsif current_option.module = 'pending' and current_option.field = 'type' then
    select count(*) into usage_count from public.pending_items where type = current_option.value;
  elsif current_option.module = 'pending' and current_option.field = 'status' then
    select count(*) into usage_count from public.pending_items where status = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'type' then
    select count(*) into usage_count from public.tasks where type = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'category' then
    select count(*) into usage_count from public.tasks where category = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'priority' then
    select count(*) into usage_count from public.tasks where priority = current_option.value;
  elsif current_option.module = 'tasks' and current_option.field = 'status' then
    select count(*) into usage_count from public.tasks where status = current_option.value;
  elsif current_option.module = 'payments' and current_option.field = 'status' then
    select count(*) into usage_count from public.leads where payment_status = current_option.value;
  end if;

  if usage_count > 0 then
    raise exception 'Esta opcao esta sendo usada em % registro(s)', usage_count;
  end if;

  delete from public.option_values
  where id = current_option.id;
end;
$$;

grant execute on function public.rename_option_value(uuid, text) to authenticated;
grant execute on function public.delete_option_value(uuid) to authenticated;
