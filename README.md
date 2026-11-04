# day2day

App de cronograma diario para móvil. Arma tu rutina — desde que te levantas hasta que te duermes — y márcala a medida que avanzas.

PWA web pura: React + react-native-web empaquetados con Vite, instalable en el iPhone desde Safari. No hay build nativo.

## Qué hace

- **Cronograma por día** con línea de tiempo, hora exacta al minuto y duración.
- **Rutinas que se repiten**: cada día, de lunes a viernes, o días específicos. Se definen una vez y aparecen solas en cada día que corresponda. Al editarlas se pregunta si el cambio va a ese día o a toda la serie.
- **Deslizar para actuar**: a la derecha completa (con sonido), a la izquierda elimina pidiendo confirmación.
- **Fin de semana de ciudad o de finca**: cada sábado y domingo tiene un selector. Las actividades marcadas como *Finca* solo aparecen en días de finca; las de *Ciudad* entre semana y en fines de semana de ciudad; las de *Cualquier día* siempre. Así conviven dos rutinas sin mezclarse.
- **Festivos**: de lunes a viernes se puede marcar el día como festivo. Ese día no muestra actividades y la racha sigue intacta.
- **Lista de pendientes** aparte del cronograma, para lo que no tiene hora fija; se editan tocando su texto, se mueven de día deslizándolos a los lados y se ordenan arrastrándolos desde el asa de la derecha.
- **Lo completado baja al final** de la lista, así lo que falta queda arriba.
- **Recordatorios** por Web Push, que llegan con la app cerrada; a la hora de inicio por defecto y configurables por actividad.
- **Iconos** por actividad, elegidos de un catálogo.
- **Importar / exportar** el cronograma completo como JSON, y **respaldo** que además incluye los pendientes y el historial de rachas.
- **Borrado en bloque** desde Ajustes: todas las actividades, los pendientes, solo el historial, o todo.
- **Reporte de constancia**: porcentaje cumplido, rachas, días perfectos, calendario de los últimos días y qué hábitos se te dan mejor o peor.
- **Seis temas de color** (azul, rosa, lila, ámbar, verde, coral) que tiñen toda la interfaz —fondo, tarjetas y bordes incluidos—, más modo claro/oscuro/automático.
- **Progreso diario** y marcador **"Ahora"** sobre la actividad en curso.
- **Dos cuentas, cerradas**: Miguel y Karen. Al abrir la app por primera vez en un dispositivo se toca el nombre y se escribe la contraseña; la sesión queda guardada y no vuelve a pedirla. No hay registro abierto. Los datos se sincronizan con Supabase y aparecen en cualquier dispositivo; lo que ya tenías en el teléfono se sube solo la primera vez.

## Formato de importación

En **Ajustes → Importar cronograma** se pega un JSON y se crean todas las actividades de una vez. El botón *Ejemplo* descarga un archivo con este mismo formato.

Se acepta una lista directa, o un objeto con la propiedad `tasks`:

```json
{
  "tasks": [
    {
      "title": "Tomar un vaso de agua",
      "time": "06:10",
      "duration": 5,
      "category": "health",
      "icon": "water-outline",
      "repeat": "daily",
      "reminder": 0,
      "notes": "Opcional"
    },
    {
      "title": "Clase de inglés",
      "time": "19:00",
      "duration": 60,
      "category": "study",
      "repeat": "custom",
      "days": ["lun", "mie", "vie"]
    }
  ]
}
```

| Campo | Obligatorio | Valores |
|---|---|---|
| `title` | sí | Texto |
| `time` | no | `"HH:MM"` en 24 h (`"06:30"`), o `"6:30 PM"`. Sin él, la actividad queda sin hora |
| `duration` | no | Minutos (5 a 720). Por defecto 30 |
| `category` | no | `work`/`trabajo`, `personal`, `health`/`salud`, `study`/`estudio`, `other`/`otro` |
| `icon` | no | Nombre de Ionicons, p. ej. `sunny-outline`, `barbell-outline`, `book-outline` |
| `repeat` | no | `none`, `daily`, `weekdays`, `custom`. Por defecto `none` |
| `days` | solo con `custom` | `["lun","mar","mie","jue","vie","sab","dom"]` o números `0`-`6` (0 = domingo) |
| `reminder` | no | Minutos de antelación del aviso. Sin él, avisa a la hora de inicio; usa `null` para no avisar |
| `context` | no | `any`/`cualquiera`, `city`/`ciudad`, `farm`/`finca`. Sin él, se usa lo elegido en *Estas actividades son de* al importar |
| `notes` | no | Texto |
| `date` | no | `"YYYY-MM-DD"`, solo para actividades sin repetición. Por defecto, hoy |

Lo que no se pueda leer se avisa al importar, sin bloquear el resto.

### Dos rutinas: ciudad y finca

Lo más simple es tener dos JSON e importarlos uno tras otro **sin** activar *Reemplazar lo existente*:

1. El de lunes a domingo, con *Estas actividades son de* → **Ciudad**. Las de lunes a viernes salen siempre; las de sábado y domingo solo cuando ese fin de semana está en ciudad.
2. El de fin de semana de finca, con *Estas actividades son de* → **Finca**. Solo salen los sábados y domingos que marques como finca.

Si una actividad debe salir en los dos casos (por ejemplo "Despertar"), ponle `"context": "any"` en el JSON o edítala y elige *Cualquier día*.

Cada sábado y domingo se marca desde el cronograma, en el selector bajo la tira de días. Por defecto todos son de ciudad; solo se guardan las excepciones. Los avisos push respetan la marca: una rutina de finca solo se programa para los días marcados.

### Para pedírselo a un asistente

> Genera un JSON con mi cronograma diario siguiendo este formato: una lista en la propiedad `tasks`, donde cada entrada tiene `title`, `time` en formato `"HH:MM"` de 24 horas, `duration` en minutos, `category` (`work`, `personal`, `health`, `study` u `other`), `icon` (nombre de Ionicons), `repeat` (`none`, `daily`, `weekdays` o `custom`), y `days` solo si es `custom`. Añade `reminder` con los minutos de antelación donde quiera un aviso.

## Cuenta y sincronización

La app es *local-first*: `AsyncStorage` sigue siendo la copia de trabajo y la base de datos es la copia compartida. Con Supabase configurado, la app pide sesión al abrir; sin las variables, corre solo en local.

- **Entrar**: pantalla de inicio → tocar *Miguel* o *Karen* → contraseña. Una vez por dispositivo: la sesión se guarda en `localStorage` y se renueva sola hasta que se cierra desde Ajustes → Cuenta. Sin enlaces mágicos: en iPhone abrirían Safari y no la app instalada.
- **Solo esas cuentas**: el registro está cerrado (*Allow new users to sign up* apagado en Supabase). Los nombres y correos salen de `VITE_ACCOUNTS`; si no está definida, la app muestra un campo de correo normal.
- **Qué se sincroniza**: actividades (con historial, overrides y días saltados), pendientes (con su orden), los días marcados como finca o festivo, y el tema de color con el modo claro/oscuro (van en los metadatos del usuario de Supabase Auth, no en una tabla). El sonido y los avisos push son por dispositivo.
- **Cómo**: cada cambio local entra en una cola persistida (`day2day:syncQueue:v1`) y se sube con un pequeño retraso; al abrir la app, al volver a primer plano y al recuperar la red se hace un *pull* incremental por `synced_at` (reloj del servidor). En un conflicto gana el `updatedAt` más reciente; un borrado gana a una edición anterior. Los borrados son lógicos (`deleted_at`) para que lleguen a los demás dispositivos.
- **Primer inicio de sesión**: lo que solo existe en el dispositivo se sube; lo que solo existe en la cuenta se baja.
- **Cerrar sesión** no borra nada: el dispositivo conserva su copia.

### Puesta en marcha de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor** → pega y ejecuta `supabase/migrations/20261101000000_init.sql`. Crea `tasks`, `todos` y `push_devices` con RLS.
3. **Authentication → Sign In / Providers**: *Email* activo; apaga **Allow new users to sign up** para que nadie más pueda crear cuenta.
4. **Authentication → Users → Add user → Create new user**: una para Miguel y otra para Karen, con su correo real, la contraseña con la que van a entrar y **Auto Confirm User** marcado. Para cambiar una contraseña después: Users → el usuario → *Reset password* o *Update password*.
5. **Variables de entorno** (ver `.env.example`):

   | Dónde | Variable | Valor |
   |---|---|---|
   | `.env.local` y Vercel | `VITE_SUPABASE_URL` | Project Settings → API → Project URL |
   | `.env.local` y Vercel | `VITE_SUPABASE_ANON_KEY` | Project Settings → API → anon public |
   | `.env.local` y Vercel | `VITE_ACCOUNTS` | `Miguel:correo1,Karen:correo2` (los mismos correos del paso 4) |

   Sin las dos `VITE_SUPABASE_*` no hay pantalla de inicio de sesión y la app funciona solo en local, como antes.

## Notificaciones

Los avisos se envían por **Web Push desde Supabase**, así que llegan aunque la app esté cerrada. (Los temporizadores dentro de la app no sirven para esto: iOS los descarta al descargar la app de memoria, y `TimestampTrigger` —lo que permitiría al service worker dispararlos solo— no existe en Safari.)

Cómo funciona: el dispositivo registra una suscripción y sube *qué* quiere que le recuerden y *a qué minuto local* a la Edge Function `push`; `pg_cron` la invoca **cada minuto** desde la propia base y ella envía lo que toca. No hay servidor propio ni cron externo: todo corre dentro de Supabase, en el plan gratis. Cada dispositivo guarda un id aleatorio y solo ve sus propios avisos.

En iPhone requieren la app **añadida a la pantalla de inicio** (iOS 16.4+); en una pestaña de Safari ni siquiera se puede pedir permiso.

### Puesta en marcha

1. **Generar las claves VAPID** (una sola vez; si ya existe `.vapid-keys.json`, reutilízalas):

   ```bash
   node -e "const w=require('web-push');console.log(JSON.stringify(w.generateVAPIDKeys(),null,2))"
   ```

   (`web-push` ya no es dependencia del proyecto; ejecútalo con `npx -p web-push node -e ...` o instala el paquete de forma global.)

2. **Secretos de la función** en Supabase → Edge Functions → Secrets (o con la CLI):

   ```bash
   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu@correo.com --project-ref TU_REF
   ```

3. **Desplegar la función**:

   ```bash
   npx supabase login
   npx supabase functions deploy push --project-ref TU_REF
   ```

   `supabase/config.toml` ya trae `verify_jwt = false` para `push`: la función valida por su cuenta la anon key (app) y la service role key (cron).

4. **Programar el envío**: ya está en `supabase/migrations/20261102000000_push_cron.sql`; se aplica con `npx supabase db push` junto con el resto. Activa `pg_cron` y `pg_net` y crea el job `day2day-push-send`, que llama a `/send` cada minuto con la clave pública del proyecto (no hace falta secreto: `/send` es idempotente). Para verlo correr: `select * from cron.job_run_details order by start_time desc limit 20;`

5. **Cliente**: `VITE_VAPID_PUBLIC_KEY` en `.env.local` y en Vercel, con la misma clave pública.

### Rutas de la función `push`

| Ruta | Qué hace |
|---|---|
| `POST /functions/v1/push/subscribe` | Registra el dispositivo y reemplaza sus recordatorios |
| `GET /functions/v1/push/status?deviceId=` | Dice si el servidor conoce ese dispositivo |
| `POST /functions/v1/push/test` | Envía un push de prueba a ese dispositivo |
| `POST /functions/v1/push/send` | Envía todo lo que toque ahora; solo con la service role key (pg_cron) |

`/send` es idempotente: cada recordatorio anota la fecha local en que se envió, así que repetir la llamada no duplica avisos, y uno que se haya pasado de hora se recupera en la siguiente pasada mientras siga dentro de los 12 minutos de margen.

## Desarrollo

Requiere Node 22 o superior.

```bash
npm install
npm run dev        # Vite en http://localhost:5173
npm run typecheck  # tsc
```

No hay backend propio: la app habla directo con Supabase (tablas y la Edge Function `push`). Para abrir la app en el celular dentro de la misma red: `npx vite --host`. Para probar la función en local: `npx supabase functions serve push --env-file .env.functions`.

## Build de producción (PWA)

```bash
npm run build
```

Genera `dist/`: `index.html` (ya con manifest, meta de iOS y registro del service worker), los assets con hash en `dist/assets/` y lo que hay en `public/` (manifest, `sw.js`, íconos).

## Despliegue en Vercel

Vercel solo sirve archivos estáticos; no hay funciones ni cron ahí. El repo incluye `vercel.json`, así que Vercel toma la configuración sola. Si necesitas ponerla a mano:

- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### Instalar en el iPhone

1. Abre la URL de Vercel en **Safari** (tiene que ser Safari, no Chrome).
2. Botón Compartir → **Añadir a pantalla de inicio**.
3. Se instala con su ícono y se abre en pantalla completa, sin barra del navegador.

Los datos quedan guardados en el dispositivo y siguen ahí al cerrar la app.

## Estructura

```
index.html                Shell de la PWA (meta de iOS, manifest, service worker)
vite.config.ts            Alias react-native → react-native-web, extensiones .web.*
App.tsx                   Raíz: gestos, providers y color del tema en el navegador
src/
  main.tsx                Monta React y registra las fuentes (Plus Jakarta Sans, Ionicons)
  screens/
    RootScreen            Pestañas y estado compartido
    ScheduleScreen        Cronograma del día
    TodosScreen           Lista de pendientes
    ReportScreen          Reporte de constancia y rachas
    LoginScreen           Pantalla de entrada (nombre + contraseña)
    SettingsScreen        Cuenta, temas, notificaciones, importar/exportar
  components/             WeekStrip, DayModeBar, TaskCard, TaskEditor, TimePicker,
                          IconPicker, ScopeDialog, TodoRow, TabBar, StreakCalendar,
                          ProgressRing, EmptyState
  storage/                Persistencia local, hook de estado, estadísticas,
                          importación JSON, modos de día (dayModes.ts) y
                          sincronización con Supabase (cloud.ts, syncQueue.ts,
                          useCloudSync.ts)
  auth/                   Sesión de Supabase (correo + contraseña)
  lib/supabase.ts         Cliente de Supabase del navegador
  theme/                  Tokens, paletas de color, categorías, catálogo de iconos
                          y el componente Ionicons (fuente + glyph map)
  types/                  Modelo de datos
  utils/                  Fechas, sonido, vibración y notificaciones
supabase/functions/push/  Edge Function de Web Push (subscribe, status, test, send)
supabase/migrations/      Esquema SQL (tablas, RLS) y cron de envío; `supabase db push`
supabase/config.toml      Config de la CLI (verify_jwt de la función)
public/                   manifest.json, sw.js e íconos
```

## Notas de diseño

- La base de datos es un espejo del modelo local, no una normalización: `completedDays`, `overrides`, etc. van como arrays y `jsonb`. Así una fila es una tarea completa y el sync es un *upsert* por fila, sin transacciones multi-tabla desde el cliente.
- Los tiempos de edición (`updated_at`) son milisegundos del reloj del cliente, porque es lo que decide quién gana en un conflicto; el cursor del *pull* usa `synced_at`, del reloj del servidor, para que un teléfono con la hora atrasada no esconda filas a los demás.
- Los días se guardan como `YYYY-MM-DD` en hora local, no como timestamps, para que una actividad no se corra de día por zona horaria.
- Una rutina se guarda una sola vez y se proyecta sobre cada día que le toca. Completarla queda registrado por día, así que marcarla hoy no la marca mañana.
- Editar un solo día de una rutina guarda un *override* para esa fecha, en vez de duplicar la actividad; el resto de la serie no se toca.
- El sonido se sintetiza con la Web Audio API en lugar de cargar un archivo, para no sumar peso al bundle.
- Un festivo no programa nada, así que para el reporte es un día sin actividades: ni suma un día perfecto ni corta la racha, igual que un domingo vacío.
- El servidor de avisos solo entiende días de la semana, no "finca" o "festivo". El cliente resuelve las marcas de los próximos 90 días: las rutinas de finca suben como fechas sueltas y el resto sube con esos días en su lista de excepciones. Se recalcula en cada sincronización.
- El reporte solo puntúa días ya transcurridos: contar el plan de mañana como incumplido haría que todo informe se viera mal. Hoy sí cuenta, porque el avance parcial es informativo, pero no rompe la racha hasta que termina.
- Cada tema define su propia rampa de neutros en vez de compartir una gris, que es lo que hace que cambie el fondo y no solo el acento. Los contrastes de los seis temas, en claro y oscuro, cumplen WCAG AA.
