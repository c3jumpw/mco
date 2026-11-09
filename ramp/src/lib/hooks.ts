import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { supabase, errText } from './supabase';
import type { DirEntry } from './types';

export interface Async<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (v: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Run an async loader and keep its result. `reload()` re-runs it without blanking the screen.
 * Throw inside the loader (or return a Supabase error) to show an error.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): Async<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const v = await fnRef.current();
      if (n === seq.current) { setData(v); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(errText(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, deps);

  return { data, error, loading, reload: run, setData: setData as Async<T>['setData'] };
}

/** Unwrap a Supabase response: throw its error, return its data. */
export async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

// ───────── staff directory (names and roles only), cached for the session ─────────

let dirCache: Promise<DirEntry[]> | null = null;
export function loadDirectory(force = false): Promise<DirEntry[]> {
  if (!dirCache || force) {
    dirCache = q<DirEntry[]>(supabase.rpc('ramp_directory')).catch((e) => { dirCache = null; throw e; });
  }
  return dirCache;
}
export function invalidateDirectory() { dirCache = null; }

export function useDirectory() {
  const [list, setList] = useState<DirEntry[]>([]);
  useEffect(() => { loadDirectory().then(setList).catch(() => setList([])); }, []);
  const byId = useCallback((id: string | null | undefined) => list.find((d) => d.id === id) || null, [list]);
  return { list, byId };
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · RAMP` : 'RAMP';
  }, [title]);
}

/** Debounced autosave: call `save(value)` `ms` after the last change. Returns 'idle' | 'saving' | 'saved' | 'error'. */
export function useAutosave<T>(value: T, save: (v: T) => Promise<void>, ms = 800, enabled = true) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const first = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!enabled) return;
    if (first.current) { first.current = false; return; }
    setStatus('saving');
    const t = setTimeout(() => {
      saveRef.current(value).then(() => setStatus('saved')).catch(() => setStatus('error'));
    }, ms);
    return () => clearTimeout(t);
  }, [value, ms, enabled]);
  return status;
}

/** True below the md breakpoint (768px). */
export function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}
