-- Activity steps: each question has a type (video, written, choice, voice, work, brief, critique, rank,
-- quiz, musthave). Candidates never receive the right answers; scoring happens here on submit.

-- ── Small helpers ──
create or replace function public.hiring_num(p jsonb, k text)
returns numeric language sql immutable as $$
  select case when jsonb_typeof(p->k) = 'number' then least(greatest((p->>k)::numeric, 0), 1e9) else null end;
$$;

-- Typing signals from written answers, keeping only known numeric fields.
create or replace function public.hiring_clean_sig(p jsonb)
returns jsonb language sql immutable as $$
  select case when jsonb_typeof(p) <> 'object' then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object(
    'typed', public.hiring_num(p, 'typed'), 'pasted', public.hiring_num(p, 'pasted'), 'pastes', public.hiring_num(p, 'pastes'),
    'ms', public.hiring_num(p, 'ms'), 'blurs', public.hiring_num(p, 'blurs'), 'blocked', public.hiring_num(p, 'blocked'))) end;
$$;

-- Questions as candidates see them: without right answers or expected must-have answers.
create or replace function public.hiring_public_steps(p jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(value - 'correct' - 'expected' order by n), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality as t(value, n);
$$;

-- Files a candidate uploaded for a step: only their own folder, only files that exist.
create or replace function public.hiring_step_files(p_files jsonb, p_prefix text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_out  jsonb := '[]'::jsonb;
  v_f    jsonb;
  v_meta jsonb;
begin
  if p_files is null or jsonb_typeof(p_files) <> 'array' then return v_out; end if;
  for v_f in select value from jsonb_array_elements(p_files) limit 5 loop
    if jsonb_typeof(v_f) <> 'object' or position(p_prefix in coalesce(v_f->>'path', '')) <> 1 then continue; end if;
    select o.metadata into v_meta from storage.objects o where o.bucket_id = 'hiring-uploads' and o.name = v_f->>'path';
    if not found then continue; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'path', v_f->>'path', 'name', left(coalesce(nullif(v_f->>'name', ''), 'file'), 200),
      'size', (v_meta->>'size')::bigint, 'type', v_meta->>'mimetype', 'note', left(coalesce(v_f->>'note', ''), 1500)));
  end loop;
  return v_out;
end $$;
revoke execute on function public.hiring_step_files(jsonb, text) from public, anon, authenticated;

-- The job a storage path belongs to (<job id>/...), or null.
create or replace function public.hiring_path_job(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return split_part(coalesce(p_name, ''), '/', 1)::uuid;
exception when others then
  return null;
end $$;

-- ── Candidates receive steps without answers ──
create or replace function public.hiring_resolve(p_path text, p_visitor text default '', p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  v_path     text := left(lower(trim(both '/' from coalesce(p_path,''))), 200);
  v_visitor  text := left(coalesce(p_visitor,''), 64);
  v_meta     jsonb := case when p_meta is not null and pg_column_size(p_meta) < 4000 then p_meta else '{}'::jsonb end;
  v_job      public.hiring_jobs;
  v_job_id   uuid;
  v_source   jsonb;
  v_deadline timestamptz;
  v_near     uuid;
  v_dist     int;
begin
  if not public.hiring_rate_ok(v_visitor) then
    return jsonb_build_object('found', false);
  end if;

  if v_path <> '' then
    select * into v_job from public.hiring_jobs
     where slug = v_path
       and coalesce(settings->>'base_link_off', 'false') <> 'true'
       and (status in ('published','closed') or (status = 'draft' and public.hiring_is_admin()));

    if v_job.id is null then
      select j.id, s.value into v_job_id, v_source
        from public.hiring_jobs j
        cross join lateral jsonb_array_elements(j.sources) s
       where v_path = j.slug || '-' || lower(s.value->>'code')
         and coalesce(s.value->>'active', 'true') <> 'false'
         and (j.status in ('published','closed') or (j.status = 'draft' and public.hiring_is_admin()))
       limit 1;
      if v_job_id is not null then
        select * into v_job from public.hiring_jobs where id = v_job_id;
        v_meta := v_meta || jsonb_build_object('source', v_source->>'code', 'source_label', v_source->>'label');
      end if;
    end if;
  end if;

  if v_job.id is not null then
    begin
      v_deadline := nullif(v_job.activity->>'deadline','')::timestamptz;
    exception when others then v_deadline := null;
    end;
    if v_job.status = 'closed' or (v_deadline is not null and v_deadline < now()) then
      insert into public.hiring_events(job_id, visitor_id, type, path, meta)
      values (v_job.id, v_visitor, 'arrival_closed', v_path, v_meta);
      return jsonb_build_object('found', true, 'closed', true, 'title', v_job.title);
    end if;
    insert into public.hiring_events(job_id, visitor_id, type, path, meta)
    values (v_job.id, v_visitor, 'arrival', v_path, v_meta);
    return jsonb_build_object(
      'found', true, 'closed', false,
      'job_id', v_job.id, 'title', v_job.title,
      'activity', v_job.activity - 'hidden_code',
      'questions', public.hiring_public_steps(v_job.questions),
      'source', case when v_source is null then null
                     else jsonb_build_object('code', v_source->>'code', 'label', v_source->>'label') end);
  end if;

  if v_path <> '' then
    select j.id, levenshtein(left(j.slug,255), left(v_path,255))
      into v_near, v_dist
      from public.hiring_jobs j
     where j.status = 'published' and j.slug is not null
     order by (position(j.slug in v_path) > 0 or position(v_path in j.slug) > 0) desc,
              levenshtein(left(j.slug,255), left(v_path,255)) asc
     limit 1;
    if v_near is not null then
      if not exists (select 1 from public.hiring_jobs j where j.id = v_near
                       and (position(j.slug in v_path) > 0 or position(v_path in j.slug) > 0))
         and v_dist > greatest(3, length(v_path) / 2) then
        v_near := null;
      end if;
    end if;
  end if;

  insert into public.hiring_events(job_id, visitor_id, type, path, meta)
  values (v_near, v_visitor,
          case when v_path = '' then 'root_visit' else 'wrong_url' end,
          v_path, v_meta || jsonb_build_object('distance', v_dist));
  return jsonb_build_object('found', false);
end $$;

-- ── Submissions: every step type checked and scored here ──
create or replace function public.hiring_submit(
  p_job uuid, p_visitor text, p_name text, p_email text,
  p_answers jsonb, p_consent boolean, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_job        public.hiring_jobs;
  v_visitor    text := left(coalesce(p_visitor,''), 64);
  v_name       text := left(trim(coalesce(p_name,'')), 200);
  v_email      text := left(lower(trim(coalesce(p_email,''))), 254);
  v_deadline   timestamptz;
  v_q          jsonb;
  v_a          jsonb;
  v_item       jsonb;
  v_clean      jsonb := '[]'::jsonb;
  v_type       text;
  v_opt        boolean;
  v_answered   boolean;
  v_url        text;
  v_walk       text;
  v_text       text;
  v_dur        numeric;
  v_min        int;
  v_max        int;
  v_prefix     text;
  v_files      jsonb;
  v_links      jsonb;
  v_l          jsonb;
  v_order      jsonb;
  v_n          int;
  v_choice     int;
  v_correct    int;
  v_sig        jsonb;
  v_need_tx    boolean;
  v_loom_n     int := 0;
  v_all_loom   boolean := true;
  v_video_n    int := 0;
  v_len_ok     boolean := true;
  v_len_known  boolean := true;
  v_tx_ok      boolean := true;
  v_must_n     int := 0;
  v_must_ok    boolean := true;
  v_quiz_n     int := 0;
  v_quiz_right int := 0;
  v_pasted     boolean := false;
  v_texts      text := '';
  v_code       text;
  v_code_ok    boolean;
  v_dup        boolean;
  v_id         uuid;
  c_url        constant text := '^https?://[^\s]+\.[^\s]+';
  c_loom       constant text := '^https?://(www\.)?loom\.com/(share|embed)/';
begin
  select * into v_job from public.hiring_jobs
   where id = p_job and (status = 'published' or (status = 'draft' and public.hiring_is_admin()));
  if v_job.id is null then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  begin
    v_deadline := nullif(v_job.activity->>'deadline','')::timestamptz;
  exception when others then v_deadline := null;
  end;
  if v_deadline is not null and v_deadline < now() then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'email'); end if;
  if coalesce(nullif(v_job.activity->>'consent_text',''), '') <> '' and not coalesce(p_consent, false) then
    return jsonb_build_object('ok', false, 'error', 'consent');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'answers');
  end if;

  begin
    v_min := round(nullif(v_job.activity->>'answer_min','')::numeric)::int;
    v_max := round(nullif(v_job.activity->>'answer_max','')::numeric)::int;
  exception when others then v_min := null; v_max := null;
  end;
  v_need_tx := coalesce(v_job.activity->>'require_transcript', '') = 'true';
  v_prefix := v_job.id::text || '/' || v_visitor || '/';

  for v_q in select value from jsonb_array_elements(v_job.questions) loop
    v_type := coalesce(nullif(v_q->>'type', ''), 'video');
    v_opt := coalesce(v_q->>'optional', '') = 'true';
    v_a := null;
    select value into v_a from jsonb_array_elements(p_answers) where value->>'question_id' = v_q->>'id' limit 1;
    v_a := coalesce(v_a, '{}'::jsonb);
    v_answered := false;
    v_item := jsonb_build_object('question_id', v_q->>'id', 'question', left(coalesce(v_q->>'text', ''), 4000), 'type', v_type, 'url', '');

    if v_type = 'video' or (v_type in ('choice', 'critique') and v_a->>'mode' = 'video') then
      v_url := left(trim(coalesce(v_a->>'url', '')), 500);
      if v_url ~* c_url then
        v_answered := true;
        v_loom_n := v_loom_n + 1;
        if v_url !~* c_loom then v_all_loom := false; end if;
        begin v_dur := nullif(nullif(v_a->>'duration_sec', '')::numeric, 0); exception when others then v_dur := null; end;  -- Loom reports 0 when it can't tell
        if v_type = 'video' then
          v_video_n := v_video_n + 1;
          if v_dur is null then v_len_known := false;
          elsif (v_min is not null and v_dur < v_min) or (v_max is not null and v_dur > v_max) then v_len_ok := false;
          end if;
          if v_need_tx and length(trim(coalesce(v_a->>'transcript', ''))) < 20 then v_tx_ok := false; end if;
        end if;
        v_item := v_item || jsonb_build_object('mode', 'video', 'url', v_url,
          'loom_id', left(coalesce(v_a->>'loom_id', ''), 64), 'title', left(coalesce(v_a->>'title', ''), 300),
          'duration_sec', v_dur, 'transcript', left(coalesce(v_a->>'transcript', ''), 20000));
        v_texts := v_texts || ' ' || coalesce(v_a->>'title', '');
      end if;

    elsif v_type in ('written', 'choice', 'critique') then
      v_text := left(trim(coalesce(v_a->>'text', '')), 20000);
      if length(v_text) > 0 then
        v_answered := true;
        v_sig := public.hiring_clean_sig(v_a->'sig');
        if coalesce(public.hiring_num(v_sig, 'pasted'), 0) > greatest(40, length(v_text) * 0.5) then v_pasted := true; end if;
        v_item := v_item || jsonb_build_object('mode', 'written', 'text', v_text, 'sig', v_sig);
        v_texts := v_texts || ' ' || v_text;
      end if;

    elsif v_type = 'voice' then
      v_files := public.hiring_step_files(jsonb_build_array(v_a->'voice'), v_prefix);
      if jsonb_array_length(v_files) > 0 then
        v_answered := true;
        v_item := v_item || jsonb_build_object('voice', (v_files->0) || jsonb_build_object('seconds', public.hiring_num(v_a->'voice', 'seconds')));
      end if;

    elsif v_type = 'work' then
      v_links := '[]'::jsonb;
      for v_l in select value from jsonb_array_elements(case when jsonb_typeof(v_a->'links') = 'array' then v_a->'links' else '[]'::jsonb end) limit 5 loop
        if left(trim(coalesce(v_l->>'url', '')), 500) ~* c_url then
          v_links := v_links || jsonb_build_array(jsonb_build_object(
            'url', left(trim(v_l->>'url'), 500), 'note', left(coalesce(v_l->>'note', ''), 1500)));
          v_texts := v_texts || ' ' || coalesce(v_l->>'note', '');
        end if;
      end loop;
      v_files := public.hiring_step_files(v_a->'files', v_prefix);
      v_texts := v_texts || ' ' || coalesce((select string_agg(f->>'note', ' ') from jsonb_array_elements(v_files) f), '');
      if jsonb_array_length(v_links) + jsonb_array_length(v_files) > 0 then v_answered := true; end if;
      v_item := v_item || jsonb_build_object('links', v_links, 'files', v_files, 'text', left(coalesce(v_a->>'text', ''), 5000));
      v_texts := v_texts || ' ' || coalesce(v_a->>'text', '');

    elsif v_type = 'brief' then
      v_url := left(trim(coalesce(v_a->>'deliverable', '')), 500);
      v_walk := left(trim(coalesce(v_a->>'walk_url', '')), 500);
      v_files := public.hiring_step_files(v_a->'files', v_prefix);
      v_answered := v_url ~* c_url or jsonb_array_length(v_files) > 0;
      if v_answered and v_q->>'walkthrough' = 'required' and v_walk !~* c_url then v_answered := false; end if;
      v_item := v_item || jsonb_build_object(
        'deliverable', case when v_url ~* c_url then v_url else '' end, 'files', v_files,
        'text', left(coalesce(v_a->>'text', ''), 5000),
        'walk_url', case when v_walk ~* c_url then v_walk else '' end,
        'walk_loom_id', left(coalesce(v_a->>'walk_loom_id', ''), 64), 'walk_title', left(coalesce(v_a->>'walk_title', ''), 300),
        'opened_at', left(coalesce(v_a->>'opened_at', ''), 40), 'seconds', public.hiring_num(v_a, 'seconds'));
      v_texts := v_texts || ' ' || coalesce(v_a->>'text', '') || ' ' || coalesce(v_a->>'walk_title', '');

    elsif v_type = 'rank' then
      v_n := jsonb_array_length(case when jsonb_typeof(v_q->'options') = 'array' then v_q->'options' else '[]'::jsonb end);
      v_order := case when jsonb_typeof(v_a->'order') = 'array' then v_a->'order' else '[]'::jsonb end;
      if v_n > 0 and jsonb_array_length(v_order) = v_n
         and (select count(distinct x) from jsonb_array_elements_text(v_order) x
               where x ~ '^\d+$' and x::int between 0 and v_n - 1) = v_n then
        v_answered := true;
        v_item := v_item || jsonb_build_object('order', v_order, 'reason', left(coalesce(v_a->>'reason', ''), 2000),
                                               'sig', public.hiring_clean_sig(v_a->'sig'));
        v_texts := v_texts || ' ' || coalesce(v_a->>'reason', '');
      end if;

    elsif v_type = 'quiz' then
      v_quiz_n := v_quiz_n + 1;
      v_answered := true;  -- a timed question may run out before they choose
      begin v_choice := nullif(v_a->>'choice', '')::int; exception when others then v_choice := null; end;
      begin v_correct := nullif(v_q->>'correct', '')::int; exception when others then v_correct := null; end;
      if v_choice is not null and v_correct is not null and v_choice = v_correct then v_quiz_right := v_quiz_right + 1; end if;
      v_item := v_item || jsonb_build_object(
        'choice', v_choice,
        'correct', case when v_correct is null then null else coalesce(v_choice = v_correct, false) end,
        'reason', left(coalesce(v_a->>'reason', ''), 1000),
        'started_at', left(coalesce(v_a->>'started_at', ''), 40), 'answered_at', left(coalesce(v_a->>'answered_at', ''), 40),
        'seconds', public.hiring_num(v_a, 'seconds'), 'timed_out', coalesce(v_a->>'timed_out', '') = 'true',
        'sig', public.hiring_clean_sig(v_a->'sig'));
      v_texts := v_texts || ' ' || coalesce(v_a->>'reason', '');

    elsif v_type = 'musthave' then
      if v_a->>'yesno' in ('yes', 'no') then
        v_answered := true;
        v_must_n := v_must_n + 1;
        if v_q->>'expected' in ('yes', 'no') and v_a->>'yesno' <> v_q->>'expected' then v_must_ok := false; end if;
        v_item := v_item || jsonb_build_object('yesno', v_a->>'yesno',
          'ok', case when v_q->>'expected' in ('yes', 'no') then v_a->>'yesno' = v_q->>'expected' else null end);
      end if;
    end if;

    if not v_answered and not v_opt then
      return jsonb_build_object('ok', false, 'error', 'answer_missing', 'question_id', v_q->>'id');
    end if;
    v_clean := v_clean || jsonb_build_array(v_item || jsonb_build_object('skipped', not v_answered));
  end loop;

  v_code := nullif(trim(coalesce(v_job.activity->>'hidden_code', '')), '');
  if v_code is not null then
    v_code_ok := position(lower(v_code) in lower(v_texts)) > 0;
  end if;
  v_dup := exists (select 1 from public.hiring_applications where job_id = p_job and email = v_email);

  insert into public.hiring_applications(job_id, name, email, answers, visitor_id, consent, flags, metrics)
  values (p_job, v_name, v_email, v_clean, v_visitor, coalesce(p_consent, false),
          jsonb_strip_nulls(jsonb_build_object(
            'all_loom_links', case when v_loom_n > 0 then v_all_loom else null end,
            'lengths_in_range', case when v_video_n > 0 and v_len_known then v_len_ok else null end,
            'transcripts_ok', case when v_video_n > 0 then v_tx_ok else null end,
            'hidden_code_ok', v_code_ok,
            'duplicate_email', v_dup,
            'musthave_ok', case when v_must_n > 0 then v_must_ok else null end,
            'quiz_right', case when v_quiz_n > 0 then v_quiz_right else null end,
            'quiz_total', case when v_quiz_n > 0 then v_quiz_n else null end,
            'pasted', case when v_pasted then true else null end,
            'ai_used', case when p_meta->'ai_use'->>'used' in ('true', 'false') then (p_meta->'ai_use'->>'used')::boolean else null end)),
          case when p_meta is not null and pg_column_size(p_meta) < 8000 then p_meta else '{}'::jsonb end)
  returning id into v_id;

  if v_visitor <> '' then
    update public.hiring_events
       set application_id = v_id, job_id = coalesce(job_id, p_job)
     where visitor_id = v_visitor and application_id is null
       and (job_id = p_job or job_id is null);
  end if;
  insert into public.hiring_events(job_id, application_id, visitor_id, type)
  values (p_job, v_id, v_visitor, 'submitted');

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ── Event names the activity page may send ──
create or replace function public.hiring_track(p_job uuid, p_visitor text, p_type text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_visitor text := left(coalesce(p_visitor,''), 64);
begin
  if p_type not in ('instructions_view','instructions_done','loom_link_click','form_start','question_focus',
                    'link_added','link_invalid','not_url','transcript_added','draft_restored','tab_hidden','tab_return',
                    'submit_attempt','submit_error','posting_copy','file_added',
                    'step_start','step_answer','paste','paste_blocked','brief_opened','voice_recorded','timed_out') then
    return;
  end if;
  if not exists (select 1 from public.hiring_jobs where id = p_job and status = 'published') then return; end if;
  if not public.hiring_rate_ok(v_visitor) then return; end if;
  insert into public.hiring_events(job_id, visitor_id, type, meta)
  values (p_job, v_visitor, p_type,
          case when p_meta is not null and pg_column_size(p_meta) < 4000 then p_meta else '{}'::jsonb end);
end $$;

-- ── Uploads: work samples, voice notes and images, up to 10 MB, 15 files per candidate ──
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array[
         'application/pdf', 'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/plain', 'text/csv',
         'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic',
         'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac']
 where id = 'hiring-uploads';

create or replace function public.hiring_upload_ok(p_name text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_parts text[] := string_to_array(coalesce(p_name,''), '/');
  v_job   uuid;
begin
  if coalesce(array_length(v_parts, 1), 0) <> 3 then return false; end if;
  if v_parts[2] !~ '^[a-z0-9_-]{5,64}$' or length(v_parts[3]) not between 1 and 160 then return false; end if;
  begin v_job := v_parts[1]::uuid; exception when others then return false; end;
  if not exists (select 1 from public.hiring_jobs
                  where id = v_job and (status = 'published' or (status = 'draft' and public.hiring_is_admin()))) then
    return false;
  end if;
  return (select count(*) from storage.objects
           where bucket_id = 'hiring-uploads' and name like v_parts[1] || '/' || v_parts[2] || '/%') < 15;
end $$;

-- Images for critique steps, added by the hiring team, readable by anyone with the link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hiring-public', 'hiring-public', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hiring public images manage" on storage.objects;
create policy "hiring public images manage" on storage.objects for insert to authenticated
  with check (bucket_id = 'hiring-public' and ((select public.hiring_is_admin()) or public.hiring_job_editor(public.hiring_path_job(name))));
drop policy if exists "hiring public images delete" on storage.objects;
create policy "hiring public images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'hiring-public' and ((select public.hiring_is_admin()) or public.hiring_job_editor(public.hiring_path_job(name))));

-- Reviewers: work samples and voice notes always; résumés and cover letters only with that permission.
create or replace function public.hiring_reviewer_file(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.hiring_applications a
      join public.hiring_reviewers r on r.job_id = a.job_id and r.user_id = auth.uid()
     where public.hiring_reviewer_sees(a.id)
       and ((r.see_files and a.attachments @> jsonb_build_array(jsonb_build_object('path', p_name)))
            or a.answers @> jsonb_build_array(jsonb_build_object('files', jsonb_build_array(jsonb_build_object('path', p_name))))
            or a.answers @> jsonb_build_array(jsonb_build_object('voice', jsonb_build_object('path', p_name)))));
$$;
