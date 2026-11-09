# Comida, cuerpo y vista compartida · Entrega 1 · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pestaña "Comida" con registro por foto/texto anclado a tablas nutricionales, check-in diario (peso, sueño, entreno), perfil con metas calculadas, y vista de solo lectura del día de la pareja.

**Architecture:** Lógica pura (BMR, metas, EMA, MET, cálculo de kcal) en `src/lib/nutrition/*` con vitest. Nuevos registros siguen el patrón local-first existente; el sync se generaliza a un registro de colecciones para no copiar el hook seis veces. Una Edge Function `nutrition` llama a Claude con tool use, hace matching contra `foods`/`user_foods` en Postgres y devuelve ítems con gramos; el cliente calcula kcal. RLS extendida con `partners` para lectura cruzada.

**Tech Stack:** React 19 + react-native-web + Vite, AsyncStorage, Supabase (Postgres, RLS, Edge Functions Deno), Anthropic API (`claude-sonnet-5-5` visión, `claude-haiku-5-5` elección y texto), vitest (nuevo, devDependency).

**Spec:** `docs/superpowers/specs/2026-11-09-nutricion-y-cuerpo-design.md` (secciones 4.1–4.6, 4.9–4.11 y Entrega 1 de la sección 5).

## Global Constraints

- Sin dependencias nuevas de runtime. Única devDependency nueva: `vitest`. Gráficas no entran en esta entrega.
- `ANTHROPIC_API_KEY` solo como secreto de Edge Function. Nunca en `VITE_*`, nunca en el repo, nunca en el chat. El builder nunca la ve; Miguel la pone en Dashboard → Edge Functions → Secrets.
- Toda kcal = gramos × valor por 100 g de una fila de `foods`/`user_foods`, en código. El modelo nunca devuelve kcal. Única excepción: alimento sin candidato → `user_foods` con `source='ai'`, `verified=false`, etiquetado en UI.
- Máximo una pregunta por comida, con chips. Sin segunda pasada de autocrítica.
- Grasa de cocción siempre ítem aparte con `isHiddenFat=true`.
- Pisos de kcal: 1.200 mujer, 1.500 hombre. Ritmo semanal permitido: bajar −0,25…−0,7; ganar +0,1…+0,3.
- Textos de UI en español colombiano. Código y comentarios en inglés, como el repo. Commits en español imperativo.
- Fechas locales `"YYYY-MM-DD"` como texto (patrón de `tasks.date`); tiempos epoch ms en `created_at`/`updated_at`; soft delete `deleted_at`; `synced_at` servidor con trigger `touch_synced_at`.
- Imagen redimensionada en cliente a 1.000 px de lado mayor, JPEG 0,8, no se guarda.
- Límite 40 análisis por usuario por día (`ai_usage`).
- Pareja: lectura total del otro; escritura ajena solo `insert` en `todos`.
- Tras cada tarea: `npm run typecheck` y `npx vitest run` en verde antes del commit.

## Review Focus

1. **Pull de sync trayendo filas de la pareja.** Con la RLS nueva, `select *` sin filtro devuelve también lo del otro y lo mezclaría en el store propio. `fetchChanges` debe filtrar `user_id = uid`. Test en Task 5.
2. **Sueño que cruza medianoche.** Acostarse 23:30 y levantarse 06:45 debe dar 435 min, no negativo. Test en Task 3.
3. **Piso de kcal y ritmo fuera de rango.** Una mujer pequeña con −0,7 kg/semana cae bajo 1.200; la meta debe quedarse en 1.200 con `floorApplied=true`; un ritmo de −1,0 se recorta a −0,7. Test en Task 2.
4. **Ítem sin candidato en la tabla.** El análisis no puede fallar ni bloquear: devuelve `source:'ai'`, `verified:false`, la comida se guarda y el editor muestra "valores estimados por IA". Test en Task 9.
5. **Entrada de peso con coma.** En iPhone en español el teclado numérico escribe "65,4". `parseDecimal` debe aceptar coma y punto. Test en Task 3.

---

## Mapa de archivos

**Crear**
- `src/types/nutrition.ts` · tipos de dominio.
- `src/lib/nutrition/trend.ts`, `bmr.ts`, `targets.ts`, `met.ts`, `mealMath.ts`, `sleep.ts`, `parse.ts` · lógica pura + `*.test.ts` al lado.
- `src/lib/nutrition/api.ts` · cliente de la Edge Function y del RPC de búsqueda.
- `src/utils/image.ts` · resize a JPEG base64.
- `src/storage/tables.ts` · `TABLES`/`Table` (sin imports, para evitar ciclos).
- `src/storage/collections.ts` · registro de colecciones sincronizables (defs de tasks/todos/day_modes y las nuevas).
- `src/utils/id.ts` · `createId()` movido desde `useTasks.ts`.
- `src/storage/nutritionStore.ts` · normalizadores y conversión fila↔registro de las colecciones nuevas.
- `src/storage/useNutrition.ts` · store local-first de comida/cuerpo (mismo rol que `useTasks` para rutina).
- `src/storage/partner.ts` · lectura de solo lectura de los datos de la pareja + insert de pendientes ajenos.
- `src/auth/PartnerProvider.tsx` · contexto `viewing`.
- `src/components/PersonSwitcher.tsx`, `ViewingBanner.tsx`.
- `src/components/food/CheckInCard.tsx`, `TotalsCards.tsx`, `MealRow.tsx`, `MealEditor.tsx`, `ChipQuestion.tsx`, `FoodSearch.tsx`, `WorkoutSheet.tsx`.
- `src/screens/FoodScreen.tsx`, `src/screens/ProfileScreen.tsx`.
- `supabase/migrations/20261110000000_nutrition.sql` · tablas, RLS, partners, RPC.
- `supabase/migrations/20261110000001_foods_tcac.sql` · seed TCAC (generado).
- `supabase/migrations/20261110000002_foods_usda.sql` · seed USDA (generado por Miguel).
- `supabase/seed/foods/tcac.csv`, `supabase/seed/foods/build-tcac-sql.mjs`, `supabase/seed/foods/build-usda-sql.mjs`.
- `supabase/functions/nutrition/index.ts`, `lib/schema.ts`, `lib/prompt.ts`, `lib/match.ts`, `lib/schema_test.ts`, `lib/match_test.ts`.
- `vitest.config.ts`.

**Modificar**
- `package.json` · scripts `test`, devDependency vitest.
- `src/storage/syncQueue.ts` · `Table` derivado de `TABLES`.
- `src/storage/useCloudSync.ts` · genérico sobre bindings.
- `src/storage/cloud.ts` · `fetchChanges(since, uid, tables)` y upsert/softDelete genéricos.
- `src/storage/useTasks.ts` · usa los bindings; `createId` se mueve a `src/utils/id.ts`.
- `src/components/TabBar.tsx` · pestaña `food`.
- `src/screens/RootScreen.tsx` · monta `FoodScreen`, `PartnerProvider`, `PersonSwitcher`, modo solo lectura.
- `src/screens/SettingsScreen.tsx` · entrada "Mi perfil y metas".
- `src/screens/ScheduleScreen.tsx`, `TodosScreen.tsx`, `ReportScreen.tsx`, `components/TaskCard.tsx`, `TodoRow.tsx` · prop `readOnly`.
- `supabase/config.toml` · `[functions.nutrition] verify_jwt = false`.
- `README.md` · sección Comida, secretos, despliegue de `nutrition`, aplicar migraciones.

---

### Task 1: vitest y peso tendencia (EMA)

**Files:**
- Create: `vitest.config.ts`, `src/lib/nutrition/trend.ts`, `src/lib/nutrition/trend.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `emaTrend(entries: WeightPoint[], alpha = 0.1): TrendPoint[]` donde `WeightPoint = { date: string; weightKg: number }`, `TrendPoint = WeightPoint & { trendKg: number }`. Ordena por `date` ascendente; el primer `trendKg` es el primer peso; `trend[i] = trend[i-1] + alpha × (w[i] − trend[i-1])`; redondea `trendKg` a 2 decimales. Entrada vacía → `[]`.
- Produces: `weeklyDelta(trend: TrendPoint[], days = 7): number | null` = `trendKg` último − `trendKg` del punto más cercano a `days` días antes; `null` si no hay un punto ≥ `days − 2` días antes.

- [ ] **Step 1: Instalar vitest y configurar**

```bash
npm i -D vitest
```
`vitest.config.ts`: `environment: 'node'`, `include: ['src/**/*.test.ts', 'supabase/seed/**/*.test.mjs']`. `package.json`: `"test": "vitest run"`.

- [ ] **Step 2: Test que falla**

```ts
// trend.test.ts
test('first trend equals first weight, then smooths', () => {
  const t = emaTrend([{ date: '2026-11-01', weightKg: 60 }, { date: '2026-11-02', weightKg: 61 }]);
  expect(t[0].trendKg).toBe(60);
  expect(t[1].trendKg).toBe(60.1);
});
test('sorts by date before smoothing', ...) // entrada desordenada → salida ordenada
test('weeklyDelta uses the point ~7 days back', () => {
  // 10 pesos iguales 59 y el último 58 → delta ≈ -0.1
});
test('weeklyDelta is null with less than 5 days of history', ...)
```

- [ ] **Step 3: Verificar que falla** — `npx vitest run src/lib/nutrition/trend.test.ts` → FAIL (módulo no existe).
- [ ] **Step 4: Implementar `trend.ts`** con las firmas de Interfaces.
- [ ] **Step 5: Verificar que pasa** — mismo comando → PASS. `npm run typecheck` → sin errores.
- [ ] **Step 6: Commit** — `Agrega vitest y el cálculo de peso tendencia`

---

### Task 2: BMR y metas diarias

**Files:**
- Create: `src/types/nutrition.ts`, `src/lib/nutrition/bmr.ts`, `bmr.test.ts`, `targets.ts`, `targets.test.ts`

**Interfaces:**
- Produces en `types/nutrition.ts`:
  ```ts
  export type Synced = { id: string; createdAt: number; updatedAt: number };
  export type Sex = 'female' | 'male';
  export type Goal = 'lose_fat' | 'maintain' | 'gain_muscle';
  export const ACTIVITY_FACTORS = [1.2, 1.375, 1.55] as const;
  export type Profile = Synced & {
    sex: Sex; birthDate: string; heightCm: number; goal: Goal; weeklyRateKg: number;
    targetWeightKg: number | null; targetFatPct: number | null;
    activityFactor: (typeof ACTIVITY_FACTORS)[number];
    proteinGPerKg: number | null;   // null = regla por objetivo
    sleepGoalMin: number; workoutsPerWeek: number;
  }; // id = userId
  export type BodyMeasurement = Synced & {
    date: string; weightKg: number | null; fatPct: number | null; fatMassKg: number | null;
    leanMassKg: number | null; skeletalMuscleKg: number | null; visceralFatLevel: number | null;
    bmrMeasured: number | null; waistCm: number | null; source: 'scale' | 'bioimpedance' | 'tape';
  };
  export type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number };
  ```
  (el resto de tipos se agregan en Task 3 y 4).
- Produces en `bmr.ts`: `ageOn(birthDate: string, onDate: string): number`; `mifflinStJeor(a: { sex: Sex; weightKg: number; heightCm: number; ageYears: number }): number`; `leanMassFrom(weightKg: number, fatPct: number): number`; `katchMcArdle(leanMassKg: number): number`; `pickBmr(a: { profile: Profile; weightKg: number; latest: BodyMeasurement | null; today: string }): { bmr: number; method: 'measured' | 'katch' | 'mifflin' }` — `measured` si `latest.bmrMeasured` y `latest.date` a ≤90 días de `today`; si no `katch` cuando `latest.fatPct` existe (masa magra = `leanMassFrom`, no `latest.leanMassKg`); si no `mifflin`.
- Produces en `targets.ts`:
  ```ts
  export const KCAL_PER_KG = 7700;
  export const KCAL_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };
  export const RATE_RANGE: Record<Goal, [number, number]> = { lose_fat: [-0.7, -0.25], maintain: [0, 0], gain_muscle: [0.1, 0.3] };
  export function clampRate(goal: Goal, rate: number): number;
  export function proteinTarget(a: { goal: Goal; weightKg: number; proteinGPerKg: number | null }): number; // regla: lose_fat 1.8, maintain 1.6, gain_muscle 2.0 g/kg peso; override si proteinGPerKg
  export type DailyTarget = Macros & { tdee: number; bmr: number; floorApplied: boolean; method: 'measured'|'katch'|'mifflin' };
  export function dailyTarget(a: { profile: Profile; weightKg: number; latest: BodyMeasurement | null; today: string; workoutKcal: number }): DailyTarget;
  export function rebalanceMacros(t: Macros, change: Partial<Pick<Macros,'proteinG'|'carbsG'|'fatG'>>): Macros;
  ```
  `dailyTarget`: `tdee = bmr × activityFactor + workoutKcal`; `kcal = round(tdee + clampRate × 7700/7)`; piso por sexo; `fatG = max(0.8 × weightKg, …)` redondeado; `carbsG = max(0, (kcal − 4P − 9F)/4)` redondeado. `rebalanceMacros` mantiene `kcal`: cambiar P o F recalcula C; cambiar C recalcula F; nunca negativo (si C < 0 → C = 0 y F absorbe).
- Nota de desviación del spec (4.4): la proteína para bajar grasa usa 1,8 g/kg de peso corporal, no 2,0–2,2 sobre masa magra, porque esta última daba ~70 g para Karen y el propio spec espera 100–110 g. Queda editable en `proteinGPerKg`.

- [ ] **Step 1: Tests que fallan** (valores exactos)

```ts
// bmr.test.ts
expect(mifflinStJeor({ sex:'female', weightKg:59, heightCm:150, ageYears:24 })).toBeCloseTo(1246.5);
expect(mifflinStJeor({ sex:'male', weightKg:65, heightCm:168, ageYears:23 })).toBe(1590);
expect(leanMassFrom(59, 40.4)).toBeCloseTo(35.16, 1);
expect(katchMcArdle(35.164)).toBeCloseTo(1129.5, 0);
expect(ageOn('2003-05-20', '2026-11-09')).toBe(23);
// pickBmr: medido hace 10 días → {bmr:1384, method:'measured'}; medido hace 91 días con fatPct → 'katch'; sin medición → 'mifflin'
// targets.test.ts
// Karen (medido 1384, factor 1.375, -0.5, sin entreno): kcal 1353, proteinG 106, fatG 47, carbsG 126, floorApplied false
// Miguel (mifflin 1590, 1.375, +0.15, workoutKcal 195): kcal 2546, proteinG 130, fatG 52, carbsG 390
// Piso: female 45 kg, 150 cm, 24, 1.2, lose_fat -0.7 → kcal 1200, floorApplied true
// clampRate('lose_fat', -1.0) === -0.7 ; clampRate('gain_muscle', 0.5) === 0.3 ; clampRate('maintain', -0.3) === 0
// proteinTarget con proteinGPerKg 2.2 y 59 kg → 130
// rebalanceMacros({kcal:2000,proteinG:150,carbsG:200,fatG:67}, {proteinG:170}) → carbsG 180, kcal 2000
// rebalanceMacros(..., {carbsG:300}) → fatG baja, kcal 2000
```

- [ ] **Step 2: Verificar que fallan** — `npx vitest run src/lib/nutrition` → FAIL.
- [ ] **Step 3: Implementar `types/nutrition.ts`, `bmr.ts`, `targets.ts`.**
- [ ] **Step 4: Verificar** — PASS + `npm run typecheck`.
- [ ] **Step 5: Commit** — `Calcula el metabolismo basal y la meta diaria`

---

### Task 3: MET, sueño, cálculo de comidas y parseo

**Files:**
- Create: `src/lib/nutrition/met.ts`, `met.test.ts`, `sleep.ts`, `sleep.test.ts`, `mealMath.ts`, `mealMath.test.ts`, `parse.ts`, `parse.test.ts`
- Modify: `src/types/nutrition.ts`

**Interfaces:**
- Tipos nuevos en `types/nutrition.ts`:
  ```ts
  export type WeightEntry = Synced & { date: string; weightKg: number };          // id = date
  export type SleepLog = Synced & { date: string; bedAtMinutes: number | null; wakeAtMinutes: number | null; durationMin: number }; // id = date
  export const WORKOUT_KINDS = ['gym_strength','treadmill','calisthenics','cardio','football','walk','other'] as const;
  export type WorkoutKind = (typeof WORKOUT_KINDS)[number];
  export type WorkoutIntensity = 'light' | 'normal' | 'hard';
  export type Workout = Synced & { date: string; kind: WorkoutKind; minutes: number; intensity: WorkoutIntensity; met: number; kcalNet: number };
  export const MEAL_SLOTS = ['breakfast','lunch','snack','dinner'] as const;
  export type MealSlot = (typeof MEAL_SLOTS)[number];
  export type FoodSource = 'tcac' | 'usda' | 'off' | 'user' | 'ai';
  export type FoodRef = { id: string; source: FoodSource; name: string; per100: Macros; verified: boolean };
  export type MealItem = { id: string; food: FoodRef | null; name: string; grams: number; gramsMin: number | null; gramsMax: number | null; weighed: boolean; confidence: number | null; isHiddenFat: boolean; sortOrder: number };
  export type EatenPct = 25 | 50 | 75 | 100;
  export type Meal = Synced & { date: string; slot: MealSlot; timeMinutes: number; title: string; eatenPct: EatenPct; items: MealItem[]; source: 'photo' | 'text' | 'manual'; analysisId: string | null };
  export type UserPortion = Synced & { foodKey: string; grams: number; samples: number }; // id = foodKey
  ```
- `met.ts`: `MET_TABLE: Record<WorkoutKind, Record<WorkoutIntensity, number>>` = gym_strength {3.0, 3.5, 5.0}, treadmill {3.0, 4.0, 6.0}, calisthenics {3.5, 5.0, 7.5}, cardio {5.0, 7.0, 9.0}, football {5.0, 7.0, 9.5}, walk {2.8, 3.5, 4.3}, other {3.0, 4.0, 5.0}; `workoutKcal(kind, intensity, minutes, weightKg): number` = `round((MET − 1) × kg × minutes/60)`; `WORKOUT_LABELS: Record<WorkoutKind, string>` en español (Gym fuerza, Caminadora, Calistenia, Cardio, Fútbol, Caminata, Otro).
- `sleep.ts`: `sleepDuration(bedAtMinutes: number, wakeAtMinutes: number): number` = `(wake − bed + 1440) % 1440`; `formatHours(min: number): string` → `"7 h 10"`.
- `mealMath.ts`: `scaleMacros(per100: Macros, grams: number): Macros` (kcal entero, gramos de macros 1 decimal); `itemMacros(item: MealItem): Macros` (`food` null → ceros); `mealTotals(meal: Meal): Macros` (suma × `eatenPct/100`); `mealKcalRange(meal: Meal): { min: number; max: number }` usando `gramsMin/Max` cuando existen y `grams` si no, × eatenPct; `dayTotals(meals: Meal[]): Macros`; `slotForMinutes(m: number): MealSlot` = <10:30 breakfast, <15:00 lunch, <18:30 snack, else dinner.
- `parse.ts`: `parseDecimal(s: string): number | null` acepta `"65,4"`, `"65.4"`, `" 65 "`; rechaza vacío y `NaN`; `parseHHMM(s: string): number | null` → minutos.

- [ ] **Step 1: Tests que fallan**

```ts
// met: workoutKcal('calisthenics','normal',45,65) === 195 ; workoutKcal('football','normal',90,65) === 585 ; workoutKcal('gym_strength','hard',60,59) === 236
// sleep: sleepDuration(23*60+30, 6*60+45) === 435 ; sleepDuration(60, 540) === 480 ; formatHours(430) === '7 h 10'
// mealMath: scaleMacros({kcal:130,proteinG:2.7,carbsG:28,fatG:0.3},180) → {kcal:234, proteinG:4.9, carbsG:50.4, fatG:0.5}
//           mealTotals con dos ítems y eatenPct 50 → mitad ; mealKcalRange usa min/max ; slotForMinutes(12*60+40) === 'lunch'
// parse: parseDecimal('65,4') === 65.4 ; parseDecimal('') === null ; parseHHMM('06:45') === 405
```

- [ ] **Step 2: Verificar que fallan.**
- [ ] **Step 3: Implementar los cuatro módulos y los tipos.**
- [ ] **Step 4: Verificar** — PASS + typecheck.
- [ ] **Step 5: Commit** — `Calcula gasto por entreno, sueño y kcal por comida`

---

### Task 4: Normalizadores y filas de las colecciones nuevas

**Files:**
- Create: `src/storage/nutritionStore.ts`, `src/storage/nutritionStore.test.ts`

**Interfaces:**
- Produces, por cada colección (`profiles`, `body_measurements`, `weights`, `sleep_logs`, `workouts`, `meals`, `user_portions`): `normalizeX(raw: unknown): X | null`, `toXRow(x: X, userId: string): XRow`, `fromXRow(row: XRow): X | null`. Filas snake_case; `meals.items` es `jsonb` (array de `MealItem` con `food` embebido). `profiles.id` = `user_id` como texto. `weights.id`/`sleep_logs.id` = `date`; `user_portions.id` = `foodKey`.
- Normalizadores rellenan defaults como `normalizeTask` (p. ej. `eatenPct` fuera de {25,50,75,100} → 100; `items` no array → `[]`; `activityFactor` fuera de la lista → 1.375; `sleepGoalMin` ausente → 450).

- [ ] **Step 1: Tests que fallan** — por colección, un round-trip `fromRow(toRow(x,'uid'))` igual a `x`, y un `normalize` de objeto parcial que rellena defaults; `normalizeMeal` descarta sin `date` o `slot` inválido.
- [ ] **Step 2: Verificar que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Verificar** — PASS + typecheck.
- [ ] **Step 5: Commit** — `Define cómo se guardan comidas, peso, sueño y perfil`

---

### Task 5: Sync genérico por colecciones (refactor que conserva comportamiento)

**Files:**
- Create: `src/storage/tables.ts`, `src/storage/collections.ts`, `src/storage/cloud.test.ts`, `src/utils/id.ts`
- Modify: `src/storage/syncQueue.ts`, `src/storage/cloud.ts`, `src/storage/useCloudSync.ts`, `src/storage/useTasks.ts`

**Interfaces:**
- `tables.ts` (sin imports): `export const TABLES = ['tasks','todos','day_modes','profiles','body_measurements','weights','sleep_logs','workouts','meals','user_portions'] as const; export type Table = (typeof TABLES)[number]; export type Rec = { id: string; updatedAt: number }; export type Row = { id: string; updated_at: number; deleted_at: number | null; synced_at?: string };`. `cloud.ts`, `syncQueue.ts` y `collections.ts` importan de aquí; `collections.ts` importa de `cloud.ts` y `nutritionStore.ts`, nunca al revés.
- `collections.ts`:
  ```ts
  export type CollectionDef<T extends Rec, R extends Row> = { table: Table; storageKey: string; normalize: (raw: unknown) => T | null; toRow: (item: T, uid: string) => R; fromRow: (row: R) => T | null; onConflict: string };
  export const COLLECTIONS: { tasks: CollectionDef<Task,TaskRow>; todos: ...; day_modes: ...; profiles: ...; body_measurements: ...; weights: ...; sleep_logs: ...; workouts: ...; meals: ...; user_portions: ... };
  ```
  `onConflict`: `'id'` para todas salvo `day_modes`, `weights`, `sleep_logs`, `user_portions`, `profiles` que usan `'user_id,id'` (pk compuesta; ver Task 6).
- `syncQueue.ts`: `Table` importado de `tables.ts`; la cola se inicializa recorriendo `TABLES`.
- `utils/id.ts`: `createId(): string` (el de `useTasks.ts`, movido; `useTasks` lo importa).
- `cloud.ts`: `fetchChanges(since: string | null, uid: string, tables: readonly Table[]): Promise<{ rows: Record<Table, Row[]>; cursor: string | null }>` — **cada query lleva `.eq('user_id', uid)`**; `upsertRows(table, rows, onConflict)`; `softDeleteRows(table, ids, at, uid)` con `.eq('user_id', uid)`. Se conserva el reintento legacy de `sort_order` en `todos`.
- `useCloudSync.ts`: `useCloudSync({ userId, ready, bindings }: { userId: string | null; ready: boolean; bindings: Binding<any, any>[] }): CloudSync` con `Binding<T,R> = { def: CollectionDef<T,R>; items: T[]; setItems: (updater: (prev: T[]) => T[]) => void }`. Trackers en `Map<Table, Tracker>`. Un solo effect de diff con deps `bindings.map(b => b.items)` (longitud fija por llamada).
- `useTasks.ts`: pasa sus tres bindings. Comportamiento externo idéntico (`TaskStore` no cambia).

- [ ] **Step 1: Test que falla** (`cloud.test.ts`, con un cliente falso que registra la cadena de llamadas)

```ts
test('fetchChanges filters every table by user_id', async () => {
  // fake supabase.from(table).select().order().eq('user_id','u1').gt(...)
  // assert eq called with ('user_id','u1') for each table in tables
});
test('softDeleteRows scopes to user_id', ...)
```
Inyección: `cloud.ts` exporta `__setClientForTests(client)` o recibe el cliente como parámetro opcional; elegir lo que menos toque el código.

- [ ] **Step 2: Verificar que falla.**
- [ ] **Step 3: Refactor** en este orden: `collections.ts` con las tres defs existentes → `syncQueue` → `cloud` → `useCloudSync` → `useTasks`. Luego agregar las siete defs nuevas a `COLLECTIONS` (nadie las usa aún).
- [ ] **Step 4: Verificar** — PASS, typecheck, y prueba manual: `npm run dev`, crear/editar/borrar una actividad y un pendiente con sesión iniciada, recargar, ver que persiste y que `pending` vuelve a 0 en Ajustes.
- [ ] **Step 5: Commit** — `Generaliza la sincronización por colecciones`

---

### Task 6: Migración de tablas, RLS con pareja y búsqueda de alimentos

**Files:**
- Create: `supabase/migrations/20261110000000_nutrition.sql`

**Interfaces (SQL):**
- Tablas `profiles`, `body_measurements`, `weights`, `sleep_logs`, `workouts`, `meals`, `user_portions` con columnas de Task 4 (`meals.items jsonb not null default '[]'`, además `kcal`, `protein_g`, `carbs_g`, `fat_g` numéricos que el cliente rellena en `toMealRow` con `mealTotals`), `user_id uuid references auth.users`, `created_at/updated_at bigint`, `deleted_at bigint`, `synced_at timestamptz default now()` + trigger `touch_synced_at`, índice `(user_id, synced_at)`. PK: `id text` para `body_measurements`, `workouts`, `meals`; `primary key (user_id, id)` para `profiles`, `weights`, `sleep_logs`, `user_portions`.
- `foods`: `id text pk`, `name_es text not null`, `name_en text`, `source text check in ('tcac','usda','off')`, `source_ref text`, `kcal numeric not null`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g numeric`, `default_portion_g numeric`, `tags text[] default '{}'`, `verified boolean default false`, `name_es_auto boolean default false`. Extensión `pg_trgm`; índice `gin (name_es gin_trgm_ops)`.
- `user_foods`: igual a `foods` + `user_id`, `source check in ('user','ai')`, `verified boolean default false`, columnas de sync.
- `partners (user_id uuid, partner_id uuid, primary key (user_id, partner_id))`. Seed: `insert into partners select a.id, b.id from auth.users a cross join auth.users b where a.id <> b.id on conflict do nothing` (válido porque hay exactamente dos usuarios).
- Función `public.can_read(uid uuid) returns boolean language sql stable security definer` = `uid = auth.uid() or exists (select 1 from partners p where p.user_id = auth.uid() and p.partner_id = uid)`.
- RLS: en `tasks`, `todos`, `day_modes` **reemplazar** las políticas `for all` por: `select using (can_read(user_id))`; `insert with check (user_id = auth.uid())` salvo `todos`: `with check (can_read(user_id))`; `update`/`delete` `using (user_id = auth.uid())`. Mismas políticas (sin la excepción de insert) en las tablas nuevas. `foods`: `select` para `authenticated`; sin insert desde cliente. `user_foods`: `select using (true)` para `authenticated`, `insert/update with check (user_id = auth.uid())`. `partners`: `select using (user_id = auth.uid())`.
- `ai_usage (id bigserial, user_id uuid, created_at timestamptz default now(), model text, input_tokens int, output_tokens int, usd numeric)`, RLS sin políticas (solo service role).
- RPC `search_foods(q text, n int default 8) returns table (id text, source text, name_es text, kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric, verified boolean, similarity real)`: `union all` de `foods` y `user_foods` (no borrados), ordena por `similarity(name_es, q) desc` con `where name_es % q or name_es ilike '%'||q||'%'`, `security invoker`.

- [ ] **Step 1: Escribir la migración.**
- [ ] **Step 2: Verificar en local o remoto** — `npx supabase db push --project-ref <REF>` (Miguel ejecuta si el builder no tiene CLI autenticada; alternativa: pegar en SQL Editor). Luego en SQL Editor: `select * from partners;` → 2 filas; `select count(*) from pg_policies where tablename='todos';` → 4.
- [ ] **Step 3: Prueba de RLS** desde la app con sesión de Miguel: `supabase.from('tasks').select('id').neq('user_id', '<miguel>')` devuelve filas de Karen (lectura cruzada); `update` sobre una fila de Karen devuelve 0 filas afectadas.
- [ ] **Step 4: Commit** — `Crea las tablas de comida y cuerpo y comparte lectura entre la pareja`

---

### Task 7: Seed TCAC (~150 alimentos colombianos)

**Files:**
- Create: `supabase/seed/foods/tcac.csv`, `supabase/seed/foods/build-tcac-sql.mjs`, `supabase/seed/foods/build-tcac-sql.test.mjs`, `supabase/migrations/20261110000001_foods_tcac.sql` (generado)

**Interfaces:**
- CSV columnas: `code,page,name_es,name_en,kcal,protein_g,carbs_g,fat_g,fiber_g,default_portion_g,tags`. `id` = `tcac:<code>`. `source_ref` = `p<page>#<code>`. `verified=true`.
- Script: `node supabase/seed/foods/build-tcac-sql.mjs` lee el CSV y escribe la migración con `insert into foods (...) values (...) on conflict (id) do update set ...`. Escapa comillas simples. Exporta `rowToSql(row)` para test.

- [ ] **Step 1: Descargar la TCAC 2018 del ICBF** (PDF público) a `supabase/seed/foods/tcac-2018.pdf` y agregar esa ruta a `.gitignore` (no se versiona el PDF).
- [ ] **Step 2: Transcribir ~150 filas** leyendo el PDF con la herramienta de lectura de PDF por rangos de páginas. Cubrir: arroz blanco cocido, arroz con coco, arepa blanca/de choclo/de huevo, pan blanco/integral, galletas de sal, avena en hojuelas, granola, papa cocida/frita, yuca cocida, plátano maduro/verde, patacón, fríjol/lenteja/garbanzo cocidos, huevo cocido/frito/revuelto, pollo pechuga/muslo (cocido, asado, frito), carne de res molida/asada, cerdo lomo/chicharrón, pescado tilapia/atún en agua, chorizo, salchicha, queso campesino/mozzarella/costeño, leche entera/deslactosada, yogur, kumis, mantequilla, aceite de girasol/soya/oliva, aguacate, tomate, cebolla, zanahoria, lechuga, brócoli, banano, manzana, mango, papaya, mora, fresa, naranja, limón, jugo de naranja/mora/mango/lulo con y sin azúcar, panela, azúcar, café, chocolate con leche, maní, almendras, salsa de tomate, mayonesa, empanada, buñuelo, pandebono, almojábana, tamal, bandeja paisa, sancocho, ajiaco (las preparaciones tradicionales como filas compuestas). Para cada fila: re-leer la página citada y confirmar kcal, P, C, G.
- [ ] **Step 3: Test que falla** — `rowToSql` escapa `'` y produce `tcac:` ids; parse CSV con comas dentro de comillas.
- [ ] **Step 4: Implementar el script, generar la migración, aplicarla** (`db push` o SQL Editor). Verificar: `select count(*) from foods where source='tcac';` ≥ 140; `select * from search_foods('arroz', 5);` devuelve "Arroz blanco cocido" primero.
- [ ] **Step 5: Commit** — `Carga 150 alimentos colombianos de la TCAC`

---

### Task 8: Seed USDA (lo corre Miguel, trae nombres en español)

**Files:**
- Create: `supabase/seed/foods/build-usda-sql.mjs`, `supabase/seed/foods/build-usda-sql.test.mjs`, `supabase/migrations/20261110000002_foods_usda.sql` (generado por Miguel)

**Interfaces:**
- Script Node 22 sin dependencias: descarga el zip CSV de **SR Legacy** de FoodData Central (URL en `README`), lee `food.csv`, `food_nutrient.csv`, `nutrient.csv`, `food_category.csv`; filtra categorías: Dairy and Egg, Spices, Fats and Oils, Poultry, Soups (no), Sausages, Breakfast Cereals, Fruits, Pork, Vegetables, Nut and Seed, Beef, Beverages, Finfish, Legumes, Lamb, Baked Products, Sweets, Cereal Grains and Pasta, Fast Foods (no), Snacks. Excluye descripciones con "baby food", "infant", "restaurant", "USDA Commodity". Cap 1.200 filas por nombre más corto primero. Nutrientes: 1008 kcal, 1003 proteína, 1005 carbohidratos, 1004 grasa, 1079 fibra. `id` = `usda:<fdc_id>`, `source_ref` = `fdc_id`.
- Traducción: `ANTHROPIC_API_KEY` en env; lotes de 100 nombres a `claude-haiku-5-5`, respuesta JSON `string[]` del mismo largo; `name_es_auto=true`. Sin key → aborta con mensaje claro.
- Exporta `filterFood(row)`, `pickNutrients(map)`, `rowToSql(row)` para test.

- [ ] **Step 1: Test que falla** — `filterFood` rechaza "Babyfood…" y acepta "Chicken, breast, roasted"; `pickNutrients` mapea los 5 ids; `rowToSql` escapa.
- [ ] **Step 2: Implementar el script.**
- [ ] **Step 3: Verificar** — PASS. Miguel ejecuta `ANTHROPIC_API_KEY=... node supabase/seed/foods/build-usda-sql.mjs` y aplica la migración. Si Miguel no lo corre aún, la entrega sigue: TCAC + `user_foods` de IA cubren el hueco.
- [ ] **Step 4: Commit** — `Agrega el script que trae alimentos de USDA en español`

---

### Task 9: Edge Function `nutrition`

**Files:**
- Create: `supabase/functions/nutrition/index.ts`, `lib/schema.ts`, `lib/prompt.ts`, `lib/match.ts`, `lib/schema_test.ts`, `lib/match_test.ts`
- Modify: `supabase/config.toml` (`[functions.nutrition] verify_jwt = false`)

**Interfaces:**
- Ruta `POST /functions/v1/nutrition/analyze`. Header `Authorization: Bearer <JWT del usuario>`; se valida con `createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization } } }).auth.getUser()`; 401 si falla.
- Request (`schema.ts`, validación manual sin dependencias, exporta `parseAnalyzeRequest(json: unknown): AnalyzeRequest | { error: string }`):
  ```ts
  type AnalyzeRequest = { image?: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }; note?: string; slot: MealSlot; date: string; hints: { portions: { name: string; grams: number }[]; recentFoods: string[] } };
  ```
  Requiere `image` o `note` (≥3 caracteres). `base64` ≤ 2,5 MB.
- Response:
  ```ts
  type AnalyzeResponse = { analysisId: string; items: AnalyzedItem[]; question: Question | null; model: string };
  type AnalyzedItem = { name: string; nameEn: string; cooking: string | null; grams: number; gramsMin: number; gramsMax: number; confidence: number; isHiddenFat: boolean; food: FoodRef };
  type Question = { itemIndex: number; text: string; options: { label: string; gramsMultiplier: number }[] };
  ```
  `FoodRef` como en `types/nutrition.ts`.
- Flujo: (1) límite: `select count(*) from ai_usage where user_id=? and created_at >= date_trunc('day', now())` ≥ 40 → 429 `{ error: 'Límite diario de 40 análisis' }`. (2) Visión con `claude-sonnet-5-5` (o `claude-haiku-5-5` si no hay imagen), `tools` con un único tool `report_meal` cuyo `input_schema` devuelve `items[]` con `name_es, name_en, cooking, grams, grams_min, grams_max, confidence, is_hidden_fat, search_terms[]` y `question` opcional; `tool_choice: { type: 'tool', name: 'report_meal' }`; `max_tokens 1500`. (3) Por ítem: `search_foods(term, 5)` con cada `search_terms` (service role), unión y dedupe. (4) Elección: una sola llamada a `claude-haiku-5-5` con tool `choose_foods` que recibe por ítem los candidatos `{id, name_es, kcal}` y devuelve `{ itemIndex, foodId | null }`; si `null` para algún ítem, el mismo tool pide `estimate: { kcal, protein_g, carbs_g, fat_g }` por 100 g → insertar en `user_foods` (`source='ai'`, `verified=false`, `id='ai:'+uuid`) y usarlo. (5) Insertar `ai_usage` por cada llamada con tokens del `usage` de la respuesta y USD según precios (Sonnet 2/10, Haiku 0,10/0,50 por millón). (6) Responder.
- `prompt.ts`: `systemPrompt(hints): string` con las reglas del spec 4.10: estimar porción **visible** en gramos con rango, nunca kcal, no usar porciones estándar, usar objeto de referencia para escala, grasa de cocción como ítem aparte `is_hidden_fat`, contexto colombiano (arroz, arepa, patacón, fríjoles, sudado, jugos con azúcar), español colombiano, como máximo una `question` y solo si el ítem dudoso pesa >15 % del total estimado, `search_terms` en español simple (2–3 por ítem). Incluye `hints.portions` como "porciones habituales de esta persona".
- `match.ts`: `dedupeCandidates(hits: FoodHit[][]): FoodHit[]` (por id, conserva mayor similarity, máx 6); `applyChoice(items, choices, created): AnalyzedItem[]`; `fallbackFoodRef(estimate, name): FoodRef` (source `'ai'`, `verified false`).

- [ ] **Step 1: Tests que fallan** (`deno test supabase/functions/nutrition/lib/`)

```ts
// schema_test: rechaza sin image ni note; rechaza slot inválido; acepta note sola; rechaza base64 > 2.5MB
// match_test: dedupeCandidates conserva la mayor similarity y corta en 6;
//             applyChoice con foodId null usa fallbackFoodRef → food.source==='ai' && verified===false
```

- [ ] **Step 2: Verificar que fallan.**
- [ ] **Step 3: Implementar `lib/*` y `index.ts`.** CORS como en `push`. Errores de Anthropic → 502 `{ error: 'No se pudo analizar la comida' }` sin filtrar detalles.
- [ ] **Step 4: Verificar tests** — PASS. Verificar modelos disponibles con `curl https://api.anthropic.com/v1/models -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"` (lo corre Miguel) y ajustar ids si difieren.
- [ ] **Step 5: Desplegar** — Miguel: `npx supabase secrets set ANTHROPIC_API_KEY=... --project-ref <REF>` y `npx supabase functions deploy nutrition --project-ref <REF>`. Prueba: `curl -X POST .../nutrition/analyze -H "Authorization: Bearer <jwt>" -d '{"note":"arroz con pollo frito y media arepa","slot":"lunch","date":"2026-11-10","hints":{"portions":[],"recentFoods":[]}}'` → 200 con ≥3 ítems, uno `isHiddenFat`.
- [ ] **Step 6: Commit** — `Analiza comidas con Claude y las ancla a la tabla de alimentos`

---

### Task 10: Cliente de la función, búsqueda y resize de imagen

**Files:**
- Create: `src/lib/nutrition/api.ts`, `src/utils/image.ts`, `src/lib/nutrition/api.test.ts`

**Interfaces:**
- `api.ts`: `analyzeMeal(req: AnalyzeRequest): Promise<AnalyzeResponse>` (toma el JWT de `supabase.auth.getSession()`, llama `${functionsUrl}/nutrition/analyze`; lanza `Error` con el `error` del servidor; 429 → mensaje "Llegaste al límite diario de 40 análisis"); `searchFoods(q: string, n = 8): Promise<FoodHit[]>` vía `supabase.rpc('search_foods', { q, n })`; `toFoodRef(hit: FoodHit): FoodRef`; `toMealItems(res: AnalyzeResponse): MealItem[]` (ids con `createId`, `sortOrder` por índice, `weighed false`).
- Tipos `AnalyzeRequest/AnalyzeResponse/AnalyzedItem/Question/FoodHit` viven en `src/types/nutrition.ts` y la función Deno los duplica (no se comparte código entre Vite y Deno).
- `image.ts`: `fileToJpegBase64(file: Blob, maxSide = 1000, quality = 0.8): Promise<{ base64: string; mediaType: 'image/jpeg' }>` con `createImageBitmap` + canvas; respeta orientación EXIF (`imageOrientation: 'from-image'`).

- [ ] **Step 1: Test que falla** — `toMealItems` asigna `sortOrder` 0..n−1, `weighed false`, conserva `isHiddenFat`; `api` mapea 429 al mensaje exacto (fetch falso).
- [ ] **Step 2: Verificar que falla.** · **Step 3: Implementar.** · **Step 4: PASS + typecheck.**
- [ ] **Step 5: Commit** — `Conecta la app con el análisis de comidas`

---

### Task 11: Store local-first `useNutrition`

**Files:**
- Create: `src/storage/useNutrition.ts`
- Modify: `src/screens/RootScreen.tsx` (instanciar y pasar), `src/storage/useTasks.ts` solo si hace falta exponer `cloud` compartido (ver nota)

**Interfaces:**
- `useNutrition(userId: string | null): NutritionStore` con:
  ```ts
  type NutritionStore = {
    isLoading: boolean;
    profile: Profile | null; measurements: BodyMeasurement[]; weights: WeightEntry[]; sleepLogs: SleepLog[]; workouts: Workout[]; meals: Meal[]; portions: UserPortion[];
    saveProfile(patch: Omit<Profile,'id'|'createdAt'|'updatedAt'>): void;
    addMeasurement(m: Omit<BodyMeasurement, keyof Synced>): void; updateMeasurement(id, patch): void; deleteMeasurement(id): void;
    setWeight(date: string, weightKg: number): void; clearWeight(date): void;
    setSleep(date: string, log: Omit<SleepLog, keyof Synced | 'date'>): void; clearSleep(date): void;
    addWorkout(w: Omit<Workout, keyof Synced | 'met' | 'kcalNet'>, weightKg: number): void; deleteWorkout(id): void;
    addMeal(m: Omit<Meal, keyof Synced>): Meal; updateMeal(id: string, patch: Partial<Omit<Meal, keyof Synced>>): void; deleteMeal(id): void;
    rememberPortion(foodKey: string, grams: number): void; // media móvil simple: grams = (grams*samples + new)/(samples+1)
    getMealsForDay(date): Meal[]; getWeightFor(date): WeightEntry | null; getSleepFor(date): SleepLog | null; getWorkoutsFor(date): Workout[];
    latestMeasurement(): BodyMeasurement | null; currentWeightKg(): number | null; // último peso, si no medición, si no null
    trend(): TrendPoint[];
    targetFor(date: string): DailyTarget | null; // null sin perfil o sin peso
    cloud: CloudSync;
  };
  ```
- Persistencia: `loadList/saveList` genéricos en `nutritionStore.ts` (reusar `loadList` de `tasks.ts` si se exporta). Claves `day2day:<table>:v1`. `stamped` igual que en `useTasks`.
- Sync: segunda instancia de `useCloudSync` con los siete bindings. Nota: dos instancias comparten `syncQueue` (módulo singleton) y el cursor por `uid`; para no pisarse el cursor, el cursor pasa a ser por `uid` **y** por lista de tablas (`CURSOR_KEY:${uid}:${tables.join(',')}`). Hacer ese cambio en `useCloudSync` dentro de esta tarea.
- `targetFor(date)`: `workoutKcal` = suma de `workouts` del día; `weightKg` = `currentWeightKg()`; `today` = `date`.

- [ ] **Step 1: Tests que fallan** — hook con `@testing-library/react`? No: mantener las mutaciones como funciones puras exportadas (`reducers.ts` dentro de `useNutrition.ts` o archivo aparte `nutritionReducers.ts`) y testearlas: `setWeightIn(list, date, kg)` reemplaza misma fecha; `rememberPortionIn(list, key, g)` promedia; `addWorkoutIn(list, w, weightKg)` calcula `met` y `kcalNet` con `workoutKcal`.
- [ ] **Step 2: Verificar que fallan.** · **Step 3: Implementar hook + reducers.** · **Step 4: PASS + typecheck.**
- [ ] **Step 5: Prueba manual** — con sesión, `setWeight` desde la consola de React DevTools o un botón temporal; ver fila en `weights` en Supabase; borrar el botón.
- [ ] **Step 6: Commit** — `Guarda y sincroniza comidas, peso, sueño y entrenos`

---

### Task 12: Perfil y metas en Ajustes

**Files:**
- Create: `src/screens/ProfileScreen.tsx`
- Modify: `src/screens/SettingsScreen.tsx` (fila "Mi perfil y metas" que abre `ProfileScreen` como modal a pantalla completa, patrón de `TaskEditor`), `src/screens/RootScreen.tsx` (pasar `nutrition`)

**Interfaces:**
- `ProfileScreen({ profile, measurements, currentWeightKg, onSave, onAddMeasurement, onUpdateMeasurement, onDeleteMeasurement, onClose })`.
- Campos: sexo (segmentado), fecha de nacimiento (input `date` nativo en web), altura cm, objetivo (3 chips con copy: "Bajar grasa", "Mantener", "Ganar músculo"), ritmo semanal (stepper 0,05 limitado por `RATE_RANGE`), peso meta (opcional), % grasa meta (opcional), actividad base (3 chips: "Sedentario", "Ligero", "Moderado"), proteína g/kg (opcional, placeholder con la regla), meta de sueño (stepper 15 min), entrenos/semana.
- Debajo, tarjeta "Tu meta hoy": `dailyTarget` en vivo con kcal, P/C/G, método del BMR en texto ("BMR medido del 30 oct", "Katch-McArdle", "Mifflin-St Jeor"), aviso si `floorApplied`. Edición de macros con `rebalanceMacros` solo visual (la meta se recalcula; no se persiste).
- Sección "Mediciones corporales": lista por fecha con % grasa, cintura, BMR; botón agregar → formulario con los campos de `BodyMeasurement`.
- Defaults al crear perfil por primera vez: `activityFactor 1.375`, `sleepGoalMin 450`, `goal 'maintain'`, `weeklyRateKg 0`.
- Al guardar perfil con `weeklyRateKg` fuera de rango → se guarda `clampRate`.

- [ ] **Step 1: Implementar pantalla y entrada en Ajustes.** Usa `parseDecimal` en todos los numéricos.
- [ ] **Step 2: Verificar** — typecheck; manual en iPhone (o Safari responsive): crear perfil de Miguel (male, 2003, 168, gain_muscle, +0,15, 1.375) → "Tu meta hoy" 2.351 kcal sin entrenos; agregar medición de Karen en su cuenta (30 oct, 59 kg, 40,4 %, BMR 1.384, cintura) → con lose_fat −0,5 → 1.353 kcal.
- [ ] **Step 3: Commit** — `Agrega el perfil con metas y mediciones corporales`

---

### Task 13: Pestaña Comida: check-in, totales y línea de tiempo

**Files:**
- Create: `src/screens/FoodScreen.tsx`, `src/components/food/CheckInCard.tsx`, `TotalsCards.tsx`, `MealRow.tsx`, `WorkoutSheet.tsx`
- Modify: `src/components/TabBar.tsx` (`TABS` → `['schedule','todos','food','report','settings']`, meta `food: { label: 'Comida', icon: 'restaurant-outline', active: 'restaurant' }`; agregar `restaurant`/`restaurant-outline` a `theme/icons.ts` si no están), `src/screens/RootScreen.tsx`

**Interfaces:**
- `FoodScreen({ selectedDate, onSelectDate, markedDays, nutrition, readOnly })`. Usa `WeekStrip` igual que las otras pestañas.
- `CheckInCard({ date, weight, sleep, workouts, weightKg, onSetWeight, onSetSleep, onAddWorkout, onDeleteWorkout, readOnly })`: tres celdas; peso abre input numérico inline (`inputMode="decimal"`), sueño abre dos `TimePicker` (acostada/levantada) con alternativa "solo horas"; entreno abre `WorkoutSheet` (tipo con `WORKOUT_LABELS`, minutos stepper de 5, intensidad 3 chips; muestra kcal estimadas con `workoutKcal`). Estado colapsado cuando peso y sueño existen: una línea "65,4 kg · 7 h 10 · Calistenia 45'".
- `TotalsCards({ totals: Macros, target: DailyTarget | null })`: dos tarjetas; sin perfil, texto "Crea tu perfil en Ajustes para ver tu meta" enlazando a Ajustes (callback `onOpenProfile`).
- `MealRow({ meal, onPress, onDelete, readOnly })`: hora, icono por slot (🍳🍗🍌🌙 → Ionicons `cafe-outline`, `restaurant-outline`, `nutrition-outline`, `moon-outline`), título, `P · C · G · ~±N kcal` (rango solo si algún ítem no está `weighed`), kcal. Gesto: deslizar izquierda elimina con `ConfirmDialog` (misma mecánica que `TaskCard`); deslizar derecha queda deshabilitado en esta entrega (fase 2: favorito).
- Franjas vacías: para cada `MEAL_SLOTS` sin comida ese día, fila atenuada "Desayuno · sin registrar" con hora = mediana de `timeMinutes` de comidas previas de ese slot, o default (7:00, 12:30, 16:00, 19:30); tocarla abre el editor con ese slot.
- Botones inferiores "📷 Foto" y "⌨ Texto" (ocultos en `readOnly`) → abren `MealEditor` (Task 14) en modo `photo`/`text`.

- [ ] **Step 1: Implementar TabBar + FoodScreen + componentes** con `MealEditor` como stub que solo cierra.
- [ ] **Step 2: Verificar** — typecheck; manual: check-in guarda peso con coma, sueño 23:30→06:45 muestra "7 h 15", entreno aparece con kcal; totales cambian con la meta de Task 12.
- [ ] **Step 3: Commit** — `Agrega la pestaña Comida con check-in y totales del día`

---

### Task 14: Editor de comida (capturar → revisar → guardar)

**Files:**
- Create: `src/components/food/MealEditor.tsx`, `ChipQuestion.tsx`, `FoodSearch.tsx`, `src/components/food/mealEditorState.ts`, `mealEditorState.test.ts`

**Interfaces:**
- `MealEditor({ visible, mode: 'photo' | 'text' | 'edit', date, slot, meal?: Meal, portions, recentFoods, onSave(meal: Omit<Meal, keyof Synced> | Meal), onClose, onRememberPortion(foodKey, grams) })`.
- Paso 1 (capturar): en `photo`, `<input type="file" accept="image/*" capture="environment">` disparado al abrir; miniatura; nota de texto; selector de slot (4 chips, preseleccionado `slotForMinutes(now)` o el recibido); botón "Analizar"; botón secundario "Buscar alimento" → `FoodSearch`. En `text`, solo nota + slot. Botón de voz: si `window.SpeechRecognition || webkitSpeechRecognition` existe, botón 🎤 que dicta en `es-CO`; si no, no se muestra.
- Al tocar "Analizar": guarda borrador `{ date, slot, note, items: [] }` en AsyncStorage `day2day:mealDraft:v1`, llama `analyzeMeal` con `hints.portions` (top 20 de `portions` por `samples`) y `recentFoods` (nombres de ítems de los últimos 7 días, únicos, máx 30). Spinner "Analizando… ~10 s". Error → toast con mensaje y vuelve al paso 1 con la foto conservada.
- Paso 2 (revisar): lista de `MealItem`; gramos editables (`inputMode="decimal"`, al editar → `weighed=true`, `gramsMin/Max=null`); nombre + fuente debajo (`TCAC · 130 kcal/100 g`, `USDA`, `Mío`, o etiqueta ámbar "valores estimados por IA" cuando `food.source==='ai'`); `isHiddenFat` → subtítulo ámbar "estimado, no se ve"; quitar ítem (✕); "＋ agregar ítem" → `FoodSearch` (busca con `searchFoods`, debounce 250 ms, elegir → ítem con `grams = default_portion_g ?? 100`). `ChipQuestion` si `question` ≠ null: al elegir, `grams` del ítem × `gramsMultiplier` (sobre los gramos originales del análisis) y la pregunta desaparece. Chips "Me comí: 100 % · 75 % · 50 % · 25 %". Total con `mealTotals`. Botón "Guardar".
- Guardar: `title` = nombres de ítems no `isHiddenFat` unidos por ", " (máx 3, luego "…"); `timeMinutes` = ahora si es hoy, si no el default del slot; `source` según modo; por cada ítem con `food` y `weighed` → `onRememberPortion(food.id, grams)`. Borra el borrador.
- Modo `edit`: abre directo en paso 2 con el `meal` recibido.
- Al montar `FoodScreen`, si existe borrador → banner "Tienes una comida sin terminar" con "Continuar" (abre paso 1 con la nota; la foto no se conserva) y "Descartar".
- `mealEditorState.ts`: reducer puro `editorReducer(state, action)` con acciones `setItems`, `setGrams(index, grams)`, `removeItem`, `addItem`, `answer(optionIndex)`, `setEatenPct`; selectores `totals(state)`, `title(state)`.

- [ ] **Step 1: Tests que fallan** — `setGrams` marca `weighed` y limpia rango; `answer` multiplica sobre gramos originales (dos respuestas seguidas no se acumulan); `title` corta a 3 nombres y excluye `isHiddenFat`; `totals` respeta `eatenPct`.
- [ ] **Step 2: Verificar que fallan.** · **Step 3: Implementar reducer y UI.** · **Step 4: PASS + typecheck.**
- [ ] **Step 5: Prueba manual en iPhone** — foto real de un almuerzo: ≥3 ítems, aceite como ítem aparte, pregunta con chips, editar gramos, guardar; la fila aparece en la línea de tiempo con kcal y rango; reabrir y editar; cerrar la app a mitad del análisis y volver → banner de borrador.
- [ ] **Step 6: Commit** — `Registra comidas por foto o texto y permite corregirlas`

---

### Task 15: Vista de la pareja

**Files:**
- Create: `src/auth/PartnerProvider.tsx`, `src/storage/partner.ts`, `src/storage/partner.test.ts`, `src/components/PersonSwitcher.tsx`, `src/components/ViewingBanner.tsx`
- Modify: `src/screens/RootScreen.tsx`, `ScheduleScreen.tsx`, `TodosScreen.tsx`, `ReportScreen.tsx`, `FoodScreen.tsx`, `components/TaskCard.tsx`, `TodoRow.tsx`, `DayModeBar.tsx`

**Interfaces:**
- `PartnerProvider` expone `usePartner(): { partner: { id: string; name: string } | null; viewing: 'me' | 'partner'; setViewing(v): void; snapshot: PartnerSnapshot | null; loading: boolean; refresh(): Promise<void>; addTodoForPartner(title: string, date: string): Promise<void> }`. `partner.id` = `select partner_id from partners` al iniciar sesión; `partner.name` = el `ACCOUNTS` cuyo email ≠ `user.email`. Si no hay fila en `partners`, `partner = null` y el switcher no se muestra.
- `partner.ts`: `fetchPartnerSnapshot(partnerId: string): Promise<PartnerSnapshot>` con `PartnerSnapshot = { tasks: Task[]; todos: Todo[]; dayModes: DayModeRecord[]; meals: Meal[]; weights: WeightEntry[]; sleepLogs: SleepLog[]; workouts: Workout[]; profile: Profile | null; measurements: BodyMeasurement[] }` — selects con `.eq('user_id', partnerId).is('deleted_at', null)`, convertidos con los `fromRow` de `COLLECTIONS`; nunca entra a AsyncStorage ni a la cola. `insertTodoFor(partnerId, todo: Todo): Promise<void>` → `supabase.from('todos').insert(toTodoRow(todo, partnerId))`; sin red → lanza `Error('Sin conexión: el pendiente no se creó')`.
- `PersonSwitcher`: dos pastillas con los nombres, en la cabecera de todas las pestañas (encima de `WeekStrip`; en Ajustes arriba). Al elegir `partner`: `refresh()` + `ViewingBanner` fijo bajo el switcher: "Viendo a Karen · solo lectura"; se refresca también al volver a primer plano (`visibilitychange`).
- `RootScreen`: cuando `viewing==='partner'`, construye las props de las pantallas desde `snapshot` (reutilizar `occursOn`/`resolve` extrayendo de `useTasks` una función pura `tasksForDay(tasks, dayModes, dayKey)` si aún no existe) y pasa `readOnly`. Mutaciones ajenas → no-op. Excepción: `TodosScreen.onAdd` → `addTodoForPartner`, luego `refresh()`.
- `readOnly` en pantallas y filas: oculta botones de agregar (salvo en Pendientes), desactiva gestos y toques de completar/editar, oculta `DayModeBar` y el `MealEditor`. `ReportScreen` muestra el reporte del otro tal cual.

- [ ] **Step 1: Test que falla** — `fetchPartnerSnapshot` con cliente falso: cada tabla consultada con `eq('user_id', partnerId)` e `is('deleted_at', null)`; `insertTodoFor` construye `user_id = partnerId`.
- [ ] **Step 2: Verificar que falla.** · **Step 3: Implementar.** · **Step 4: PASS + typecheck.**
- [ ] **Step 5: Prueba manual con dos cuentas** — Miguel ve a Karen: cronograma, pendientes, progreso y comida de ella; no puede completar nada; agrega un pendiente a Karen → aparece en la cuenta de Karen al sincronizar; Karen lo puede marcar y borrar. Volver a "Miguel" y confirmar que su store local no tiene nada de Karen (Ajustes muestra el mismo conteo de actividades que antes).
- [ ] **Step 6: Commit** — `Permite ver el día de la pareja y agregarle pendientes`

---

### Task 16: Documentación y despliegue

**Files:**
- Modify: `README.md`, `AGENTS.md` (una línea: existe la función `nutrition` y la pestaña Comida)

- [ ] **Step 1: README** — sección "Comida y cuerpo": qué hace, de dónde salen las kcal, cómo se calcula la meta, límite diario, qué se guarda y qué no (la foto no). Sección de puesta en marcha: `ANTHROPIC_API_KEY` como secreto, `npx supabase functions deploy nutrition`, `npx supabase db push`, cómo correr el seed USDA. Tabla de rutas de `nutrition`. Nota sobre la vista de la pareja y las políticas RLS.
- [ ] **Step 2: Verificar** — `npm run typecheck && npm test && npm run build` en verde.
- [ ] **Step 3: Commit y push** — `Documenta la pestaña Comida y su despliegue`; `git push origin main` (Vercel despliega solo).
- [ ] **Step 4: Verificación en producción** — abrir la PWA instalada en los dos iPhones, registrar una comida real cada uno, un peso y un sueño; ver que aparecen cruzados en la vista de la pareja.
