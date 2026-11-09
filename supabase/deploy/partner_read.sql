-- day2day · lectura compartida con la pareja en tasks, todos y day_modes
--
-- NO es una migración: no va en supabase/migrations/. Se aplica a mano, en el
-- SQL Editor, después de desplegar el cliente nuevo.
--
-- CUÁNDO: solo DESPUÉS de que LOS DOS teléfonos hayan abierto la versión
-- nueva. Compruébalo en cada app instalada: la pestaña "Comida" tiene que
-- verse en ambas. Si una todavía no la muestra, ciérrala del todo y vuelve a
-- abrirla (o recárgala) y espera a que aparezca antes de correr este archivo.
--
-- POR QUÉ: una PWA instalada que se retoma desde segundo plano sin recargar
-- sigue ejecutando el bundle anterior aunque el despliegue ya esté hecho. Ese
-- cliente viejo hace el pull sin filtrar por user_id y se apoyaba en que el
-- RLS solo devolvía filas propias; con estas políticas recibiría también las
-- filas de la pareja, las mezclaría en su almacenamiento local y luego
-- intentaría subirlas como propias, con lo que fallaría cada flush.
--
-- Requiere haber aplicado antes 20261110000000_nutrition.sql (public.can_read).
-- Reemplaza las políticas "for all" por una por operación: leer lo propio y
-- lo de la pareja, escribir solo lo propio.

begin;

-- ----------------------------------------------------------------- tasks
drop policy if exists "own tasks" on public.tasks;
drop policy if exists "read tasks" on public.tasks;
drop policy if exists "insert tasks" on public.tasks;
drop policy if exists "update tasks" on public.tasks;
drop policy if exists "delete tasks" on public.tasks;

create policy "read tasks" on public.tasks
  for select to authenticated using (public.can_read(user_id));
create policy "insert tasks" on public.tasks
  for insert to authenticated with check (user_id = auth.uid());
create policy "update tasks" on public.tasks
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete tasks" on public.tasks
  for delete to authenticated using (user_id = auth.uid());

-- ----------------------------------------------------------------- todos
-- Los pendientes se pueden crear también para la pareja: el insert acepta
-- user_id propio o de la pareja.
drop policy if exists "own todos" on public.todos;
drop policy if exists "read todos" on public.todos;
drop policy if exists "insert todos" on public.todos;
drop policy if exists "update todos" on public.todos;
drop policy if exists "delete todos" on public.todos;

create policy "read todos" on public.todos
  for select to authenticated using (public.can_read(user_id));
create policy "insert todos" on public.todos
  for insert to authenticated with check (public.can_read(user_id));
create policy "update todos" on public.todos
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete todos" on public.todos
  for delete to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------ day_modes
drop policy if exists "own day_modes" on public.day_modes;
drop policy if exists "read day_modes" on public.day_modes;
drop policy if exists "insert day_modes" on public.day_modes;
drop policy if exists "update day_modes" on public.day_modes;
drop policy if exists "delete day_modes" on public.day_modes;

create policy "read day_modes" on public.day_modes
  for select to authenticated using (public.can_read(user_id));
create policy "insert day_modes" on public.day_modes
  for insert to authenticated with check (user_id = auth.uid());
create policy "update day_modes" on public.day_modes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete day_modes" on public.day_modes
  for delete to authenticated using (user_id = auth.uid());

commit;
