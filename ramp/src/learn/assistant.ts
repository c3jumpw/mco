// The RAMP Assistant: the setup prompt that starts a new Claude chat for training builds, and the build packet an
// admin pastes into it. The prompt's standards are kept here and updated with RAMP; its module format comes from
// schema.ts, so it always matches what this version can import. Workspaces can add their own instructions.
import type { Block, LaunchData, LaunchGet, Module } from '../lib/types';
import { FORMAT, FORMAT_VERSION } from './schema';

export const PROMPT_VERSION = '2026-11-21';

const STANDARDS = `You are the RAMP Assistant. You turn a company's training notes into interactive onboarding and training modules for RAMP, a training and onboarding platform. Admins import what you write straight into RAMP.

HOW WE WORK
- I paste a build packet: the new hire's role, the client's business, their notes, routines and goals, and any of our standard modules to reuse or adapt.
- If something important is missing (the tools they use, their daily routines, what great looks like at 30/60/90 days), ask me up to 5 short questions first. Otherwise build straight away.
- Reply with the module package in ONE \`\`\`json block, then a short list: what I should check, and any screenshots I should upload.

STANDARDS FOR EVERY MODULE
- Plain, warm, direct language at about a 7th–8th grade reading level. Short sentences. Explain why, not just what.
- No AI-sounding words: delve, leverage, utilize, ensure, seamless, robust, "it's important to note".
- Teach by doing. At least half the steps are interactive: scenario, sort, order, match, flashcards, checklist, practice tool (sim), click-through or real work. Never three text steps in a row.
- 8–16 steps, 10–25 minutes, 3–5 objectives that start with a verb. End with a check (quiz or scenario) and, where it fits, real work or a teach-back assignment (set mentor_review true for teach-backs).
- Use the client's real tools, names, routines and examples from the packet. Use practice tools for the routines the new hire will do every day: tasks, calendar, inbox and chat.
- Scenarios use a realistic message (sender, channel, time) with exactly one best choice. Feedback always says why.
- Visuals: steps for a process, cycle for a loop, cards for a set of ideas, pillars for 2–3 categories, compare for two side by side, timeline for phases.
- Don't repeat what the reused standard modules already teach; build on them and point back to them.
- Never invent facts about the client. If you need something, ask, or leave a clear [placeholder].
- Pictures: you can't add images. Leave src "" and say in the caption which screenshot the admin should upload.
- Keep company-wide content (track "company"), role content ("role") and refreshers ("continued") apart.`;

/** The full setup prompt: standards, the workspace's additions, then the module format. */
export function setupPrompt(additions?: string): string {
  const extra = (additions || '').trim();
  return [
    STANDARDS,
    extra ? `OUR WORKSPACE'S ADDITIONS\n${extra}` : '',
    `MODULE FORMAT (RAMP setup prompt ${PROMPT_VERSION}, module format ${FORMAT_VERSION})\n${FORMAT}`,
    'When you’re ready, reply only: “Ready. Paste the build packet.”',
  ].filter(Boolean).join('\n\n');
}

// ───────── build packet ─────────

/** A module's content as plain text, so the Assistant can reuse or adapt it. */
export function moduleText(m: Pick<Module, 'title' | 'track' | 'summary' | 'objectives' | 'blocks'>, full: boolean): string {
  const out: string[] = [`MODULE: ${m.title} (${m.track})`, m.summary ? `Summary: ${m.summary}` : ''];
  if (m.objectives?.length) out.push(`Objectives: ${m.objectives.join('; ')}`);
  if (full) for (const b of m.blocks || []) out.push(blockText(b));
  return out.filter(Boolean).join('\n');
}

function blockText(b: Block): string {
  switch (b.type) {
    case 'slides': return b.slides.map((s) => `[Slide] ${s.title}\n${s.body}`).join('\n');
    case 'reading': return `[Reading] ${b.title}\n${b.body}`;
    case 'video': return `[Video/presentation] ${b.caption || ''} ${b.url}`;
    case 'quiz': return `[Quiz]\n${b.questions.map((q) => `- ${q.q} → ${q.options[q.answer]}`).join('\n')}`;
    case 'assignment': return `[Assignment] ${b.prompt}`;
    case 'form': return '[Form to fill in]';
    case 'practice': return '[RAMP platform practice]';
    case 'visual': return `[Visual: ${b.layout}] ${b.title}\n${b.items.map((i) => `- ${i.title}${i.body ? `: ${i.body.replace(/\n/g, '; ')}` : ''}`).join('\n')}`;
    case 'image': return `[Picture] ${b.caption || b.alt}`;
    case 'scenario': return `[Scenario] ${b.title}: ${b.message?.text || b.setup || ''} → best: ${b.choices.find((c) => c.result === 'best')?.text || ''}`;
    case 'order': return `[Order] ${b.title}: ${b.items.join(' → ')}`;
    case 'sort': return `[Sort] ${b.title}: ${b.items.map((i) => `${i.text} = ${b.groups[i.group]}`).join('; ')}`;
    case 'match': return `[Match] ${b.title}: ${b.pairs.map((p) => `${p.left} = ${p.right}`).join('; ')}`;
    case 'flashcards': return `[Flashcards] ${b.cards.map((c) => `${c.front}: ${c.back}`).join(' | ')}`;
    case 'checklist': return `[Checklist] ${b.title}: ${b.items.join('; ')}`;
    case 'hotspot': return `[Click-through] ${b.title}: ${b.steps.map((s) => s.prompt).join(' → ')}`;
    case 'realwork': return `[Real work: ${b.action}] ${b.title}`;
    case 'sim': return `[Practice tool: ${b.tool}] ${b.title}: ${b.brief}`;
  }
}

function launchText(d: LaunchData | undefined): string {
  if (!d) return '';
  const out: string[] = [];
  const c = d.company;
  if (c?.summary) out.push(`About the company: ${c.summary}`);
  if (c?.public_info) out.push(`Public info:\n${c.public_info}`);
  if (c?.admin_info) out.push(`Internal info:\n${c.admin_info}`);
  if (d.values?.length) out.push(`Values:\n${d.values.map((v) => `- ${v.title}: ${v.practice}`).join('\n')}`);
  if (d.projects?.length) out.push(`Projects and objectives:\n${d.projects.map((p) => `- ${p.name} (${p.priority} priority, ${p.status}${p.progress ? `, ${p.progress}%` : ''})${p.challenges ? `. Challenges: ${p.challenges}` : ''}${p.objectives?.length ? `\n  Objectives: ${p.objectives.map((o) => o.title).join('; ')}` : ''}`).join('\n')}`);
  if (d.checklists?.length) out.push(`Checklists:\n${d.checklists.map((k) => `- ${k.title} (${k.frequency}): ${k.items.map((i) => i.title).join('; ')}`).join('\n')}`);
  if (d.tools?.length) out.push(`Tools:\n${d.tools.map((t) => `- ${t.name}: ${t.purpose}`).join('\n')}`);
  if (d.milestones?.length) out.push(`Milestones:\n${d.milestones.map((m) => `- ${m.title}${m.due_day != null ? ` (by day ${m.due_day})` : ''}${m.why ? `: ${m.why}` : ''}`).join('\n')}`);
  if (d.schedules?.length) out.push(`Schedules:\n${d.schedules.map((s) => `- ${s.period}: ${s.blocks.map((b) => `${b.days} ${b.start}–${b.end} ${b.focus}`).join('; ')}`).join('\n')}`);
  return out.join('\n\n');
}

export interface PacketInput {
  org: string;
  role: string;
  goal: string;
  notes: string;
  launch?: LaunchGet | null;
  modules: Module[];
  full: boolean;
}

/** The packet as plain text (to paste) and as a readable HTML page (to download, read and attach). */
export function buildPacket(p: PacketInput): { text: string; html: string } {
  const pl = p.launch?.placement;
  const sections: [string, string][] = [
    ['What to build', p.goal.trim()],
    ['The role and new hire', [p.role.trim(), pl ? `Placed with: ${pl.client.name} (time zone ${pl.client.timezone}). Title: ${pl.title}. ${pl.hours_per_week} h/week${pl.schedule ? `, ${pl.schedule}` : ''}${pl.start_date ? `. Starts ${pl.start_date}` : ''}.` : ''].filter(Boolean).join('\n')],
    ...(p.launch?.plan ? [['From the client’s launch plan', launchText(p.launch.plan.data)] as [string, string]] : []),
    ['Notes, SOPs and goals', p.notes.trim()],
    ['Our standard modules to reuse or adapt', p.modules.length ? p.modules.map((m) => moduleText(m, p.full)).join('\n\n———\n\n') : 'None selected.'],
  ];
  const head = `RAMP BUILD PACKET · ${p.org} · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\nUse your RAMP Assistant setup (module format ${FORMAT_VERSION}). Build the modules described below.`;
  const text = [head, ...sections.filter(([, b]) => b).map(([t, b]) => `## ${t.toUpperCase()}\n${b}`)].join('\n\n');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RAMP build packet · ${esc(p.org)}</title>
<style>
body{font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#111827;background:#F4F5F7;margin:0}
main{max-width:860px;margin:0 auto;padding:40px 24px 80px}
header{background:linear-gradient(135deg,#E0E7FF,#fff 70%);border:1px solid #E3E6EA;border-radius:20px;padding:28px}
.k{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#3730A3}
h1{font-size:30px;line-height:1.2;margin:6px 0 8px}
section{background:#fff;border:1px solid #E3E6EA;border-radius:16px;padding:20px 24px;margin-top:16px}
h2{font-size:18px;margin:0 0 10px}
pre{white-space:pre-wrap;font:inherit;margin:0;color:#374151}
.tip{font-size:14px;color:#4B5563;margin-top:8px}
</style></head><body><main>
<header><div class="k">RAMP build packet</div><h1>${esc(p.role.split('\n')[0] || 'Training build')}</h1>
<p>${esc(p.org)} · ${esc(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))}</p>
<p class="tip">Paste this whole packet into a chat started with the RAMP Assistant setup prompt (Admin › Training › RAMP Assistant). Then import the reply in Admin › Training › Import.</p></header>
${sections.filter(([, b]) => b).map(([t, b]) => `<section><h2>${esc(t)}</h2><pre>${esc(b)}</pre></section>`).join('\n')}
<section><h2>Instruction to the Assistant</h2><pre>${esc(head)}</pre></section>
</main></body></html>`;
  return { text, html };
}
