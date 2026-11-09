import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, errText, FILES_BUCKET } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { cx, fmtDate, plural } from '../lib/util';
import type { Page } from '../lib/types';
import { BackLink, Button, Card, Chip, EmptyState, ErrorBox, Icon, PageHeader, SearchInput, Select, Sheet, Skeleton, useConfirm, useToast } from '../ui';
import { PageEditor, type ModuleLite } from './parts/tools-notes-editor';
import { useWide } from './parts/tools-media';

interface Data { pages: Page[]; modules: ModuleLite[] }

interface Starter { key: string; title: string; desc: string; make: () => { title: string; body: string } }

const today = () => fmtDate(new Date(), { weekday: 'short', month: 'short', day: 'numeric' });

const STARTERS: Starter[] = [
  { key: 'blank', title: 'Blank page', desc: 'Start from nothing.', make: () => ({ title: 'Untitled page', body: '' }) },
  {
    key: 'meeting', title: 'Meeting notes', desc: 'Who was there, decisions and action items.',
    make: () => ({
      title: `Meeting notes, ${today()}`,
      body: 'Who was there:\n\nWhat we talked about\n- \n\nDecisions\n- \n\nAction items (who, what, by when)\n- \n',
    }),
  },
  {
    key: 'daily', title: 'Daily log', desc: 'What you worked on, what got in the way, and wins.',
    make: () => ({
      title: `Daily log, ${today()}`,
      body: 'What I worked on\n- \n\nWhat got in my way\n- \n\nWins\n- \n\nTomorrow\n- \n',
    }),
  },
  {
    key: 'mentor', title: 'Questions for my mentor', desc: 'Collect questions as they come up, then bring them to your check-in.',
    make: () => ({
      title: 'Questions for my mentor',
      body: 'Questions\n- \n\nAnswers and notes\n- \n\nTip: turn on “Share with my mentor and lead” so your mentor can read these before you meet.\n',
    }),
  },
];

export default function Notes() {
  const { id } = useParams();
  const { me } = useMe();
  const nav = useNavigate();
  // Two panes need room next to the sidebar; narrower screens show the list, then the page.
  const mobile = !useWide();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<{ parent: string } | null>(null);

  const { data, error, reload, setData } = useAsync<Data>(async () => {
    const [pages, modules] = await Promise.all([
      q<Page[]>(supabase.from('ramp_pages').select('*').eq('member_id', me.id).order('sort').order('created_at')),
      q<{ id: string; title: string; status: string }[]>(supabase.from('ramp_modules').select('id, title, status').order('sort')).catch(() => []),
    ]);
    return { pages, modules: modules.filter((m) => m.status === 'published').map(({ id, title }) => ({ id, title })) };
  }, [me.id]);

  const pages = data?.pages;
  const page = id && pages ? pages.find((p) => p.id === id) || null : null;
  useTitle(page ? page.title || 'Notebook' : 'Notebook');

  function patch(pid: string, p: Partial<Page>) {
    setData((d) => ({ ...d!, pages: d!.pages.map((x) => (x.id === pid ? { ...x, ...p } : x)) }));
  }

  async function create(s: Starter, parent: string) {
    const { title, body } = s.make();
    try {
      const row = await q<Page>(supabase.from('ramp_pages').insert({ member_id: me.id, title, body, parent_id: parent || null }).select('*').single());
      setData((d) => ({ ...d!, pages: [...d!.pages, row] }));
      setCreating(null);
      setSearch('');
      nav(`/notes/${row.id}`);
      toast(s.key === 'blank' ? 'Page created.' : `${s.title} page created.`);
    } catch (e) {
      toast(errText(e), 'bad');
    }
  }

  async function remove(p: Page) {
    const kids = (pages || []).filter((x) => x.parent_id === p.id);
    const ok = await confirm({
      title: `Delete “${p.title}”?`,
      body: kids.length
        ? `Its ${plural(kids.length, 'sub-page')} and every attached file will be deleted too. This can’t be undone.`
        : 'The page and its attached files will be deleted. This can’t be undone.',
      action: 'Delete page', danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('ramp_pages').delete().eq('id', p.id);
    if (error) { toast(errText(error), 'bad'); return; }
    const paths = [p, ...kids].flatMap((x) => (x.files || []).map((f) => f.path));
    if (paths.length) supabase.storage.from(FILES_BUCKET).remove(paths).then(() => {});
    setData((d) => ({ ...d!, pages: d!.pages.filter((x) => x.id !== p.id && x.parent_id !== p.id) }));
    nav(p.parent_id ? `/notes/${p.parent_id}` : '/notes', { replace: true });
    toast('Page deleted.');
  }

  const newButton = <Button variant="primary" icon="plus" onClick={() => setCreating({ parent: '' })}>New page</Button>;
  const header = <PageHeader title="Notebook" subtitle="Your notes, templates and files. Pages are private unless you share them." actions={data ? newButton : undefined} />;

  if (error && !data) return <div className="flex flex-col gap-6">{header}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="flex flex-col gap-6">{header}<Skeleton rows={4} /></div>;

  const notFound = !!id && !page;
  const editor = page ? (
    <PageEditor key={page.id} page={page} pages={data.pages} modules={data.modules}
      onPatch={(p) => patch(page.id, p)} onDelete={() => remove(page)} onAddSub={() => setCreating({ parent: page.id })} />
  ) : null;
  const missing = (
    <Card>
      <EmptyState icon="notes" title="We couldn’t find that page" body="It may have been deleted. Pick another page from your notebook."
        action={<Link to="/notes" className="font-semibold text-brand-ink no-underline">Back to my notebook</Link>} />
    </Card>
  );

  const list = <PageList pages={data.pages} activeId={id || null} search={search} onSearch={setSearch} onNew={() => setCreating({ parent: '' })} />;

  return (
    <div className="flex flex-col gap-6">
      {mobile && id ? (
        <>
          <BackLink to="/notes">All pages</BackLink>
          {notFound ? missing : editor}
        </>
      ) : (
        <>
          {header}
          {error && <ErrorBox error={error} onRetry={reload} />}
          {mobile ? list : (
            <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-6 items-start">
              <div className="sticky top-8">{list}</div>
              {notFound ? missing : editor || <Intro hasPages={data.pages.length > 0} onNew={() => setCreating({ parent: '' })} />}
            </div>
          )}
        </>
      )}

      <Sheet open={!!creating} onClose={() => setCreating(null)} title="New page" subtitle="Pick a starting point. You can change everything afterwards.">
        {creating && <NewPage pages={data.pages} parent={creating.parent} onParent={(p) => setCreating({ parent: p })} onPick={(s) => create(s, creating.parent)} />}
      </Sheet>
      {dialog}
    </div>
  );
}

// ───────── page list ─────────

function PageList({ pages, activeId, search, onSearch, onNew }: { pages: Page[]; activeId: string | null; search: string; onSearch: (v: string) => void; onNew: () => void }) {
  const tops = useMemo(() => pages.filter((p) => !p.parent_id || !pages.some((x) => x.id === p.parent_id)), [pages]);
  const term = search.trim().toLowerCase();
  const hits = term ? pages.filter((p) => p.title.toLowerCase().includes(term) || p.body.toLowerCase().includes(term)) : [];

  const item = (p: Page, depth: number, sub?: string) => (
    <li key={p.id}>
      <Link to={`/notes/${p.id}`} aria-current={p.id === activeId ? 'page' : undefined}
        className={cx('flex items-center gap-2.5 min-h-11 rounded-xl pr-2 no-underline text-[15px]',
          depth ? 'pl-9' : 'pl-3',
          p.id === activeId ? 'bg-brand-soft text-brand-ink font-semibold' : 'text-ink-2 hover:bg-chip font-medium')}>
        <Icon name="fileText" size={17} className={p.id === activeId ? 'text-brand-ink' : 'text-muted'} />
        <span className="min-w-0 flex-1 py-2">
          <span className="block truncate">{p.title || 'Untitled page'}</span>
          {sub && <span className="block text-xs text-muted truncate font-normal">{sub}</span>}
        </span>
        {(p.files || []).length > 0 && <Icon name="paperclip" size={14} className="text-muted" />}
        {p.shared && <Chip tone="brand">Shared</Chip>}
      </Link>
    </li>
  );

  return (
    <nav aria-label="Notebook pages" className="bg-card border border-line rounded-2xl p-2.5 flex flex-col gap-2 lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto">
      {pages.length > 0 && <div className="p-0.5"><SearchInput value={search} onChange={onSearch} placeholder="Search pages" label="Search pages" /></div>}
      {pages.length === 0 ? (
        <EmptyState icon="notes" title="Start your notebook" body="Keep module notes, meeting notes and files here. Only you can see them unless you share a page."
          action={<Button variant="primary" icon="plus" onClick={onNew}>New page</Button>} />
      ) : term ? (
        hits.length === 0
          ? <p className="text-sm text-muted px-3 py-4">No pages match “{search.trim()}”.</p>
          : <ul className="flex flex-col gap-0.5">{hits.map((p) => item(p, 0, p.parent_id ? `In ${pages.find((x) => x.id === p.parent_id)?.title || 'a page'}` : undefined))}</ul>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {tops.flatMap((p) => [item(p, 0), ...pages.filter((c) => c.parent_id === p.id).map((c) => item(c, 1))])}
        </ul>
      )}
      <div className="border-t border-line-2 pt-2 mt-1">
        <Link to="/vault" className="flex items-center gap-2.5 min-h-11 rounded-xl px-3 no-underline text-ink-2 hover:bg-chip text-[15px] font-medium">
          <Icon name="lock" size={17} className="text-muted" />
          <span className="flex-1">Vault</span>
          <span className="text-xs text-muted">Saved logins</span>
        </Link>
      </div>
    </nav>
  );
}

// ───────── empty editor (desktop) ─────────

function Intro({ hasPages, onNew }: { hasPages: boolean; onNew: () => void }) {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-display text-[22px] font-bold">{hasPages ? 'Pick a page' : 'Start here'}</h2>
      <p className="text-[15px] text-ink-2 leading-relaxed">This notebook is yours. Use it for module notes, meeting notes and files, while you train and after you graduate.</p>
      <ul className="prose-ramp text-[15px]">
        <li>Pages can have sub-pages.</li>
        <li>Attach files to any page.</li>
        <li>Share a page with your mentor and lead when you want feedback.</li>
        <li>Keep logins in the Vault. Only you can open it.</li>
      </ul>
      <div><Button variant="primary" icon="plus" onClick={onNew}>New page</Button></div>
    </Card>
  );
}

// ───────── new page picker ─────────

function NewPage({ pages, parent, onParent, onPick }: { pages: Page[]; parent: string; onParent: (p: string) => void; onPick: (s: Starter) => Promise<void> }) {
  const [busy, setBusy] = useState('');
  const tops = pages.filter((p) => !p.parent_id);
  async function pick(s: Starter) {
    setBusy(s.key);
    await onPick(s);
    setBusy('');
  }
  return (
    <>
      {tops.length > 0 && (
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
          Where should it go?
          <Select value={parent} onChange={(e) => onParent(e.target.value)}>
            <option value="">Top level of my notebook</option>
            {tops.map((p) => <option key={p.id} value={p.id}>Inside “{p.title}”</option>)}
          </Select>
        </label>
      )}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <button key={s.key} type="button" disabled={!!busy} onClick={() => pick(s)}
            className="text-left flex flex-col gap-1 min-h-20 p-4 rounded-2xl border border-line bg-card hover:border-brand hover:bg-brand-soft cursor-pointer disabled:opacity-60 disabled:cursor-wait transition-colors">
            <span className="flex items-center gap-2 text-[15px] font-semibold">
              <Icon name={s.key === 'blank' ? 'file' : 'fileText'} size={18} className="text-brand-ink" />{s.title}
              {busy === s.key && <span className="ml-auto text-xs text-muted">Creating…</span>}
            </span>
            <span className="text-sm text-muted leading-relaxed">{s.desc}</span>
          </button>
        ))}
      </div>
    </>
  );
}
