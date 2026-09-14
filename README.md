# day2day

App de cronograma diario para móvil. Arma tu rutina — desde que te levantas hasta que te duermes — y márcala a medida que avanzas.

Hecha con Expo (React Native) y desplegable como PWA instalable en el iPhone.

## Qué hace

- **Cronograma por día** con línea de tiempo, hora exacta al minuto y duración.
- **Rutinas que se repiten**: cada día, de lunes a viernes, o días específicos. Se definen una vez y aparecen solas en cada día que corresponda. Al editarlas se pregunta si el cambio va a ese día o a toda la serie.
- **Deslizar para actuar**: a la derecha completa (con sonido), a la izquierda elimina.
- **Lista de pendientes** aparte del cronograma, para lo que no tiene hora fija.
- **Recordatorios** en el celular, con aviso configurable por actividad.
- **Iconos** por actividad, elegidos de un catálogo.
- **Importar / exportar** el cronograma completo como JSON.
- **Seis temas de color** (azul, rosa, lila, ámbar, verde, coral) y modo claro/oscuro/automático.
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
| `reminder` | no | Minutos de antelación del aviso (`0` = a la hora). Sin él, no avisa |
| `notes` | no | Texto |
| `date` | no | `"YYYY-MM-DD"`, solo para actividades sin repetición. Por defecto, hoy |

Lo que no se pueda leer se avisa al importar, sin bloquear el resto.

### Para pedírselo a un asistente

> Genera un JSON con mi cronograma diario siguiendo este formato: una lista en la propiedad `tasks`, donde cada entrada tiene `title`, `time` en formato `"HH:MM"` de 24 horas, `duration` en minutos, `category` (`work`, `personal`, `health`, `study` u `other`), `icon` (nombre de Ionicons), `repeat` (`none`, `daily`, `weekdays` o `custom`), y `days` solo si es `custom`. Añade `reminder` con los minutos de antelación donde quiera un aviso.

## Notificaciones

Los recordatorios usan la API de notificaciones del navegador. En iPhone requieren que la app esté **añadida a la pantalla de inicio** (iOS 16.4 o superior); en una pestaña normal de Safari no se pueden activar.

Se programan desde la propia app, así que llegan mientras la app haya estado abierta durante el día. Para avisos garantizados con la app cerrada durante horas haría falta un servidor de push, que esta versión no incluye.

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
    SettingsScreen        Temas, notificaciones, importar/exportar
  components/             WeekStrip, TaskCard, TaskEditor, TimePicker, IconPicker,
                          ScopeDialog, TodoRow, TabBar, ProgressRing, EmptyState
  storage/                Persistencia local, hook de estado e importación JSON
  theme/                  Tokens, paletas de color, categorías, catálogo de iconos
  types/                  Modelo de datos
  utils/                  Fechas, sonido y notificaciones
scripts/build-pwa.js      Post-proceso del build web (manifest, service worker, meta de iOS)
public/                   manifest.json, sw.js e íconos
```

## Notas de diseño

- Los días se guardan como `YYYY-MM-DD` en hora local, no como timestamps, para que una actividad no se corra de día por zona horaria.
- Una rutina se guarda una sola vez y se proyecta sobre cada día que le toca. Completarla queda registrado por día, así que marcarla hoy no la marca mañana.
- Editar un solo día de una rutina guarda un *override* para esa fecha, en vez de duplicar la actividad; el resto de la serie no se toca.
- El sonido se sintetiza con la Web Audio API en lugar de cargar un archivo, para no sumar peso al bundle.
