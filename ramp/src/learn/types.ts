// Interactive lesson blocks: visuals, drills, scenarios and practice versions of everyday tools.
// They sit in a module's blocks next to slides, readings and quizzes. Each one is a single step in the player.
// The RAMP Assistant writes them too: src/learn/schema.ts holds the format it's given and the validator for imports.

/** A picture: "media:<id>" (uploaded to RAMP), an https link, or a file in /public. */
export type MediaSrc = string;

export type VisualLayout = 'steps' | 'cycle' | 'cards' | 'pillars' | 'compare' | 'timeline';

export interface VisualBlock {
  type: 'visual';
  title: string;
  intro?: string;
  layout: VisualLayout;
  items: { title: string; body?: string; icon?: string; image?: MediaSrc }[];
  note?: string;
}

export interface ImageBlock { type: 'image'; src: MediaSrc; alt: string; caption?: string; title?: string }

export type ChoiceResult = 'best' | 'ok' | 'poor';
export interface ScenarioBlock {
  type: 'scenario';
  title: string;
  setup?: string;
  /** The message that starts it, shown like a real chat or email. */
  message?: { from: string; channel?: string; time?: string; text: string };
  question: string;
  choices: { text: string; result: ChoiceResult; feedback: string }[];
}

export interface OrderBlock { type: 'order'; title: string; prompt: string; items: string[] }

export interface SortBlock {
  type: 'sort';
  title: string;
  prompt: string;
  groups: string[];
  items: { text: string; group: number; why?: string }[];
}

export interface MatchBlock { type: 'match'; title: string; prompt: string; pairs: { left: string; right: string }[] }

export interface FlashcardsBlock { type: 'flashcards'; title: string; intro?: string; cards: { front: string; back: string }[] }

export interface ChecklistBlock { type: 'checklist'; title: string; intro?: string; items: string[] }

export interface HotspotBlock {
  type: 'hotspot';
  title: string;
  intro?: string;
  image: MediaSrc;
  /** Boxes are percentages of the image. */
  steps: { prompt: string; x: number; y: number; w: number; h: number; tip?: string }[];
}

export interface RealWorkBlock {
  type: 'realwork';
  title: string;
  body: string;
  action: 'task' | 'note' | 'message';
  task?: { title: string; notes?: string; due_days?: number };
  note?: { title: string; body: string };
  message?: { text: string };
}

// ───────── practice tools ─────────

export type TaskType = 'Operational' | 'Administrative';
export type Duration = 'Quick task' | 'Small project' | 'Big project';
export type Priority = 'Low' | 'Normal' | 'High' | 'Urgent';

export interface TaskSimRequest {
  id: string;
  from: string;
  text: string;
  /** create: log it as a new task. comment: add an update to an existing task (by title). */
  action?: 'create' | 'comment';
  task?: string;
  expect: { list?: string; type?: TaskType; duration?: Duration; priority?: Priority; keywords?: string[] };
  why?: string;
}

export interface TaskSim {
  type: 'sim';
  tool: 'tasks';
  title: string;
  brief: string;
  space?: string;
  lists: string[];
  tasks?: { title: string; list: string; status?: 'To do' | 'In progress' | 'Done'; description?: string; comments?: string[] }[];
  requests: TaskSimRequest[];
}

export interface CalendarSim {
  type: 'sim';
  tool: 'calendar';
  title: string;
  brief: string;
  day: string;
  /** Whole hours, 24h clock. */
  start: number;
  end: number;
  events: { title: string; start: string; end: string; kind?: 'meeting' | 'personal' | 'focus' }[];
  blocks: { id: string; title: string; minutes: number; after?: string; before?: string; why?: string }[];
}

export type TriageAction = 'reply' | 'task' | 'calendar' | 'sync' | 'archive' | 'forward' | 'note';

export interface TriageMessage {
  id: string;
  from: string;
  subject?: string;
  time: string;
  body: string;
  /** Any of these counts as right. */
  expect: TriageAction[];
  why: string;
  /** When replying is right: what a good reply says. */
  reply?: { mustInclude?: string[]; hint?: string };
}

export interface TriageSim {
  type: 'sim';
  tool: 'inbox' | 'chat';
  title: string;
  brief: string;
  /** Inbox address or channel name. */
  place: string;
  messages: TriageMessage[];
}

export type SimBlock = TaskSim | CalendarSim | TriageSim;

export type InteractiveBlock =
  | VisualBlock | ImageBlock | ScenarioBlock | OrderBlock | SortBlock | MatchBlock | FlashcardsBlock
  | ChecklistBlock | HotspotBlock | RealWorkBlock | SimBlock;

export type InteractiveType = InteractiveBlock['type'];

/** What a learner did on one interactive step. Scores are 0–100. */
export interface StepResult { first: number; best: number; tries: number; done: boolean }
