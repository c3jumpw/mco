// Shapes of the ramp_ tables (see supabase/migrations/001_ramp_schema.sql).

export type Level = 'owner' | 'admin' | 'lead' | 'mentor' | 'employee' | 'trainee' | 'guest';
export type MemberStatus = 'invited' | 'active' | 'inactive';

export interface Org {
  id: true;
  name: string;
  brand_color: string;
  timezone: string;
  welcome_from: string;
  welcome_headline: string;
  welcome_message: string;
  welcome_video_url: string;
  flow: FlowStep[];
  flow_reviewed: boolean;
  flags: OrgFlags;
  updated_at: string;
}
export type FlowStepId = 'welcome' | 'profile' | 'practice' | 'documents' | 'mentor' | 'done';
export interface FlowStep { id: FlowStepId; on: boolean }
export interface OrgFlags { chat: boolean; tasks: boolean; certificates: boolean; record_ip: boolean }

export interface Department { id: string; name: string; lead_id: string | null; created_at: string }

export interface JobRole {
  id: string;
  title: string;
  department_id: string | null;
  /** Access level someone moves to when they graduate. */
  level: 'admin' | 'lead' | 'mentor' | 'employee';
  description: string;
  created_at: string;
}

export interface Member {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string;
  preferred_name: string;
  phone: string;
  timezone: string;
  level: Level;
  job_role_id: string | null;
  department_id: string | null;
  mentor_id: string | null;
  status: MemberStatus;
  source: 'manual' | 'hiring' | 'staff' | 'request' | 'seed';
  source_ref: string | null;
  start_date: string | null;
  onboarded_at: string | null;
  practice_done_at: string | null;
  graduated_at: string | null;
  last_seen_at: string | null;
  access_until: string | null;
  invited_by: string | null;
  invited_at: string;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Row from rpc('ramp_directory'): names only, safe to show any staff member. */
export interface DirEntry {
  id: string;
  full_name: string;
  preferred_name: string;
  level: Level;
  job_title: string;
  department: string;
  mentor_id: string | null;
}

export interface AccessRequest { id: string; auth_user_id: string; email: string; name: string; note: string; status: 'open' | 'invited' | 'dismissed'; created_at: string }

/** Row from rpc('ramp_potential_staff'). */
export interface PotentialStaff { source: 'hiring' | 'staff' | 'request'; ref: string; name: string; email: string; detail: string; at: string }

// ───────── training ─────────

export type Track = 'company' | 'role' | 'continued';

export interface Slide { title: string; body: string }
export interface QuizQuestion { q: string; options: string[]; answer: number; explain?: string }

/**
 * A module is an ordered list of blocks. The player turns them into steps:
 * every slide is a step; reading, video, quiz (all its questions at once), assignment,
 * form and practice are one step each.
 */
export type Block =
  | { type: 'slides'; slides: Slide[] }
  | { type: 'reading'; title: string; body: string }
  | { type: 'video'; url: string; caption?: string }
  | { type: 'quiz'; questions: QuizQuestion[] }
  | { type: 'assignment'; prompt: string }
  | { type: 'form'; template_id: string | null; note?: string }
  | { type: 'practice' };
export type BlockType = Block['type'];

export interface Module {
  id: string;
  title: string;
  track: Track;
  summary: string;
  minutes: number;
  objectives: string[];
  blocks: Block[];
  /** 0 = no passing score. */
  pass_score: number;
  mentor_review: boolean;
  due_days: number | null;
  /** Company track only: assigned to everyone automatically. */
  required: boolean;
  guest_visible: boolean;
  builtin: 'practice' | null;
  status: 'draft' | 'published';
  sort: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleModule { job_role_id: string; module_id: string; sort: number }

export type ProgressStatus = 'in_progress' | 'submitted' | 'returned' | 'completed';
export interface Progress {
  member_id: string;
  module_id: string;
  status: ProgressStatus;
  step: number;
  score: number | null;
  answer: string;
  feedback: string;
  reviewer_id: string | null;
  started_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

// ───────── documents ─────────

export type TemplateKind = 'form' | 'upload' | 'esign' | 'checklist';
export type TemplateStage = 'before' | 'onboarding' | 'first_week';
export type FieldType = 'text' | 'email' | 'phone' | 'date' | 'choice' | 'file' | 'check' | 'sign' | 'secure' | 'info';

export interface TemplateField {
  /** Stable key inside answers. */
  k: string;
  type: FieldType;
  label: string;
  required?: boolean;
  /** Encrypt the answer (always true for type 'secure'); for files, marks the file as sensitive. */
  secure?: boolean;
  options?: string[];
  help?: string;
}

export interface Template {
  id: string;
  title: string;
  kind: TemplateKind;
  stage: TemplateStage;
  audience: 'everyone' | 'role' | 'candidates';
  job_role_id: string | null;
  description: string;
  fields: TemplateField[];
  legal_review: boolean;
  status: 'draft' | 'published';
  version: number;
  sort: number;
  created_at: string;
  updated_at: string;
}

export interface SubmissionFile { k: string; label: string; name: string; path: string; secure?: boolean }

export interface Submission {
  id: string;
  member_id: string;
  template_id: string | null;
  template_title: string;
  template_version: number;
  /** Non-sensitive answers by field key. Sensitive ones live encrypted; reveal with rpc('ramp_reveal'). */
  answers: Record<string, string>;
  secure_fields: string[];
  files: SubmissionFile[];
  signed_name: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface SignIn { id: number; member_id: string; at: string; ip: string | null; user_agent: string | null }
export interface AuditEntry { id: number; at: string; actor_id: string | null; action: string; member_id: string | null; detail: string; ip: string | null; user_agent: string | null }

// ───────── everyday tools ─────────

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done';
export interface Task {
  id: string;
  member_id: string;
  title: string;
  notes: string;
  due_date: string | null;
  status: TaskStatus;
  template_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: string;
  member_id: string;
  parent_id: string | null;
  title: string;
  body: string;
  shared: boolean;
  module_id: string | null;
  files: { name: string; path: string; size?: number }[];
  sort: number;
  created_at: string;
  updated_at: string;
}

export interface VaultEntry { id: string; member_id: string; label: string; username: string; url: string; created_at: string; updated_at: string }

export interface Channel { id: string; slug: string; name: string; description: string; kind: 'company' | 'department' | 'cohort' | 'dm'; department_id: string | null; read_only: boolean; created_at: string }
export interface ChannelMember { channel_id: string; member_id: string }
export interface Message { id: number; channel_id: string; member_id: string | null; body: string; created_at: string }

export interface Announcement { id: string; title: string; body: string; audience: 'everyone' | 'trainees' | 'employees' | 'department'; department_id: string | null; require_ack: boolean; created_by: string | null; created_at: string }
export interface Ack { announcement_id: string; member_id: string; at: string }

export interface Resource {
  id: string;
  title: string;
  category: 'policy' | 'sop' | 'guide' | 'tool' | 'other';
  url: string;
  body: string;
  file_path: string | null;
  required: boolean;
  job_role_id: string | null;
  guest_visible: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
}
