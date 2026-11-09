-- day2day · comida y cuerpo
--
-- Migración ADITIVA: solo crea objetos nuevos, no toca las tablas existentes,
-- así que el cliente anterior sigue funcionando igual. El cambio de políticas
-- de tasks / todos / day_modes (lectura compartida con la pareja) vive aparte
-- en supabase/deploy/partner_read.sql y se aplica a mano después de desplegar,
-- cuando los dos teléfonos ya abrieron el cliente nuevo (ver su cabecera).
--
-- Los nombres de columna espejan las filas de src/storage/nutritionStore.ts.
-- Los tiempos van como milisegundos epoch (bigint), igual que en init.sql.

create extension if not exists pg_trgm with schema extensions;

-- -------------------------------------------------------------- partners
-- Quién puede leer los datos de quién. Solo existen dos cuentas, así que el
-- seed las empareja entre sí.
create table if not exists public.partners (
  user_id    uuid not null references auth.users (id) on delete cascade,
  partner_id uuid not null references auth.users (id) on delete cascade,
  primary key (user_id, partner_id)
);

insert into public.partners (user_id, partner_id)
select a.id, b.id
from auth.users a
cross join auth.users b
where a.id <> b.id
on conflict do nothing;

alter table public.partners enable row level security;

drop policy if exists "own partners" on public.partners;
create policy "own partners" on public.partners
  for select to authenticated
  using (user_id = auth.uid());

-- security definer: lee partners sin pasar por su RLS, y así las políticas de
-- las demás tablas pueden llamarla sin recursión.
create or replace function public.can_read(uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select uid = auth.uid()
    or exists (
      select 1 from public.partners p
      where p.user_id = auth.uid() and p.partner_id = uid
    );
$$;

grant execute on function public.can_read(uuid) to authenticated;

-- -------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id                text not null,
  user_id           uuid not null references auth.users (id) on delete cascade,
  sex               text not null check (sex in ('female', 'male')),
  birth_date        text not null check (birth_date ~ '^\d{4}-\d{2}-\d{2}$'),
  height_cm         numeric not null,
  goal              text not null default 'maintain'
                    check (goal in ('lose_fat', 'maintain', 'gain_muscle')),
  weekly_rate_kg    numeric not null default 0,
  target_weight_kg  numeric,
  target_fat_pct    numeric,
  activity_factor   numeric not null,
  protein_g_per_kg  numeric,
  sleep_goal_min    integer not null,
  workouts_per_week integer not null,
  created_at        bigint not null,
  updated_at        bigint not null,
  deleted_at        bigint,
  synced_at         timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists profiles_user_synced_idx on public.profiles (user_id, synced_at);

-- ---------------------------------------------------- body_measurements
create table if not exists public.body_measurements (
  id                 text primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  date               text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  weight_kg          numeric,
  fat_pct            numeric,
  fat_mass_kg        numeric,
  lean_mass_kg       numeric,
  skeletal_muscle_kg numeric,
  visceral_fat_level numeric,
  bmr_measured       numeric,
  waist_cm           numeric,
  source             text not null check (source in ('scale', 'bioimpedance', 'tape')),
  created_at         bigint not null,
  updated_at         bigint not null,
  deleted_at         bigint,
  synced_at          timestamptz not null default now()
);

create index if not exists body_measurements_user_synced_idx
  on public.body_measurements (user_id, synced_at);

-- --------------------------------------------------------------- weights
create table if not exists public.weights (
  id         text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  weight_kg  numeric not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  synced_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists weights_user_synced_idx on public.weights (user_id, synced_at);

-- ------------------------------------------------------------ sleep_logs
create table if not exists public.sleep_logs (
  id              text not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  date            text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  bed_at_minutes  integer,
  wake_at_minutes integer,
  duration_min    integer not null,
  created_at      bigint not null,
  updated_at      bigint not null,
  deleted_at      bigint,
  synced_at       timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists sleep_logs_user_synced_idx on public.sleep_logs (user_id, synced_at);

-- ------------------------------------------------------------- workouts
create table if not exists public.workouts (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  kind       text not null check (kind in (
               'gym_strength', 'treadmill', 'calisthenics', 'cardio',
               'football', 'walk', 'other')),
  minutes    integer not null,
  intensity  text not null check (intensity in ('light', 'normal', 'hard')),
  met        numeric not null,
  kcal_net   numeric not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  synced_at  timestamptz not null default now()
);

create index if not exists workouts_user_synced_idx on public.workouts (user_id, synced_at);

-- ----------------------------------------------------------------- meals
-- kcal y macros se derivan de items al escribir (toMealRow) para poder
-- agregar en el servidor; el cliente los ignora al leer.
create table if not exists public.meals (
  id           text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  date         text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  slot         text not null check (slot in ('breakfast', 'lunch', 'snack', 'dinner')),
  time_minutes integer not null,
  title        text not null,
  eaten_pct    integer not null,
  items        jsonb not null default '[]'::jsonb,
  source       text not null check (source in ('photo', 'text', 'manual')),
  analysis_id  text,
  kcal         numeric not null default 0,
  protein_g    numeric not null default 0,
  carbs_g      numeric not null default 0,
  fat_g        numeric not null default 0,
  created_at   bigint not null,
  updated_at   bigint not null,
  deleted_at   bigint,
  synced_at    timestamptz not null default now()
);

create index if not exists meals_user_synced_idx on public.meals (user_id, synced_at);

-- --------------------------------------------------------- user_portions
create table if not exists public.user_portions (
  id         text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  food_key   text not null,
  grams      numeric not null,
  samples    integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  synced_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists user_portions_user_synced_idx
  on public.user_portions (user_id, synced_at);

-- -------------------------------------------------------------- triggers
-- touch_synced_at ya existe (init.sql).
drop trigger if exists profiles_touch_synced_at on public.profiles;
create trigger profiles_touch_synced_at
  before insert or update on public.profiles
  for each row execute function public.touch_synced_at();

drop trigger if exists body_measurements_touch_synced_at on public.body_measurements;
create trigger body_measurements_touch_synced_at
  before insert or update on public.body_measurements
  for each row execute function public.touch_synced_at();

drop trigger if exists weights_touch_synced_at on public.weights;
create trigger weights_touch_synced_at
  before insert or update on public.weights
  for each row execute function public.touch_synced_at();

drop trigger if exists sleep_logs_touch_synced_at on public.sleep_logs;
create trigger sleep_logs_touch_synced_at
  before insert or update on public.sleep_logs
  for each row execute function public.touch_synced_at();

drop trigger if exists workouts_touch_synced_at on public.workouts;
create trigger workouts_touch_synced_at
  before insert or update on public.workouts
  for each row execute function public.touch_synced_at();

drop trigger if exists meals_touch_synced_at on public.meals;
create trigger meals_touch_synced_at
  before insert or update on public.meals
  for each row execute function public.touch_synced_at();

drop trigger if exists user_portions_touch_synced_at on public.user_portions;
create trigger user_portions_touch_synced_at
  before insert or update on public.user_portions
  for each row execute function public.touch_synced_at();

-- ------------------------------------------------------------------- RLS
-- Lectura: propia o de la pareja. Escritura: solo propia.
alter table public.profiles          enable row level security;
alter table public.body_measurements enable row level security;
alter table public.weights           enable row level security;
alter table public.sleep_logs        enable row level security;
alter table public.workouts          enable row level security;
alter table public.meals             enable row level security;
alter table public.user_portions     enable row level security;

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles
  for select to authenticated using (public.can_read(user_id));
drop policy if exists "insert profiles" on public.profiles;
create policy "insert profiles" on public.profiles
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update profiles" on public.profiles;
create policy "update profiles" on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete profiles" on public.profiles;
create policy "delete profiles" on public.profiles
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "read body_measurements" on public.body_measurements;
create policy "read body_measurements" on public.body_measurements
  for select to authenticated using (public.can_read(user_id));
drop policy if exists "insert body_measurements" on public.body_measurements;
create policy "insert body_measurements" on public.body_measurements
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update body_measurements" on public.body_measurements;
create policy "update body_measurements" on public.body_measurements
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete body_measurements" on public.body_measurements;
create policy "delete body_measurements" on public.body_measurements
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "read weights" on public.weights;
create policy "read weights" on public.weights
  for select to authenticated using (public.can_read(user_id));
drop policy if exists "insert weights" on public.weights;
create policy "insert weights" on public.weights
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update weights" on public.weights;
create policy "update weights" on public.weights
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete weights" on public.weights;
create policy "delete weights" on public.weights
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "read sleep_logs" on public.sleep_logs;
create policy "read sleep_logs" on public.sleep_logs
  for select to authenticated using (public.can_read(user_id));
drop policy if exists "insert sleep_logs" on public.sleep_logs;
create policy "insert sleep_logs" on public.sleep_logs
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update sleep_logs" on public.sleep_logs;
create policy "update sleep_logs" on public.sleep_logs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete sleep_logs" on public.sleep_logs;
create policy "delete sleep_logs" on public.sleep_logs
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "read workouts" on public.workouts;
create policy "read workouts" on public.workouts
  for select to authenticated using (public.can_read(user_id));
drop policy if exists "insert workouts" on public.workouts;
create policy "insert workouts" on public.workouts
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update workouts" on public.workouts;
create policy "update workouts" on public.workouts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete workouts" on public.workouts;
create policy "delete workouts" on public.workouts
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "read meals" on public.meals;
create policy "read meals" on public.meals
  for select to authenticated using (public.can_read(user_id));
drop policy if exists "insert meals" on public.meals;
create policy "insert meals" on public.meals
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update meals" on public.meals;
create policy "update meals" on public.meals
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete meals" on public.meals;
create policy "delete meals" on public.meals
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "read user_portions" on public.user_portions;
create policy "read user_portions" on public.user_portions
  for select to authenticated using (public.can_read(user_id));
drop policy if exists "insert user_portions" on public.user_portions;
create policy "insert user_portions" on public.user_portions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update user_portions" on public.user_portions;
create policy "update user_portions" on public.user_portions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete user_portions" on public.user_portions;
create policy "delete user_portions" on public.user_portions
  for delete to authenticated using (user_id = auth.uid());

-- ----------------------------------------------------------------- foods
-- Catálogo común (TCAC, USDA, Open Food Facts). Solo lectura desde el
-- cliente; lo carga el servidor con la service role key.
create table if not exists public.foods (
  id                text primary key,
  name_es           text not null,
  name_en           text,
  source            text not null check (source in ('tcac', 'usda', 'off')),
  source_ref        text,
  kcal              numeric not null,
  protein_g         numeric not null default 0,
  carbs_g           numeric not null default 0,
  fat_g             numeric not null default 0,
  fiber_g           numeric,
  default_portion_g numeric,
  tags              text[] not null default '{}',
  verified          boolean not null default false,
  name_es_auto      boolean not null default false
);

create index if not exists foods_name_es_trgm_idx
  on public.foods using gin (name_es gin_trgm_ops);

alter table public.foods enable row level security;

drop policy if exists "read foods" on public.foods;
create policy "read foods" on public.foods
  for select to authenticated using (true);

-- ------------------------------------------------------------ user_foods
-- Alimentos creados por el usuario o estimados por la IA. Los ven ambos
-- usuarios; solo el dueño los escribe.
create table if not exists public.user_foods (
  id                text primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  name_es           text not null,
  name_en           text,
  source            text not null check (source in ('user', 'ai')),
  source_ref        text,
  kcal              numeric not null,
  protein_g         numeric not null default 0,
  carbs_g           numeric not null default 0,
  fat_g             numeric not null default 0,
  fiber_g           numeric,
  default_portion_g numeric,
  tags              text[] not null default '{}',
  verified          boolean not null default false,
  name_es_auto      boolean not null default false,
  created_at        bigint not null,
  updated_at        bigint not null,
  deleted_at        bigint,
  synced_at         timestamptz not null default now()
);

create index if not exists user_foods_user_synced_idx on public.user_foods (user_id, synced_at);
create index if not exists user_foods_name_es_trgm_idx
  on public.user_foods using gin (name_es gin_trgm_ops);

drop trigger if exists user_foods_touch_synced_at on public.user_foods;
create trigger user_foods_touch_synced_at
  before insert or update on public.user_foods
  for each row execute function public.touch_synced_at();

alter table public.user_foods enable row level security;

drop policy if exists "read user_foods" on public.user_foods;
create policy "read user_foods" on public.user_foods
  for select to authenticated using (true);
drop policy if exists "insert user_foods" on public.user_foods;
create policy "insert user_foods" on public.user_foods
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update user_foods" on public.user_foods;
create policy "update user_foods" on public.user_foods
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------- search_foods
-- Búsqueda difusa (trigramas) en el catálogo y en los alimentos de usuario.
-- security invoker: aplica el RLS de quien llama. search_path fijo para que
-- los operadores y similarity() de pg_trgm (esquema extensions) se resuelvan
-- igual sin importar quién llame. q se recorta (vacío: sin resultados), n se
-- limita a 1..20 y los comodines % y _ de q se escapan en el ilike.
create or replace function public.search_foods(q text, n int default 8)
returns table (
  id        text,
  source    text,
  name_es   text,
  kcal      numeric,
  protein_g numeric,
  carbs_g   numeric,
  fat_g     numeric,
  verified  boolean,
  similarity real
)
language sql stable security invoker
set search_path = public, extensions
as $$
  with args as (
    select btrim(coalesce(q, '')) as t,
           least(greatest(coalesce(n, 8), 1), 20) as lim
  ),
  p as (
    select t,
           '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
    from args
    where t <> ''
  )
  select s.id, s.source, s.name_es, s.kcal, s.protein_g, s.carbs_g, s.fat_g,
         s.verified, s.sim as similarity
  from (
    select f.id, f.source, f.name_es, f.kcal, f.protein_g, f.carbs_g, f.fat_g,
           f.verified, similarity(f.name_es, p.t) as sim
    from public.foods f, p
    where f.name_es % p.t or f.name_es ilike p.pattern escape '\'
    union all
    select u.id, u.source, u.name_es, u.kcal, u.protein_g, u.carbs_g, u.fat_g,
           u.verified, similarity(u.name_es, p.t) as sim
    from public.user_foods u, p
    where u.deleted_at is null
      and (u.name_es % p.t or u.name_es ilike p.pattern escape '\')
  ) s
  order by s.sim desc, length(s.name_es)
  limit (select lim from args);
$$;

grant execute on function public.search_foods(text, int) to authenticated;

-- -------------------------------------------------------------- ai_usage
-- Gasto de IA. Sin políticas: solo la service role key (Edge Functions) la
-- lee y escribe.
create table if not exists public.ai_usage (
  id            bigserial primary key,
  user_id       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  model         text,
  input_tokens  integer,
  output_tokens integer,
  usd           numeric
);

alter table public.ai_usage enable row level security;
