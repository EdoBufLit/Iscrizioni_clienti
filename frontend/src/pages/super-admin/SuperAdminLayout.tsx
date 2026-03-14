import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  fetchSuperAdminMe,
  superAdminLogout,
  fetchVersion,
  AuthError,
  type SuperAdminProfile,
  type VersionInfo,
} from "../../lib/api";
import { applySeo } from "../../lib/seo";
import MobileDashboardNav, { type MobileDashboardNavItem } from "../../components/ui/MobileDashboardNav";
import ThemeToggle from "../../components/theme/ThemeToggle";

const SuperAdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [profile, setProfile] = useState<SuperAdminProfile | null>(null);
  const [ver, setVer] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    applySeo({ title: "Super Admin", description: "Pannello super admin ASSO.N.A.M.", noindex: true });
  }, []);

  useEffect(() => {
    fetchSuperAdminMe()
      .then(setProfile)
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
        }
      })
      .finally(() => setLoading(false));

    fetchVersion().then(setVer).catch(() => {});
  }, [navigate]);

  const handleLogout = async () => {
    await superAdminLogout();
    navigate("/super-admin/login", { replace: true });
  };

  const navLinks = [
    { label: "Associazioni", path: "/super-admin/associazioni" },
    { label: "Affiliazioni", path: "/super-admin/affiliazioni" },
    { label: "Documenti", path: "/super-admin/documenti" },
    { label: "Amministratori", path: "/super-admin/org-admins" },
    { label: "Libro Soci", path: "/super-admin/soci" },
  ];

  const mobilePrimaryNav = useMemo(
    (): MobileDashboardNavItem[] => [
      { key: "orgs", label: "Associazioni", to: "/super-admin/associazioni", activeMatch: ["/super-admin/associazioni"], icon: "building" as const },
      { key: "affiliations", label: "Affiliazioni", to: "/super-admin/affiliazioni", activeMatch: ["/super-admin/affiliazioni"], icon: "chart" as const },
      { key: "documents", label: "Documenti", to: "/super-admin/documenti", activeMatch: ["/super-admin/documenti"], icon: "docs" as const },
    ],
    [],
  );

  const mobileMoreNav = useMemo(
    (): MobileDashboardNavItem[] => [
      { key: "admins", label: "Amministratori", to: "/super-admin/org-admins", activeMatch: ["/super-admin/org-admins"], icon: "shield" as const },
      { key: "members", label: "Libro Soci", to: "/super-admin/soci", activeMatch: ["/super-admin/soci"], icon: "users" as const },
      { key: "site", label: "Torna al sito", to: "/", icon: "globe" as const },
      {
        key: "logout",
        label: "Esci",
        icon: "logout" as const,
        tone: "danger" as const,
        onSelect: handleLogout,
      },
    ],
    [],
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-500">
        Caricamento...
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen">
      {/* Header band */}
      <header className="app-header sticky top-0 z-50 transition-all">
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
              <div className="flex flex-col justify-center h-full">
                <div className="flex items-center gap-2.5">
                  <h1 className="truncate text-base font-bold tracking-tight text-neutral-900 uppercase tracking-widest leading-none">
                    Governance
                  </h1>
                  <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-700 shadow-sm leading-none">
                    Super Admin
                  </span>
                </div>
                {profile && (
                  <p className="truncate text-[11px] font-medium text-neutral-500 uppercase tracking-wide opacity-80 mt-1 leading-none">
                    {profile.email}
                  </p>
                )}
              </div>
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
                <h1 className="truncate text-sm font-bold tracking-tight text-neutral-900 uppercase">
                  Governance
                </h1>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <ThemeToggle />
            <Link className="link-muted hidden text-sm font-bold tracking-tight sm:block" to="/">
              Sito pubblico
            </Link>
            <div className="app-divider hidden h-4 w-px sm:block" />
            <button
              className="btn-ghost !px-4 !py-2 !text-xs font-bold uppercase tracking-wider"
              type="button"
              onClick={handleLogout}
            >
              Esci
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="container-shell">
          <nav className="hidden flex-wrap gap-6 pb-0 overflow-x-auto no-scrollbar md:flex">
            {navLinks.map((link) => {
              const isActive = location.pathname.startsWith(link.path);
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`relative whitespace-nowrap py-3 text-sm font-bold tracking-tight transition-colors ${
                    isActive 
                      ? "text-neutral-900" 
                      : "text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900 rounded-t-full" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="dashboard-mobile-safe container-shell py-10 animate-in fade-in duration-500 md:pb-10">
        <Outlet context={{ profile }} />
      </main>

      {/* Version footer */}
      {ver && (
        <footer className="container-shell pb-8 pt-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          Core Engine v{ver.version}
          {ver.git_sha ? ` [${ver.git_sha.slice(0, 7)}]` : ""}
        </footer>
      )}

      <MobileDashboardNav
        items={mobilePrimaryNav}
        moreItems={mobileMoreNav}
        moreTitle="Altro"
      />
    </div>
  );
};

export default SuperAdminLayout;
