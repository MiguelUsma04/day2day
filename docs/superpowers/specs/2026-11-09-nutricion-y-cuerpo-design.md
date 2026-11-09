# day2day · Comida, cuerpo y vista compartida

Fecha: 2026-11-09. Estado: aprobado por Miguel el 2026-11-09. Foto de progreso descartada por ahora.

## 1. Intención

day2day ya resuelve la rutina diaria de Miguel y Karen. Falta la otra mitad de
sus objetivos físicos: saber cuánto comen, cuánto pesan y cuánto duermen, para
confirmar si cada uno va en la dirección que quiere.

- **Karen** (24 años, 150 cm, ~59 kg, 40,4 % grasa, masa libre de grasa
  31,6 kg según el equipo, BMR medido 1.384 kcal por bioimpedancia el
  2026-10-30) quiere bajar grasa
  conservando o ganando músculo en piernas y glúteo. Referencia visual: físico
  atlético con abdomen marcado. Meta numérica: ~50 kg y ~24 % grasa. Eso
  implica perder ~11–12 kg de grasa sin perder músculo: mínimo 6 meses a
  −0,5 kg/semana, realista 6–9 con mesetas. La app muestra ese horizonte
  desde el primer día.
- **Miguel** (23 años, 168 cm, ~65 kg) quiere ganar fuerza y músculo
  (calistenia) sin acumular grasa. Sin peso objetivo; lo que importa es que la
  tendencia suba despacio.

Lo que ambos necesitan ver sin pensar: **cuánto llevo hoy, cuánto me falta o me
pasé, y si la semana va en la dirección correcta**. La proteína importa casi
tanto como las calorías y va siempre visible al lado.

Además, cada uno quiere ver el día del otro: rutina, pendientes, progreso y
ahora comida.

## 2. Metas, no-metas, anti-metas

**Metas**
1. Registrar una comida en menos de 30 segundos con foto o texto, con calorías
   y macros que salen de tablas nutricionales, no inventadas por el modelo.
2. Ver el balance diario y semanal contra una meta personal, por cuenta.
3. Check-in de la mañana en 20 segundos: peso, horas dormidas, entreno del día.
4. Peso tendencia (suavizado) y, a las 3–4 semanas, gasto energético real
   calculado a partir de comida + peso, que ajusta la meta solo.
5. Vista de solo lectura del día del otro, con permiso para agregarle
   pendientes.
6. Exportar un resumen en texto de las últimas semanas para pedir consejo a
   Claude fuera de la app.

**No-metas**
- Seguimiento de series, cargas o programas de gym. Se registra tipo +
  minutos; el programa vive fuera de la app.
- App nativa, HealthKit, Apple Watch, anillos. Los pasos del iPhone entran solo
  por un Atajo (fase 3).
- Telegram, Railway, n8n. Todo vive en la PWA + Supabase.
- Multiusuario abierto. Siguen siendo dos cuentas cerradas.

**Anti-metas (si pasa esto, fracasó)**
- Que el modelo invente kcal. Toda caloría trazable a un alimento de la tabla.
- Que registrar dé pereza a la segunda semana. Si una comida exige más de una
  pregunta o más de 3 toques de corrección, el flujo está mal.
- Que Karen baje de 1.200 kcal/día o pierda >0,7 kg/semana sin que la app lo
  señale. La meta tiene piso y la tendencia tiene alarma.
- Que la pestaña Comida se convierta en MyFitnessPal: nada de "health score",
  rachas de comida, insignias, agua.

## 3. Restricciones

- Stack actual intacto: React 19 + react-native-web + Vite, AsyncStorage
  local-first, Supabase (Postgres, RLS, Edge Functions Deno), deploy en
  Vercel, Web Push ya existente (`supabase/functions/push`).
- Patrón de sync actual se reutiliza: filas con `id` texto, `user_id`,
  `created_at`/`updated_at` epoch ms, `deleted_at` soft delete, `synced_at`
  servidor con trigger `touch_synced_at`, cola `syncQueue.ts`, colecciones en
  `useCloudSync.ts`.
- La API key de Anthropic vive solo como secreto de Edge Function
  (`ANTHROPIC_API_KEY`). Nunca en `VITE_*`, nunca en el cliente, nunca en el
  chat. Miguel la crea y la pone él en Dashboard → Edge Functions → Secrets.
- Costo objetivo: <US$5/mes para los dos. Fotos redimensionadas en cliente a
  ~1.000 px de lado mayor antes de enviarlas.
- Idioma de UI: español colombiano, como el resto de la app.
- Fuentes nutricionales por 100 g: TCAC 2018 del ICBF (colombianos) y USDA
  FoodData Central. Más adelante Open Food Facts por código de barras.
- Timeout de Edge Functions en plan gratuito (~150 s) sobra para una llamada
  de visión (5–15 s).

## 4. Decisiones tomadas en la conversación

### 4.1 Pestaña "Comida" (opción B elegida)

Quinta pestaña en `TabBar`, entre Pendientes y Progreso. Icono tipo
`restaurant-outline`. Vista del día con el mismo selector de fecha que el
cronograma.

De arriba abajo:
1. **Tarjeta "Check-in de hoy"** (opción A elegida): tres campos, peso (kg),
   dormí (h:mm o acostada/levantada), entreno (＋). Cuando los tres están llenos
   se encoge a una línea resumen. Toque para editar.
2. **Dos tarjetas de totales**: Calorías (consumidas, barra contra la meta,
   "faltan N" o "te pasaste N") y Proteína (g, barra, faltan). Carbohidratos
   y grasa se ven dentro de cada comida, no arriba.
3. **Línea de tiempo de comidas**: una fila por comida, con hora, icono,
   título (ítems resumidos), subtítulo `P · C · G` y rango de incertidumbre
   pequeño (`~±120 kcal`), kcal a la derecha. Franjas vacías esperadas
   (Desayuno, Almuerzo, Snack, Cena) aparecen atenuadas con "sin registrar";
   la hora de la franja vacía sale del horario habitual del usuario.
4. **Dos botones**: 📷 Foto y ⌨ Texto. Ambos abren el mismo editor de comida.

Gestos sobre una comida: tocar = editar; deslizar derecha = guardar como
frecuente; deslizar izquierda = eliminar con confirmación. Mismos componentes
de gesto que `TaskCard`/`TodoRow`.

### 4.2 Flujo de registro (aprobado tal cual)

**Paso 1, capturar.** Foto desde cámara o galería (`<input type="file"
accept="image/*" capture="environment">`), nota opcional de texto o voz (Web
Speech API si está disponible; si no, solo texto), selector de franja
(Desayuno / Almuerzo / Snack / Cena, preseleccionado por hora). Botón
"Analizar". Botón secundario "Sin foto: elegir de mis comidas frecuentes".
Pista en pantalla: foto cenital, cubiertos o mano en cuadro para escala.

**Paso 2, revisar y ajustar.** Lista de ítems devueltos por el análisis. Cada
ítem: nombre, fuente (TCAC/USDA/personal) y kcal/100 g, campo de gramos
editable (toque = teclado numérico, es donde se escribe lo de la gramera),
kcal calculadas. La grasa de cocción aparece **siempre como ítem aparte**
marcado "estimado, no se ve". Botón "＋ agregar ítem" con buscador de la
tabla. Debajo, **como máximo una pregunta** con chips (ej. "¿Cuánto aceite
llevaba el pollo?" Poco / Normal / Bastante / Al horno), solo si el ítem
dudoso pesa más de ~15 % del total. Total kcal + proteína. Botón "Guardar".

**Paso 3, guardada.** Vuelve al día, la comida nueva resaltada un instante,
totales actualizados. Al día siguiente, en la franja vacía correspondiente,
aparece "Repetir almuerzo de ayer" en un toque.

**Tabla nutricional manda.** El modelo identifica y estima gramos; la app
busca candidatos en `foods` y el modelo elige entre los candidatos devueltos.
**Si ningún candidato sirve**, el modelo propone valores por 100 g para ese
alimento; se guardan en `user_foods` con `source='ai'` y `verified=false`, el
ítem muestra una etiqueta "valores estimados por IA" y la comida se guarda sin
pasos extra (no cuenta como pregunta). El usuario puede corregir o confirmar
ese alimento después desde el buscador; al confirmarlo pasa a
`verified=true`. Es la única vía por la que un valor nutricional sale del
modelo, y queda marcada. kcal y macros =
gramos × valor/100 g, en código. Se guarda rango mín–máx de gramos para
mostrar la incertidumbre; cuando el usuario escribe gramos a mano, el rango
desaparece y el ítem queda marcado `weighed`.

**Sobras.** Campo "me comí el X %" en el editor (chips 100 / 75 / 50 / 25).
Nunca se restan dos estimaciones independientes.

**Sin autocrítica en segunda pasada** del modelo: la evidencia dice que no
ayuda. Una sola llamada de visión por comida.

### 4.3 Check-in, peso, sueño, entreno

- **Peso**: un número al día, kg con un decimal. Se guarda por fecha; si se
  repite el mismo día, reemplaza. Peso tendencia = media móvil exponencial
  α = 0,1 sobre los días con dato (The Hacker's Diet). Se muestra siempre la
  tendencia como número principal y el peso crudo como secundario.
- **Sueño**: horas reales, aparte del cronograma (decisión explícita de
  Miguel). Entrada: hora de acostarse + hora de levantarse (calcula
  duración), o duración directa. Meta por defecto 7,5 h, editable en perfil.
  Se muestra promedio de 7 días y deuda acumulada contra la meta.
- **Entreno**: tipo + minutos + intensidad opcional (suave/normal/fuerte).
  Tipos iniciales: Gym fuerza (3,5 MET; fuerte 5,0), Caminadora (4,0; fuerte
  6,0), Calistenia (5,0; fuerte 7,5), Cardio (7,0), Fútbol (7,0), Caminata
  (3,5), Otro (4,0). Gasto neto = (MET − 1) × kg × horas. Varios entrenos por
  día permitidos. Los MET son semilla; el gasto adaptativo los absorbe después.

### 4.4 Perfil y metas

Pantalla "Mi perfil" dentro de Ajustes. Por cuenta:

- Sexo, fecha de nacimiento (o edad), altura cm, peso inicial (se toma del
  último check-in si existe).
- Opcionales: % grasa, BMR medido (bioimpedancia), fecha de la medición.
- Objetivo: `bajar grasa` | `mantener` | `ganar músculo`.
- Ritmo semanal en kg (Karen −0,5 por defecto; Miguel +0,15). Rangos
  permitidos: bajar −0,25 a −0,7; ganar +0,1 a +0,3.
- Meta de peso opcional (Karen 50). Meta de % grasa opcional (Karen 24).
- Nivel de actividad base fuera de entrenos: sedentario / ligero / moderado
  (factor 1,2 / 1,375 / 1,55 sobre BMR). Por defecto ligero.
- Entrenos por semana esperados (solo informativo para el usuario).
- Meta de sueño en horas.
- Proteína objetivo g/kg: por defecto 2,0 sobre peso corporal para ganar
  músculo; para bajar grasa 2,0–2,2 sobre **masa magra** si hay % grasa, si no
  1,8 sobre peso. Editable.
- Agregar/editar **mediciones corporales** (fecha, peso, % grasa, masa libre
  de grasa, masa muscular esquelética, grasa visceral, BMR medido, cintura en
  cm). La cintura se mide una vez al mes; es la señal más barata de grasa
  visceral y cambia antes que la báscula cuando se gana músculo. Entran en
  la **Entrega 1** porque la fórmula de la meta las necesita; `profiles` no
  duplica estos campos, la meta lee la medición más reciente. Semilla para
  Karen (del informe de bioimpedancia):
  - 2026-09-23: peso 59, masa libre de grasa 31, masa grasa 24, músculo
    esquelético 17 (valores redondeados que trae el historial del informe).
  - 2026-10-30: peso 59, grasa 40,4 %, masa grasa 23,8, masa libre de grasa
    31,6, músculo esquelético 17, grasa visceral 10, BMR 1.384,22.

**Cálculo de la meta diaria (fase 1, fórmula):**
1. BMR = BMR medido si existe y tiene <90 días; si no, Katch-McArdle cuando
   hay % grasa (370 + 21,6 × masa libre de grasa, calculada como peso ×
   (1 − % grasa) y no el valor del equipo, que no es comparable entre marcas);
   si no, Mifflin-St Jeor.
2. Gasto estimado del día = BMR × factor de actividad base + gasto neto de
   entrenos registrados ese día (los entrenos **sí** suman a la meta del día,
   porque son manuales y no inflados por sensores).
3. Meta kcal = gasto estimado + (ritmo kg/semana × 7.700 / 7).
4. Piso: 1.200 kcal para Karen (mujer) y 1.500 para Miguel (hombre). Si la
   fórmula da menos, se usa el piso y se avisa que el ritmo real será menor.
5. Macros coherentes: proteína según regla, grasa mínimo 0,8 g/kg, el resto
   carbohidratos. kcal = 4P + 4C + 9G siempre cuadra; al editar un macro se
   recalculan los otros (no repetir el bug de Cal AI).

Con los datos actuales esto da aproximadamente: Karen ~1.350–1.450 kcal y
~100–110 g proteína en día sin entreno; Miguel ~2.500–2.700 kcal y ~130 g.
Son puntos de partida; la fase 3 los reemplaza por el gasto medido.

### 4.5 Progreso

A `ReportScreen` se le suman, debajo de lo de rutina:
- **Peso**: línea de tendencia con puntos crudos atenuados, banda de ritmo
  objetivo, marcadores de mediciones corporales (con % grasa). Alarma textual
  si la tendencia cae >0,7 kg/semana (Karen) o sube >0,3 (Miguel).
- **Sueño**: barras por noche contra la meta, promedio semanal.
- **Balance semanal**: ingesta promedio vs gasto estimado, déficit/superávit
  real de la semana, proteína promedio vs meta.
- (Fase 3) "Tu gasto real: ~X kcal/día" y la fecha del próximo ajuste.

### 4.6 Vista del otro

- Selector de persona en la cabecera de todas las pestañas (donde hoy aparece
  el nombre): Miguel | Karen. Al elegir al otro, toda la app muestra sus datos
  con un banner persistente "Viendo a Karen · solo lectura".
- Permisos: **lectura total** de tareas, pendientes, day_modes, comidas,
  check-ins, perfil y metas del otro. **Escritura**: solo crear pendientes
  (`todos`) para el otro. No se puede marcar, editar ni borrar nada ajeno,
  ni los pendientes que uno mismo le creó una vez guardados (el dueño decide).
- Implementación: RLS con una tabla `partners (user_id, partner_id)` de dos
  filas simétricas. Políticas `select` para `user_id = auth.uid() or user_id in
  (select partner_id from partners where user_id = auth.uid())`; `insert` en
  `todos` permitido con `user_id` = pareja; `update`/`delete` solo propio.
- Los datos del otro **no** entran en la cola de sync ni en AsyncStorage como
  propios: se leen en modo solo-lectura con caché aparte, se refrescan al
  entrar al modo y al volver a primer plano. Nunca se mezclan con el store
  local del usuario.
- Los pendientes creados para el otro se escriben directo a Supabase (no a la
  cola local) y aparecen cuando el otro hace pull; si no hay red, se avisa y
  no se crea.

### 4.7 Recordatorios

Dos nuevos recordatorios por Web Push, apagables en Ajustes:
- **Check-in de la mañana**: a la hora del primer "Despertar" del cronograma
  (o 7:00 si no hay) si falta peso o sueño del día.
- **Resumen del día**: 21:00, con calorías, proteína y franjas sin registrar.
  Si no hay ninguna comida registrada ese día, el texto cambia a "Hoy no
  registraste nada".
El contenido se arma en el cliente al sincronizar recordatorios, igual que los
actuales, o en la función `push` con lectura de tablas vía service role.
Decisión del builder.

### 4.8 Exportar resumen

Botón en Ajustes → "Resumen para Claude". Genera texto plano con selector de
2 / 4 semanas: perfil y metas, tabla por día (kcal, P/C/G, meta, peso crudo,
tendencia, sueño, entrenos), promedios semanales, comidas más repetidas,
mediciones corporales. Se copia al portapapeles y se puede compartir
(`navigator.share` si existe). Nada se envía a ningún servidor.

### 4.9 Alimentos

- Tabla `foods` global (no por usuario), por 100 g: `id`, `name_es`,
  `name_en`, `source` (`tcac` | `usda` | `off` | `user`), `source_ref`,
  `kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `default_portion_g`,
  `tags` (ej. `frito`, `cocido`, `bebida`), `search` tsvector + índice
  `pg_trgm` sobre nombre.
- Semilla inicial: ~150 alimentos colombianos frecuentes extraídos de la
  TCAC 2018 (PDF público del ICBF; el builder lo descarga y lo deja en
  `supabase/seed/tcac-2018.pdf` fuera del bundle) (arroces, arepas, fríjoles, lentejas, papa, yuca, plátano,
  patacón, huevo, pollo por corte y cocción, carnes, pescados, aceites,
  mantequilla, panes, galletas, quesos, leche, yogur, frutas, jugos con y sin
  azúcar, panela, café, chocolate, avena, granola, maní, aguacate) + un
  extracto de USDA FoodData Central para lo que falte (SR Legacy / Foundation,
  CSV descargado por un script de seed, filtrado a ~2.000 filas genéricas).
  Verificación: el builder transcribe la TCAC leyendo el PDF y re-lee cada
  fila contra la página de origen (`source_ref` = página y código TCAC);
  columna `verified` true solo para esas. Las filas USDA llevan `name_es`
  traducido una sola vez con `claude-haiku-5-5` en el script de seed
  (`name_es_auto=true`); sin nombre en español el buscador y el matching no
  las encuentran. Miguel no verifica filas a mano; si una kcal se ve rara en
  el uso, se corrige desde el buscador.
- `user_foods`: alimentos creados por un usuario o propuestos por el modelo
  (`source` `user`|`ai`, `verified` bool); visibles para los dos.
- `user_portions`: memoria de porciones ("mi plato de arroz ≈ 180 g") por
  usuario y alimento; se alimenta de cada corrección de gramos y de cada
  pesaje. Se usa como prior para el modelo y para los defaults del editor.
- `favorite_meals`: comidas guardadas con sus ítems y gramos, por usuario.

### 4.10 Edge Function `nutrition`

Rutas bajo `/functions/v1/nutrition`, autenticadas con el JWT del usuario
(no la anon key):
- `POST /analyze`: body `{ image_base64?, note?, meal_slot, locale:'es-CO',
  hints: { portions: [...], recent_foods: [...] } }`. Llama a Claude
  (`claude-sonnet-5-5` para visión; `claude-haiku-5-5` para elegir candidatos
  y para texto sin foto). Prompt: estimar **porción visible** en gramos con
  rango, nunca kcal; no usar porciones estándar; usar objeto de referencia
  para escala; listar grasa de cocción aparte; contexto colombiano; devolver
  JSON estricto (tool use con esquema). Luego, por ítem, busca hasta 5
  candidatos en `foods`/`user_foods` (prioridad: `user_portions` del usuario,
  `user_foods`, TCAC, USDA) y pide al modelo elegir uno o `null`. Devuelve
  ítems con `food_id`, gramos, rango, confianza, `hidden_fat_item`, y como
  máximo una `question` con opciones y el efecto en gramos de cada opción.
- `POST /search`: búsqueda de texto en `foods` para el "＋ agregar ítem".
  Puede ser también una vista/RPC de Postgres directa; decisión del builder.
- Límite de uso: 40 análisis por usuario por día. Registro de costo por
  llamada en `ai_usage` (tokens entrada/salida, modelo) para mirar la factura.
- Imagen: el cliente redimensiona a 1.000 px lado mayor, JPEG calidad 0,8,
  antes de codificar. La imagen **no** se guarda; solo el resultado. Si luego
  se quiere guardar la foto, va a Storage, fuera de este alcance.

### 4.11 Modelo de datos (tablas nuevas)

Todas con `user_id`, `created_at`, `updated_at` (epoch ms), `deleted_at`,
`synced_at` + trigger, índice `(user_id, synced_at)`, y siguen el patrón de
`tasks`/`todos` salvo donde se indica.

- `profiles` (1 por usuario): sexo, `birth_date`, `height_cm`, `goal`,
  `weekly_rate_kg`, `target_weight_kg`, `target_fat_pct`, `activity_factor`,
  `protein_g_per_kg`, `sleep_goal_min`, `workouts_per_week`. El BMR medido y
  el % grasa viven en `body_measurements`, no aquí.
- `body_measurements`: `date`, `weight_kg`, `fat_pct`, `fat_mass_kg`,
  `lean_mass_kg`, `skeletal_muscle_kg`, `visceral_fat_level`, `bmr_measured`,
  `waist_cm`, `source` (`scale`|`bioimpedance`|`tape`). Entrega 1.
- `weights`: `date` (pk por usuario), `weight_kg`.
- `sleep_logs`: `date`, `bed_at_minutes`, `wake_at_minutes`, `duration_min`.
- `workouts`: `date`, `kind`, `minutes`, `intensity`, `met`, `kcal_net`.
- `meals`: `date`, `slot`, `time_minutes`, `title`, `eaten_pct`,
  `kcal`, `protein_g`, `carbs_g`, `fat_g`, `kcal_min`, `kcal_max`,
  `source` (`photo`|`text`|`favorite`|`repeat`|`manual`), `analysis_id`.
- `meal_items`: `meal_id`, `food_id` / `user_food_id`, `name`, `grams`,
  `grams_min`, `grams_max`, `weighed` bool, `confidence`, `is_hidden_fat`,
  `kcal`, `protein_g`, `carbs_g`, `fat_g`, `sort_order`.
- `favorite_meals` + `favorite_meal_items`.
- `user_foods`, `user_portions`.
- `foods` (global, solo lectura para clientes; se carga por migración/seed).
- `partners (user_id, partner_id)`.
- `ai_usage` (solo servidor).
- `daily_targets` (fase 3): `week_start`, `tdee_estimated`, `tdee_adaptive`,
  `kcal_target`, `protein_target_g`, `method`.

Las colecciones que el cliente edita (weights, sleep_logs, workouts, meals,
meal_items, favorite_meals*, user_foods, user_portions, body_measurements,
profiles) entran en `COLLECTIONS` de `useCloudSync.ts` y en `Table` de
`syncQueue.ts`. `meals` y `meal_items` se sincronizan como una unidad lógica
(la comida con sus ítems embebidos en el store local; en el servidor pueden
ser dos tablas o `items jsonb` en `meals`. **Decisión del builder**, con
preferencia por `items jsonb` para reutilizar el patrón de `overrides`).

### 4.12 Gasto adaptativo (fase 3)

Cada semana (domingo noche), por usuario, si hay ≥6 días con comida
registrada y ≥2 pesos en las últimas 2 semanas:
1. Δtendencia = tendencia hoy − tendencia hace 14 días, en kg/día.
2. TDEE_adaptativo = ingesta media de 14–28 días − Δtendencia × 7.700.
3. Mezcla: peso del dato = min(1, semanas_con_datos / 4). TDEE = mezcla entre
   fórmula y adaptativo.
4. Nueva meta = TDEE + ritmo objetivo; cambio máximo ±150 kcal/semana;
   respeta el piso.
5. Se guarda en `daily_targets` y se muestra "Tu gasto real ≈ X" en Progreso
   con una línea de qué cambió y por qué.
Si hay menos datos, se mantiene la fórmula y se dice cuántos días faltan.

### 4.13 Pasos por Atajo de iPhone (fase 3)

`POST /functions/v1/nutrition/steps` con Bearer = token personal largo
guardado en `profiles.steps_token` (generado desde Ajustes). Body `{ date,
steps }` para hoy y ayer (idempotente por fecha). Tabla `activity_daily`.
Uso: solo informativo y como modificador menor (+0,04 kcal × kg por paso
sobre 5.000) hasta que el adaptativo tome el control. Guía del Atajo en el
README.

## 5. Orden de construcción

Tres entregas, cada una usable sola y desplegada a Vercel al terminar:

**Entrega 1 · lo esencial**
1. Migraciones: `profiles`, `body_measurements`, `weights`, `sleep_logs`,
   `workouts`, `meals` (+ ítems), `foods`, `user_foods`, `user_portions`,
   `partners`, `ai_usage`, RLS con pareja. Seed de las dos mediciones de
   Karen.
2. Seed de `foods` (TCAC a mano + USDA filtrado).
3. Edge Function `nutrition` con `/analyze` y `/search`.
4. Perfil y metas en Ajustes (fórmula, piso, macros coherentes).
5. Pestaña Comida: check-in, totales, línea de tiempo, editor de comida
   completo (foto, texto, revisar, pregunta con chips, guardar).
6. Sync de las nuevas colecciones.
7. Vista del otro (selector, banner, RLS, crear pendientes ajenos).

**Entrega 2 · lo que lo hace cómodo**
1. Gráficas de peso, sueño y balance semanal en Progreso.
2. Comidas frecuentes, "repetir ayer", guardar como frecuente por gesto.
3. Recordatorios de check-in y resumen del día.
4. Exportar resumen para Claude.
5. Marcadores de mediciones corporales en la gráfica de peso, con línea de
   cintura.
6. Descartado por ahora (decisión de Miguel, 2026-11-09): foto de progreso
   mensual. No se construye en ninguna entrega salvo pedido nuevo.

**Entrega 3 · lo que lo hace exacto**
1. Gasto adaptativo semanal y `daily_targets`.
2. Pasos por Atajo.
3. Código de barras con Open Food Facts (lector en cámara de la PWA).
4. Factor de sesgo personal por categoría a partir de pesajes.

## 6. Lo que queda al builder

- Estructura de componentes y división de pantallas (sugerido: `FoodScreen`,
  `MealEditor`, `CheckInCard`, `FoodSearch`, `PersonSwitcher`, `ProfileScreen`).
- `items jsonb` vs tabla `meal_items` (ver 4.11).
- Librería de gráficas o SVG a mano (la app no tiene ninguna; SVG a mano es
  aceptable, el repo ya evita dependencias).
- Dónde se arma el texto de los recordatorios nuevos (cliente vs función).
- Formato exacto del seed de `foods` (SQL vs CSV + script).
- Prompt final de visión y esquema de tool use, dentro de las reglas de 4.10.
- Cómo se expone la voz (Web Speech API es opcional; texto siempre).
- Estrategia de pruebas: lógica pura (BMR, metas, macros coherentes, EMA,
  adaptativo, cálculo kcal por ítem) con pruebas unitarias; la Edge Function
  con pruebas de contrato sobre el JSON; UI manual en iPhone.

## 7. Riesgos conocidos

- Comida colombiana mixta (sancocho, bandeja paisa) tendrá más error. Mitiga:
  gramera, memoria de porciones, preparaciones tradicionales de la TCAC como
  alimentos compuestos.
- Extraer la TCAC del PDF es tedioso y propenso a error de fila. Mitiga: solo
  ~150 filas iniciales, cada una verificada; el resto se agrega con el uso.
- iOS puede matar la pestaña entre tomar la foto y recibir la respuesta.
  Mitiga: el borrador de la comida se guarda en AsyncStorage antes de llamar
  a la función y se recupera al volver.
- Doble conteo si los entrenos suman a la meta y el adaptativo también los
  absorbe. Mitiga: en fase 3, cuando el adaptativo manda, los entrenos dejan
  de sumar a la meta del día y pasan a ser informativos.
