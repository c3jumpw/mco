-- Job-board link variants: apply1234.com/<slug>-<code> resolves to the job and records which board it came from.
alter table public.hiring_jobs add column if not exists sources jsonb not null default '[]'::jsonb;

create or replace function public.hiring_resolve(p_path text, p_visitor text default '', p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
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
    -- 1) the main link (unless the admin turned it off)
    select * into v_job from public.hiring_jobs
     where slug = v_path
       and coalesce(settings->>'base_link_off', 'false') <> 'true'
       and (status in ('published','closed') or (status = 'draft' and public.hiring_is_admin()));

    -- 2) a job-board variant: <slug>-<code>
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
      'questions', v_job.questions,
      'source', case when v_source is null then null
                     else jsonb_build_object('code', v_source->>'code', 'label', v_source->>'label') end);
  end if;

  -- Wrong or partial link: log it and attach it to the closest live job.
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
