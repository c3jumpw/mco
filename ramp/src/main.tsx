import { StrictMode, Suspense, lazy, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { SessionProvider, useSession } from './lib/session';
import { Loading, ToastProvider } from './ui';
import Login, { Blocked, LoadError, NoAccess, ResetPassword } from './auth/Login';
import AppShell from './shell/AppShell';
import More from './pages/More';

// Pages load on demand so the first screen is quick on phones.
// A failed chunk (after a new deploy) reloads the page once to pick up the new files.
function page(load: () => Promise<{ default: ComponentType }>) {
  return lazy(() => load().catch((e) => {
    if (!sessionStorage.getItem('ramp-reloaded')) { sessionStorage.setItem('ramp-reloaded', '1'); window.location.reload(); }
    throw e;
  }));
}

const Home = page(() => import('./pages/Home'));
const Welcome = page(() => import('./pages/Welcome'));
const Training = page(() => import('./pages/Training'));
const ModulePlayer = page(() => import('./pages/ModulePlayer'));
const Practice = page(() => import('./pages/Practice'));
const Tasks = page(() => import('./pages/Tasks'));
const Notes = page(() => import('./pages/Notes'));
const Vault = page(() => import('./pages/Vault'));
const Chat = page(() => import('./pages/Chat'));
const Resources = page(() => import('./pages/Resources'));
const News = page(() => import('./pages/News'));
const Team = page(() => import('./pages/Team'));
const TeamMember = page(() => import('./pages/TeamMember'));
const Me = page(() => import('./pages/Me'));

const AdminHome = page(() => import('./admin/AdminHome'));
const Org = page(() => import('./admin/Org'));
const Roles = page(() => import('./admin/Roles'));
const Flow = page(() => import('./admin/Flow'));
const Documents = page(() => import('./admin/Documents'));
const DocumentEditor = page(() => import('./admin/DocumentEditor'));
const TrainingAdmin = page(() => import('./admin/TrainingAdmin'));
const ModuleBuilder = page(() => import('./admin/ModuleBuilder'));
const Assign = page(() => import('./admin/Assign'));
const People = page(() => import('./admin/People'));
const Person = page(() => import('./admin/Person'));
const Metrics = page(() => import('./admin/Metrics'));
const NewsAdmin = page(() => import('./admin/NewsAdmin'));
const ResourcesAdmin = page(() => import('./admin/ResourcesAdmin'));
const System = page(() => import('./admin/System'));

function Root() {
  const { state, rank, isAdmin, org } = useSession();
  if (state.status === 'loading') return <Loading full label="Opening RAMP…" />;
  if (state.status === 'signed_out') return <Login />;
  if (state.status === 'recovery') return <ResetPassword />;
  if (state.status === 'no_access') return <NoAccess email={state.email} requested={state.requested} />;
  if (state.status === 'inactive' || state.status === 'expired') return <Blocked kind={state.status} email={state.email} />;
  if (state.status === 'error') return <LoadError message={state.message} />;
  sessionStorage.removeItem('ramp-reloaded');
  const staff = rank <= 6;
  const flags = org?.flags || { chat: true, tasks: true, certificates: false, record_ip: true };
  return (
    <Suspense fallback={<Loading full />}>
      <Routes>
        {/* Full-screen focus pages */}
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/training/:id" element={<ModulePlayer />} />
        <Route path="/practice" element={<Practice />} />

        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="training" element={<Training />} />
          <Route path="resources" element={<Resources />} />
          <Route path="me" element={<Me />} />
          {staff && <Route path="more" element={<More />} />}
          {staff && flags.tasks && <Route path="tasks" element={<Tasks />} />}
          {staff && <Route path="notes" element={<Notes />} />}
          {staff && <Route path="notes/:id" element={<Notes />} />}
          {staff && <Route path="vault" element={<Vault />} />}
          {staff && flags.chat && <Route path="chat" element={<Chat />} />}
          {staff && flags.chat && <Route path="chat/:id" element={<Chat />} />}
          {staff && <Route path="news" element={<News />} />}
          {rank <= 4 && <Route path="team" element={<Team />} />}
          {rank <= 4 && <Route path="team/:id" element={<TeamMember />} />}
          {isAdmin && (
            <Route path="admin">
              <Route index element={<AdminHome />} />
              <Route path="org" element={<Org />} />
              <Route path="roles" element={<Roles />} />
              <Route path="flow" element={<Flow />} />
              <Route path="documents" element={<Documents />} />
              <Route path="documents/:id" element={<DocumentEditor />} />
              <Route path="training" element={<TrainingAdmin />} />
              <Route path="training/:id" element={<ModuleBuilder />} />
              <Route path="assign" element={<Assign />} />
              <Route path="people" element={<People />} />
              <Route path="people/:id" element={<Person />} />
              <Route path="metrics" element={<Metrics />} />
              <Route path="news" element={<NewsAdmin />} />
              <Route path="resources" element={<ResourcesAdmin />} />
              <Route path="system" element={<System />} />
            </Route>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <Root />
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
