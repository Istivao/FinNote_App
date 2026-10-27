-- Imagem das zonas de treino de cada usuario (consultada nos treinos de Corrida).
-- Bucket privado; cada usuario so le e grava a propria pasta: <user_id>/zones.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'zone-images',
  'zone-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy zone_images_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'zone-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy zone_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'zone-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy zone_images_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'zone-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'zone-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy zone_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'zone-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
