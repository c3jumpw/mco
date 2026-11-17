// Shapes of the ramp_ tables (see supabase/migrations/001_ramp_schema.sql).

export type Level = 'owner' | 'admin' | 'lead' | 'mentor' | 'employee' | 'trainee' | 'guest' | 'client';
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
  agency: AgencySettings;
  updated_at: string;
}
export type FlowStepId = 'welcome' | 'profile' | 'practice' | 'documents' | 'mentor' | 'done';
export interface FlowStep { id: FlowStepId; on: boolean }
export interface OrgFlags { chat: boolean; tasks: boolean; certificates: boolean; record_ip: boolean; agency?: boolean }

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
  /** Client contacts (level 'client') belong to one client company. */
  client_id: string | null;
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

// ───────── agency: clients, placements, money ─────────

export type StepOwner = 'agency' | 'client' | 'va';
export interface ChecklistTemplateItem { title: string; owner: StepOwner }
export interface LaunchAgendaTemplateItem { key: string; title: string; minutes: number; section: LaunchSection | null }

/** ramp_org.agency — settings for the staffing side of RAMP (Admin › Agency settings). */
export interface AgencySettings {
  checklist: ChecklistTemplateItem[];
  /** Days after the start date when the first check-ins are due (one with the client, one with the assistant). */
  checkin_days: number[];
  /** After a check-in is done, the next one of the same kind is scheduled this many days later. */
  checkin_every_days: number;
  /** Replacement guarantee length from the start date. */
  replacement_days: number;
  invoice_prefix: string;
  next_invoice_number: number;
  /** Only pay assistants for hours on paid invoices (or prepaid periods). */
  pay_when_paid: boolean;
  default_setup_fee: number;
  payout_currency: string;
  launch_agenda: LaunchAgendaTemplateItem[];
}

export type ClientStatus = 'prospect' | 'active' | 'paused' | 'ended';
export interface Client {
  id: string;
  name: string;
  website: string;
  industry: string;
  timezone: string;
  status: ClientStatus;
  billing_name: string;
  billing_email: string;
  billing_address: string;
  billing_cycle: 'weekly' | 'biweekly' | 'monthly';
  /** arrears: bill approved hours after the fact. advance: bill scheduled hours up front, settle the difference next time. */
  billing_mode: 'arrears' | 'advance';
  net_days: number;
  currency: string;
  stripe_customer_id: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tier {
  id: string;
  name: string;
  level: number;
  description: string;
  /** Default rates for new placements at this tier. Bill rate is admin-only. */
  bill_rate: number;
  pay_rate: number;
  required_modules: string[];
  min_days: number;
  min_checkin_score: number;
  created_at: string;
  updated_at: string;
}

export interface ClientModule { client_id: string; module_id: string; sort: number }

export type PlacementStatus = 'proposed' | 'onboarding' | 'active' | 'paused' | 'ended';
export interface Placement {
  id: string;
  client_id: string;
  member_id: string;
  title: string;
  tier_id: string | null;
  status: PlacementStatus;
  start_date: string | null;
  end_date: string | null;
  hours_per_week: number;
  schedule: string;
  bill_rate: number;
  pay_rate: number;
  currency: string;
  setup_fee: number;
  setup_fee_status: 'none' | 'unbilled' | 'invoiced' | 'paid' | 'waived';
  coach_id: string | null;
  client_contact_id: string | null;
  replaces_id: string | null;
  guarantee_until: string | null;
  ended_reason: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlacementStep { id: string; placement_id: string; title: string; owner: StepOwner; sort: number; done_at: string | null; done_by: string | null; note: string }

export interface RateChange {
  id: string;
  placement_id: string;
  effective_date: string;
  old_tier_id: string | null;
  new_tier_id: string | null;
  old_bill: number;
  new_bill: number;
  old_pay: number;
  new_pay: number;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface Checkin {
  id: string;
  placement_id: string;
  kind: 'client' | 'va';
  due_date: string | null;
  status: 'scheduled' | 'done' | 'skipped';
  done_at: string | null;
  by_member: string | null;
  score: number | null;
  went_well: string;
  improve: string;
  actions: string;
  share_with_client: boolean;
  created_at: string;
  updated_at: string;
}

export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export interface Timesheet {
  id: string;
  placement_id: string;
  member_id: string;
  /** Monday. */
  week_start: string;
  /** Hours Monday to Sunday. */
  days: number[];
  total: number;
  notes: string;
  status: TimesheetStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string;
  pay_rate: number | null;
  invoice_line_id: string | null;
  payout_line_id: string | null;
  created_at: string;
  updated_at: string;
}

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void';
export interface Invoice {
  id: string;
  client_id: string;
  number: string;
  status: InvoiceStatus;
  period_start: string;
  period_end: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  total: number;
  paid_at: string | null;
  paid_note: string;
  stripe_invoice_id: string | null;
  stripe_url: string | null;
  stripe_pdf: string | null;
  sent_at: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export interface InvoiceLine {
  id: string;
  invoice_id: string;
  placement_id: string | null;
  kind: 'hours' | 'prepay' | 'adjustment' | 'setup_fee' | 'other';
  description: string;
  quantity: number;
  unit_price: number;
  /** Generated: quantity × unit_price. Never write it. */
  amount: number;
  period_start: string | null;
  period_end: string | null;
  reconciled_at: string | null;
  sort: number;
}

export interface Payout {
  id: string;
  label: string;
  period_start: string;
  period_end: string;
  status: 'draft' | 'exported' | 'sent';
  currency: string;
  total: number;
  exported_at: string | null;
  sent_at: string | null;
  reference: string;
  notes: string;
  /** Set when a draft is discarded; hide these. */
  discarded_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export interface PayoutLine {
  id: string;
  payout_id: string;
  member_id: string;
  placement_id: string | null;
  kind: 'hours' | 'bonus' | 'adjustment';
  description: string;
  quantity: number;
  rate: number;
  /** Generated: quantity × rate. Never write it. */
  amount: number;
  sort: number;
}

export type PayeeMethod = 'wise_recipient' | 'wise_email' | 'bank' | 'other';
/** From rpc('ramp_payee_get'). Bank details are encrypted; reveal with rpc('ramp_payee_reveal'). */
export interface PayeeInfo {
  method: PayeeMethod;
  account_name: string;
  email: string;
  wise_recipient_id: string;
  target_currency: string;
  has_bank: boolean;
  notes: string;
  updated_at: string;
}
/** Row from rpc('ramp_payout_export'). */
export interface PayoutExportRow {
  member_id: string;
  name: string;
  email: string;
  method: PayeeMethod;
  wise_recipient_id: string;
  account_name: string;
  target_currency: string;
  amount: number;
  currency: string;
  reference: string;
  bank: Record<string, string> | null;
}

export interface ClientRequest {
  id: string;
  client_id: string;
  placement_id: string | null;
  member_id: string | null;
  kind: 'support' | 'replacement' | 'hours' | 'new_va' | 'other';
  body: string;
  status: 'open' | 'in_progress' | 'done';
  response: string;
  created_at: string;
  updated_at: string;
}

/** rpc('ramp_my_roles') */
export interface MyRoles { work: boolean; coaching: number; client: { id: string; name: string } | null }

/** rpc('ramp_my_work') — an assistant's own placements. Never contains bill rates. */
export interface MyWork {
  placements: {
    id: string; title: string; status: PlacementStatus; start_date: string | null; end_date: string | null;
    hours_per_week: number; schedule: string; pay_rate: number; currency: string;
    client: { name: string; timezone: string; website: string };
    coach: { id: string | null; name: string | null };
    tier: { id: string; name: string; level: number } | null;
    steps: { id: string; title: string; owner: StepOwner; done_at: string | null }[];
    next_checkin: string | null;
    checkin_avg: number | null;
    days_active: number | null;
  }[];
  tiers: { id: string; name: string; level: number; description: string; pay_rate: number; required_modules: string[];
    min_days: number; min_checkin_score: number; module_titles: string[] }[];
  completed_modules: string[];
  payouts: { id: string; payout_id: string; label: string; status: Payout['status']; sent_at: string | null; description: string;
    quantity: number; rate: number; amount: number; currency: string }[];
  payee: PayeeInfo | null;
}

export interface TrainingSummary { total: number; done: number; pct: number; next: string | null }

/** rpc('ramp_client_portal') — what a client contact sees. Never contains pay rates. */
export interface ClientPortal {
  client: { id: string; name: string; timezone: string; billing_cycle: Client['billing_cycle']; billing_mode: Client['billing_mode']; net_days: number; billing_email: string };
  placements: {
    id: string; title: string; status: PlacementStatus; start_date: string | null; end_date: string | null;
    hours_per_week: number; schedule: string; bill_rate: number; currency: string; guarantee_until: string | null;
    tier: { name: string; level: number; description: string } | null;
    va: { id: string; name: string; email: string; timezone: string };
    coach: { name: string | null };
    steps: { id: string; title: string; owner: StepOwner; done_at: string | null }[];
    training: TrainingSummary;
    checkins: { id: string; kind: 'client' | 'va'; done_at: string; score: number | null; went_well: string; improve: string; actions: string; by_name: string | null }[];
    next_checkin: string | null;
    hours_this_week: number;
    hours_last_week: number;
  }[];
  timesheets: { id: string; placement_id: string; va_name: string; title: string; week_start: string; days: number[]; total: number;
    notes: string; status: TimesheetStatus; submitted_at: string | null; reviewed_at: string | null; review_note: string }[];
  requests: ClientRequest[];
}

/** rpc('ramp_coach_placements') items. No rates. */
export interface CoachPlacementSummary {
  id: string; title: string; status: PlacementStatus; start_date: string | null; hours_per_week: number; schedule: string; guarantee_until: string | null;
  client: { id: string; name: string; timezone: string };
  va: { id: string; name: string; email: string };
  tier: { id: string; name: string; level: number } | null;
  steps_total: number; steps_done: number;
  next_checkin: { id: string; kind: 'client' | 'va'; due_date: string } | null;
  last_score: number | null;
  training: TrainingSummary;
}
/** rpc('ramp_coach_placement', { p_placement }) */
export interface CoachPlacementDetail {
  id: string; title: string; status: PlacementStatus; start_date: string | null; end_date: string | null; hours_per_week: number;
  schedule: string; notes: string; guarantee_until: string | null;
  client: { id: string; name: string; timezone: string; website: string };
  va: { id: string; name: string; email: string; timezone: string };
  coach: { id: string | null; name: string | null };
  tier: { id: string; name: string; level: number } | null;
  training: TrainingSummary;
  steps: { id: string; title: string; owner: StepOwner; done_at: string | null; done_by: string | null; note: string }[];
  checkins: (Checkin & { by_name: string | null })[];
  timesheets: { id: string; week_start: string; total: number; status: TimesheetStatus; days: number[]; notes: string; review_note: string }[];
}

// ───────── launch plans (first days at a client) ─────────

export type LaunchSection = 'company' | 'values' | 'projects' | 'checklists' | 'tools' | 'milestones' | 'schedules';
export interface QuickSteps { id?: string; title: string; steps: string[] }
export interface LaunchFile { name: string; path: string }
/** ramp_launch_plans.data — every part optional; the wizard fills it in. */
export interface LaunchData {
  company?: { summary?: string; public_info?: string; admin_info?: string; presentation_url?: string; files?: LaunchFile[] };
  values?: { id: string; title: string; practice: string }[];
  projects?: { id: string; name: string; priority: 'high' | 'medium' | 'low'; status: string; progress: number; challenges: string;
    links: string[]; files: LaunchFile[]; objectives: QuickSteps[] }[];
  checklists?: { id: string; title: string; frequency: 'daily' | 'weekly'; items: QuickSteps[] }[];
  tools?: { id: string; name: string; purpose: string; access_how: string; url: string; granted: boolean; tested: boolean }[];
  milestones?: { id: string; title: string; due_day: number | null; scope: 'individual' | 'team' | 'company'; why: string; reward: string }[];
  schedules?: { period: 'training' | 'post_training' | 'staff'; blocks: { id: string; days: string; start: string; end: string; focus: string }[] }[];
  /** Day 1 run details: planned start time (HH:MM, client's zone) and when Day 1 was started and finished. */
  run?: { start?: string; started_at?: string | null; finished_at?: string | null };
}
/** An agenda row; done_at, stage (walkthrough 0–3) and checks (access tests passed) are filled in on Day 1. */
export interface LaunchAgendaItem extends LaunchAgendaTemplateItem { done: boolean; notes: string; done_at?: string | null; stage?: number; checks?: string[] }
export interface LaunchPlan {
  placement_id: string;
  status: 'preparing' | 'ready' | 'in_progress' | 'done';
  day1_date: string | null;
  data: LaunchData;
  agenda: LaunchAgendaItem[];
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}
/** rpc('ramp_launch_get', { p_placement }) — creates the plan from the agency template on first open (not for assistants). */
export interface LaunchGet {
  role: 'admin' | 'coach' | 'client' | 'va';
  plan: LaunchPlan | null;
  placement: { id: string; title: string; status: PlacementStatus; start_date: string | null; hours_per_week: number; schedule: string;
    client: { id: string; name: string; timezone: string }; va: { id: string; name: string }; coach: { id: string | null; name: string | null };
    tier: { name: string; level: number } | null };
}
