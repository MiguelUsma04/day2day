# day2day

App de cronograma diario para móvil. Arma tu rutina — desde que te levantas hasta que te duermes — y márcala a medida que avanzas.

Hecha con Expo (React Native) y desplegable como PWA instalable en el iPhone.

## Qué hace

- **Cronograma por día** con línea de tiempo, hora de inicio y duración.
- **Rutinas que se repiten**: cada día, de lunes a viernes, o días específicos. Se definen una vez y aparecen solas en cada día que corresponda.
- **Progreso diario**: cuántas actividades llevas completadas.
- **Marcador "Ahora"**: resalta la actividad que está ocurriendo en este momento.
- **Categorías** (trabajo, personal, salud, estudio, otro) con color e ícono.
- **Modo claro y oscuro** automático, según el sistema.
- **Todo local**: los datos se guardan en el dispositivo. No hay cuentas ni servidor.

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
App.tsx                   Raíz: carga de fuentes y providers
src/
  screens/ScheduleScreen  Pantalla principal
  components/             WeekStrip, TaskCard, TaskEditor, TimePicker, ProgressRing, EmptyState
  storage/                Persistencia local (AsyncStorage) y hook de estado
  theme/                  Tokens de diseño, tema claro/oscuro, categorías
  types/                  Modelo de datos
  utils/date.ts           Manejo de fechas y formato
scripts/build-pwa.js      Post-proceso del build web (manifest, service worker, meta de iOS)
public/                   manifest.json, sw.js e íconos
```

## Notas de diseño

- Los días se guardan como `YYYY-MM-DD` en hora local, no como timestamps, para que una actividad no se corra de día por zona horaria.
- Una rutina se guarda una sola vez y se proyecta sobre cada día que le toca. Completarla queda registrado por día, así que marcarla hoy no la marca mañana.
