import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  fetchOrgAdminMe,
  fetchVersion,
  orgAdminLogout,
  AuthError,
  type OrgAdminProfile,
  type VersionInfo,
} from "../../lib/api";
import { applySeo } from "../../lib/seo";
import Skeleton from "../../components/ui/Skeleton";
import { OnboardingTour, ReviewGuideButton } from "../../components/onboarding";
import OrgAdminNotificationBell from "./components/OrgAdminNotificationBell";

type OrgAdminCtx = {
  admin: OrgAdminProfile | null;
  loading: boolean;
};

const Ctx = createContext<OrgAdminCtx>({ admin: null, loading: true });
export const useOrgAdmin = () => useContext(Ctx);

const OrgAdminLayout = () => {
  const [admin, setAdmin] = useState<OrgAdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [ver, setVer] = useState<VersionInfo | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    applySeo({ title: "Admin Associazione", description: "Pannello admin associazione ASSO.N.A.M.", noindex: true });
  }, []);

  useEffect(() => {
    fetchOrgAdminMe()
      .then(setAdmin)
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
        }
      })
      .finally(() => setLoading(false));
    fetchVersion().then(setVer).catch(() => {});
  }, [navigate]);

  const handleLogout = async () => {
    await orgAdminLogout();
    navigate("/org-admin/login", { replace: true });
  };

  const navItems = useMemo(() => {
    const items = [
      { to: "/org-admin", label: "Panoramica", end: true },
      { to: "/org-admin/inviti", label: "Inviti", end: false },
      { to: "/org-admin/soci", label: "Soci", end: false },
      { to: "/org-admin/tessere", label: "Tessere", end: false },
      { to: "/org-admin/documenti", label: "Documenti", end: false },
      { to: "/org-admin/associazione", label: "Associazione", end: false },
    ];
    if (admin?.organization?.accounting_enabled) {
      items.splice(5, 0, { to: "/org-admin/contabilita", label: "Contabilità", end: false });
    }
    return items;
  }, [admin?.organization?.accounting_enabled]);

  return (
    <Ctx.Provider value={{ admin, loading }}>
      <div className="min-h-screen bg-[#f8f9fa]/50">
        {/* Header band */}
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50 transition-all">
          <div className="container-shell flex items-center justify-between h-16 md:h-20">
            <div className="flex items-center gap-6">
              <div className="hidden shrink-0 sm:block">
                <Link to="/" className="flex items-center gap-3 transition-transform hover:scale-95 group">
                  <img
                    src={`${import.meta.env.BASE_URL}assonam-logo.svg`}
                    alt="ASSONAM"
                    className="h-8 md:h-10 w-auto"
                  />
                  <span className="font-display font-bold text-xl tracking-tight text-neutral-900 hidden lg:block group-hover:text-brand transition-colors">
                    ASSONAM
                  </span>
                </Link>
              </div>
              <div className="min-w-0 flex-1 border-l border-neutral-200/60 pl-6 ml-2 hidden sm:block">
                {loading ? (
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                ) : admin ? (
                  <div className="flex flex-col justify-center h-full">
                    <div className="flex items-center gap-2.5">
                      <h1 className="truncate text-base font-bold tracking-tight text-neutral-900 leading-none">
                        {admin.organization?.name ?? "Gestione associazione"}
                      </h1>
                      <span className="inline-flex items-center rounded-full border border-brand/20 bg-brand/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand leading-none">
                        Gestore locale
                      </span>
                    </div>
                    <p className="truncate text-[11px] font-medium text-neutral-500 uppercase tracking-wide opacity-80 mt-1 leading-none">
                      {admin.email}
                    </p>
                  </div>
                ) : (
                  <h1 className="text-base font-bold tracking-tight text-neutral-900 uppercase tracking-widest leading-none">
                    Gestione associazione
                  </h1>
                )}
              </div>
              
              {/* Mobile Header Title */}
              <div className="sm:hidden min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <Link to="/" className="shrink-0 transition-transform hover:scale-95">
                    <img
                      src={`${import.meta.env.BASE_URL}assonam-logo.svg`}
                      alt="ASSONAM"
                      className="h-8 w-auto"
                    />
                  </Link>
                  <div className="w-px h-6 bg-neutral-200/60"></div>
                  <h1 className="truncate text-sm font-bold tracking-tight text-neutral-900">
                    {admin?.organization?.name ?? "Org Admin"}
                  </h1>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              {!loading && admin && <OrgAdminNotificationBell />}
              {!loading && admin && <ReviewGuideButton className="hidden md:flex" />}
              <Link className="link-muted hidden text-sm font-bold tracking-tight sm:block" to="/">
                Sito pubblico
              </Link>
              <div className="h-4 w-px bg-neutral-200 hidden sm:block" />
              {!loading && admin && (
                <button
                  className="btn-ghost !px-4 !py-2 !text-xs font-bold uppercase tracking-wider"
                  type="button"
                  onClick={handleLogout}
                >
                  Esci
                </button>
              )}
            </div>
          </div>

          {/* Nav tabs */}
          {!loading && admin && (
            <div className="container-shell">
              <nav className="flex flex-wrap gap-6 pb-0 overflow-x-auto no-scrollbar">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `relative whitespace-nowrap py-3 text-sm font-bold tracking-tight transition-colors ${
                        isActive 
                          ? "text-brand" 
                          : "text-neutral-500 hover:text-neutral-900"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {item.label}
                        {isActive && (
                          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-full" />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </nav>
            </div>
          )}
        </header>

        {/* Content */}
        <main className="animate-in fade-in duration-500">
          <Outlet />
        </main>

        {/* Version footer */}
        {ver && (
          <footer className="container-shell pb-8 pt-12 text-[10px] font-bold uppercase tracking-widest text-neutral-300">
            Piattaforma ASSO.N.A.M. v{ver.version}
            {ver.git_sha ? ` [${ver.git_sha.slice(0, 7)}]` : ""}
          </footer>
        )}

        {!loading && admin && <OnboardingTour role="org_admin" />}
      </div>
    </Ctx.Provider>
  );
};

export default OrgAdminLayout;
