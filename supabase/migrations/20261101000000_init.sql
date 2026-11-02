-- day2day · esquema inicial
--
-- Pégalo completo en Supabase → SQL Editor → Run.
--
-- Las tablas espejan el modelo del cliente (src/types/task.ts) casi 1:1: los
-- campos que en la app son objetos o listas se guardan como jsonb / arrays.
-- Los tiempos van como milisegundos epoch (bigint) porque el cliente compara
-- con Date.now() para decidir quién gana en un conflicto; así no hay que
-- convertir zonas horarias en ningún lado.

-- ---------------------------------------------------------------- tasks
create table if not exists public.tasks (
  id               text primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  title            text not null,
  notes            text,
  -- "YYYY-MM-DD" en hora local del usuario; texto a propósito, nunca timestamp.
  date             text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  start_minutes    integer check (start_minutes between 0 and 1439),
  duration_minutes integer not null default 30,
  category         text not null default 'other',
  icon             text,
  repeat_kind      text not null default 'none'
                   check (repeat_kind in ('none', 'daily', 'weekdays', 'custom')),
  repeat_days      smallint[] not null default '{}',
  -- 'any' | 'city' | 'farm': en qué tipo de día aparece.
  context          text not null default 'any' check (context in ('any', 'city', 'farm')),
  completed_days   text[] not null default '{}',
  skipped_days     text[] not null default '{}',
  overrides        jsonb not null default '{}'::jsonb,
  reminder_minutes integer,
  created_at       bigint not null,
  updated_at       bigint not null,
  deleted_at       bigint,
  -- Reloj del servidor; es el cursor del pull incremental, para que un reloj
  -- de teléfono atrasado no esconda filas a los demás dispositivos.
  synced_at        timestamptz not null default now()
);

create index if not exists tasks_user_synced_idx on public.tasks (user_id, synced_at);

-- ---------------------------------------------------------------- todos
create table if not exists public.todos (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  date       text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  done       boolean not null default false,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  synced_at  timestamptz not null default now()
);

create index if not exists todos_user_synced_idx on public.todos (user_id, synced_at);

-- synced_at lo pone siempre el servidor, también en updates.
create or replace function public.touch_synced_at()
returns trigger language plpgsql as $$
begin
  new.synced_at := now();
  return new;
end $$;

drop trigger if exists tasks_touch_synced_at on public.tasks;
create trigger tasks_touch_synced_at
  before insert or update on public.tasks
  for each row execute function public.touch_synced_at();

drop trigger if exists todos_touch_synced_at on public.todos;
create trigger todos_touch_synced_at
  before insert or update on public.todos
  for each row execute function public.touch_synced_at();

-- ------------------------------------------------------------ day_modes
-- Días marcados a mano: fin de semana de ciudad o finca, o festivo entre
-- semana. Solo se guardan los marcados; el resto usa el valor por defecto.
create table if not exists public.day_modes (
  id         text not null,  -- el propio día "YYYY-MM-DD"
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  mode       text not null check (mode in ('city', 'farm', 'holiday')),
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  synced_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists day_modes_user_synced_idx on public.day_modes (user_id, synced_at);

drop trigger if exists day_modes_touch_synced_at on public.day_modes;
create trigger day_modes_touch_synced_at
  before insert or update on public.day_modes
  for each row execute function public.touch_synced_at();

-- --------------------------------------------------------- push_devices
-- Suscripciones Web Push. Las escribe solo el servidor (api/) con la service
-- role key; el cliente nunca las toca directamente. user_id es opcional: los
-- avisos funcionan sin cuenta, igual que antes.
create table if not exists public.push_devices (
  device_id         text primary key,
  user_id           uuid references auth.users (id) on delete set null,
  subscription      jsonb not null,
  tz_offset_minutes integer not null default 0,
  reminders         jsonb not null default '[]'::jsonb,
  updated_at        timestamptz not null default now()
);

-- ------------------------------------------------------------------ RLS
alter table public.tasks        enable row level security;
alter table public.todos        enable row level security;
alter table public.day_modes    enable row level security;
alter table public.push_devices enable row level security;

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own day_modes" on public.day_modes;
create policy "own day_modes" on public.day_modes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own todos" on public.todos;
create policy "own todos" on public.todos
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- push_devices: sin políticas. Con RLS activo y cero políticas, anon y
-- authenticated no ven nada; la service role key las ignora y es la única
-- que las usa.

-- Realtime no hace falta: el cliente hace pull al abrir y al volver a primer plano.
