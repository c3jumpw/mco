import { useEffect, useState } from 'react';
import { Loading } from '../ui';

// The guide is one self-contained HTML page (built by scripts/guide/build.py), loaded only when
// someone opens it, and shown in a frame so its styles never mix with the app's.
export default function Guide() {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    document.title = 'Guide · apply1234';
    import('./guide/guide.html?raw').then((m) => setHtml(m.default)).catch(() => setFailed(true));
    return () => { document.title = 'apply1234 · admin'; };
  }, []);

  const openTab = () => {
    if (!html) return;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (failed) return <p className="text-sm text-bad py-10">Couldn't load the guide. Refresh the page to try again.</p>;
  if (!html) return <Loading label="Loading the guide" />;
  return (
    <div className="-mx-4 sm:-mx-6 -mt-6">
      <div className="h-10 px-4 sm:px-6 flex items-center justify-between border-b border-line text-sm">
        <span className="text-muted">How to use apply1234</span>
        <button onClick={openTab} className="text-muted hover:text-ink underline underline-offset-2">Open in a new tab ↗</button>
      </div>
      <iframe title="apply1234 guide" srcDoc={html} className="block w-full border-0 h-[calc(100dvh-12rem)] sm:h-[calc(100dvh-8.5rem)]" />
    </div>
  );
}
