import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Associazioni from "./pages/Associazioni";

const LoStudio = lazy(() => import("./pages/LoStudio"));
const Servizi = lazy(() => import("./pages/Servizi"));
const AffiliazioneDettaglio = lazy(() => import("./pages/AffiliazioneDettaglio"));
const Iscrizione = lazy(() => import("./pages/Iscrizione"));
const Contatti = lazy(() => import("./pages/Contatti"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));

const DashboardLayout = lazy(() => import("./pages/dashboard/DashboardLayout"));
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const DashboardProfile = lazy(() => import("./pages/dashboard/DashboardProfile"));
const DashboardDocuments = lazy(() => import("./pages/dashboard/DashboardDocuments"));

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const AdminAffiliations = lazy(() => import("./pages/admin/AdminAffiliations"));

const OrgAdminLogin = lazy(() => import("./pages/org-admin/OrgAdminLogin"));
const OrgAdminCallback = lazy(() => import("./pages/org-admin/OrgAdminCallback"));
const OrgAdminLayout = lazy(() => import("./pages/org-admin/OrgAdminLayout"));
const OrgAdminDashboard = lazy(() => import("./pages/org-admin/OrgAdminDashboard"));
const OrgAdminMembers = lazy(() => import("./pages/org-admin/OrgAdminMembers"));
const OrgAdminCards = lazy(() => import("./pages/org-admin/OrgAdminCards"));

const Loading = () => (
  <div className="flex justify-center py-16">
    <div className="surface px-8 py-6">
      <p className="text-sm text-neutral-500">Caricamento…</p>
    </div>
  </div>
);

const App = () => {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="lo-studio" element={<LoStudio />} />
          <Route path="servizi" element={<Servizi />} />
          <Route path="associazioni" element={<Associazioni />} />
          <Route path="associazioni/:slug" element={<AffiliazioneDettaglio />} />
          <Route path="associazioni/:slug/iscrizione" element={<Iscrizione />} />
          <Route path="contatti" element={<Contatti />} />
          <Route path="login" element={<Login />} />
          <Route path="dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="profilo" element={<DashboardProfile />} />
            <Route path="documenti" element={<DashboardDocuments />} />
          </Route>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminHome />} />
            <Route path="affiliazioni" element={<AdminAffiliations />} />
          </Route>
          <Route path="org-admin/login" element={<OrgAdminLogin />} />
          <Route path="org-admin/callback" element={<OrgAdminCallback />} />
          <Route path="org-admin" element={<OrgAdminLayout />}>
            <Route index element={<OrgAdminDashboard />} />
            <Route path="soci" element={<OrgAdminMembers />} />
            <Route path="tessere" element={<OrgAdminCards />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

export default App;
