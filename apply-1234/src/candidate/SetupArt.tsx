// Small illustrations for the Loom setup steps. The picture is chosen from the step's wording,
// so admins can rewrite the steps and still get a fitting visual.

type Kind = 'install' | 'record' | 'link' | 'transcript' | 'share' | 'done';

export function kindFor(text: string): Kind {
  const t = text.toLowerCase();
  if (/transcript/.test(t)) return 'transcript';
  if (/copy|paste|link/.test(t)) return 'link';
  if (/record|camera|video/.test(t)) return 'record';
  if (/install|download|account|sign ?up|extension|desktop app/.test(t)) return 'install';
  if (/shar|anyone|public|access/.test(t)) return 'share';
  return 'done';
}

const INK = '#16151a';
const ACCENT = '#ff5a1f';
const SOFT = '#ffe7dc';
const LINE = '#d9d4c8';

function Art({ kind }: { kind: Kind }) {
  const common = { stroke: INK, strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'install':
      return (
        <svg viewBox="0 0 160 110" aria-hidden="true">
          <rect x="32" y="14" width="96" height="64" rx="6" fill="#fff" {...common} />
          <line x1="32" y1="25" x2="128" y2="25" stroke={LINE} strokeWidth="2.5" />
          <circle cx="40" cy="19.5" r="1.8" fill={LINE} /><circle cx="46" cy="19.5" r="1.8" fill={LINE} />
          <path d="M18 84h124l-8 10H26z" fill="#fff" {...common} />
          <path d="M80 35v23" stroke={ACCENT} strokeWidth="4" strokeLinecap="round" />
          <path d="M70 49l10 10 10-10" fill="none" stroke={ACCENT} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M66 67h28" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'record':
      return (
        <svg viewBox="0 0 160 110" aria-hidden="true">
          <rect x="18" y="12" width="124" height="84" rx="6" fill="#fff" {...common} />
          <rect x="72" y="28" width="56" height="6" rx="3" fill={LINE} />
          <rect x="72" y="40" width="44" height="6" rx="3" fill={LINE} />
          <rect x="72" y="52" width="50" height="6" rx="3" fill={LINE} />
          <circle cx="46" cy="66" r="20" fill={SOFT} {...common} />
          <circle cx="46" cy="60" r="6.5" fill={INK} />
          <path d="M34 80c2.5-7 7-10 12-10s9.5 3 12 10" fill={INK} />
          <circle cx="124" cy="80" r="6" fill={ACCENT} />
          <text x="94" y="84" fontFamily="ui-monospace, Menlo, monospace" fontSize="10" fontWeight="700" fill={INK}>REC</text>
        </svg>
      );
    case 'link':
      return (
        <svg viewBox="0 0 160 110" aria-hidden="true">
          <rect x="10" y="14" width="66" height="44" rx="6" fill={INK} />
          <path d="M37 27l14 9-14 9z" fill="#fff" />
          <rect x="10" y="66" width="66" height="20" rx="10" fill={ACCENT} />
          <text x="43" y="79.5" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize="10" fontWeight="600" fill="#fff">Copy link</text>
          <path d="M84 76c10 0 14-8 22-8" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 5" />
          <path d="M101 63l6 5-6 5" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="112" y="56" width="40" height="24" rx="5" fill="#fff" {...common} />
          <rect x="118" y="65" width="22" height="5" rx="2.5" fill={LINE} />
          <line x1="144" y1="62" x2="144" y2="74" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case 'transcript':
      return (
        <svg viewBox="0 0 160 110" aria-hidden="true">
          <rect x="56" y="10" width="72" height="90" rx="6" fill="#fff" {...common} />
          {[24, 36, 48, 60, 72, 84].map((y, i) => (
            <rect key={y} x="66" y={y} width={i % 3 === 2 ? 34 : 52} height="5" rx="2.5" fill={LINE} />
          ))}
          <path d="M18 30h40a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8H36l-10 9v-9h-8a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8z" fill={ACCENT} />
          <rect x="20" y="40" width="34" height="4" rx="2" fill="#fff" />
          <rect x="20" y="49" width="24" height="4" rx="2" fill="#fff" />
        </svg>
      );
    case 'share':
      return (
        <svg viewBox="0 0 160 110" aria-hidden="true">
          <circle cx="72" cy="55" r="34" fill="#fff" {...common} />
          <ellipse cx="72" cy="55" rx="14" ry="34" fill="none" {...common} />
          <path d="M40 44h64M40 66h64" fill="none" {...common} />
          <circle cx="112" cy="80" r="16" fill={ACCENT} />
          <path d="M104 80l6 6 10-12" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 160 110" aria-hidden="true">
          <circle cx="80" cy="55" r="32" fill={SOFT} {...common} />
          <path d="M66 56l10 10 20-22" fill="none" stroke={ACCENT} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export default function SetupStep({ n, text }: { n: number; text: string }) {
  return (
    <li className="flex items-center gap-4 rounded-2xl bg-card border border-line p-3 sm:p-4">
      <div className="shrink-0 w-24 sm:w-36 rounded-xl bg-paper-2 p-1.5">
        <Art kind={kindFor(text)} />
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[11px] text-muted tracking-wide">STEP {n}</p>
        <p className="leading-relaxed mt-0.5 text-[15px]">{text}</p>
      </div>
    </li>
  );
}
