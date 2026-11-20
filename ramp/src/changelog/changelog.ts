// RAMP's change log: every release, newest first, from changelog.json.
// The Admin › Change log page lists it; TourHost uses it to show each person, once, the changes that apply to them.
// When you change RAMP, add an entry in the same commit (see CLAUDE.md). npm run guide:check validates the file.
import data from './changelog.json';
import type { TourCtx, TourRole, TourSlide } from '../guide/tours';

export type ChangeType = 'new' | 'improved' | 'fixed';
/** Who a change affects. everyone = anyone who signs in, clients included. */
export type Who = 'everyone' | TourRole;
/** Features a change needs before it means anything to someone. */
export type Requirement = 'agency' | 'work' | 'coaching' | 'tasks' | 'chat' | 'linkedClient';

export interface Change { type: ChangeType; who: Who[]; requires?: Requirement[]; text: string; link?: string; guide?: string }
export interface EntrySlide extends Omit<TourSlide, 'when'> { who?: Who[]; requires?: Requirement[] }
export interface Entry {
  id: string;
  version: string;
  date: string;
  title: string;
  summary: string;
  /** Shown once as What's new to the people it applies to. */
  announce: boolean;
  changes: Change[];
  slides?: EntrySlide[];
  commits?: string[];
  migrations?: string[];
}

export const ENTRIES: Entry[] = (data as { entries: Entry[] }).entries;
export const LATEST: Entry = ENTRIES[0]!;
export const CURRENT_VERSION = LATEST.version;

export const TYPE_META: Record<ChangeType, { label: string; icon: string; tone: 'brand' | 'good' | 'warn' }> = {
  new: { label: 'New', icon: 'sparkle', tone: 'brand' },
  improved: { label: 'Better', icon: 'star', tone: 'good' },
  fixed: { label: 'Fixed', icon: 'check', tone: 'warn' },
};

export const WHO_LABEL: Record<Who, string> = {
  everyone: 'Everyone', member: 'Team members', guest: 'Guests', coach: 'Mentors and leads',
  admin: 'Admins', client: 'Clients', platform: 'Platform admins',
};

export const REQ_LABEL: Record<Requirement, string> = {
  agency: 'Agency on', work: 'Placed team members', coaching: 'Coaches', tasks: 'Tasks on', chat: 'Chat on', linkedClient: 'Linked clients',
};

/** Release ids used before the change log existed, mapped to the entry that covered them. */
const LEGACY: Record<string, string> = { '2026-11-agency-workspaces': '2026-11-18-tours' };

export function entryIndex(id: string | null | undefined): number {
  if (!id) return -1;
  return ENTRIES.findIndex((e) => e.id === (LEGACY[id] || id));
}

/** Which audiences a person counts as. Admins also mentor and train, so they count as mentors and team members too. */
export function audienceOf(c: TourCtx): Set<Who> {
  const s = new Set<Who>(['everyone']);
  if (c.isClient) s.add('client');
  else if (c.isAdmin) { s.add('admin'); s.add('coach'); s.add('member'); }
  else if (c.rank <= 4) { s.add('coach'); s.add('member'); }
  else if (c.rank === 7) s.add('guest');
  else s.add('member');
  if (c.isSuper) s.add('platform');
  return s;
}

const REQ: Record<Requirement, (c: TourCtx) => boolean> = {
  agency: (c) => c.agencyOn, work: (c) => c.work, coaching: (c) => c.coaching,
  tasks: (c) => c.tasks, chat: (c) => c.chat, linkedClient: (c) => c.linkedClient,
};

/** Does a change or slide apply to this person? */
export function appliesTo(item: { who?: Who[]; requires?: Requirement[] }, c: TourCtx, aud: Set<Who> = audienceOf(c)): boolean {
  const who = item.who?.length ? item.who : (['everyone'] as Who[]);
  return who.some((w) => aud.has(w)) && (item.requires || []).every((r) => REQ[r](c));
}

/**
 * Is a change shown in the Admin › Change log for this admin? Platform admins see everything. Other admins see
 * everything that can affect their workspace: platform-only changes are left out, and so are changes for features
 * their workspace has switched off. Person-level conditions (placed, coaching) don't hide anything here.
 */
export function inAdminLog(item: { who?: Who[]; requires?: Requirement[] }, c: TourCtx): boolean {
  if (c.isSuper) return true;
  const who = item.who?.length ? item.who : (['everyone'] as Who[]);
  if (who.every((w) => w === 'platform')) return false;
  return (item.requires || []).every((r) => (r === 'agency' || r === 'tasks' || r === 'chat' ? REQ[r](c) : true));
}

/** Entries released after the one a person last saw, newest first. Unknown or missing ids mean "nothing new". */
export function newerThan(lastSeen: string | null | undefined): Entry[] {
  const i = entryIndex(lastSeen);
  return i > 0 ? ENTRIES.slice(0, i) : [];
}

export function dateText(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m || 1) - 1, d || 1).toLocaleDateString('en-US', opts);
}

export function toTourSlide(s: EntrySlide): TourSlide {
  return { id: s.id, title: s.title, text: s.text, image: s.image, device: s.device, link: s.link };
}

// ───────── exports for the Change log page ─────────

export function changelogRows(entries: Entry[]): (string | number)[][] {
  const rows: (string | number)[][] = [['Version', 'Date', 'Release', 'Type', 'Change', 'Who it affects', 'Needs', 'Commits', 'Database migrations']];
  for (const e of entries) for (const ch of e.changes) {
    rows.push([e.version, e.date, e.title, TYPE_META[ch.type].label, ch.text, ch.who.map((w) => WHO_LABEL[w]).join('; '),
      (ch.requires || []).map((r) => REQ_LABEL[r]).join('; '), (e.commits || []).join(' '), (e.migrations || []).join(' ')]);
  }
  return rows;
}
