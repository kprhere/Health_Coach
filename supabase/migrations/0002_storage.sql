-- 0002_storage.sql
-- Private 'uploads' bucket. Every object lives under <user id>/..., and every
-- policy pins the first folder to the caller. Guarded so it can run where the
-- storage schema is a test stub or absent.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not present; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('uploads', 'uploads', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
  on conflict (id) do update set
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

  drop policy if exists uploads_select on storage.objects;
  drop policy if exists uploads_insert on storage.objects;
  drop policy if exists uploads_update on storage.objects;
  drop policy if exists uploads_delete on storage.objects;

  create policy uploads_select on storage.objects for select to authenticated
    using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
  create policy uploads_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
  create policy uploads_update on storage.objects for update to authenticated
    using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
  create policy uploads_delete on storage.objects for delete to authenticated
    using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
end $$;
