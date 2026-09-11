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
import { SuperAdminIcon, type SuperAdminIconName } from "./components/SuperAdminPrimitives";

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

  const navLinks: Array<{ label: string; path: string; icon: SuperAdminIconName }> = [
    { label: "Associazioni", path: "/super-admin/associazioni", icon: "users" },
    { label: "Affiliazioni", path: "/super-admin/affiliazioni", icon: "user" },
    { label: "Documenti", path: "/super-admin/documenti", icon: "documents" },
    { label: "Comunicazioni", path: "/super-admin/comunicazioni", icon: "mail" },
    { label: "Amministratori", path: "/super-admin/org-admins", icon: "shield" },
    { label: "Registro lotti", path: "/super-admin/registro-lotti", icon: "cards" },
    { label: "Crediti tessere", path: "/super-admin/crediti-tessere", icon: "wallet" },
    { label: "Libro Soci", path: "/super-admin/soci", icon: "book" },
    { label: "Sicurezza", path: "/super-admin/sicurezza", icon: "shield" },
    { label: "Chiusura annuale", path: "/super-admin/chiusura-annuale", icon: "clock" },
    { label: "Registro attività", path: "/super-admin/registro-attivita", icon: "book" },
  ];

  const mobilePrimaryNav = useMemo(
    (): MobileDashboardNavItem[] => [
      { key: "orgs", label: "Associazioni", to: "/super-admin/associazioni", activeMatch: ["/super-admin/associazioni"], icon: "building" as const },
      { key: "affiliations", label: "Affiliazioni", to: "/super-admin/affiliazioni", activeMatch: ["/super-admin/affiliazioni"], icon: "chart" as const },
      { key: "documents", label: "Documenti", to: "/super-admin/documenti", activeMatch: ["/super-admin/documenti"], icon: "docs" as const },
      { key: "lots", label: "Registro lotti", to: "/super-admin/registro-lotti", activeMatch: ["/super-admin/registro-lotti"], icon: "cards" as const },
    ],
    [],
  );

  const mobileMoreNav = useMemo(
    (): MobileDashboardNavItem[] => [
      { key: "communications", label: "Comunicazioni", to: "/super-admin/comunicazioni", activeMatch: ["/super-admin/comunicazioni"], icon: "book" as const },
      { key: "admins", label: "Amministratori", to: "/super-admin/org-admins", activeMatch: ["/super-admin/org-admins"], icon: "shield" as const },
      { key: "card-credits", label: "Crediti tessere", to: "/super-admin/crediti-tessere", activeMatch: ["/super-admin/crediti-tessere"], icon: "cards" as const },
      { key: "members", label: "Libro Soci", to: "/super-admin/soci", activeMatch: ["/super-admin/soci"], icon: "book" as const },
      { key: "security", label: "Sicurezza", to: "/super-admin/sicurezza", activeMatch: ["/super-admin/sicurezza"], icon: "shield" as const },
      { key: "annual", label: "Chiusura annuale", to: "/super-admin/chiusura-annuale", activeMatch: ["/super-admin/chiusura-annuale"], icon: "chart" as const },
      { key: "audit", label: "Registro attività", to: "/super-admin/registro-attivita", activeMatch: ["/super-admin/registro-attivita"], icon: "book" as const },
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
    <div className="app-shell super-admin-v2 min-h-screen">
      <header className="sa-header sticky top-0 z-50 transition-all">
        <div className="container-shell sa-header__top">
          <div className="sa-header__brand">
            <Link to="/" className="sa-header__logo">
              <img
                src={`${import.meta.env.BASE_URL}assonam-logo.svg`}
                alt="ASSONAM"
              />
              <span className="hidden text-xl font-black tracking-tight md:inline">ASSONAM</span>
            </Link>
            <div className="sa-header__identity">
              <div className="sa-header__workspace">
                Governance
                <span className="sa-header__role">Super Admin</span>
              </div>
              {profile ? <p className="sa-header__email">{profile.email}</p> : null}
            </div>
          </div>
          <div className="sa-header__actions">
            <ThemeToggle />
            <Link className="sa-header__public hidden sm:inline-flex" to="/">
              Sito pubblico
              <SuperAdminIcon name="link" className="h-4 w-4" />
            </Link>
            <button
              className="sa-btn"
              type="button"
              onClick={handleLogout}
            >
              Esci
              <SuperAdminIcon name="chevron" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="container-shell">
          <nav className="sa-nav" aria-label="Navigazione super admin">
            {navLinks.map((link) => {
              const isActive = location.pathname.startsWith(link.path);
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`sa-nav__item ${isActive ? "is-active" : ""}`}
                >
                  <SuperAdminIcon name={link.icon} />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="dashboard-mobile-safe container-shell py-7 animate-in fade-in duration-500 md:pb-10">
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
