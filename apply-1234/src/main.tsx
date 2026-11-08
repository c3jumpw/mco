import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { ToastProvider, Loading } from './ui';
import Home from './candidate/Home';
import Resolver from './candidate/Resolver';
import PublicPosting from './candidate/PublicPosting';

const AdminApp = lazy(() => import('./admin/AdminApp'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/p/:publicId" element={<PublicPosting />} />
          <Route path="/admin/*" element={<Suspense fallback={<Loading />}><AdminApp /></Suspense>} />
          <Route path="*" element={<Resolver />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>
);
