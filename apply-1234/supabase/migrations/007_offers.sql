-- Offer letters. The hiring team prepares an offer for a candidate; the hiring-offer function sends it,
-- records every view and the signature (with time, IP address and browser), and builds the signed PDF.
-- Once an offer is sent, only that function can change it, so the signed record can't be edited.

create table if not exists public.hiring_offers (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.hiring_applications(id) on delete cascade,
  job_id          uuid not null references public.hiring_jobs(id) on delete cascade,
  status          text not null default 'draft'
                  check (status in ('draft', 'sent', 'viewed', 'signed', 'declined', 'withdrawn')),
  fields          jsonb not null default '{}'::jsonb,   -- company, position, pay, start date, manager…
  letter          text not null default '',             -- Markdown with {placeholders}
  terms           text not null default '',             -- terms and conditions, Markdown
  attachments     jsonb not null default '[]'::jsonb,   -- [{path, name, size, type}] in hiring-team
  token           text unique,                          -- secret in the candidate's link, set on send
  final_letter    text,                                 -- what was sent, placeholders filled
  final_terms     text,
  doc_hash        text,                                 -- SHA-256 of the sent document
  expires_at      timestamptz,
  sent_at         timestamptz,
  sent_by         text,
  sent_meta       jsonb,                                -- {ip, ua}
  viewed_at       timestamptz,
  views           int not null default 0,
  signed_at       timestamptz,
  signer_name     text,
  signature       jsonb,                                -- {kind: 'drawn'|'typed', path?, text?}
  signer_meta     jsonb,                                -- {ip, ua, tz}
  declined_at     timestamptz,
  decline_reason  text,
  withdrawn_at    timestamptz,
  pdf_path        text,                                 -- signed PDF with its signature certificate
  events          jsonb not null default '[]'::jsonb,   -- audit trail [{at, type, by?, ip?, ua?, note?}]
  created_by      text not null default lower(coalesce(auth.jwt()->>'email', '')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists hiring_offers_application on public.hiring_offers(application_id);

drop trigger if exists hiring_offers_touch on public.hiring_offers;
create trigger hiring_offers_touch before update on public.hiring_offers
  for each row execute function public.hiring_touch();

-- People can edit drafts. Sending, viewing, signing and withdrawing happen only in the hiring-offer function.
create or replace function public.hiring_offers_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.token is not null or new.final_letter is not null or new.sent_at is not null
       or new.signed_at is not null or new.pdf_path is not null or new.events <> '[]'::jsonb then
      raise exception 'New offers start as drafts.';
    end if;
    if not exists (select 1 from public.hiring_applications a where a.id = new.application_id and a.job_id = new.job_id) then
      raise exception 'That candidate didn''t apply to this job.';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Only draft offers can be deleted.'; end if;
    return old;
  end if;
  if old.status <> 'draft' then
    raise exception 'This offer has been sent and can''t be changed. Withdraw it and prepare a new one.';
  end if;
  if new.status <> 'draft' or new.application_id <> old.application_id or new.job_id <> old.job_id
     or new.token is distinct from old.token or new.final_letter is distinct from old.final_letter
     or new.final_terms is distinct from old.final_terms or new.doc_hash is distinct from old.doc_hash
     or new.sent_at is distinct from old.sent_at or new.sent_by is distinct from old.sent_by
     or new.signed_at is distinct from old.signed_at or new.signature is distinct from old.signature
     or new.signer_name is distinct from old.signer_name or new.signer_meta is distinct from old.signer_meta
     or new.pdf_path is distinct from old.pdf_path or new.events is distinct from old.events
     or new.viewed_at is distinct from old.viewed_at or new.views <> old.views or new.created_by <> old.created_by then
    raise exception 'Use Send to send an offer.';
  end if;
  return new;
end $$;
drop trigger if exists hiring_offers_guard on public.hiring_offers;
create trigger hiring_offers_guard before insert or update or delete on public.hiring_offers
  for each row execute function public.hiring_offers_guard();

alter table public.hiring_offers enable row level security;
drop policy if exists "hiring_offers admin all" on public.hiring_offers;
create policy "hiring_offers admin all" on public.hiring_offers for all to authenticated
  using ((select public.hiring_is_admin())) with check ((select public.hiring_is_admin()));
drop policy if exists "hiring_offers editor all" on public.hiring_offers;
create policy "hiring_offers editor all" on public.hiring_offers for all to authenticated
  using (public.hiring_job_editor(job_id)) with check (public.hiring_job_editor(job_id));

-- Interview recordings and transcripts on a candidate's profile:
-- [{id, kind: 'recording'|'transcript'|'file', label, url?, text?, path?, name?, size?, added_at, added_by}]
alter table public.hiring_applications add column if not exists interview_records jsonb not null default '[]'::jsonb;

-- Files the hiring team adds: offer attachments, signed offers, signatures, interview transcripts.
-- Path: <job id>/<application id>/<…>. Private; links are short-lived.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hiring-team', 'hiring-team', false, 26214400, array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/plain', 'text/csv', 'text/vtt',
  'application/x-subrip', 'image/png', 'image/jpeg', 'image/webp', 'application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hiring team files read" on storage.objects;
create policy "hiring team files read" on storage.objects for select to authenticated
  using (bucket_id = 'hiring-team' and ((select public.hiring_is_admin()) or public.hiring_job_editor(public.hiring_path_job(name))));
drop policy if exists "hiring team files add" on storage.objects;
create policy "hiring team files add" on storage.objects for insert to authenticated
  with check (bucket_id = 'hiring-team' and ((select public.hiring_is_admin()) or public.hiring_job_editor(public.hiring_path_job(name))));
drop policy if exists "hiring team files remove" on storage.objects;
create policy "hiring team files remove" on storage.objects for delete to authenticated
  using (bucket_id = 'hiring-team' and position('/offers/' in name) = 0
         and ((select public.hiring_is_admin()) or public.hiring_job_editor(public.hiring_path_job(name))));
