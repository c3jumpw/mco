import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, errText, openFile } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import type { Resource } from '../lib/types';
import { Button, Card, Chip, EmptyState, ErrorBox, Icon, LinkButton, Notice, PageHeader, Pills, SearchInput, Sheet, Skeleton, useToast } from '../ui';

type Cat = Resource['category'];
const CATS: { value: Cat; label: string; heading: string; one: string }[] = [
  { value: 'policy', label: 'Policies', heading: 'Policies', one: 'Policy' },
  { value: 'sop', label: 'SOPs', heading: 'Standard operating procedures', one: 'SOP' },
  { value: 'guide', label: 'Guides', heading: 'Guides', one: 'Guide' },
  { value: 'tool', label: 'Tools', heading: 'Tools', one: 'Tool' },
  { value: 'other', label: 'Other', heading: 'Other', one: 'Resource' },
];

const isInternal = (url: string) => url.trim().startsWith('/');
const hrefOf = (url: string) => (isInternal(url) || /^https?:\/\//i.test(url) ? url.trim() : `https://${url}`);

function kindOf(r: Resource): { icon: string; hint: string } {
  if (r.body.trim()) return { icon: 'fileText', hint: 'Read here' };
  if (isInternal(r.url)) return { icon: 'chevronRight', hint: 'Opens in RAMP' };
  if (r.url.trim()) {
    let host = '';
    try { host = new URL(hrefOf(r.url)).host.replace(/^www\./, ''); } catch { /* keep it blank */ }
    return { icon: 'link', hint: host ? `Opens ${host}` : 'Opens in a new tab' };
  }
  if (r.file_path) return { icon: 'file', hint: 'File' };
  return { icon: 'info', hint: 'Nothing attached yet' };
}

export default function Resources() {
  useTitle('Resources');
  const { me, isAdmin, isGuest } = useMe();
  const toast = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<Cat | 'all'>('all');
  const [reading, setReading] = useState<Resource | null>(null);

  const { data, error, reload } = useAsync(async () => {
    const [resources, roles] = await Promise.all([
      q<Resource[]>(supabase.from('ramp_resources').select('*').order('sort').order('title')),
      q<{ id: string; title: string }[]>(supabase.from('ramp_job_roles').select('id, title')).catch(() => []),
    ]);
    return { resources, roles };
  }, [me.id]);

  // Everyone sees general items plus their own role's; admins see everything.
  const mine = (data?.resources || []).filter((r) => isAdmin || !r.job_role_id || r.job_role_id === me.job_role_id);
  const term = search.trim().toLowerCase();
  const shown = mine.filter((r) => (cat === 'all' || r.category === cat) && (!term || r.title.toLowerCase().includes(term) || r.body.toLowerCase().includes(term)));
  const roleName = (rid: string) => data?.roles.find((x) => x.id === rid)?.title || 'one role';

  async function openRes(r: Resource) {
    if (r.body.trim()) { setReading(r); return; }
    if (isInternal(r.url)) { navigate(r.url.trim()); return; }
    if (r.url.trim()) { window.open(hrefOf(r.url), '_blank', 'noopener,noreferrer'); return; }
    if (r.file_path) {
      try { await openFile(r.file_path); } catch (e) { toast(errText(e), 'bad'); }
      return;
    }
    toast('This resource doesn’t have anything attached yet.', 'bad');
  }

  async function openAttachment(path: string) {
    try { await openFile(path); } catch (e) { toast(errText(e), 'bad'); }
  }

  const header = (
    <PageHeader title="Resources" subtitle="Policies, procedures, guides and tools for your work."
      actions={isAdmin ? <LinkButton to="/admin/resources" icon="pen">Manage resources</LinkButton> : undefined} />
  );

  if (error && !data) return <div className="flex flex-col gap-6">{header}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="flex flex-col gap-6">{header}<Skeleton rows={5} /></div>;

  const counts = (c: Cat) => mine.filter((r) => r.category === c).length;
  const usedCats = CATS.filter((c) => counts(c.value) > 0);

  return (
    <div className="flex flex-col gap-6">
      {header}
      {isGuest && <Notice>You’re seeing only the items shared with your guest access.</Notice>}

      {mine.length === 0 ? (
        <Card>
          <EmptyState icon="folder" title="No resources yet"
            body={isAdmin ? 'Add your handbook, policies, SOPs and tool guides so everyone can find them in one place.' : 'Your admins haven’t added any resources yet. Check back soon, or ask your mentor where to find what you need.'}
            action={isAdmin ? <LinkButton to="/admin/resources" variant="primary" icon="plus">Add resources</LinkButton> : undefined} />
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search policies, SOPs, guides…" label="Search resources" />
            {usedCats.length > 1 && (
              <div className="overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
                <Pills label="Category" value={cat} onChange={setCat} dark size="sm"
                  options={[{ value: 'all' as const, label: 'All' }, ...usedCats.map((c) => ({ value: c.value, label: c.label }))]} />
              </div>
            )}
          </div>

          {shown.length === 0 ? (
            <Card>
              <EmptyState icon="search" title="Nothing matches"
                body={term ? `No resources match “${search.trim()}”${cat !== 'all' ? ' in this category' : ''}.` : 'There’s nothing in this category yet.'}
                action={<Button onClick={() => { setSearch(''); setCat('all'); }}>Show everything</Button>} />
            </Card>
          ) : (
            CATS.map((c) => {
              const items = shown.filter((r) => r.category === c.value);
              if (!items.length) return null;
              return (
                <section key={c.value} className="flex flex-col gap-2.5" aria-labelledby={`res-${c.value}`}>
                  <h2 id={`res-${c.value}`} className="font-display text-lg font-semibold">{c.heading}</h2>
                  <Card padded={false} className="overflow-hidden">
                    <ul>
                      {items.map((r) => {
                        const k = kindOf(r);
                        const mineRole = !!r.job_role_id && r.job_role_id === me.job_role_id;
                        const inner = (
                          <>
                            <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name={k.icon} size={19} /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[15px] font-semibold leading-snug break-words">{r.title}</span>
                              <span className="block text-[13px] text-muted truncate">{k.hint}</span>
                            </span>
                            <span className="flex flex-wrap justify-end gap-1.5">
                              {r.required && <Chip tone="warn">Required</Chip>}
                              {mineRole && <Chip tone="brand">Your role</Chip>}
                              {isAdmin && r.job_role_id && !mineRole && <Chip>For {roleName(r.job_role_id)}</Chip>}
                              {isAdmin && r.guest_visible && <Chip>Guests</Chip>}
                            </span>
                            <Icon name={r.url.trim() && !r.body.trim() && !isInternal(r.url) ? 'link' : 'chevronRight'} size={18} className="text-muted" />
                          </>
                        );
                        const cls = 'flex items-center gap-3 w-full min-h-16 px-4 py-3 text-left text-ink no-underline hover:bg-bg cursor-pointer';
                        return (
                          <li key={r.id} className="border-t border-line-2 first:border-t-0">
                            {isInternal(r.url) && !r.body.trim()
                              ? <Link to={r.url.trim()} className={cls}>{inner}</Link>
                              : r.url.trim() && !r.body.trim()
                              ? <a href={hrefOf(r.url)} target="_blank" rel="noopener noreferrer" className={cls}>{inner}<span className="sr-only">(opens in a new tab)</span></a>
                              : <button type="button" onClick={() => openRes(r)} className={cls}>{inner}</button>}
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                </section>
              );
            })
          )}
        </>
      )}

      <Sheet open={!!reading} onClose={() => setReading(null)} title={reading?.title} wide
        subtitle={reading ? <>{CATS.find((c) => c.value === reading.category)?.one}{reading.required ? ' · Required reading' : ''}</> : undefined}
        footer={reading && (
          <>
            {reading.url.trim() && <a href={hrefOf(reading.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl text-[15px] font-semibold no-underline bg-card text-ink border border-[#C9CED6] hover:bg-chip"><Icon name="link" size={18} />Open link</a>}
            {reading.file_path && <Button icon="download" onClick={() => openAttachment(reading.file_path!)}>Open file</Button>}
            <Button variant="primary" onClick={() => setReading(null)}>Done</Button>
          </>
        )}>
        {reading && <div className="text-base leading-relaxed text-ink-2 whitespace-pre-wrap break-words">{reading.body}</div>}
      </Sheet>
    </div>
  );
}
