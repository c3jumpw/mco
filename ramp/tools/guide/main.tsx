// @ts-nocheck
// The real RAMP app (src/App.tsx) with the sample-data session and backend.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './harness.css';
import { SessionProvider } from './session';
import { ToastProvider } from '@app/ui';
import App from '@app/App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
