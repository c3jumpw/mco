// What changed, newest first. Add an entry (with the next version number) whenever something
// people can see changes. Admins see entries newer than the last one they read, once.

export interface Change {
  version: number;
  date: string;        // YYYY-MM-DD
  title: string;
  items: string[];
  image?: string;      // picture in scripts/guide/img
  phone?: boolean;
  to?: string;
  toLabel?: string;
}

export const CHANGES: Change[] = [
  {
    version: 4, date: '2026-11-19', title: 'Offer letters with e-signature',
    items: [
      'Prepare an offer from a candidate’s page: pay, start date, terms and attachments, with a live preview.',
      'Send it from your company name. The hiring manager is CC’d by default, and you can add others. Copies have no signing link.',
      'Candidates sign on any device. Everyone gets the signed PDF, with a certificate showing the time, IP address and device.',
      'Interview recordings, transcripts and files now live on the candidate’s page.',
    ],
    image: 'offer-editor',
  },
  {
    version: 3, date: '2026-11-18', title: 'A getting-started tour',
    items: ['A slide-by-slide tour of every screen, under Help at the top of the page.', 'After each update, this What’s new shows what changed.'],
    image: 'admin-overview',
  },
  {
    version: 2, date: '2026-11-13', title: 'Activity steps for every kind of role',
    items: [
      'Ten kinds of step: written answers, quick timed scenarios, ranking, must-haves, work samples, mini briefs, critiques, voice notes, their choice and video.',
      'The new-job wizard suggests steps for the role, and the AI writes them.',
      'Candidates are told AI is welcome if they say how they used it, and answer that before submitting.',
      'Written answers show whether they were typed or pasted. New flags: must-haves, scenario score, pasted, used AI.',
      'Interview follow-up questions drawn from a candidate’s own answers.',
    ],
    image: 'job-steps',
  },
  {
    version: 1, date: '2026-11-13', title: 'Share a job with more control',
    items: ['When you give someone access to a job, choose whether they see candidates’ contact details and résumés.'],
    image: 'access-card',
  },
];

export const LATEST = CHANGES[0].version;
