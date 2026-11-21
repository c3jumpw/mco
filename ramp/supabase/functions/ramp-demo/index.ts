// RAMP demo accounts: one sign-in for every kind of user, in a separate "RAMP Demo" account, so the team can test
// features as an owner, admin, lead, supervisor, employee, trainee, guest, placed team member or client contact.
//   status  → who the demo people are and whether the demo is built (platform admins and demo users)
//   setup   → create the demo sign-ins (no passwords, can't receive email) and rebuild the demo data (platform admins)
//   signin  → a one-time sign-in token for one demo person (platform admins, or a demo user switching person)
// Demo sign-ins carry app_metadata.ramp_demo, which only this function can set, and only those can be opened here.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DOMAIN = Deno.env.get('RAMP_DEMO_EMAIL_DOMAIN') || 'example.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PERSONAS = [
  { k: 'owner', name: 'Olivia Owner', level: 'owner' },
  { k: 'admin', name: 'Adam Admin', level: 'admin' },
  { k: 'lead', name: 'Lena Lead', level: 'lead' },
  { k: 'mentor', name: 'Marco Mentor', level: 'mentor' },
  { k: 'employee', name: 'Erin Employee', level: 'employee' },
  { k: 'trainee', name: 'Tara Trainee', level: 'trainee' },
  { k: 'guest', name: 'Gary Guest', level: 'guest' },
  { k: 'va', name: 'Val Assistant', level: 'trainee' },
  { k: 'client', name: 'Cleo Client', level: 'client' },
] as const;
type Key = typeof PERSONAS[number]['k'];
const emailOf = (k: string) => `ramp.demo+${k}@${DOMAIN}`;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** The demo person's sign-in id, creating it the first time. Refuses an existing sign-in that isn't a demo one. */
async function ensureUser(p: typeof PERSONAS[number]) {
  const email = emailOf(p.k);
  const made = await admin.auth.admin.createUser({
    email, email_confirm: true,
    app_metadata: { ramp_demo: true, ramp_demo_persona: p.k },
    user_metadata: { full_name: p.name },
  });
  if (made.data?.user) return made.data.user.id;
  // Only look up a sign-in that already exists; anything else is a real error (and must not create one without the demo mark).
  if (made.error && !/already|exists|registered/i.test(made.error.message)) throw new Error(`${email}: ${made.error.message}`);
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const user = link.data?.user;
  if (!user) throw new Error(made.error?.message || link.error?.message || `Couldn’t create ${email}.`);
  if (user.app_metadata?.ramp_demo !== true) throw new Error(`${email} belongs to a sign-in that isn’t a demo one, so it can’t be used.`);
  return user.id;
}

async function status() {
  const { data: acc } = await admin.from('ramp_accounts').select('id, created_at').eq('name', 'RAMP Demo').like('notes', 'demo:%')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: ws } = acc
    ? await admin.from('ramp_workspaces').select('id, name').eq('account_id', acc.id).limit(1).maybeSingle()
    : { data: null };
  const { data: members } = ws
    ? await admin.from('ramp_members').select('email, auth_user_id, status').eq('workspace_id', ws.id).in('email', PERSONAS.map((p) => emailOf(p.k)))
    : { data: [] as { email: string; auth_user_id: string | null; status: string }[] };
  return {
    built_at: acc?.created_at || null,
    workspace: ws || null,
    personas: PERSONAS.map((p) => ({
      ...p, email: emailOf(p.k),
      ready: !!(members || []).find((m) => m.email === emailOf(p.k) && m.auth_user_id && m.status === 'active'),
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
  const { data: who } = await asUser.auth.getUser();
  const user = who?.user;
  if (!user) return json({ error: 'Sign in first.' }, 401);
  const { data: superFlag } = await asUser.rpc('ramp_is_super');
  const isSuper = superFlag === true;
  const isDemo = user.app_metadata?.ramp_demo === true;
  if (!isSuper && !isDemo) return json({ error: 'Only the RAMP platform team can use demo accounts.' }, 403);

  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === 'status') return json(await status());

    if (body.action === 'setup') {
      if (!isSuper) return json({ error: 'Only the RAMP platform team can rebuild the demo.' }, 403);
      const ids: Record<string, string> = {};
      for (const p of PERSONAS) ids[p.k] = await ensureUser(p);
      const { error } = await admin.rpc('ramp_demo_seed', { p_users: ids });
      if (error) throw new Error(error.message);
      return json(await status());
    }

    if (body.action === 'signin') {
      const p = PERSONAS.find((x) => x.k === body.persona);
      if (!p) return json({ error: 'Pick a demo person.' }, 400);
      // Only people the demo was built with (never create a sign-in here).
      const st = await status();
      if (!st.personas.find((x) => x.k === p.k)?.ready) return json({ error: 'The demo isn’t set up yet. Build it from Client accounts › Demo accounts.' }, 400);
      const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: emailOf(p.k as Key) });
      if (link.error || !link.data?.user) return json({ error: link.error?.message || 'Couldn’t open that demo person.' }, 400);
      if (link.data.user.app_metadata?.ramp_demo !== true) return json({ error: 'That isn’t a demo sign-in.' }, 403);
      return json({ email: emailOf(p.k), name: p.name, token_hash: link.data.properties.hashed_token });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
