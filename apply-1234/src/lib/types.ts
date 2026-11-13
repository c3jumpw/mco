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
  confirm_off?: boolean;
  confirm_subject?: string;
  confirm_body?: string;
  reply_to?: string;
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
  cover_letter?: string;
  attachments?: Attachment[];
  notified_at?: string | null;
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

export interface Attachment { kind: 'resume' | 'cover_letter' | 'other'; path: string; name: string; size: number; type?: string }

export type MessageKind = 'bug' | 'question' | 'other';
export interface HMessage {
  id: string;
  job_id: string | null;
  application_id: string | null;
  visitor_id: string;
  kind: MessageKind;
  name: string;
  email: string;
  body: string;
  context: Record<string, unknown>;
  status: 'new' | 'open' | 'done';
  admin_note: string;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashDay { day: string; arrivals: number; starts: number; applicants: number }
export interface Dashboard {
  tz: string; days: number; start: string;
  applicants: number; applicants_prev: number;
  posting_views: number; arrivals: number; arrivals_prev: number; starts: number;
  wrong_tries: number; wrong_visitors: number;
  to_review: number; shortlisted: number; interviews_next7: number;
  messages_new: number; messages_period: number; live_jobs: number;
  series: DashDay[];
}

export type AccessRole = 'reviewer' | 'editor';
export interface JobAccess {
  id: string;
  job_id: string;
  email: string;
  name: string;
  user_id: string | null;
  role: AccessRole;
  hide_contact: boolean;
  see_files: boolean;
  shortlisted_only: boolean;
  notify: boolean;
  can_move_stages: boolean;
  invited_by: string;
  invited_at: string;
  last_invite_at: string | null;
  claimed_at: string | null;
}

/** A job as an invited reviewer sees it. */
export interface ClientJob {
  id: string;
  title: string;
  status: JobStatus;
  questions: Question[];
  rubric: string[];
  activity: Pick<Activity, 'answer_min' | 'answer_max' | 'hidden_code' | 'require_transcript'>;
  access: Pick<JobAccess, 'role' | 'hide_contact' | 'see_files' | 'shortlisted_only' | 'notify' | 'can_move_stages'>;
  candidates: number;
  scored_by_me: number;
}
