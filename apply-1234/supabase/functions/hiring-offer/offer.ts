// Offer letters: fields, default wording and how {placeholders} are filled.
// Shared by the hiring-offer function (which freezes what is sent) and the app (which previews it),
// so a preview always matches what the candidate signs. No imports: it runs in Deno and the browser.

export interface OfferFields {
  company?: string;
  company_address?: string;
  position?: string;
  employment_type?: string;
  location?: string;
  schedule?: string;
  start_date?: string;      // YYYY-MM-DD
  expires?: string;         // YYYY-MM-DD, the last day to sign
  pay_amount?: string;
  pay_currency?: string;
  pay_period?: string;      // per hour, per month…
  pay_schedule?: string;    // how often they're paid
  benefits?: string;
  manager_name?: string;
  manager_title?: string;
  manager_email?: string;
  manager_phone?: string;
}

export interface OfferEvent { at: string; type: string; by?: string; ip?: string; ua?: string; note?: string }
export interface OfferFile { path: string; name: string; size?: number; type?: string }

export const EMPLOYMENT_TYPES = [
  'Full-time employee', 'Part-time employee', 'Independent contractor, full-time hours',
  'Independent contractor, part-time hours', 'Fixed-term contract',
];
export const PAY_PERIODS = ['per hour', 'per week', 'per month', 'per year', 'per project'];
export const CURRENCIES = ['USD', 'PHP', 'CAD', 'EUR', 'GBP', 'AUD', 'INR', 'MXN'];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "2026-12-01" → "Tuesday, December 1, 2026" (the same everywhere, whatever the time zone). */
export function fmtDay(d?: string | null): string {
  const m = (d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAYS[date.getUTCDay()]}, ${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}

/** An instant as "December 1, 2026, 14:05 UTC". */
export function fmtStamp(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

export const payText = (f: OfferFields) =>
  [f.pay_currency, f.pay_amount?.trim(), f.pay_period].filter(Boolean).join(' ').trim();

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Values for every {placeholder}. Empty values make their line disappear. */
export function offerVars(f: OfferFields, candidate: { name: string; email?: string }, sentOn?: string): Record<string, string> {
  const t = (s?: string) => (s || '').trim();
  return {
    first: firstName(candidate.name),
    candidate_name: t(candidate.name),
    company: t(f.company),
    company_address: t(f.company_address),
    position: t(f.position),
    employment_type: t(f.employment_type),
    location: t(f.location),
    schedule: t(f.schedule),
    start_date: fmtDay(f.start_date),
    expires: fmtDay(f.expires),
    pay: payText(f),
    pay_schedule: t(f.pay_schedule),
    benefits: t(f.benefits),
    manager_name: t(f.manager_name),
    manager_title: t(f.manager_title),
    manager_email: t(f.manager_email),
    manager_phone: t(f.manager_phone),
    manager_contact: [t(f.manager_email), t(f.manager_phone)].filter(Boolean).join(' or '),
    reports_to: [t(f.manager_name), t(f.manager_title)].filter(Boolean).join(', '),
    signoff_title: [t(f.manager_title), t(f.company)].filter(Boolean).join(', '),
    today: fmtDay(sentOn || new Date().toISOString().slice(0, 10)),
  };
}

/** Fills {placeholders}. A line whose placeholder has no value is left out. */
export function fillOffer(text: string, vars: Record<string, string>): string {
  return (text || '').replace(/\r\n/g, '\n').split('\n').filter((line) => {
    const keys = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => k in vars);
    return !keys.some((k) => !vars[k]);
  }).map((line) => line.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** [Square-bracket notes] left for the sender to fill in (Markdown links don't count). */
export const PLACEHOLDER_RE = /\[[^\]\n]{3,}\](?!\()/g;
export const placeholdersIn = (text: string) => [...new Set((text || '').match(PLACEHOLDER_RE) || [])];

/** Everything that must be filled in before an offer can be sent. */
export function missingForSend(f: OfferFields, letter: string, terms: string, today = new Date().toISOString().slice(0, 10)): string[] {
  const out: string[] = [];
  const need: [keyof OfferFields, string][] = [
    ['company', 'the company name'], ['position', 'the position'], ['employment_type', 'the type of engagement'],
    ['start_date', 'a start date'], ['pay_amount', 'the pay'], ['pay_currency', 'the pay currency'], ['pay_period', 'how pay is counted (per hour, per month…)'],
    ['manager_name', 'the hiring manager’s name'], ['manager_email', 'the hiring manager’s email'], ['expires', 'the date the offer expires'],
  ];
  for (const [k, label] of need) if (!(f[k] || '').trim()) out.push(label);
  if (f.manager_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.manager_email.trim())) out.push('a valid hiring manager email');
  if (f.expires && f.expires < today) out.push('an expiry date that hasn’t passed');
  if (!letter.trim()) out.push('the letter');
  const left = [...placeholdersIn(letter), ...placeholdersIn(terms)];
  if (left.length) out.push(`these notes in the letter or terms: ${left.slice(0, 4).join(' ')}${left.length > 4 ? '…' : ''}`);
  return out;
}

/** The exact text the document fingerprint (SHA-256) is taken from. */
export function documentText(letter: string, terms: string, attachments: OfferFile[]): string {
  return [letter.trim(), terms.trim() ? `# Terms and conditions\n\n${terms.trim()}` : '',
    attachments.length ? `# Attachments\n\n${attachments.map((a) => `- ${a.name}${a.size ? ` (${a.size} bytes)` : ''}`).join('\n')}` : '']
    .filter(Boolean).join('\n\n');
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** "Chrome on Windows" from a user-agent string. */
export function uaLabel(ua = ''): string {
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} on ${os}` : b;
}

export const EVENT_LABELS: Record<string, string> = {
  sent: 'Offer sent', emailed: 'Email sent to the candidate', email_failed: 'Email could not be sent', reminder: 'Reminder sent',
  viewed: 'Opened by the candidate', file: 'Attachment opened', signed: 'Signed by the candidate', declined: 'Declined by the candidate',
  withdrawn: 'Withdrawn', pdf: 'Signed PDF created', copies: 'Signed copies emailed',
};

export const DEFAULT_LETTER = `Dear {first},

We are delighted to offer you the position of **{position}** with **{company}**. Everyone who met you was impressed, and we're excited about what you'll bring to the team.

## The details

- **Position:** {position}
- **Engagement:** {employment_type}
- **Start date:** {start_date}
- **Pay:** {pay}
- **Pay schedule:** {pay_schedule}
- **Schedule:** {schedule}
- **Location:** {location}
- **Reports to:** {reports_to}
- **Benefits:** {benefits}

This offer is subject to the terms and conditions below. To accept, please review them and sign by **{expires}**.

If you have any questions, contact {manager_name} at {manager_contact}.

We look forward to working with you.

{manager_name}
{signoff_title}`;

export const DEFAULT_TERMS = `1. **Engagement.** This role is offered on this basis: {employment_type}. [Employee: your employment is at will, so either you or {company} may end it at any time, subject to the notice below. Contractor: you are an independent contractor responsible for your own taxes, and this offer does not create an employment relationship. Keep the one that applies.]
2. **Trial period.** The first [90] days are a trial period, during which either side may end the arrangement with [7] days' written notice.
3. **Pay.** You will be paid {pay}, {pay_schedule}, by [payment method].
4. **Hours.** {schedule}. [Core hours, time zone and how quickly you're expected to respond.]
5. **Confidentiality.** You will keep confidential any non-public information about {company}, its clients and its business, during and after your time with us.
6. **Work product.** Work you create for {company} in this role belongs to {company}, and you will sign any documents needed to confirm this.
7. **Equipment and accounts.** [Who provides the computer, software and accounts. Company accounts and data are returned when the arrangement ends.]
8. **Ending the arrangement.** After the trial period, either side may end this arrangement with [14] days' written notice.
9. **Conditions.** This offer is conditional on [reference checks, proof of identity or right to work; delete if none].
10. **Entire agreement.** This letter and these terms are the whole agreement about this offer and replace anything discussed before. They are governed by the laws of [state or country].`;
