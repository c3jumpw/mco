-- Conversations with candidates. A candidate writes from their private offer link; the hiring team replies
-- in apply1234. Both go through the hiring-offer function, which saves the message and emails the other
-- side. Everyone on the team who can open the candidate can read the conversation and mark it read.

create table if not exists public.hiring_chat (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.hiring_applications(id) on delete cascade,
  job_id          uuid not null references public.hiring_jobs(id) on delete cascade,
  offer_id        uuid references public.hiring_offers(id) on delete set null,
  sender          text not null check (sender in ('candidate', 'team')),
  author_email    text not null default '',
  author_name     text not null default '',
  body            text not null check (char_length(body) between 1 and 5000),
  meta            jsonb not null default '{}'::jsonb,     -- {ip, ua}
  emailed         jsonb not null default '[]'::jsonb,     -- who was told by email
  read_at         timestamptz,                            -- candidate messages: when the team read it
  read_by         text,
  created_at      timestamptz not null default now()
);
create index if not exists hiring_chat_application on public.hiring_chat(application_id, created_at);
create index if not exists hiring_chat_unread on public.hiring_chat(created_at) where sender = 'candidate' and read_at is null;

-- The team can only mark messages as read; sending happens in the hiring-offer function.
create or replace function public.hiring_chat_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if new.application_id <> old.application_id or new.job_id <> old.job_id or new.offer_id is distinct from old.offer_id
     or new.sender <> old.sender or new.author_email <> old.author_email or new.author_name <> old.author_name
     or new.body <> old.body or new.meta <> old.meta or new.emailed <> old.emailed or new.created_at <> old.created_at then
    raise exception 'Messages can''t be changed once sent.';
  end if;
  new.read_by := case when new.read_at is null then null else lower(coalesce(auth.jwt()->>'email', '')) end;
  return new;
end $$;
drop trigger if exists hiring_chat_guard on public.hiring_chat;
create trigger hiring_chat_guard before update on public.hiring_chat
  for each row execute function public.hiring_chat_guard();

alter table public.hiring_chat enable row level security;
drop policy if exists "hiring_chat team read" on public.hiring_chat;
create policy "hiring_chat team read" on public.hiring_chat for select to authenticated
  using ((select public.hiring_is_admin()) or public.hiring_job_editor(job_id));
drop policy if exists "hiring_chat team mark read" on public.hiring_chat;
create policy "hiring_chat team mark read" on public.hiring_chat for update to authenticated
  using ((select public.hiring_is_admin()) or public.hiring_job_editor(job_id))
  with check ((select public.hiring_is_admin()) or public.hiring_job_editor(job_id));
