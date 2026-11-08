import type { Application, HEvent } from './types';

export interface Behavior {
  firstSeen?: string;
  firstArrival?: string;
  instructionsView?: string;
  instructionsDone?: string;
  formStart?: string;
  submitted?: string;
  wrongAttempts: number;
  wrongPaths: { path: string; at: string }[];
  arrivals: number;
  instructionsMs?: number;
  arrivalToSubmitMs?: number;
  formMs?: number;
  firstSeenToArrivalMs?: number;
  tabSwitches: number;
  invalidLinks: number;
  submitErrors: number;
  loomClick: boolean;
  activeSeconds?: number;
  tz?: string;
  device?: string;
  referrer?: string;
}

const t = (s?: string) => (s ? new Date(s).getTime() : undefined);
const diff = (a?: string, b?: string) => (a && b ? t(b)! - t(a)! : undefined);

export function deviceLabel(ua?: string): string | undefined {
  if (!ua) return undefined;
  const mobile = /iPhone|Android.+Mobile|Mobile Safari/i.test(ua);
  const tablet = /iPad|Tablet/i.test(ua);
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) && !mobile && !tablet ? 'macOS' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
  return `${mobile ? 'Phone' : tablet ? 'Tablet' : 'Computer'} · ${browser}${os ? ' on ' + os : ''}`;
}

export function behavior(app: Application, events: HEvent[]): Behavior {
  const ev = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const first = (type: string) => ev.find((e) => e.type === type)?.created_at;
  const count = (type: string) => ev.filter((e) => e.type === type).length;
  const m = app.metrics as Record<string, any>;
  const firstArrival = first('arrival');
  const submitted = first('submitted') || app.submitted_at;
  const b: Behavior = {
    firstSeen: ev[0]?.created_at,
    firstArrival,
    instructionsView: first('instructions_view'),
    instructionsDone: first('instructions_done'),
    formStart: first('form_start'),
    submitted,
    wrongAttempts: count('wrong_url'),
    wrongPaths: ev.filter((e) => e.type === 'wrong_url').map((e) => ({ path: e.path, at: e.created_at })),
    arrivals: count('arrival'),
    tabSwitches: count('tab_hidden'),
    invalidLinks: count('link_invalid'),
    submitErrors: count('submit_error'),
    loomClick: count('loom_link_click') > 0,
    activeSeconds: typeof m?.active_seconds === 'number' ? m.active_seconds : undefined,
    tz: m?.tz,
    device: deviceLabel(m?.ua),
    referrer: (ev.find((e) => e.type === 'arrival')?.meta as any)?.ref || undefined,
  };
  b.instructionsMs = diff(b.instructionsView, b.instructionsDone);
  b.arrivalToSubmitMs = diff(firstArrival, submitted);
  b.formMs = diff(b.formStart, submitted);
  b.firstSeenToArrivalMs = b.wrongAttempts ? diff(b.firstSeen, firstArrival) : undefined;
  return b;
}

export const EVENT_LABELS: Record<string, string> = {
  root_visit: 'Opened the bare domain',
  wrong_url: 'Tried a wrong link',
  arrival: 'Opened the activity page',
  arrival_closed: 'Opened the page after it closed',
  instructions_view: 'Read the setup instructions',
  instructions_done: 'Confirmed Loom setup',
  loom_link_click: 'Clicked the Loom download link',
  form_start: 'Started answering',
  question_focus: 'Worked on a question',
  link_added: 'Added a video link',
  link_invalid: 'Pasted a link that failed the check',
  transcript_added: 'Added a transcript',
  draft_restored: 'Came back to a saved draft',
  tab_hidden: 'Switched away from the page',
  tab_return: 'Came back to the page',
  submit_attempt: 'Pressed submit',
  submit_error: 'Submission was rejected',
  submitted: 'Submitted',
  posting_view: 'Viewed the shared posting',
  posting_copy: 'Copied from the posting',
};
