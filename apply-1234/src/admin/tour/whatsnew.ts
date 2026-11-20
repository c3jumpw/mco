// What's new: the entries of the change log (../changelog.ts) that have a `version`, newest first.
// Add the release to the change log, with the next version number, whenever something people can see
// changes. Admins see entries newer than the last one they read, once.
import { CHANGELOG } from '../changelog';

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

export const CHANGES: Change[] = CHANGELOG
  .filter((r) => r.version)
  .map((r) => ({ version: r.version!, date: r.date, title: r.title, items: r.whatsNew || r.items, image: r.image, phone: r.phone, to: r.to, toLabel: r.toLabel }))
  .sort((a, b) => b.version - a.version);

export const LATEST = CHANGES[0].version;
