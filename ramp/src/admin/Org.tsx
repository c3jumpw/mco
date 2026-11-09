import { useMemo, useState } from 'react';
import { supabase, errText } from '../lib/supabase';
import { useMe } from '../lib/session';
import { useTitle } from '../lib/hooks';
import { BRAND_COLORS, cx } from '../lib/util';
import type { Org as OrgRow } from '../lib/types';
import { embedUrl } from '../lib/plan';
import { Button, Card, Field, Icon, Input, Notice, PageHeader, Textarea, useToast } from '../ui';
import { ADMIN_BACK, HEX_RE, SaveBar, SectionHead, contrastWithWhite, same, useLeaveGuard } from './parts/setup-kit';
import { TimezonePicker, isZone } from './parts/setup-timezone';
import { WelcomePreview } from './parts/setup-welcome-preview';

type Form = Pick<OrgRow, 'name' | 'brand_color' | 'timezone' | 'welcome_from' | 'welcome_headline' | 'welcome_message' | 'welcome_video_url'>;

const pick = (o: OrgRow): Form => ({
  name: o.name || '',
  brand_color: (o.brand_color || '#4338CA').toUpperCase(),
  timezone: o.timezone || 'America/New_York',
  welcome_from: o.welcome_from || '',
  welcome_headline: o.welcome_headline || '',
  welcome_message: o.welcome_message || '',
  welcome_video_url: o.welcome_video_url || '',
});

function validate(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.name.trim()) e.name = 'Add your company name.';
  else if (f.name.trim().length > 80) e.name = 'Keep the name to 80 characters or fewer.';
  if (!HEX_RE.test(f.brand_color)) e.brand_color = 'Use a 6-digit hex color, like #4338CA.';
  if (!isZone(f.timezone)) e.timezone = 'Pick a time zone from the list.';
  if (!f.welcome_headline.trim()) e.welcome_headline = 'Add a headline for the first screen.';
  const url = f.welcome_video_url.trim();
  if (url && !/^https?:\/\/\S+\.\S+/i.test(url)) e.welcome_video_url = 'Paste the full link, starting with https://';
  return e;
}

export default function Org() {
  useTitle('Organization');
  const { org, setOrg } = useMe();
  const toast = useToast();
  const saved = useMemo(() => pick(org), [org]);
  const [form, setForm] = useState<Form>(saved);
  const [hex, setHex] = useState(saved.brand_color);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [fail, setFail] = useState('');
  const dirty = !same(form, saved);
  const { dialog } = useLeaveGuard(dirty);
  const errors = validate(form);
  const shown = showErrors ? errors : {};
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function pickColor(c: string) {
    set('brand_color', c.toUpperCase());
    setHex(c.toUpperCase());
  }
  function typeHex(v: string) {
    const clean = ('#' + v.replace(/[^0-9a-f]/gi, '')).slice(0, 7).toUpperCase();
    setHex(clean);
    if (HEX_RE.test(clean)) set('brand_color', clean);
  }

  async function save() {
    setFail('');
    if (Object.keys(errors).length) { setShowErrors(true); toast('Check the highlighted fields.', 'bad'); return; }
    setSaving(true);
    try {
      const patch: Form = {
        ...form,
        name: form.name.trim(),
        welcome_from: form.welcome_from.trim(),
        welcome_headline: form.welcome_headline.trim(),
        welcome_message: form.welcome_message.trim(),
        welcome_video_url: form.welcome_video_url.trim(),
      };
      const { data, error } = await supabase.from('ramp_org').update(patch).eq('id', true).select().single();
      if (error) throw error;
      const row = data as OrgRow;
      setOrg(row);
      setForm(pick(row));
      setHex(pick(row).brand_color);
      setShowErrors(false);
      toast('Organization saved.');
    } catch (e) {
      setFail(errText(e));
      toast(errText(e), 'bad');
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setForm(saved);
    setHex(saved.brand_color);
    setShowErrors(false);
  }

  const lowContrast = HEX_RE.test(form.brand_color) && contrastWithWhite(form.brand_color) < 4.5;
  const isPreset = BRAND_COLORS.some((b) => b.c.toUpperCase() === form.brand_color);
  const video = form.welcome_video_url.trim();
  const canEmbed = !!video && !!embedUrl(video);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow="Set up" title="Organization"
        subtitle="Your company name, brand color and time zone, and the welcome message every new person sees first." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <Card className="flex flex-col gap-5">
            <SectionHead title="Company profile" />
            <Field label="Company name" required error={shown.name}>
              <Input value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} autoComplete="organization" />
            </Field>

            <fieldset className="flex flex-col gap-2.5">
              <legend className="text-[13px] font-semibold text-ink-2 mb-2.5">Brand color</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Brand color">
                {BRAND_COLORS.map((b) => {
                  const on = b.c.toUpperCase() === form.brand_color;
                  return (
                    <button key={b.c} type="button" role="radio" aria-checked={on} aria-label={b.name} title={b.name} onClick={() => pickColor(b.c)}
                      className={cx('w-11 h-11 rounded-full flex items-center justify-center cursor-pointer border-2', on ? 'border-ink' : 'border-transparent')}>
                      <span className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: b.c }}>
                        {on && <Icon name="check" size={16} strokeWidth={2.6} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-end gap-2 max-w-xs">
                <Field label="Custom color" className="flex-1" error={shown.brand_color} hint="Six digits, like #0F766E.">
                  <Input value={hex} onChange={(e) => typeHex(e.target.value)} onBlur={() => setHex(form.brand_color)} spellCheck={false}
                    className="font-mono uppercase" inputMode="text" autoCapitalize="characters" maxLength={7} placeholder="#4338CA" />
                </Field>
                <label className={cx('relative w-11 h-11 rounded-xl border border-field overflow-hidden shrink-0 cursor-pointer', !isPreset && 'ring-2 ring-ink ring-offset-2')}
                  style={{ background: form.brand_color }} title="Pick any color">
                  <span className="sr-only">Pick any color</span>
                  <input type="color" value={HEX_RE.test(form.brand_color) ? form.brand_color : '#4338CA'} onChange={(e) => pickColor(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                </label>
              </div>
              {lowContrast
                ? <Notice tone="warn" icon="alert">White text is hard to read on this color. Pick a darker shade so buttons stay readable.</Notice>
                : <p className="text-xs text-muted">Used for buttons, highlights and the welcome screens new people see first.</p>}
            </fieldset>

            <Field label="Time zone" error={shown.timezone} hint="Due dates, record times and the audit log use this time zone.">
              <TimezonePicker value={form.timezone} onChange={(tz) => set('timezone', tz)} />
            </Field>
          </Card>

          <Card className="flex flex-col gap-5">
            <SectionHead title="Welcome message" subtitle="The first screen of the welcome flow. Keep it short and personal." />
            <Field label="Message from" hint="Who it’s from, like “Dana Reyes, Founder”. Shown with the video and message.">
              <Input value={form.welcome_from} maxLength={80} onChange={(e) => set('welcome_from', e.target.value)} placeholder="Name, title" />
            </Field>
            <Field label="Headline" required error={shown.welcome_headline} hint="Type {first} where the new person’s first name should go.">
              <Input value={form.welcome_headline} maxLength={120} onChange={(e) => set('welcome_headline', e.target.value)} />
            </Field>
            <Field label="Message">
              <Textarea value={form.welcome_message} rows={5} maxLength={1500} onChange={(e) => set('welcome_message', e.target.value)}
                placeholder="What RAMP is for, what the first days look like and who to ask for help." />
            </Field>
            <Field label="Welcome video link" error={shown.welcome_video_url}
              hint={video && !shown.welcome_video_url ? (canEmbed ? 'This video will play right on the welcome screen.' : 'This link can’t play inside RAMP, so new people will get a button to open it.') : 'Optional. YouTube, Vimeo and Loom links play right on the welcome screen.'}>
              <Input type="url" inputMode="url" value={form.welcome_video_url} onChange={(e) => set('welcome_video_url', e.target.value)} placeholder="https://www.loom.com/share/…" />
            </Field>
          </Card>
          {fail && <Notice tone="bad" icon="alert">{fail}</Notice>}
        </div>

        <aside className="flex flex-col gap-2 lg:sticky lg:top-6" aria-label="Live preview">
          <p className="text-xs font-bold tracking-[0.08em] uppercase text-muted px-1">Live preview</p>
          <WelcomePreview name={form.name} color={form.brand_color} from={form.welcome_from} headline={form.welcome_headline}
            message={form.welcome_message} videoUrl={form.welcome_video_url} />
          <p className="text-xs text-muted px-1">Shown with a sample name. Each new person sees their own first name.</p>
        </aside>
      </div>

      <SaveBar dirty={dirty} saving={saving}>
        {dirty && <Button variant="ghost" onClick={discard} disabled={saving}>Discard</Button>}
        <Button variant="primary" onClick={save} loading={saving} disabled={!dirty} icon="check">Save organization</Button>
      </SaveBar>
      {dialog}
    </div>
  );
}
