// The branded email layout shared with hiring-notify: paper, ink and orange, with the apply1234 wordmark.
const SITE = 'https://www.apply1234.com';
export const INK = '#16151a';
const MUTED = '#6e6c73', PAPER = '#f5f3ee', LINE = '#e2ded4', ACCENT = '#ff5a1f';
const SANS = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function layout(inner: string, preheader = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>apply1234</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAPER}">${esc(preheader)}&#8203;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 4px 14px;font-family:${MONO};font-size:16px;font-weight:700;letter-spacing:-0.02em;color:${INK};">apply<span style="color:${ACCENT};">1234</span></td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:28px;font-family:${SANS};color:${INK};">${inner}</td></tr>
    <tr><td style="padding:16px 4px 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${MUTED};">
      Sent by <a href="${SITE}" style="color:${MUTED};">apply1234.com</a> from hiring@apply1234.com
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export const heading = (t: string, sub = '') =>
  `<h1 style="margin:0 0 4px;font-family:${SANS};font-size:20px;line-height:1.3;color:${INK};">${esc(t)}</h1>` +
  (sub ? `<p style="margin:0 0 18px;font-size:14px;color:${MUTED};">${sub}</p>` : '');

export const paragraphs = (text: string) =>
  text.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.6;font-size:15px;color:${INK};">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

export const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr><td style="border-radius:10px;background:${INK};"><a href="${esc(href)}" style="display:inline-block;padding:12px 20px;font-family:${SANS};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)}</a></td></tr></table>`;

export const row = (k: string, v: string) =>
  `<tr><td style="padding:6px 14px 6px 0;color:${MUTED};font-size:13px;white-space:nowrap;vertical-align:top;font-family:${SANS};">${esc(k)}</td><td style="padding:6px 0;font-size:14px;font-family:${SANS};color:${INK};">${v}</td></tr>`;

export const table = (rows: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:6px 0 4px;">${rows}</table>`;
