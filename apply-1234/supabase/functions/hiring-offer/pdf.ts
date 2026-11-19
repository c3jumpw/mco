// Builds the signed offer as a PDF: the letter, the terms, both signature blocks, and a final
// signature certificate page with the document fingerprint and every recorded event (time, IP, browser).
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import { EVENT_LABELS, type OfferEvent, type OfferFile, fmtStamp, uaLabel } from './offer.ts';

export interface PdfInput {
  offerId: string;
  company: string;
  companyAddress?: string;
  position: string;
  candidateName: string;
  candidateEmail: string;
  letter: string;
  terms: string;
  attachments: OfferFile[];
  manager: { name: string; title?: string; email: string; phone?: string };
  sentAt: string;
  sentBy: string;
  signerName: string;
  signedAt: string;
  signature: { kind: 'drawn' | 'typed'; png?: Uint8Array; text?: string };
  signerMeta: { ip?: string; ua?: string; tz?: string };
  docHash: string;
  events: OfferEvent[];
}

const INK = rgb(0.086, 0.082, 0.102), MUTED = rgb(0.43, 0.42, 0.45), LINE = rgb(0.886, 0.871, 0.831), ACCENT = rgb(1, 0.353, 0.122);
const W = 612, H = 792, M = 64, CW = W - M * 2;
const FALLBACK: Record<string, string> = { '₱': 'PHP ', '₹': 'INR ', '→': '->', '✓': 'v', '✕': 'x', ' ': ' ' };

interface Fonts { reg: PDFFont; bold: PDFFont; ital: PDFFont; sig: PDFFont; mono: PDFFont }
interface Run { text: string; bold?: boolean }

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(public doc: PDFDocument, public f: Fonts) { this.newPage(); }
  newPage() { this.page = this.doc.addPage([W, H]); this.y = H - M; }
  ensure(h: number) { if (this.y - h < M + 24) this.newPage(); }
  /** Characters the built-in fonts can't draw become close equivalents. */
  safe(s: string, font: PDFFont): string {
    let out = '';
    for (const ch of s) {
      if (FALLBACK[ch] !== undefined) { out += FALLBACK[ch]; continue; }
      try { font.encodeText(ch); out += ch; } catch { out += '?'; }
    }
    return out;
  }
  text(s: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
    this.page.drawText(this.safe(s, font), { x, y, size, font, color });
  }
  width(s: string, size: number, font: PDFFont) { return font.widthOfTextAtSize(this.safe(s, font), size); }
  /** Lays out runs of regular and bold text, wrapping words to the width. */
  runs(runs: Run[], { x = M, width = CW, size = 10.5, leading = 15.5, color = INK } = {}) {
    const words: { w: string; bold: boolean; space: boolean }[] = [];
    for (const r of runs) {
      const parts = r.text.split(/(\s+)/);
      for (const p of parts) {
        if (!p) continue;
        if (/^\s+$/.test(p)) { if (words.length) words[words.length - 1].space = true; continue; }
        words.push({ w: p, bold: !!r.bold, space: false });
      }
    }
    const lines: typeof words[] = [];
    let line: typeof words = [], lw = 0;
    for (const word of words) {
      const font = word.bold ? this.f.bold : this.f.reg;
      const ww = this.width(word.w, size, font), sp = this.width(' ', size, this.f.reg);
      const add = (line.length && line[line.length - 1].space ? sp : 0) + ww;
      if (line.length && lw + add > width) { lines.push(line); line = []; lw = 0; }
      lw += (line.length && line[line.length - 1].space ? sp : 0) + ww;
      line.push(word);
    }
    if (line.length) lines.push(line);
    if (!lines.length) lines.push([]);
    for (const l of lines) {
      this.ensure(leading);
      let cx = x;
      for (const [i, word] of l.entries()) {
        const font = word.bold ? this.f.bold : this.f.reg;
        this.text(word.w, cx, this.y - size, size, font, color);
        cx += this.width(word.w, size, font) + (word.space && i < l.length - 1 ? this.width(' ', size, this.f.reg) : 0);
      }
      this.y -= leading;
    }
  }
  gap(h: number) { this.y -= h; }
  rule(color = LINE) { this.ensure(8); this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.7, color }); this.y -= 10; }
}

/** **bold**, [links](url) → link text, `code` and _italics_ → plain. */
function inline(s: string): Run[] {
  const plain = s.replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)\s]+\)/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/(^|\s)[_*]([^_*]+)[_*]/g, '$1$2');
  return plain.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((p) => (p.startsWith('**') && p.endsWith('**') ? { text: p.slice(2, -2), bold: true } : { text: p }));
}

/** The Markdown the app uses: headings, bullet and numbered lists, paragraphs with line breaks. */
function markdown(w: Writer, md: string) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let prevBlank = true;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { if (!prevBlank) w.gap(6); prevBlank = true; continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (h) {
      w.gap(prevBlank ? 4 : 10);
      w.ensure(30);
      const size = h[1].length === 1 ? 15 : h[1].length === 2 ? 12.5 : 11;
      w.runs([{ text: h[2].replace(/\*\*/g, ''), bold: true }], { size, leading: size + 6 });
      w.gap(2);
    } else if (ul || ol) {
      const marker = ul ? '•' : `${ol![1]}.`;
      w.ensure(16);
      w.text(marker, M + 4, w.y - 10.5, 10.5, ul ? w.f.reg : w.f.bold, ul ? ACCENT : INK);
      w.runs(inline(ul ? ul[1] : ol![2]), { x: M + 22, width: CW - 22 });
      w.gap(2);
    } else {
      w.runs(inline(line));
    }
    prevBlank = false;
  }
}

export async function buildOfferPdf(i: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Offer for ${i.candidateName}: ${i.position}`);
  doc.setAuthor(i.company);
  doc.setSubject('Signed offer letter');
  doc.setCreator('apply1234');
  doc.setProducer('apply1234');
  doc.setCreationDate(new Date(i.signedAt));
  const f: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    ital: await doc.embedFont(StandardFonts.HelveticaOblique),
    sig: await doc.embedFont(StandardFonts.TimesRomanItalic),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const w = new Writer(doc, f);

  // Letterhead
  w.runs([{ text: i.company, bold: true }], { size: 17, leading: 22 });
  if (i.companyAddress) w.runs([{ text: i.companyAddress }], { size: 9, leading: 13, color: MUTED });
  w.gap(4);
  w.page.drawRectangle({ x: M, y: w.y, width: 36, height: 2.5, color: ACCENT });
  w.gap(18);
  w.runs([{ text: 'Offer of employment', bold: true }, { text: `  ·  ${i.position}` }], { size: 11, color: MUTED });
  w.runs([{ text: `To ${i.candidateName} (${i.candidateEmail})  ·  Sent ${fmtStamp(i.sentAt)}` }], { size: 9, leading: 13, color: MUTED });
  w.gap(14);

  markdown(w, i.letter);
  if (i.terms.trim()) {
    w.gap(14);
    markdown(w, `## Terms and conditions\n\n${i.terms}`);
  }
  if (i.attachments.length) {
    w.gap(10);
    markdown(w, `## Attachments\n\n${i.attachments.map((a) => `- ${a.name}`).join('\n')}`);
    w.runs([{ text: 'Attachments were provided with this offer and form part of it.' }], { size: 9, leading: 13, color: MUTED });
  }

  // Signatures
  w.gap(16);
  w.ensure(170);
  w.runs([{ text: 'Signatures', bold: true }], { size: 12.5, leading: 18 });
  w.rule();
  const colW = (CW - 28) / 2, top = w.y;
  const left = (s: string, dy: number, size = 9.5, font = f.reg, color = INK) => w.text(s, M, top - dy, size, font, color);
  const right = (s: string, dy: number, size = 9.5, font = f.reg, color = INK) => w.text(s, M + colW + 28, top - dy, size, font, color);
  left('OFFERED BY', 10, 7.5, f.bold, MUTED);
  left(i.company, 26, 10.5, f.bold);
  left(i.manager.name + (i.manager.title ? `, ${i.manager.title}` : ''), 41);
  left(i.manager.email + (i.manager.phone ? `  ·  ${i.manager.phone}` : ''), 55, 9, f.reg, MUTED);
  left(`Sent electronically ${fmtStamp(i.sentAt)}`, 75, 8.5, f.reg, MUTED);
  left(`by ${i.sentBy}`, 87, 8.5, f.reg, MUTED);

  right('ACCEPTED BY', 10, 7.5, f.bold, MUTED);
  const sx = M + colW + 28;
  if (i.signature.kind === 'drawn' && i.signature.png) {
    const img = await doc.embedPng(i.signature.png);
    const scale = Math.min(colW / img.width, 54 / img.height);
    w.page.drawImage(img, { x: sx, y: top - 74, width: img.width * scale, height: img.height * scale });
  } else {
    w.text(i.signature.text || i.signerName, sx, top - 62, 24, f.sig);
  }
  w.page.drawLine({ start: { x: sx, y: top - 78 }, end: { x: sx + colW, y: top - 78 }, thickness: 0.7, color: INK });
  right(i.signerName, 92, 10.5, f.bold);
  right(`Signed electronically ${fmtStamp(i.signedAt)}`, 107, 8.5, f.reg, MUTED);
  right(`IP ${i.signerMeta.ip || 'not recorded'}`, 119, 8.5, f.reg, MUTED);
  w.y = top - 140;

  // Signature certificate
  w.newPage();
  w.runs([{ text: 'Signature certificate', bold: true }], { size: 17, leading: 22 });
  w.runs([{ text: 'How and when this offer was sent, opened and signed. The fingerprint is calculated from the exact text of the letter, the terms and the list of attachments; if a single word changes, the fingerprint changes.' }], { size: 9, leading: 13, color: MUTED });
  w.gap(10);
  const kv = (k: string, v: string, mono = false) => {
    w.ensure(16);
    w.text(k, M, w.y - 9.5, 8.5, f.bold, MUTED);
    const x = M + 120;
    if (mono) {
      for (let p = 0; p < v.length; p += 40) { w.ensure(13); w.text(v.slice(p, p + 40), x, w.y - 9.5, 9, f.mono); w.y -= 13; }
      w.y -= 2;
    } else {
      w.runs([{ text: v }], { x, width: CW - 120, size: 9.5, leading: 14 });
    }
  };
  kv('Document', `Offer letter: ${i.position}, ${i.company}`);
  kv('Offer ID', i.offerId);
  kv('Fingerprint (SHA-256)', i.docHash, true);
  kv('Status', `Signed ${fmtStamp(i.signedAt)}`);
  w.gap(6);
  w.rule();
  kv('Offered by', `${i.company}. Sent by ${i.sentBy}; contact ${i.manager.name}, ${i.manager.email}`);
  kv('Signer', `${i.signerName} (${i.candidateEmail})`);
  kv('Signature', i.signature.kind === 'drawn' ? 'Drawn by hand on screen' : `Typed: "${i.signature.text || i.signerName}"`);
  kv('Signer IP address', i.signerMeta.ip || 'not recorded');
  kv('Signer device', `${uaLabel(i.signerMeta.ua)}${i.signerMeta.tz ? `, time zone ${i.signerMeta.tz}` : ''}`);
  kv('Consent', 'Agreed to sign electronically, and confirmed they had read the offer, the terms and the attachments.');
  kv('Access', 'Opened through a private link emailed to the signer’s address.');
  w.gap(6);
  w.rule();
  w.runs([{ text: 'Event log', bold: true }], { size: 11, leading: 16 });
  w.gap(2);
  const cols = [M, M + 128, M + 258];
  const head = (t: string, x: number) => w.text(t, x, w.y - 8.5, 7.5, f.bold, MUTED);
  w.ensure(14); head('TIME (UTC)', cols[0]); head('EVENT', cols[1]); head('DETAILS', cols[2]); w.y -= 14;
  for (const e of i.events) {
    const details = [e.by, e.ip ? `IP ${e.ip}` : '', e.ua ? uaLabel(e.ua) : '', e.note].filter(Boolean).join(' · ');
    w.ensure(28);
    const y0 = w.y;
    w.text(fmtStamp(e.at).replace(' UTC', ''), cols[0], y0 - 9, 8.5, f.reg);
    w.text(EVENT_LABELS[e.type] || e.type, cols[1], y0 - 9, 8.5, f.reg);
    w.runs([{ text: details || '-' }], { x: cols[2], width: W - M - cols[2], size: 8.5, leading: 12, color: MUTED });
    w.y = Math.min(w.y, y0 - 13) - 3;
  }
  if (i.attachments.length) {
    w.gap(6);
    w.rule();
    w.runs([{ text: 'Attachments', bold: true }], { size: 11, leading: 16 });
    for (const a of i.attachments) w.runs([{ text: `${a.name}${a.size ? ` (${Math.max(1, Math.round(a.size / 1024))} KB)` : ''}` }], { size: 9.5, leading: 14 });
  }

  // Footer on every page
  const pages = doc.getPages();
  pages.forEach((p, n) => {
    const t = `Offer ${i.offerId.slice(0, 8)}  ·  ${i.company}  ·  Page ${n + 1} of ${pages.length}`;
    p.drawText(w.safe(t, f.reg), { x: M, y: 32, size: 7.5, font: f.reg, color: MUTED });
    p.drawText('apply1234', { x: W - M - f.bold.widthOfTextAtSize('apply1234', 7.5), y: 32, size: 7.5, font: f.bold, color: MUTED });
  });
  return await doc.save();
}
