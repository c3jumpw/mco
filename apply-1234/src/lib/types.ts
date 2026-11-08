export type JobStatus = 'draft' | 'published' | 'closed';
export type Stage = 'new' | 'reviewed' | 'shortlisted' | 'interview' | 'offer' | 'hired' | 'rejected';

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'reviewed', label: 'Reviewed' },
  { id: 'shortlisted', label: 'Shortlist' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' },
  { id: 'hired', label: 'Hired' },
  { id: 'rejected', label: 'Rejected' },
];

export interface Fragment { text: string }

export interface Activity {
  headline?: string;
  intro?: string;
  loom_steps?: string;
  answer_min?: number | null; // seconds
  answer_max?: number | null; // seconds
  deadline?: string; // ISO
  extra?: string;
  require_transcript?: boolean;
  hidden_code?: string;
  consent_text?: string;
  accommodations_email?: string;
}

export interface Question { id: string; text: string; guidance?: string }
export interface InterviewQuestion { id: string; text: string; kind: 'general' | 'custom' }

export interface Source { id: string; label: string; code: string; active: boolean }

export interface JobSettings {
  base_link_off?: boolean;
  invite_subject?: string;
  invite_body?: string;
  reject_subject?: string;
  reject_body?: string;
}

export interface Job {
  id: string;
  title: string;
  status: JobStatus;
  notes: string;
  posting: string;
  domain: string;
  slug: string | null;
  fragments: Fragment[];
  hint_format: string;
  public_id: string;
  share_enabled: boolean;
  activity: Activity;
  questions: Question[];
  interview_questions: InterviewQuestion[];
  rubric: string[];
  booking_url: string;
  settings: JobSettings;
  sources: Source[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
  closed_at: string | null;
}

export interface Answer {
  question_id: string;
  question: string;
  url: string;
  loom_id?: string;
  title?: string;
  duration_sec?: number | null;
  transcript?: string;
}

export interface Application {
  id: string;
  job_id: string;
  name: string;
  email: string;
  answers: Answer[];
  visitor_id: string;
  stage: Stage;
  tags: string[];
  consent: boolean;
  flags: {
    all_loom_links?: boolean;
    lengths_in_range?: boolean | null;
    transcripts_ok?: boolean;
    hidden_code_ok?: boolean | null;
    duplicate_email?: boolean;
  };
  metrics: Record<string, unknown>;
  interview_at: string | null;
  interview_answers: Record<string, { notes?: string; score?: number }>;
  interview_summary: string;
  submitted_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  application_id: string;
  reviewer_id: string;
  reviewer_email: string;
  scores: Record<string, number>;
  criteria: Record<string, number>;
  overall: number | null;
  recommendation: 'strong_yes' | 'yes' | 'maybe' | 'no' | null;
  updated_at: string;
}

export interface Note {
  id: string;
  application_id: string;
  author_email: string;
  kind: 'note' | 'interview';
  body: string;
  created_at: string;
}

export interface HEvent {
  id: number;
  job_id: string | null;
  application_id: string | null;
  visitor_id: string;
  type: string;
  path: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Template {
  id: string;
  kind: 'activity' | 'posting' | 'questions' | 'interview';
  name: string;
  content: unknown;
  created_at: string;
}

export interface JobStats {
  job_id: string;
  submissions: number;
  new_count: number;
  shortlisted: number;
  interviews: number;
  hired: number;
  arrivals: number;
  wrong_attempts: number;
  wrong_visitors: number;
  form_starts: number;
  posting_views: number;
}
