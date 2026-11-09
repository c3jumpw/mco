// The guide as its own page, for sharing outside RAMP (built with `npm run build:guide`).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import './standalone.css';
import GuideView, { type GuideViewMode } from './GuideView';
import type { GuideData } from './types';
import data from './guide.json';
import { ToastProvider } from '../ui';

const view = (new URLSearchParams(window.location.search).get('view') as GuideViewMode | null) || 'admin';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <ToastProvider>
        <main className="max-w-6xl mx-auto px-4 md:px-8 py-5 md:py-10">
          <GuideView data={data as GuideData} rank={1} initialView={view} media={(s) => s.replace(/^\//, '')}
            appUrl="https://mco-ramp.vercel.app" standalone />
          <footer className="mt-10 pb-6 text-center text-sm text-muted">
            RAMP · training, onboarding and resources · <a className="text-brand-ink font-semibold" href="https://mco-ramp.vercel.app" target="_blank" rel="noopener noreferrer">Open RAMP</a>
          </footer>
        </main>
      </ToastProvider>
    </MemoryRouter>
  </StrictMode>,
);
