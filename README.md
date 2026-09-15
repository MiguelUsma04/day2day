# day2day

App de cronograma diario para móvil. Arma tu rutina — desde que te levantas hasta que te duermes — y márcala a medida que avanzas.

Hecha con Expo (React Native) y desplegable como PWA instalable en el iPhone.

## Qué hace

- **Cronograma por día** con línea de tiempo, hora exacta al minuto y duración.
- **Rutinas que se repiten**: cada día, de lunes a viernes, o días específicos. Se definen una vez y aparecen solas en cada día que corresponda. Al editarlas se pregunta si el cambio va a ese día o a toda la serie.
- **Deslizar para actuar**: a la derecha completa (con sonido), a la izquierda elimina pidiendo confirmación.
- **Lista de pendientes** aparte del cronograma, para lo que no tiene hora fija.
- **Recordatorios** por Web Push, que llegan con la app cerrada; a la hora de inicio por defecto y configurables por actividad.
- **Iconos** por actividad, elegidos de un catálogo.
- **Importar / exportar** el cronograma completo como JSON, y **respaldo** que además incluye los pendientes y el historial de rachas.
- **Borrado en bloque** desde Ajustes: todas las actividades, los pendientes, solo el historial, o todo.
- **Reporte de constancia**: porcentaje cumplido, rachas, días perfectos, calendario de los últimos días y qué hábitos se te dan mejor o peor.
- **Seis temas de color** (azul, rosa, lila, ámbar, verde, coral) que tiñen toda la interfaz —fondo, tarjetas y bordes incluidos—, más modo claro/oscuro/automático.
- **Progreso diario** y marcador **"Ahora"** sobre la actividad en curso.
- **Todo local**: los datos se guardan en el dispositivo. No hay cuentas ni servidor.

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
| `notes` | no | Texto |
| `date` | no | `"YYYY-MM-DD"`, solo para actividades sin repetición. Por defecto, hoy |

Lo que no se pueda leer se avisa al importar, sin bloquear el resto.

### Para pedírselo a un asistente

> Genera un JSON con mi cronograma diario siguiendo este formato: una lista en la propiedad `tasks`, donde cada entrada tiene `title`, `time` en formato `"HH:MM"` de 24 horas, `duration` en minutos, `category` (`work`, `personal`, `health`, `study` u `other`), `icon` (nombre de Ionicons), `repeat` (`none`, `daily`, `weekdays` o `custom`), y `days` solo si es `custom`. Añade `reminder` con los minutos de antelación donde quiera un aviso.

## Notificaciones

Los avisos se envían por **Web Push desde el servidor**, así que llegan aunque la app esté cerrada. (Los temporizadores dentro de la app no sirven para esto: iOS los descarta al descargar la app de memoria, y `TimestampTrigger` —lo que permitiría al service worker dispararlos solo— no existe en Safari.)

Cómo funciona: el dispositivo registra una suscripción y sube *qué* quiere que le recuerden y *a qué minuto local*; un trabajo programado recorre los dispositivos y envía lo que toca. No hay cuentas: cada dispositivo guarda un id aleatorio y solo ve sus propios avisos.

En iPhone requieren la app **añadida a la pantalla de inicio** (iOS 16.4+); en una pestaña de Safari ni siquiera se puede pedir permiso.

### Puesta en marcha

1. **Generar las claves VAPID** (una sola vez):

   ```bash
   node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys(),null,2))"
   ```

2. **Variables de entorno en Vercel** (Settings → Environment Variables):

   | Variable | Valor |
   |---|---|
   | `VAPID_PUBLIC_KEY` | la clave pública |
   | `VAPID_PRIVATE_KEY` | la clave privada (nunca en el repo) |
   | `VAPID_SUBJECT` | `mailto:tu@correo.com` |
   | `PUSH_CRON_SECRET` | una cadena larga al azar, para que solo tu disparador pueda invocar el envío |
   | `EXPO_PUBLIC_VAPID_PUBLIC_KEY` | la misma clave pública (la usa el cliente) |
   | `BLOB_READ_WRITE_TOKEN` | lo añade Vercel al crear el Blob store |

3. **Crear un Blob store**: en Vercel, Storage → Create → Blob. Guarda las suscripciones; no hace falta base de datos.

4. **Programar el disparador.** El cron de Vercel en plan Hobby corre *una vez al día con ±59 min de margen*, inservible para avisar a una hora concreta, así que queda solo como barrido de reconciliación. Para la precisión al minuto usa un disparador externo gratuito, por ejemplo [cron-job.org](https://cron-job.org):

   - URL: `https://TU-APP.vercel.app/api/push/send?key=EL_PUSH_CRON_SECRET`
   - Intervalo: cada 5 minutos (el margen de tolerancia del servidor es de 12 min, así que ningún aviso se pierde)

### Endpoints

| Ruta | Qué hace |
|---|---|
| `POST /api/push/subscribe` | Registra el dispositivo y reemplaza sus recordatorios |
| `POST /api/push/test` | Envía un push de prueba a ese dispositivo |
| `GET /api/push/send` | Envía todo lo que toque ahora; lo invoca el disparador |

`/api/push/send` es idempotente: cada recordatorio anota la fecha local en que se envió, así que repetir la llamada no duplica avisos, y uno que se haya pasado de hora se recupera en la siguiente pasada mientras siga dentro de los 12 minutos de margen.

## Desarrollo

Requiere Node 22.13 o superior.

```bash
npm install
npm start          # abre Expo; escanea el QR con la cámara del iPhone (app Expo Go)
npm run web        # abre en el navegador
```

Para probar en el celular con Expo Go, el teléfono y el computador deben estar en la misma red WiFi. Si no conecta, usa `npx expo start --tunnel`.

## Build de producción (PWA)

```bash
npm run build:web
```

Genera `dist/`: el bundle de Expo más el manifest, el service worker y los íconos que hacen la app instalable.

## Despliegue en Vercel

El repo incluye `vercel.json`, así que Vercel toma la configuración sola. Si necesitas ponerla a mano:

- **Framework Preset**: Other
- **Build Command**: `npm run build:web`
- **Output Directory**: `dist`

### Instalar en el iPhone

1. Abre la URL de Vercel en **Safari** (tiene que ser Safari, no Chrome).
2. Botón Compartir → **Añadir a pantalla de inicio**.
3. Se instala con su ícono y se abre en pantalla completa, sin barra del navegador.

Los datos quedan guardados en el dispositivo y siguen ahí al cerrar la app.

## Estructura

```
App.tsx                   Raíz: fuentes, gestos y providers
src/
  screens/
    RootScreen            Pestañas y estado compartido
    ScheduleScreen        Cronograma del día
    TodosScreen           Lista de pendientes
    ReportScreen          Reporte de constancia y rachas
    SettingsScreen        Temas, notificaciones, importar/exportar
  components/             WeekStrip, TaskCard, TaskEditor, TimePicker, IconPicker,
                          ScopeDialog, TodoRow, TabBar, StreakCalendar, ProgressRing,
                          EmptyState
  storage/                Persistencia local, hook de estado, estadísticas
                          e importación JSON
  theme/                  Tokens, paletas de color, categorías, catálogo de iconos
  types/                  Modelo de datos
  utils/                  Fechas, sonido y notificaciones
api/push/                 Endpoints de Web Push (subscribe, send, test)
api/_lib/store.js         Suscripciones y recordatorios en Vercel Blob
scripts/build-pwa.js      Post-proceso del build web (manifest, service worker, meta de iOS)
public/                   manifest.json, sw.js e íconos
```

## Notas de diseño

- Los días se guardan como `YYYY-MM-DD` en hora local, no como timestamps, para que una actividad no se corra de día por zona horaria.
- Una rutina se guarda una sola vez y se proyecta sobre cada día que le toca. Completarla queda registrado por día, así que marcarla hoy no la marca mañana.
- Editar un solo día de una rutina guarda un *override* para esa fecha, en vez de duplicar la actividad; el resto de la serie no se toca.
- El sonido se sintetiza con la Web Audio API en lugar de cargar un archivo, para no sumar peso al bundle.
- El reporte solo puntúa días ya transcurridos: contar el plan de mañana como incumplido haría que todo informe se viera mal. Hoy sí cuenta, porque el avance parcial es informativo, pero no rompe la racha hasta que termina.
- Cada tema define su propia rampa de neutros en vez de compartir una gris, que es lo que hace que cambie el fondo y no solo el acento. Los contrastes de los seis temas, en claro y oscuro, cumplen WCAG AA.
