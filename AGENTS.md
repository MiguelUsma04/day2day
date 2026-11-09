# day2day

PWA web pura: React + react-native-web + Vite. No hay build nativo ni Expo; no consultes docs de Expo.

- `npm run dev` levanta Vite. No hay backend propio: Supabase (tablas + Edge Function `push` en `supabase/functions/push`) hace todo.
- Datos: local-first en AsyncStorage, sincronizados con Supabase cuando hay sesión (ver README).
- Solo existen las cuentas listadas en `VITE_ACCOUNTS`; el registro está cerrado.
- Pestaña Comida: la Edge Function `nutrition` (`supabase/functions/nutrition`) analiza fotos o texto con Claude; las kcal y macros nunca salen del modelo, siempre de la tabla `foods` (TCAC/USDA).
