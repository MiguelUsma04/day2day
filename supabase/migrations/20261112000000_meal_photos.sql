-- Fotos de comidas en Supabase Storage. La foto se guarda reducida (640 px,
-- WebP) en el bucket privado `meal-photos`, bajo `{user_id}/{meal_id}.webp`.
-- La fila de meals apunta a esa ruta en photo_path; sin foto queda null.

alter table public.meals add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 512000, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- La primera carpeta de la ruta es el user_id: la pareja lee via can_read,
-- solo el dueño escribe o borra.
drop policy if exists "read meal photos" on storage.objects;
create policy "read meal photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meal-photos'
    and public.can_read(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "insert meal photos" on storage.objects;
create policy "insert meal photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "update meal photos" on storage.objects;
create policy "update meal photos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "delete meal photos" on storage.objects;
create policy "delete meal photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
