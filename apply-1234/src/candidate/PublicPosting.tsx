import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isPreviewBrowser, visitorId } from '../lib/util';
import { mdToHtml } from '../lib/posting';
import type { Fragment } from '../lib/types';
import { Spinner, Wordmark } from '../ui';

interface Posting { title: string; posting: string; fragments: Fragment[]; hint_format: string }

export default function PublicPosting() {
  const { publicId } = useParams();
  const [data, setData] = useState<Posting | null | undefined>(undefined);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    supabase.rpc('hiring_public_posting', { p_public_id: publicId, p_visitor: isPreviewBrowser() ? '' : visitorId() })
      .then(({ data }) => setData((data as Posting) ?? null));
  }, [publicId]);

  if (data === undefined) return <div className="min-h-dvh flex items-center justify-center text-muted"><Spinner /></div>;
  if (data === null)
    return (
      <main className="min-h-dvh flex items-center justify-center px-6 text-center">
        <div><h1 className="font-display text-4xl">This posting isn't available.</h1>
          <p className="text-muted mt-3">It may have closed or been unpublished.</p></div>
      </main>
    );

  return (
    <main className="min-h-dvh">
      <header className="max-w-2xl mx-auto px-5 pt-8 flex items-center justify-between">
        <Wordmark className="text-sm" />
        <span className="text-xs text-muted">Job posting</span>
      </header>
      <article className="max-w-2xl mx-auto px-5 py-10 rise">
        <h1 className="font-display text-5xl leading-[1.02]">{data.title}</h1>
        <div className="prose-posting mt-6"
          dangerouslySetInnerHTML={{ __html: mdToHtml(data.posting, 'hint', data.fragments || [], data.hint_format) }} />
      </article>
    </main>
  );
}
