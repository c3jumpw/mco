-- Vaultleaf device sync.
-- Stores only data that was encrypted in the browser. The server never sees passwords, passcodes or vault keys.
-- Access is by sync code: the browser derives a vault id and an access token from it and sends both.
-- Only the token's SHA-256 hash is stored. Tables have RLS on with no policies, so they're reachable only
-- through the security-definer functions below. Every object is prefixed vaultleaf_.

create table if not exists public.vaultleaf_vaults (
  id          text primary key check (id ~ '^[a-f0-9]{32}$'),
  token_hash  text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  header      jsonb not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.vaultleaf_blobs (
  vault_id  text not null references public.vaultleaf_vaults(id) on delete cascade,
  name      text not null check (name ~ '^(b|f)-[a-z0-9]{6,40}$'),
  part      int  not null check (part between 0 and 199),
  data      text not null check (length(data) <= 1100000),
  primary key (vault_id, name, part)
);

alter table public.vaultleaf_vaults enable row level security;
alter table public.vaultleaf_blobs  enable row level security;
revoke all on public.vaultleaf_vaults from anon, authenticated;
revoke all on public.vaultleaf_blobs  from anon, authenticated;

comment on table public.vaultleaf_vaults is 'Vaultleaf: one encrypted vault per sync code. Browser-encrypted data only. Access via vaultleaf_* functions.';
comment on table public.vaultleaf_blobs  is 'Vaultleaf: encrypted vault bodies (b-<rev>) and file attachments (f-<id>), split into parts of up to ~1 MB.';

-- token check
create or replace function public.vaultleaf_ok(p_id text, p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vaultleaf_vaults v
    where v.id = p_id
      and v.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  );
$$;
revoke all on function public.vaultleaf_ok(text, text) from public, anon, authenticated;

-- header, meta and the list of stored files (id -> part count); null when the code is wrong or the vault is gone
create or replace function public.vaultleaf_head(p_id text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.vaultleaf_ok(p_id, p_token) then return null; end if;
  select jsonb_build_object(
    'header', v.header, 'meta', v.meta, 'updated_at', v.updated_at,
    'files', coalesce((select jsonb_object_agg(substr(b.name, 3), b.parts)
                       from (select name, count(*) as parts from public.vaultleaf_blobs
                             where vault_id = p_id and name like 'f-%' group by name) b), '{}'::jsonb))
  into r from public.vaultleaf_vaults v where v.id = p_id;
  return r;
end $$;

-- read a blob (all its parts joined)
create or replace function public.vaultleaf_blob_get(p_id text, p_token text, p_name text)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.vaultleaf_ok(p_id, p_token) then return null; end if;
  return (select string_agg(data, '' order by part) from public.vaultleaf_blobs where vault_id = p_id and name = p_name);
end $$;

-- write one part of a blob
create or replace function public.vaultleaf_blob_put(p_id text, p_token text, p_name text, p_part int, p_data text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare used bigint;
begin
  if not public.vaultleaf_ok(p_id, p_token) then return false; end if;
  select coalesce(sum(length(data)), 0) into used from public.vaultleaf_blobs
    where vault_id = p_id and not (name = p_name and part = p_part);
  if used + length(p_data) > 60000000 then raise exception 'vaultleaf: storage limit reached' using errcode = 'P0001'; end if;
  insert into public.vaultleaf_blobs (vault_id, name, part, data) values (p_id, p_name, p_part, p_data)
    on conflict (vault_id, name, part) do update set data = excluded.data;
  return true;
end $$;

-- remove a file's parts
create or replace function public.vaultleaf_blob_delete(p_id text, p_token text, p_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.vaultleaf_ok(p_id, p_token) then return false; end if;
  delete from public.vaultleaf_blobs where vault_id = p_id and name = p_name;
  return true;
end $$;

-- Create the vault (first push) or move it to a new revision.
-- p_base_rev must match the stored revision, otherwise the caller gets {conflict, meta} and merges first.
create or replace function public.vaultleaf_commit(p_id text, p_token text, p_header jsonb, p_meta jsonb, p_base_rev text, p_create boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cur jsonb; new_rev text := p_meta->>'rev'; recent int;
begin
  if new_rev is null or new_rev !~ '^[a-z0-9]{6,40}$' then raise exception 'vaultleaf: bad revision' using errcode = 'P0001'; end if;
  if length(p_header::text) > 20000 or length(p_meta::text) > 20000 then raise exception 'vaultleaf: header too large' using errcode = 'P0001'; end if;
  if p_create and not exists (select 1 from public.vaultleaf_vaults where id = p_id) then
    select count(*) into recent from public.vaultleaf_vaults where created_at > now() - interval '1 hour';
    if recent >= 30 then return jsonb_build_object('error', 'busy'); end if;
    insert into public.vaultleaf_vaults (id, token_hash, header, meta)
      values (p_id, encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex'), p_header, p_meta);
    return jsonb_build_object('ok', true, 'created', true);
  end if;
  if not public.vaultleaf_ok(p_id, p_token) then return jsonb_build_object('error', 'not_found'); end if;
  select meta into cur from public.vaultleaf_vaults where id = p_id for update;
  if p_base_rev is distinct from (cur->>'rev') and (cur->>'rev') is not null then
    return jsonb_build_object('conflict', true, 'meta', cur);
  end if;
  update public.vaultleaf_vaults set header = p_header, meta = p_meta, updated_at = now() where id = p_id;
  delete from public.vaultleaf_blobs where vault_id = p_id and name like 'b-%' and name <> 'b-' || new_rev;
  return jsonb_build_object('ok', true);
end $$;

-- delete the synced copy (turn sync off, or get a new sync code)
create or replace function public.vaultleaf_drop(p_id text, p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.vaultleaf_ok(p_id, p_token) then return false; end if;
  delete from public.vaultleaf_vaults where id = p_id;
  return true;
end $$;

revoke all on function public.vaultleaf_head(text, text)                                   from public;
revoke all on function public.vaultleaf_blob_get(text, text, text)                         from public;
revoke all on function public.vaultleaf_blob_put(text, text, text, int, text)              from public;
revoke all on function public.vaultleaf_blob_delete(text, text, text)                      from public;
revoke all on function public.vaultleaf_commit(text, text, jsonb, jsonb, text, boolean)    from public;
revoke all on function public.vaultleaf_drop(text, text)                                   from public;
grant execute on function public.vaultleaf_head(text, text)                                to anon, authenticated;
grant execute on function public.vaultleaf_blob_get(text, text, text)                      to anon, authenticated;
grant execute on function public.vaultleaf_blob_put(text, text, text, int, text)           to anon, authenticated;
grant execute on function public.vaultleaf_blob_delete(text, text, text)                   to anon, authenticated;
grant execute on function public.vaultleaf_commit(text, text, jsonb, jsonb, text, boolean) to anon, authenticated;
grant execute on function public.vaultleaf_drop(text, text)                                to anon, authenticated;
