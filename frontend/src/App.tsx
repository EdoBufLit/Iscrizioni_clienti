import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/ui/ToastProvider";
import Home from "./pages/Home";
import Associazioni from "./pages/Associazioni";
import { useStatePlatformCapabilities } from "./hooks/useStatePlatformCapabilities";

const LoStudio = lazy(() => import("./pages/LoStudio"));
const Servizi = lazy(() => import("./pages/Servizi"));
const Affiliazione = lazy(() => import("./pages/Affiliazione"));
const AffiliazioneInfo = lazy(() => import("./pages/AffiliazioneInfo"));
const AffiliazioneDettaglio = lazy(() => import("./pages/AffiliazioneDettaglio"));
const Iscrizione = lazy(() => import("./pages/Iscrizione"));
const Contatti = lazy(() => import("./pages/Contatti"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Login = lazy(() => import("./pages/Login"));
const MagicLinkVerify = lazy(() => import("./pages/MagicLinkVerify"));
const WalletGoogleAdd = lazy(() => import("./pages/WalletGoogleAdd"));
const ReservedAreaRedirect = lazy(() => import("./pages/ReservedAreaRedirect"));
const InvitoAffiliazioneRedirect = lazy(() => import("./pages/InvitoAffiliazioneRedirect"));
const PienissimoThankYouPage = lazy(() => import("./pages/PienissimoThankYouPage"));
const PublicFormPage = lazy(() => import("./pages/PublicFormPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const DashboardLayout = lazy(() => import("./pages/dashboard/DashboardLayout"));
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const DashboardProfile = lazy(() => import("./pages/dashboard/DashboardProfile"));
const DashboardDocuments = lazy(() => import("./pages/dashboard/DashboardDocuments"));

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const AdminAffiliations = lazy(() => import("./pages/admin/AdminAffiliations"));

const SuperAdminLogin = lazy(() => import("./pages/super-admin/SuperAdminLogin"));
const SuperAdminLayout = lazy(() => import("./pages/super-admin/SuperAdminLayout"));
const SuperAdminOrgAdmins = lazy(() => import("./pages/super-admin/SuperAdminOrgAdmins"));
const SuperAdminOrganizations = lazy(() => import("./pages/super-admin/SuperAdminOrganizations"));
const SuperAdminMemberDetail = lazy(() => import("./pages/super-admin/SuperAdminMemberDetail"));
const SuperAdminAffiliations = lazy(() => import("./pages/super-admin/SuperAdminAffiliations"));
const SuperAdminDocuments = lazy(() => import("./pages/super-admin/SuperAdminDocuments"));

const OrgAdminLogin = lazy(() => import("./pages/org-admin/OrgAdminLogin"));
const OrgAdminCallback = lazy(() => import("./pages/org-admin/OrgAdminCallback"));
const OrgAdminLayout = lazy(() => import("./pages/org-admin/OrgAdminLayout"));
const OrgAdminDashboard = lazy(() => import("./pages/org-admin/OrgAdminDashboard"));
const OrgAdminInvites = lazy(() => import("./pages/org-admin/OrgAdminInvites"));
const OrgAdminMembers = lazy(() => import("./pages/org-admin/OrgAdminMembers"));
const OrgAdminMemberDetail = lazy(() => import("./pages/org-admin/OrgAdminMemberDetail"));
const OrgAdminCards = lazy(() => import("./pages/org-admin/OrgAdminCards"));
const OrgAdminCommunications = lazy(() => import("./pages/org-admin/OrgAdminCommunications"));
const OrgAdminSettings = lazy(() => import("./pages/org-admin/OrgAdminSettings"));
const OrgAdminSharedDocuments = lazy(() => import("./pages/org-admin/OrgAdminSharedDocuments"));

const Loading = () => (
  <div className="flex justify-center py-16">
    <div className="surface px-8 py-6">
      <p className="text-sm text-neutral-500">Caricamento…</p>
    </div>
  </div>
);

const App = () => {
  const { capabilities, loading: capabilitiesLoading } = useStatePlatformCapabilities();
  const affiliazioneEnabled = capabilities?.affiliazioneEnabled === true;

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="lo-studio" element={<LoStudio />} />
              <Route path="servizi" element={<Servizi />} />
              <Route
                path="affiliazione"
                element={
                  capabilitiesLoading ? (
                    <Loading />
                  ) : affiliazioneEnabled ? (
                    <Affiliazione />
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route
                path="invito/:slug"
                element={
                  capabilitiesLoading ? (
                    <Loading />
                  ) : affiliazioneEnabled ? (
                    <InvitoAffiliazioneRedirect />
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route path="affiliazione-info" element={<AffiliazioneInfo />} />
              <Route path="associazioni" element={<Associazioni />} />
              <Route path="associazioni/:slug" element={<AffiliazioneDettaglio />} />
              <Route path="associazioni/:slug/iscrizione" element={<Iscrizione />} />
              <Route path="associazioni/:orgSlug/tessera" element={<PienissimoThankYouPage />} />
              <Route path="contatti" element={<Contatti />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="login" element={<Login />} />
              <Route path="area-riservata" element={<ReservedAreaRedirect />} />
              <Route path="pienissimo/thank-you/:orgSlug" element={<PienissimoThankYouPage />} />
              <Route path="forms/:slug" element={<PublicFormPage />} />
              <Route path="auth/verify" element={<MagicLinkVerify />} />
              <Route path="wallet/google/add" element={<WalletGoogleAdd />} />
              <Route path="dashboard" element={<DashboardLayout />}>
                <Route index element={<DashboardHome />} />
                <Route path="profilo" element={<DashboardProfile />} />
                <Route path="documenti" element={<DashboardDocuments />} />
              </Route>
              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<AdminHome />} />
                <Route path="affiliazioni" element={<AdminAffiliations />} />
              </Route>
              <Route path="super-admin/login" element={<SuperAdminLogin />} />
              <Route path="super-admin" element={<SuperAdminLayout />}>
                <Route path="associazioni" element={<SuperAdminOrganizations />} />
                <Route path="affiliazioni" element={<SuperAdminAffiliations />} />
                <Route path="documenti" element={<SuperAdminDocuments />} />
                <Route path="org-admins" element={<SuperAdminOrgAdmins />} />
                <Route path="soci" element={<SuperAdminMemberDetail />} />
              </Route>
              <Route path="org-admin/login" element={<OrgAdminLogin />} />
              <Route path="org-admin/callback" element={<OrgAdminCallback />} />
              <Route path="org-admin" element={<OrgAdminLayout />}>
                <Route index element={<OrgAdminDashboard />} />
                <Route path="inviti" element={<OrgAdminInvites />} />
                <Route path="soci" element={<OrgAdminMembers />} />
                <Route path="soci/:id" element={<OrgAdminMemberDetail />} />
                <Route path="tessere" element={<OrgAdminCards />} />
                <Route path="documenti" element={<OrgAdminSharedDocuments />} />
                <Route path="comunicazioni" element={<OrgAdminCommunications />} />
                <Route path="forms" element={<Navigate to="/org-admin/comunicazioni?tab=forms" replace />} />
                <Route path="contabilita" element={<OrgAdminSharedDocuments />} />
                <Route path="associazione" element={<OrgAdminSettings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
