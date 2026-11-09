// Shape of src/guide/guide.json: the written guide plus annotated screenshots of the real app.

export type GuideAudience = 'everyone' | 'staff' | 'reviewers' | 'admins';
export type GuideGroup = 'start' | 'daily' | 'team' | 'admin';

export interface GuideHotspot {
  n: number;
  /** Box position and size as percentages of the image. */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  text: string;
}

export interface GuideShot {
  src: string;
  w: number;
  h: number;
  device: 'phone' | 'desktop';
  caption: string;
  alt: string;
  hotspots: GuideHotspot[];
}

export interface GuideSection {
  id: string;
  group: GuideGroup;
  audience: GuideAudience;
  title: string;
  icon: string;
  summary: string;
  route: string | null;
  shots: GuideShot[];
  steps?: { title: string; text: string }[];
  tips?: string[];
  settings?: { name: string; where: string; effect: string }[];
}

export interface GuideData { sections: GuideSection[] }

/** Highest rank (1 owner … 7 guest) that can see a section. */
export const AUDIENCE_RANK: Record<GuideAudience, number> = { everyone: 7, staff: 6, reviewers: 4, admins: 2 };

export const GROUPS: { id: GuideGroup; title: string; blurb: string }[] = [
  { id: 'start', title: 'Getting started', blurb: 'Signing in, finding your way around and your first days.' },
  { id: 'daily', title: 'Everyday tools', blurb: 'Training, documents, tasks, notes, chat and everything you use day to day.' },
  { id: 'team', title: 'Mentors and leads', blurb: 'Following your people’s progress, reviewing work and assigning tasks.' },
  { id: 'admin', title: 'Admin portal', blurb: 'Setting up the organization, building training and documents, managing people and records.' },
];
