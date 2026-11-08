import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { isPreviewBrowser, visitorId } from '../lib/util';
import { Wordmark } from '../ui';

export default function Home() {
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    supabase.rpc('hiring_resolve', {
      p_path: '',
      p_visitor: visitorId(),
      p_meta: { ref: document.referrer ? new URL(document.referrer).host : '', preview: isPreviewBrowser() },
    }).then(() => {});
  }, []);

  return (
    <main className="min-h-dvh flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md text-center rise">
          <Wordmark className="text-xl" />
          <h1 className="font-display text-5xl sm:text-6xl leading-[1.02] mt-8">Close, but not quite.</h1>
          <p className="text-ink-2 mt-5 leading-relaxed">
            If you're applying for a role, the page you need has its own address. Everything you need to find it is
            in the job posting, so read it carefully, start to finish.
          </p>
        </div>
      </div>
      <footer className="py-6 text-center text-xs text-muted">apply1234.com</footer>
    </main>
  );
}
