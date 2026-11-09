-- Mentors, leads and admins can open attachments on notebook pages that were shared with them.
-- (A second permissive policy; it adds to ramp_files_read.)
create policy ramp_files_read_shared_notes on storage.objects for select to authenticated using (
  bucket_id = 'ramp-files'
  and (storage.foldername(name))[2] = 'notes'
  and (select public.ramp_my_rank()) <= 4
  and exists (
    select 1 from public.ramp_pages p
    where p.shared and p.member_id::text = (storage.foldername(name))[1]
      and p.files @> jsonb_build_array(jsonb_build_object('path', name))
      and public.ramp_can_see(p.member_id)));
