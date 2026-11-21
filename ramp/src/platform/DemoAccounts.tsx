// Platform console › Demo accounts: build the RAMP Demo company and open it as any kind of user.
import { useState } from 'react';
import { errText } from '../lib/supabase';
import { useAsync } from '../lib/hooks';
import { demoCall, openDemo, PersonaList, type DemoStatus, type PersonaKey } from '../lib/demo';
import { ago } from '../lib/util';
import { Button, Card, CardHeader, ErrorBox, Notice, Skeleton, useConfirm, useToast } from '../ui';

export default function DemoAccounts() {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, reload, setData } = useAsync(() => demoCall<DemoStatus>({ action: 'status' }), []);
  const [building, setBuilding] = useState(false);
  const [busy, setBusy] = useState<PersonaKey | null>(null);
  const built = !!data?.workspace && data.personas.every((p) => p.ready);

  async function build() {
    if (built) {
      const ok = await confirm({
        title: 'Rebuild the demo?', action: 'Rebuild demo', danger: true,
        body: 'Everything in the Demo Company is deleted and set up again from your training library: anything you tried in the demo is lost. Your real accounts aren’t touched.',
      });
      if (!ok) return;
    }
    setBuilding(true);
    try {
      setData(await demoCall<DemoStatus>({ action: 'setup' }));
      toast(built ? 'Demo rebuilt.' : 'Demo built. Pick someone to open it as.');
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBuilding(false);
    }
  }

  async function open(k: PersonaKey) {
    setBusy(k);
    try { await openDemo(k); } catch (e) { toast(errText(e), 'bad'); setBusy(null); }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <CardHeader title="Demo accounts"
          subtitle="A separate RAMP Demo account with a sample company, “Demo Company”, and one person for every kind of user. Open it as anyone to test what they see."
          action={data && <Button variant={built ? 'secondary' : 'primary'} icon="refresh" loading={building} onClick={build}>{built ? 'Rebuild demo' : 'Build demo'}</Button>} />
        {error && !data && <ErrorBox error={error} onRetry={reload} />}
        {!data && !error && <Skeleton rows={3} />}
        {data && (
          <>
            <p className="text-sm text-muted">
              {data.built_at ? `Built ${ago(data.built_at)}. ` : 'Not built yet. '}
              The demo copies your training library (including published interactive modules), adds a client, Brightside Bakery, with a placed team
              member, and gives modules due dates so reminders and the calendar have something to show.
            </p>
            <PersonaList personas={data.personas} busy={busy} onPick={open} />
            <Notice icon="info">
              Demo people have no passwords and can’t receive email. Opening one keeps your own sign-in on this device: use <b>Exit</b> on the dark
              demo bar to come back here. Demo sign-ins only ever belong to the demo company.
            </Notice>
          </>
        )}
      </Card>
      {dialog}
    </div>
  );
}
