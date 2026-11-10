-- Agua tomada por día (ml). Misma forma que weights: id = la fecha.
create table if not exists public.water_logs (
  id         text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  ml         integer not null check (ml >= 0),
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  synced_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists water_logs_user_synced_idx on public.water_logs (user_id, synced_at);

drop trigger if exists water_logs_touch_synced_at on public.water_logs;
create trigger water_logs_touch_synced_at
  before insert or update on public.water_logs
  for each row execute function public.touch_synced_at();

alter table public.water_logs enable row level security;

drop policy if exists "read water_logs" on public.water_logs;
create policy "read water_logs" on public.water_logs
  for select to authenticated using (public.can_read(user_id));
drop policy if exists "insert water_logs" on public.water_logs;
create policy "insert water_logs" on public.water_logs
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update water_logs" on public.water_logs;
create policy "update water_logs" on public.water_logs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete water_logs" on public.water_logs;
create policy "delete water_logs" on public.water_logs
  for delete to authenticated using (user_id = auth.uid());
