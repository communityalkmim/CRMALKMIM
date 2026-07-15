-- Atualizacao segura do Maikon CRM.
-- Execute no Supabase: SQL Editor > New query > Run.
-- Este script nao apaga os cadastros existentes.

create extension if not exists pgcrypto;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  segment text not null default 'Adesão/PF',
  commission_percent numeric(6,2) not null default 100,
  commission_1_percent numeric(6,2) not null default 0,
  commission_2_percent numeric(6,2) not null default 0,
  commission_3_percent numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plans add column if not exists segment text not null default 'Adesão/PF';
alter table public.plans add column if not exists commission_1_percent numeric(6,2);
alter table public.plans add column if not exists commission_2_percent numeric(6,2);
alter table public.plans add column if not exists commission_3_percent numeric(6,2);
update public.plans set commission_1_percent = commission_percent where commission_1_percent is null;
update public.plans set commission_2_percent = 0 where commission_2_percent is null;
update public.plans set commission_3_percent = 0 where commission_3_percent is null;
alter table public.plans alter column commission_1_percent set default 0;
alter table public.plans alter column commission_1_percent set not null;
alter table public.plans alter column commission_2_percent set default 0;
alter table public.plans alter column commission_2_percent set not null;
alter table public.plans alter column commission_3_percent set default 0;
alter table public.plans alter column commission_3_percent set not null;
alter table public.plans drop constraint if exists plans_user_id_name_key;
create unique index if not exists plans_user_segment_name_key on public.plans(user_id, segment, name);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plans_segment_check') then
    alter table public.plans add constraint plans_segment_check check (segment in ('Adesão/PF', 'PME'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plans_commissions_check') then
    alter table public.plans add constraint plans_commissions_check check (
      commission_1_percent between 0 and 1000 and
      commission_2_percent between 0 and 1000 and
      commission_3_percent between 0 and 1000
    );
  end if;
end $$;

alter table public.leads add column if not exists contact_date date;
alter table public.leads add column if not exists effective_date date;
alter table public.leads add column if not exists plan_id uuid;
alter table public.leads add column if not exists plan_name text;
alter table public.leads add column if not exists plan_segment text;
alter table public.leads add column if not exists plan_value numeric(12,2) not null default 0;
alter table public.leads add column if not exists commission_percent numeric(6,2) not null default 0;
alter table public.leads add column if not exists commission_1_percent numeric(6,2);
alter table public.leads add column if not exists commission_2_percent numeric(6,2);
alter table public.leads add column if not exists commission_3_percent numeric(6,2);
alter table public.leads add column if not exists commission_1 numeric(12,2);
alter table public.leads add column if not exists commission_2 numeric(12,2);
alter table public.leads add column if not exists commission_3 numeric(12,2);
alter table public.leads add column if not exists has_bonus boolean not null default false;
alter table public.leads add column if not exists bonus_description text;
alter table public.leads add column if not exists bonus_value numeric(12,2) not null default 0;
alter table public.leads add column if not exists payment_status text not null default 'A receber';

update public.leads l
set plan_segment = coalesce(l.plan_segment, p.segment),
    commission_1_percent = coalesce(l.commission_1_percent, l.commission_percent),
    commission_2_percent = coalesce(l.commission_2_percent, 0),
    commission_3_percent = coalesce(l.commission_3_percent, 0),
    commission_1 = coalesce(l.commission_1, l.commission),
    commission_2 = coalesce(l.commission_2, 0),
    commission_3 = coalesce(l.commission_3, 0)
from public.plans p
where l.plan_id = p.id;
update public.leads
set commission_1_percent = coalesce(commission_1_percent, commission_percent),
    commission_2_percent = coalesce(commission_2_percent, 0),
    commission_3_percent = coalesce(commission_3_percent, 0),
    commission_1 = coalesce(commission_1, commission),
    commission_2 = coalesce(commission_2, 0),
    commission_3 = coalesce(commission_3, 0);
alter table public.leads alter column commission_1_percent set default 0;
alter table public.leads alter column commission_1_percent set not null;
alter table public.leads alter column commission_2_percent set default 0;
alter table public.leads alter column commission_2_percent set not null;
alter table public.leads alter column commission_3_percent set default 0;
alter table public.leads alter column commission_3_percent set not null;
alter table public.leads alter column commission_1 set default 0;
alter table public.leads alter column commission_1 set not null;
alter table public.leads alter column commission_2 set default 0;
alter table public.leads alter column commission_2 set not null;
alter table public.leads alter column commission_3 set default 0;
alter table public.leads alter column commission_3 set not null;

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

create table if not exists public.lead_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null check (kind in ('commission', 'bonus')),
  installment smallint not null default 0 check (installment between 0 and 3),
  due_date date,
  percent numeric(6,2),
  source_amount numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  status text not null default 'A receber',
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lead_id, kind, installment)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lead_payments_status_check') then
    alter table public.lead_payments add constraint lead_payments_status_check
      check (status in ('A receber', 'Recebido', 'Cancelado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lead_payments_amounts_check') then
    alter table public.lead_payments add constraint lead_payments_amounts_check
      check (source_amount >= 0 and amount >= 0 and (percent is null or percent between 0 and 1000));
  end if;
end $$;

with plan_defaults(segment, name) as (
  values
    ('Adesão/PF', 'Amil'), ('Adesão/PF', 'Vera Cruz'), ('Adesão/PF', 'Hapvida'),
    ('Adesão/PF', 'Medsênior'), ('Adesão/PF', 'SulAmérica'), ('Adesão/PF', 'Bradesco Saúde'),
    ('Adesão/PF', 'Porto Saúde'), ('Adesão/PF', 'Uniodonto'), ('Adesão/PF', 'Amil Dental'),
    ('Adesão/PF', 'Santa Tereza'),
    ('PME', 'Amil'), ('PME', 'Vera Cruz'), ('PME', 'Hapvida'), ('PME', 'Medsênior'),
    ('PME', 'SulAmérica'), ('PME', 'Bradesco Saúde'), ('PME', 'Porto Saúde'),
    ('PME', 'Uniodonto'), ('PME', 'Amil Dental'), ('PME', 'Santa Tereza')
)
insert into public.plans(user_id, segment, name, commission_percent, commission_1_percent, commission_2_percent, commission_3_percent)
select u.id, d.segment, d.name, 0, 0, 0, 0
from auth.users u cross join plan_defaults d
on conflict (user_id, segment, name) do nothing;

insert into public.lead_payments(user_id, lead_id, kind, installment, due_date, percent, source_amount, amount, status, received_at)
select l.user_id, l.id, 'commission', part.installment,
       (coalesce(l.effective_date, l.contact_date, l.entry_date) + make_interval(months => part.installment - 1))::date,
       part.percent, l.plan_value, part.amount,
       case when part.installment = 1 then l.payment_status else 'A receber' end,
       case when part.installment = 1 and lower(l.payment_status) = 'recebido' then l.updated_at else null end
from public.leads l
cross join lateral (values
  (1, l.commission_1_percent, l.commission_1),
  (2, l.commission_2_percent, l.commission_2),
  (3, l.commission_3_percent, l.commission_3)
) as part(installment, percent, amount)
where l.plan_id is not null or l.plan_name is not null
on conflict (user_id, lead_id, kind, installment) do nothing;

insert into public.lead_payments(user_id, lead_id, kind, installment, due_date, percent, source_amount, amount, status, received_at)
select l.user_id, l.id, 'bonus', 0, coalesce(l.effective_date, l.contact_date, l.entry_date),
       null, l.bonus_value, l.bonus_value, l.payment_status,
       case when lower(l.payment_status) = 'recebido' then l.updated_at else null end
from public.leads l
where l.has_bonus and l.bonus_value > 0
on conflict (user_id, lead_id, kind, installment) do nothing;

create index if not exists leads_user_plan_idx on public.leads(user_id, plan_id);
create index if not exists plans_user_name_idx on public.plans(user_id, name);
create index if not exists appointments_lead_id_idx on public.appointments(lead_id);
create index if not exists followups_lead_id_idx on public.followups(lead_id);
create index if not exists followups_user_created_idx on public.followups(user_id, created_at desc);
create index if not exists leads_plan_id_idx on public.leads(plan_id);
create index if not exists leads_user_created_idx on public.leads(user_id, created_at desc);
create index if not exists marketing_user_id_idx on public.marketing(user_id);
create index if not exists pending_items_lead_id_idx on public.pending_items(lead_id);
create index if not exists tasks_lead_id_idx on public.tasks(lead_id);
create index if not exists lead_payments_user_due_idx on public.lead_payments(user_id, due_date);
create index if not exists lead_payments_lead_id_idx on public.lead_payments(lead_id);
create index if not exists lead_payments_user_status_idx on public.lead_payments(user_id, status);

alter table public.plans enable row level security;
alter table public.leads enable row level security;
alter table public.appointments enable row level security;
alter table public.pending_items enable row level security;
alter table public.tasks enable row level security;
alter table public.followups enable row level security;
alter table public.option_values enable row level security;
alter table public.lead_payments enable row level security;

grant select, insert, update, delete on table
  public.plans,
  public.leads,
  public.appointments,
  public.pending_items,
  public.tasks,
  public.followups,
  public.option_values,
  public.lead_payments
to authenticated;

-- Cada usuario autenticado acessa somente registros vinculados ao proprio user_id.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'plans', 'leads', 'appointments', 'pending_items', 'tasks',
    'followups', 'option_values', 'lead_payments'
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

revoke all on function public.rename_option_value(uuid, text) from public, anon;
revoke all on function public.delete_option_value(uuid) from public, anon;
grant execute on function public.rename_option_value(uuid, text) to authenticated;
grant execute on function public.delete_option_value(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end $$;
