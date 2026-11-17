import { StrictMode, Suspense, lazy, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { SessionProvider, useSession } from './lib/session';
import { Loading, ToastProvider } from './ui';
import Login, { AccountBlocked, AccountPending, Blocked, LoadError, NoAccess, ResetPassword } from './auth/Login';
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
const Guide = page(() => import('./pages/Guide'));
const Work = page(() => import('./pages/Work'));
const Coaching = page(() => import('./pages/Coaching'));
const CoachingPlacement = page(() => import('./pages/CoachingPlacement'));
const Launch = page(() => import('./launch/Launch'));
const ClientHome = page(() => import('./client/ClientHome'));
const ClientHours = page(() => import('./client/ClientHours'));
const ClientInvoices = page(() => import('./client/ClientInvoices'));
const ClientInvoice = page(() => import('./client/ClientInvoice'));
const AgencyHome = page(() => import('./admin/agency/AgencyHome'));
const Clients = page(() => import('./admin/agency/Clients'));
const ClientDetail = page(() => import('./admin/agency/ClientDetail'));
const Placements = page(() => import('./admin/agency/Placements'));
const PlacementDetail = page(() => import('./admin/agency/PlacementDetail'));
const Tiers = page(() => import('./admin/agency/Tiers'));
const AgencySettings = page(() => import('./admin/agency/AgencySettings'));
const Timesheets = page(() => import('./admin/agency/Timesheets'));
const Invoices = page(() => import('./admin/agency/Invoices'));
const InvoiceDetail = page(() => import('./admin/agency/InvoiceDetail'));
const Payouts = page(() => import('./admin/agency/Payouts'));
const PayoutDetail = page(() => import('./admin/agency/PayoutDetail'));

const Setup = page(() => import('./admin/Setup'));
const Account = page(() => import('./admin/Account'));
const PlatformConsole = lazy(() => import('./platform/Console'));
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
  const { state, rank, isAdmin, isClient, isSuper, org, roles } = useSession();
  if (state.status === 'loading') return <Loading full label="Opening RAMP…" />;
  if (state.status === 'signed_out') return <Login />;
  if (state.status === 'recovery') return <ResetPassword />;
  if (state.status === 'no_access') return <NoAccess email={state.email} requested={state.requested} request={state.request} />;
  if (state.status === 'account_pending') return <AccountPending email={state.email} request={state.request} />;
  if (state.status === 'account_blocked') return <AccountBlocked kind={state.kind} email={state.email} />;
  if (state.status === 'console') return <Suspense fallback={<Loading full />}><PlatformConsole standalone /></Suspense>;
  if (state.status === 'inactive' || state.status === 'expired') return <Blocked kind={state.status} email={state.email} />;
  if (state.status === 'error') return <LoadError message={state.message} />;
  sessionStorage.removeItem('ramp-reloaded');
  const staff = rank <= 6;
  const flags = org?.flags || { chat: true, tasks: true, certificates: false, record_ip: true };
  const agency = flags.agency !== false;
  // Client pages: client contacts in the agency's workspace, or owners and admins of a client's own linked workspace.
  const clientView = (isClient && agency) || !!roles.client?.linked;
  return (
    <Suspense fallback={<Loading full />}>
      <Routes>
        {/* Full-screen focus pages */}
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/training/:id" element={<ModulePlayer />} />
        <Route path="/practice" element={<Practice />} />
        {isAdmin && <Route path="/setup" element={<Setup />} />}

        <Route element={<AppShell />}>
          <Route index element={isClient ? <Navigate to="/client" replace /> : <Home />} />
          {clientView && <Route path="client" element={<ClientHome />} />}
          {clientView && <Route path="client/hours" element={<ClientHours />} />}
          {clientView && <Route path="client/invoices" element={<ClientInvoices />} />}
          {clientView && <Route path="client/invoices/:id" element={<ClientInvoice />} />}
          {(clientView || (agency && staff)) && <Route path="launch/:id" element={<Launch />} />}
          {isSuper && <Route path="platform" element={<PlatformConsole />} />}
          {staff && agency && roles.work && <Route path="work" element={<Work />} />}
          {staff && agency && rank <= 4 && <Route path="coaching" element={<Coaching />} />}
          {staff && agency && rank <= 4 && <Route path="coaching/:id" element={<CoachingPlacement />} />}
          {!isClient && <Route path="training" element={<Training />} />}
          {!isClient && <Route path="resources" element={<Resources />} />}
          <Route path="me" element={<Me />} />
          {!isClient && <Route path="guide" element={<Guide />} />}
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
              <Route path="account" element={<Account />} />
              {agency && <Route path="agency" element={<AgencyHome />} />}
              {agency && <Route path="agency/settings" element={<AgencySettings />} />}
              {agency && <Route path="clients" element={<Clients />} />}
              {agency && <Route path="clients/:id" element={<ClientDetail />} />}
              {agency && <Route path="placements" element={<Placements />} />}
              {agency && <Route path="placements/:id" element={<PlacementDetail />} />}
              {agency && <Route path="tiers" element={<Tiers />} />}
              {agency && <Route path="timesheets" element={<Timesheets />} />}
              {agency && <Route path="invoices" element={<Invoices />} />}
              {agency && <Route path="invoices/:id" element={<InvoiceDetail />} />}
              {agency && <Route path="payouts" element={<Payouts />} />}
              {agency && <Route path="payouts/:id" element={<PayoutDetail />} />}
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
