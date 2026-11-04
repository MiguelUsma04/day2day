-- day2day · orden manual de los pendientes
--
-- Posición de cada pendiente dentro de su día, elegida arrastrando. Es un
-- float: al soltar entre dos vecinos toma el punto medio y solo cambia esa
-- fila. Null en filas anteriores a esta columna: el cliente usa created_at.
alter table public.todos
  add column if not exists sort_order double precision;
