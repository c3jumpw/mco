-- RAMP 010: RAMP is for every new hire, so user-facing wording says "team member" instead of "assistant".
-- Rewrites the few database messages that mention assistants, in place (owners, grants and comments stay as they are).
do $$
declare r record; def text;
begin
  for r in select p.oid from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('ramp_client_request', 'ramp_members_guard', 'ramp_placement_sync_internal', 'ramp_timesheet_review') loop
    def := pg_get_functiondef(r.oid);
    def := replace(def, 'That assistant isn’t on your account.', 'That team member isn’t on your account.');
    def := replace(def, 'Agency assistants are managed by the agency.', 'Team members placed by the agency are managed by the agency.');
    def := replace(def, '''agency assistant removed''', '''agency team member removed''');
    def := replace(def, '''agency assistant added''', '''agency team member added''');
    def := replace(def, 'Add a note so the assistant knows what to fix.', 'Add a note so the team member knows what to fix.');
    execute def;
  end loop;
end $$;

alter table public.ramp_placements alter column title set default 'Team member';
