import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isPreviewBrowser, visitorId } from '../lib/util';
import type { Activity as ActivityT, Question } from '../lib/types';
import { Spinner, Wordmark } from '../ui';
import Activity from './Activity';

type Result =
  | { found: false }
  | { found: true; closed: true; title: string }
  | { found: true; closed: false; job_id: string; title: string; activity: ActivityT; questions: Question[]; source?: { code: string; label: string } | null };

export default function Resolver() {
  const { pathname } = useLocation();
  const [res, setRes] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    setRes(null);
    let path = pathname;
    try { path = decodeURIComponent(pathname); } catch { /* keep raw */ }
    supabase
      .rpc('hiring_resolve', {
        p_path: path,
        p_visitor: visitorId(),
        p_meta: {
          ref: document.referrer ? safeHost(document.referrer) : '',
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          preview: isPreviewBrowser(),
        },
      })
      .then(({ data, error }) => {
        if (error) { setFailed(true); return; }
        setRes((data as Result) ?? { found: false });
      });
  }, [pathname]);

  if (failed) return <Message title="Something went wrong." body="Please refresh the page in a moment." />;
  if (!res) return <div className="min-h-dvh flex items-center justify-center text-muted"><Spinner /></div>;
  if (!res.found) return <NotFound />;
  if (res.closed) return <Message title="Applications for this role have closed." body={`Thanks for your interest in the ${res.title} role. This activity is no longer accepting submissions.`} />;
  return <Activity jobId={res.job_id} title={res.title} activity={res.activity || {}} questions={res.questions || []} source={res.source || null} />;
}

function safeHost(u: string) {
  try { return new URL(u).host; } catch { return ''; }
}

function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md text-center rise">
          <p className="font-mono text-sm text-muted">404</p>
          <h1 className="font-display text-5xl sm:text-6xl leading-[1.02] mt-4">Nothing here.</h1>
          <p className="text-ink-2 mt-5 leading-relaxed">
            This address doesn't lead anywhere. Check the pieces you put together: the order, the spelling, and
            the characters between them.
          </p>
        </div>
      </div>
      <footer className="py-6 text-center"><Wordmark className="text-sm text-muted" /></footer>
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-dvh flex items-center justify-center px-6">
      <div className="max-w-md text-center rise">
        <Wordmark className="text-base" />
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] mt-6">{title}</h1>
        <p className="text-ink-2 mt-4 leading-relaxed">{body}</p>
      </div>
    </main>
  );
}
