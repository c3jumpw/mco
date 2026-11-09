// Starter content for new documents and training modules. Company-specific text is left in [brackets]
// so the setup checklist can flag it until someone fills it in.

import type { Block, Template, Track } from '../../lib/types';

export interface DocPreset {
  key: string;
  label: string;
  desc: string;
  icon: string;
  t: Pick<Template, 'title' | 'kind' | 'stage' | 'audience' | 'description' | 'fields' | 'legal_review'>;
}

export const DOC_PRESETS: DocPreset[] = [
  {
    key: 'application', label: 'Employment application', icon: 'fileText', desc: 'Contact details, work eligibility, résumé and a signature. For candidates.',
    t: {
      title: 'Employment application', kind: 'form', stage: 'before', audience: 'candidates', legal_review: false,
      description: 'Your hiring app already collects applications. Use this only if you also need a written application.',
      fields: [
        { k: 'name', type: 'text', label: 'Full legal name', required: true },
        { k: 'email', type: 'email', label: 'Email', required: true },
        { k: 'phone', type: 'phone', label: 'Phone', required: true },
        { k: 'position', type: 'text', label: 'Position you’re applying for', required: true },
        { k: 'start', type: 'date', label: 'Earliest start date' },
        { k: 'authorized', type: 'choice', label: 'Are you legally allowed to work in the United States?', required: true, options: ['Yes', 'No'] },
        { k: 'resume', type: 'file', label: 'Résumé', required: true },
        { k: 'sign', type: 'sign', label: 'I confirm this information is accurate', required: true },
      ],
    },
  },
  {
    key: 'photo_id', label: 'Photo ID upload', icon: 'upload', desc: 'Front and back of a government ID, stored as sensitive files.',
    t: {
      title: 'Photo ID upload', kind: 'upload', stage: 'onboarding', audience: 'everyone', legal_review: false,
      description: 'A clear photo of a government-issued ID. Only owners and admins can open it. This doesn’t replace the official Form I-9 process.',
      fields: [
        { k: 'note', type: 'info', label: 'Use good lighting and make sure all four corners are visible.' },
        { k: 'id_front', type: 'file', label: 'Front of ID', required: true, secure: true },
        { k: 'id_back', type: 'file', label: 'Back of ID', secure: true },
      ],
    },
  },
  {
    key: 'employee_info', label: 'New employee information', icon: 'users', desc: 'Legal name, date of birth, address, phone and an emergency contact.',
    t: {
      title: 'New employee information', kind: 'form', stage: 'onboarding', audience: 'everyone', legal_review: false,
      description: 'Contact details and an emergency contact.',
      fields: [
        { k: 'legal_name', type: 'text', label: 'Full legal name', required: true },
        { k: 'preferred_name', type: 'text', label: 'Preferred name' },
        { k: 'dob', type: 'date', label: 'Date of birth', required: true, secure: true },
        { k: 'address', type: 'text', label: 'Home address', required: true },
        { k: 'phone', type: 'phone', label: 'Mobile phone', required: true },
        { k: 'emergency_name', type: 'text', label: 'Emergency contact name', required: true },
        { k: 'emergency_phone', type: 'phone', label: 'Emergency contact phone', required: true },
      ],
    },
  },
  {
    key: 'payroll', label: 'Payroll and direct deposit', icon: 'lock', desc: 'Bank, routing and account numbers (encrypted), W-4 and authorization.',
    t: {
      title: 'Payroll and direct deposit', kind: 'form', stage: 'onboarding', audience: 'everyone', legal_review: false,
      description: 'Where your pay goes. Bank details are encrypted.',
      fields: [
        { k: 'bank_name', type: 'text', label: 'Bank name', required: true },
        { k: 'account_type', type: 'choice', label: 'Account type', required: true, options: ['Checking', 'Savings'] },
        { k: 'routing', type: 'secure', label: 'Routing number', required: true, secure: true },
        { k: 'account', type: 'secure', label: 'Account number', required: true, secure: true },
        { k: 'w4', type: 'file', label: 'Federal tax withholding form (W-4)', required: true, secure: true },
        { k: 'sign', type: 'sign', label: 'I authorize direct deposit to this account', required: true },
      ],
    },
  },
  {
    key: 'tools', label: 'Install your tools', icon: 'tasks', desc: 'A first-week checklist: home screen, role apps and two-step sign-in.',
    t: {
      title: 'Install your tools', kind: 'checklist', stage: 'first_week', audience: 'everyone', legal_review: false,
      description: 'Get every app you need on your phone and computer.',
      fields: [
        { k: 'home_screen', type: 'check', label: 'Add RAMP to your phone’s home screen', required: true },
        { k: 'apps', type: 'check', label: 'Install the apps your role uses (your mentor will share the list)', required: true },
        { k: 'two_step', type: 'check', label: 'Turn on two-step sign-in for your work accounts', required: true },
        { k: 'screenshot', type: 'file', label: 'Screenshot of your setup (optional)' },
      ],
    },
  },
  {
    key: 'email', label: 'Set up your company email', icon: 'mail', desc: 'Sign in, add the email signature and connect a phone.',
    t: {
      title: 'Set up your company email', kind: 'checklist', stage: 'first_week', audience: 'everyone', legal_review: false,
      description: 'Sign in, add your signature and connect your phone.',
      fields: [
        { k: 'signin', type: 'check', label: 'Sign in to your company email', required: true },
        { k: 'signature', type: 'check', label: 'Add the company email signature', required: true },
        { k: 'phone', type: 'check', label: 'Add your email account to your phone', required: true },
      ],
    },
  },
  {
    key: 'notebook', label: 'Using your notebook', icon: 'notes', desc: 'Guided practice: a page, an attachment and a Vault login.',
    t: {
      title: 'Using your notebook', kind: 'checklist', stage: 'first_week', audience: 'everyone', legal_review: false,
      description: 'A short guided practice in your own notebook.',
      fields: [
        { k: 'page', type: 'check', label: 'Create a page from the Module notes template', required: true },
        { k: 'file', type: 'check', label: 'Attach a file to a page', required: true },
        { k: 'vault', type: 'check', label: 'Save one login in your Vault', required: true },
      ],
    },
  },
  {
    key: 'policies', label: 'Policies and core principles', icon: 'pen', desc: 'Handbook and code of conduct acknowledgement, signed electronically.',
    t: {
      title: 'Policies and core principles', kind: 'esign', stage: 'onboarding', audience: 'everyone', legal_review: false,
      description: 'Read the handbook and our core principles, then sign.',
      fields: [
        { k: 'text', type: 'info', label: 'Policies and core principles', help: '[Paste your policies and core principles here, or link the handbook from Resources.]' },
        { k: 'handbook', type: 'check', label: 'I’ve read the employee handbook', required: true },
        { k: 'conduct', type: 'check', label: 'I understand the code of conduct', required: true },
        { k: 'sign', type: 'sign', label: 'Signature', required: true },
      ],
    },
  },
  {
    key: 'confidentiality', label: 'Confidentiality agreement', icon: 'shield', desc: 'Agreement text, consent and signature. Flagged for legal review.',
    t: {
      title: 'Confidentiality agreement', kind: 'esign', stage: 'onboarding', audience: 'everyone', legal_review: true,
      description: 'Keeps company and client information private.',
      fields: [
        { k: 'text', type: 'info', label: 'Confidentiality agreement', help: '[Your confidentiality agreement text, reviewed by your employment lawyer.]' },
        { k: 'agree', type: 'check', label: 'I agree to the terms above', required: true },
        { k: 'sign', type: 'sign', label: 'Signature', required: true },
      ],
    },
  },
  {
    key: 'noncompete', label: 'Non-compete', icon: 'alert', desc: 'For the roles that need it. Rules differ by state. Flagged for legal review.',
    t: {
      title: 'Non-compete and non-solicitation', kind: 'esign', stage: 'onboarding', audience: 'role', legal_review: true,
      description: 'Only for roles that need it. Rules differ by state, and some states don’t allow non-competes.',
      fields: [
        { k: 'text', type: 'info', label: 'Non-compete and non-solicitation', help: '[Agreement text, reviewed by your employment lawyer.]' },
        { k: 'agree', type: 'check', label: 'I agree to the terms above', required: true },
        { k: 'sign', type: 'sign', label: 'Signature', required: true },
      ],
    },
  },
  {
    key: 'blank', label: 'Blank document', icon: 'plus', desc: 'Start from nothing and add your own fields.',
    t: { title: 'Untitled document', kind: 'form', stage: 'onboarding', audience: 'everyone', legal_review: false, description: '', fields: [] },
  },
];

export interface ModulePreset {
  key: string;
  label: string;
  desc: string;
  icon: string;
  m: { title: string; track: Track; summary: string; minutes: number; objectives: string[]; blocks: Block[]; pass_score: number; mentor_review: boolean; due_days: number | null };
}

export const MODULE_PRESETS: ModulePreset[] = [
  {
    key: 'blank', label: 'Blank module', icon: 'plus', desc: 'Start from nothing and add your own blocks.',
    m: { title: 'Untitled module', track: 'role', summary: '', minutes: 10, objectives: [], blocks: [], pass_score: 0, mentor_review: false, due_days: null },
  },
  {
    key: 'policy', label: 'Policy reading and quiz', icon: 'fileText', desc: 'A page to read, then a short quiz with a passing score.',
    m: {
      title: '[Policy name]', track: 'company', summary: 'Read the policy and check your understanding.', minutes: 10,
      objectives: ['Explain the policy in your own words', 'Know where to find it later'],
      blocks: [
        { type: 'reading', title: '[Policy name]', body: '[Paste the policy here, or summarize it and link the full version from Resources.]' },
        { type: 'quiz', questions: [
          { q: '[A question about the policy]', options: ['[The right answer]', '[A wrong answer]', '[Another wrong answer]'], answer: 0, explain: '[Why this is the right answer]' },
          { q: '[Another question]', options: ['[A wrong answer]', '[The right answer]'], answer: 1, explain: '' },
        ] },
      ],
      pass_score: 80, mentor_review: false, due_days: 7,
    },
  },
  {
    key: 'skill', label: 'Skill lesson with a reviewed assignment', icon: 'target', desc: 'Slides that teach the skill, a real task to try, and mentor review.',
    m: {
      title: '[Skill name]', track: 'role', summary: '[What this lesson teaches and why it matters.]', minutes: 30,
      objectives: ['[What someone can do after this lesson]'],
      blocks: [
        { type: 'slides', slides: [
          { title: 'Why this matters', body: '[The outcome this skill is responsible for.]' },
          { title: 'How to do it', body: '[The steps, one per line.]' },
          { title: 'What good looks like', body: '[An example of great work.]' },
        ] },
        { type: 'assignment', prompt: '[A small real task to try. Say exactly what to hand in.]' },
      ],
      pass_score: 0, mentor_review: true, due_days: 14,
    },
  },
  {
    key: 'video', label: 'Video lesson', icon: 'play', desc: 'A video with a caption, then two quick check questions.',
    m: {
      title: '[Video title]', track: 'role', summary: '[What the video covers.]', minutes: 15,
      objectives: ['[What someone should take away from the video]'],
      blocks: [
        { type: 'video', url: '', caption: '[What to watch for]' },
        { type: 'quiz', questions: [
          { q: '[A question about the video]', options: ['[The right answer]', '[A wrong answer]'], answer: 0, explain: '' },
        ] },
      ],
      pass_score: 0, mentor_review: false, due_days: 7,
    },
  },
];
