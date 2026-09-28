-- Bucket privado para imágenes, PDFs y videos subidos desde el editor.
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

-- Cada usuario solo accede a su carpeta: files/<user_id>/...
drop policy if exists "own files read" on storage.objects;
create policy "own files read" on storage.objects for select
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own files write" on storage.objects;
create policy "own files write" on storage.objects for insert
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own files delete" on storage.objects;
create policy "own files delete" on storage.objects for delete
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
