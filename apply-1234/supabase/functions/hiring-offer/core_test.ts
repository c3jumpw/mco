// deno test -A supabase/functions/hiring-offer/core_test.ts
import { handle, type App, type Deps, type Mail, type Offer, type Store } from './core.ts';
import { DEFAULT_LETTER, DEFAULT_TERMS, fillOffer, missingForSend, offerVars, sha256Hex, documentText } from './offer.ts';

const assert = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAZAAAAB4CAYAAADc36SXAAAD90lEQVR42u3dOW4bQRAF0LKhK1iB7382B9Ih5MBgIpjLDDnTtbwXGnAg9vJ7m+4IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAONEPPwGZvP/6/bX3/358/lGf0WZObBcaHOWDQ6ignaxpA2+KhCkNTphgcCVA4CUNUaAgOMISFjr3vY1PiFAxOLLUW42H9rODSg0Sdb9SHdVoGLW8tPLECnQb3GgsjNybECQIDgGCALG0RZvwqFbfNA6cjjIjQXDs8lOxwr8GfKsRVzhSifAwA8EMJEGD6trgV36HMHUW17kuCRAEiBBZMtPqHigT6o8AQYAM7giyLc116VinDD4EyKLKZVO21hUjnTqEKvs5FdvItFmrTkzFEiADynBraBz992S7VVYbFyA+HBIgS8uywt5N1rqXLeCEhwApOwKcFiQVb8nNGiId6lmlMJm+siBAFnaSZiX1r1j/Xxlm/BCycl3KetmgZWkBkqKjnBwkHd7oWDkbmfYFfZZOW3gIkHSd5MQg6RwgbhWedYfaxD1MLxJGzmOL1yrp5d8dA85VbrfK61Vl5ZEse19mICrdpsrWfaTZ7ZnZo2YjZhzr60+W/S4zEDbPSu7NSFTmWbMRZW7WEW7j5VW3xV4qultjc39Bvad8ro18dWC+2hcgCJJh5fRs2QgOJ60ECC/poLxhUXM2omzqLlsJDwEyarSrs8pZPsrFnocAMboqs/aerVy6ncDaUz73ykVb2vabPvt72W9aHCCXAlDx8z7Nqmxc18Fj7cLvfWKAfC8AHdW6UbaN9hkntLBi0iZArPPW3GhXRjlPaCkXJ63GLWEJkbpLW36l3Ce0dGjHL1nZ80iwib5nsxAntpSHQDfrECDWG5uc2BIo3v/udhJLeBQJEMslPb5qV174OJAlM5Ajr3Pg3NGv2cjactDB+Tgwpt7Ge+2G0iNuJ+XYZYBpH/9lu30Z17CP3AOxWdh3eUsZHhcklld8HBgelJo5newyWt8SEI/+jWYyZK+jRK0HpSxp1brDyQNXVHjIS3g0C5B7r7Yp6B5r9WYZOCYdlrBWTj0rF/ykDtQjSThpFTbRs40MbND2uXcLMh4EofAMpPMowhLO44MADR17qQLE2W0B4kw+CBCzEQFitAhEzTfR3RobTscAAsSljABhCSvc42/5CjADiWZvWChSAAGy+2lWQQIgQJ76AFGQAIQ9kChwJYrnMgEB4qvn8JU1wLAAyXjEV4AAAkSQCAyAKQFyVpgIDUCACBSBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwpL++6q5zuIFhpQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

function setup(fields: Partial<Offer['fields']> = {}) {
  const terms = DEFAULT_TERMS.replace(/\[[^\]]+\]/g, 'as agreed');
  const offer: Offer = {
    id: '0ff00000-0000-4000-8000-000000000001', application_id: 'app1', job_id: 'job1', status: 'draft',
    fields: {
      company: 'Brand Craftsman', company_address: '100 Main St, Austin, TX', position: 'Executive Assistant to the CEO',
      employment_type: 'Independent contractor, full-time hours', location: 'Remote', schedule: 'Monday to Friday, flexible hours',
      start_date: '2026-12-01', expires: '2026-11-26', pay_amount: '6.00', pay_currency: 'USD', pay_period: 'per hour',
      pay_schedule: 'twice a month', manager_name: 'Alex Rivera', manager_title: 'CEO', manager_email: 'alex@brand.test', manager_phone: '+1 555 0100',
      ...fields,
    },
    letter: DEFAULT_LETTER, terms, attachments: [{ path: 'job1/app1/offers/0ff00000/attachments/nda.pdf', name: 'NDA.pdf', size: 2048, type: 'application/pdf' }],
    token: null, final_letter: null, final_terms: null, doc_hash: null, expires_at: null, sent_at: null, sent_by: null, viewed_at: null, views: 0,
    signed_at: null, signer_name: null, signature: null, signer_meta: null, declined_at: null, decline_reason: null, withdrawn_at: null, pdf_path: null, events: [],
  };
  const app: App = { id: 'app1', job_id: 'job1', name: 'Mary Ruth Example', email: 'mary@example.test', stage: 'interview' };
  const files = new Map<string, Uint8Array>();
  const mails: Mail[] = [];
  const store: Store = {
    offer: async (id) => (id === offer.id ? structuredClone(offer) : null),
    offerByToken: async (t) => (t === offer.token ? structuredClone(offer) : null),
    patch: async (_id, p, from) => { if (from && !from.includes(offer.status)) return null; Object.assign(offer, structuredClone(p)); return structuredClone(offer); },
    application: async () => structuredClone(app),
    setStage: async (_a, stage) => { app.stage = stage; },
    isStaff: async (uid) => uid === 'admin',
    upload: async (p, b) => { if (files.has(p)) throw new Error('exists'); files.set(p, b); },
    download: async (p) => files.get(p) || null,
    signedUrl: async (p) => `https://files.test/${p}`,
  };
  let clock = new Date('2026-11-20T15:00:00Z');
  const deps: Deps = {
    store, site: 'https://www.apply1234.com', now: () => clock,
    user: async (jwt) => (jwt === 'admin-jwt' ? { id: 'admin', email: 'boss@brand.test' } : jwt === 'other-jwt' ? { id: 'other', email: 'x@y.test' } : null),
    send: async (m) => { mails.push(m); return { ok: true }; },
  };
  const call = (body: Record<string, unknown>, opts: { jwt?: string; ip?: string } = {}) => handle(new Request('https://f.test', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `${opts.ip || '203.0.113.7'}, 10.0.0.1`, 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1', ...(opts.jwt ? { authorization: `Bearer ${opts.jwt}` } : {}) },
  }), deps).then(async (r) => ({ status: r.status, body: await r.json() }));
  return { offer, app, files, mails, call, setClock: (d: string) => { clock = new Date(d); } };
}

Deno.test('placeholders fill and empty lines drop', () => {
  const v = offerVars({ company: 'Acme', manager_name: 'Al', manager_email: 'al@a.test' }, { name: 'Mary Ruth' });
  const out = fillOffer('Hi {first}\n- **Pay:** {pay}\nCall {manager_contact}', v);
  assert(out === 'Hi Mary\nCall al@a.test', `got: ${out}`);
  assert(missingForSend({}, 'x', '', '2026-11-20').length >= 9, 'missing fields reported');
  assert(missingForSend(setup().offer.fields, 'Dear [name]', '', '2026-11-20').some((m) => m.includes('[name]')), 'placeholders block sending');
});

Deno.test('only the hiring team can send', async () => {
  const t = setup();
  assert((await t.call({ action: 'send', offer_id: t.offer.id })).status === 401, 'needs sign-in');
  assert((await t.call({ action: 'send', offer_id: t.offer.id }, { jwt: 'other-jwt' })).status === 403, 'other users refused');
});

Deno.test('sending refuses an offer with missing details', async () => {
  const t = setup({ pay_amount: '' });
  const r = await t.call({ action: 'send', offer_id: t.offer.id }, { jwt: 'admin-jwt' });
  assert(r.status === 400 && r.body.missing.includes('the pay'), JSON.stringify(r.body));
  assert(t.offer.status === 'draft' && t.mails.length === 0, 'nothing sent');
});

Deno.test('full journey: send, view, sign, signed PDF and emails', async () => {
  const t = setup();
  const sent = await t.call({ action: 'send', offer_id: t.offer.id }, { jwt: 'admin-jwt', ip: '198.51.100.20' });
  assert(sent.body.ok && sent.body.link.startsWith('https://www.apply1234.com/offer/'), JSON.stringify(sent.body));
  assert(t.offer.status === 'sent' && t.app.stage === 'offer', 'status and stage after send');
  assert(t.offer.final_letter!.includes('Dear Mary,') && t.offer.final_letter!.includes('USD 6.00 per hour') && !t.offer.final_letter!.includes('{'), 'letter filled');
  assert(t.offer.doc_hash === await sha256Hex(documentText(t.offer.final_letter!, t.offer.final_terms!, t.offer.attachments)), 'fingerprint matches');
  assert(t.offer.events[0].ip === '198.51.100.20' && t.offer.events[0].by === 'boss@brand.test', 'send recorded with IP');
  const toCandidate = t.mails.find((m) => m.to[0] === 'mary@example.test')!;
  assert(toCandidate.from_name === 'Brand Craftsman' && toCandidate.reply_to === 'alex@brand.test' && toCandidate.html.includes(t.offer.token!), 'candidate email');
  assert(t.mails.some((m) => m.to.includes('alex@brand.test') && m.subject.startsWith('Offer sent')), 'team copy');

  const token = t.offer.token!;
  const view = await t.call({ action: 'view', token });
  assert(view.body.ok && view.body.offer.letter.includes('Dear Mary') && !('token' in view.body.offer), 'view returns the letter, not the token');
  assert(t.offer.status === 'viewed' && t.offer.events.some((e) => e.type === 'viewed' && e.ip === '203.0.113.7'), 'view logged with IP');
  const file = await t.call({ action: 'file', token, file: 0 });
  assert(file.body.url.includes('nda.pdf'), 'attachment link');
  assert((await t.call({ action: 'file', token, file: 'pdf' })).status === 404, 'no PDF before signing');

  assert((await t.call({ action: 'sign', token, name: 'Mary Ruth Example', signature: { kind: 'drawn', png: 'data:image/png;base64,' + btoa(String.fromCharCode(...PNG)) }, consent: false, read: true })).body.error === 'consent', 'consent required');
  const signed = await t.call({ action: 'sign', token, name: 'Mary Ruth Example', signature: { kind: 'drawn', png: 'data:image/png;base64,' + btoa(String.fromCharCode(...PNG)) }, consent: true, read: true, tz: 'Asia/Manila' });
  assert(signed.body.ok && signed.body.pdf, JSON.stringify(signed.body));
  assert(t.offer.status === 'signed' && t.app.stage === 'hired' && t.offer.signer_meta?.ip === '203.0.113.7' && t.offer.signer_meta?.tz === 'Asia/Manila', 'signature recorded');
  assert(t.files.has(t.offer.signature!.path!) && t.files.has(t.offer.pdf_path!), 'signature and PDF stored');
  const pdf = t.files.get(t.offer.pdf_path!)!;
  assert(new TextDecoder().decode(pdf.slice(0, 5)) === '%PDF-', 'a PDF');
  await Deno.writeFile('/tmp/signed-offer-test.pdf', pdf);
  const copies = t.mails.filter((m) => m.attachments?.length);
  assert(copies.some((m) => m.to[0] === 'mary@example.test') && copies.some((m) => m.to.includes('alex@brand.test')), 'signed PDF emailed to both sides');
  assert((await t.call({ action: 'sign', token, name: 'X Y', signature: { kind: 'typed' }, consent: true, read: true })).status === 409, 'cannot sign twice');
  assert((await t.call({ action: 'file', token, file: 'pdf' })).body.url.includes('signed-offer'), 'signed PDF available to the candidate');
  const types = t.offer.events.map((e) => e.type);
  for (const k of ['sent', 'emailed', 'viewed', 'file', 'signed', 'pdf', 'copies']) assert(types.includes(k), `event ${k} logged (${types.join(',')})`);
});

Deno.test('typed signature, expiry, decline and withdraw', async () => {
  const t = setup();
  await t.call({ action: 'send', offer_id: t.offer.id }, { jwt: 'admin-jwt' });
  const token = t.offer.token!;
  t.setClock('2026-11-27T12:00:00Z');
  assert((await t.call({ action: 'sign', token, name: 'Mary', signature: { kind: 'typed', text: 'Mary' }, consent: true, read: true })).body.error === 'expired', 'expired offers cannot be signed');
  t.setClock('2026-11-21T12:00:00Z');
  const typed = await t.call({ action: 'sign', token, name: 'Mary Ruth Example', signature: { kind: 'typed', text: 'Mary Ruth Example' }, consent: true, read: true });
  assert(typed.body.ok && t.offer.signature?.kind === 'typed', 'typed signature works');
  await Deno.writeFile('/tmp/signed-offer-typed.pdf', t.files.get(t.offer.pdf_path!)!);

  const d = setup();
  await d.call({ action: 'send', offer_id: d.offer.id }, { jwt: 'admin-jwt' });
  const dec = await d.call({ action: 'decline', token: d.offer.token, reason: 'Accepted another role' });
  assert(dec.body.ok && d.offer.status === 'declined' && d.mails.some((m) => m.subject.includes('declined')), 'decline recorded and team told');

  const w = setup();
  await w.call({ action: 'send', offer_id: w.offer.id }, { jwt: 'admin-jwt' });
  assert((await w.call({ action: 'withdraw', offer_id: w.offer.id }, { jwt: 'admin-jwt' })).body.ok && w.offer.status === 'withdrawn', 'withdraw');
  assert((await w.call({ action: 'sign', token: w.offer.token, name: 'Mary', signature: { kind: 'typed' }, consent: true, read: true })).status === 409, 'withdrawn cannot be signed');
  assert((await w.call({ action: 'view', token: 'x'.repeat(32) })).status === 404, 'unknown link');
});
