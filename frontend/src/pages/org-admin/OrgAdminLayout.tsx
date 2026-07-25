import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AuthError,
  fetchOrgAdminMe,
  fetchVersion,
  orgAdminLogout,
  type OrgAdminProfile,
  type VersionInfo,
} from "../../lib/api";
import { applySeo } from "../../lib/seo";
import Skeleton from "../../components/ui/Skeleton";
import MobileDashboardNav, { type MobileDashboardNavItem } from "../../components/ui/MobileDashboardNav";
import { OnboardingTour, ReviewGuideButton } from "../../components/onboarding";
import ThemeToggle from "../../components/theme/ThemeToggle";
import OrgAdminNotificationBell from "./components/OrgAdminNotificationBell";
import { useStatePlatformCapabilities } from "../../hooks/useStatePlatformCapabilities";

type OrgAdminCtx = {
  admin: OrgAdminProfile | null;
  loading: boolean;
};

type IconName =
  | "accounting"
  | "audit"
  | "billing"
  | "calendar"
  | "cards"
  | "documents"
  | "form"
  | "home"
  | "logout"
  | "mail"
  | "map"
  | "message"
  | "renew"
  | "room"
  | "scan"
  | "send"
  | "settings"
  | "support"
  | "table"
  | "template"
  | "users"
  | "whatsapp";

type NavLeaf = {
  to: string;
  label: string;
  end?: boolean;
  match?: string[];
  icon: IconName;
  hidden?: boolean;
};

type NavGroup = {
  label?: string;
  items: NavLeaf[];
};

const Ctx = createContext<OrgAdminCtx>({ admin: null, loading: true });
export const useOrgAdmin = () => useContext(Ctx);

function MiniIcon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<IconName, ReactNode> = {
    accounting: (
      <>
        <path d="M5 19V5h14v14" />
        <path d="M8 9h8M8 13h3M14 13h2M8 16h3M14 16h2" />
      </>
    ),
    audit: (
      <>
        <path d="M6 4h12v16H6z" />
        <path d="M9 8h6M9 12h6M9 16h4" />
        <path d="M4 7V2h5" />
      </>
    ),
    billing: (
      <>
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="M7 10h10M8 14h3" />
      </>
    ),
    calendar: (
      <>
        <rect x="4" y="5.5" width="16" height="15" rx="2" />
        <path d="M8 3.5v4M16 3.5v4M4 10h16" />
      </>
    ),
    cards: (
      <>
        <rect x="4" y="7" width="16" height="11" rx="2" />
        <path d="M4 10h16M8 14h4" />
      </>
    ),
    documents: (
      <>
        <path d="M7 3h7l4 4v14H7V3Z" />
        <path d="M14 3v5h5M10 13h6M10 17h5" />
      </>
    ),
    form: (
      <>
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    home: (
      <>
        <path d="m4 10 8-6 8 6" />
        <path d="M6.5 9.5V20h11V9.5" />
        <path d="M10 20v-6h4v6" />
      </>
    ),
    logout: (
      <>
        <path d="M10 6H6v12h4" />
        <path d="M14 8l4 4-4 4M18 12H9" />
      </>
    ),
    mail: (
      <>
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="m4 8 8 6 8-6" />
      </>
    ),
    map: (
      <>
        <path d="M9 18 4 20V6l5-2 6 2 5-2v14l-5 2-6-2Z" />
        <path d="M9 4v14M15 6v14" />
      </>
    ),
    message: (
      <>
        <path d="M5 5h14v10H8l-3 3V5Z" />
        <path d="M8 9h8M8 12h5" />
      </>
    ),
    renew: (
      <>
        <path d="M19 12a7 7 0 1 1-2-5" />
        <path d="M19 5v5h-5" />
      </>
    ),
    room: (
      <>
        <path d="M4 20h16" />
        <path d="M6 20V6l8-2v16" />
        <path d="M14 8h4v12" />
        <path d="M10 12h.01" />
      </>
    ),
    scan: (
      <>
        <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
        <path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM14 13h2v2h-2z" />
      </>
    ),
    send: (
      <>
        <path d="m4 12 16-7-7 16-2-7-7-2Z" />
        <path d="m11 14 3-3" />
      </>
    ),
    settings: (
      <>
        <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
        <path d="M19 12h2M3 12h2M12 3v2M12 19v2M18 6l-1.4 1.4M7.4 16.6 6 18M6 6l1.4 1.4M16.6 16.6 18 18" />
      </>
    ),
    support: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.7 2.7 0 0 1 5 1.4c0 2-2.5 2.2-2.5 4" />
        <path d="M12 18h.01" />
      </>
    ),
    table: (
      <>
        <path d="M5 9h14" />
        <path d="M7 9v10M17 9v10" />
        <rect x="4" y="5" width="16" height="4" rx="1.5" />
      </>
    ),
    template: (
      <>
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    users: (
      <>
        <path d="M16 19c0-2-1.8-3.5-4-3.5S8 17 8 19" />
        <circle cx="12" cy="9" r="3" />
        <path d="M19 18c0-1.4-1-2.6-2.4-3.1M17 7.5a2.5 2.5 0 0 1 0 5" />
      </>
    ),
    whatsapp: (
      <>
        <path d="M7.5 19.5 4 20l.7-3.1A8 8 0 1 1 7.5 19.5Z" />
        <path d="M9 8.5c.3 3 2.2 5 5.2 5.5l1-1.4-1.7-1-1 .7c-1.1-.5-1.9-1.3-2.4-2.4l.7-1-1-1.7L9 8.5Z" />
      </>
    ),
  };

  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...common}>
      {paths[name]}
    </svg>
  );
}

function profileInitials(value: string | null | undefined) {
  const parts = (value || "Admin").split(/[\s@._-]+/).filter(Boolean);
  return `${parts[0]?.[0] || "A"}${parts[1]?.[0] || ""}`.toUpperCase();
}

function isSidebarItemActive(item: NavLeaf, location: ReturnType<typeof useLocation>) {
  if (item.match?.some((path) => location.pathname.startsWith(path))) return true;
  const [itemPath, itemSearch = ""] = item.to.split("?");
  if (item.end) return location.pathname === itemPath;
  if (!location.pathname.startsWith(itemPath)) return false;
  if (!itemSearch) return true;
  const targetParams = new URLSearchParams(itemSearch);
  const currentParams = new URLSearchParams(location.search);
  for (const [key, value] of targetParams.entries()) {
    if (currentParams.get(key) !== value) return false;
  }
  return true;
}

const OrgAdminLayout = () => {
  const [admin, setAdmin] = useState<OrgAdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [ver, setVer] = useState<VersionInfo | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { capabilities } = useStatePlatformCapabilities();

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

  const navGroups = useMemo<NavGroup[]>(() => {
    const accountingEnabled = Boolean(admin?.organization?.accounting_enabled);
    const stripeEnabled = Boolean(capabilities?.stripeConnectDemoEnabled);

    return [
      { items: [{ to: "/org-admin", label: "Home", end: true, icon: "home" }] },
      {
        label: "Comunicazioni",
        items: [
          { to: "/org-admin/comunicazioni?tab=panoramica", label: "Panoramica", icon: "message" },
          { to: "/org-admin/comunicazioni?tab=campagne", label: "Campagne", icon: "send" },
          { to: "/org-admin/comunicazioni?tab=modelli", label: "Modelli", icon: "template" },
          { to: "/org-admin/comunicazioni?tab=moduli", label: "Form pubblici", icon: "form" },
          { to: "/org-admin/comunicazioni?tab=sondaggi", label: "Sondaggi", icon: "form" },
          { to: "/org-admin/comunicazioni?tab=whatsapp", label: "WhatsApp", icon: "whatsapp" },
          { to: "/org-admin/comunicazioni?tab=email", label: "Email", icon: "mail" },
        ],
      },
      {
        label: "Prenotazioni",
        items: [
          { to: "/org-admin/prenotazioni?section=agenda", label: "Agenda", icon: "calendar" },
          { to: "/org-admin/prenotazioni?section=events", label: "Serate", icon: "calendar" },
          { to: "/org-admin/prenotazioni?section=rooms", label: "Sale", icon: "room" },
          { to: "/org-admin/prenotazioni?section=tables", label: "Tavoli", icon: "table" },
          { to: "/org-admin/prenotazioni?section=map", label: "Mappa sala", icon: "map" },
        ],
      },
      {
        label: "Soci e tessere",
        items: [
          { to: "/org-admin/soci", label: "Soci", match: ["/org-admin/soci"], icon: "users" },
          { to: "/org-admin/presenze", label: "Presenze", match: ["/org-admin/presenze"], icon: "scan" },
          { to: "/org-admin/tessere", label: "Tessere", match: ["/org-admin/tessere"], icon: "cards" },
          { to: "/org-admin/quote", label: "Quote e rinnovi", match: ["/org-admin/quote"], icon: "renew" },
          { to: "/org-admin/inviti", label: "Inviti", match: ["/org-admin/inviti"], icon: "renew" },
        ],
      },
      {
        label: "Contabilità",
        items: [
          { to: "/org-admin/contabilita", label: "Movimenti", match: ["/org-admin/contabilita"], icon: "accounting", hidden: !accountingEnabled },
          { to: "/org-admin/documenti", label: "Documenti", match: ["/org-admin/documenti"], icon: "documents" },
          { to: "/org-admin/billing", label: "Billing demo", match: ["/org-admin/billing"], icon: "billing", hidden: !stripeEnabled },
        ],
      },
      {
        label: "Impostazioni",
        items: [
          { to: "/org-admin/associazione", label: "Associazione", match: ["/org-admin/associazione"], icon: "settings" },
          { to: "/org-admin/sicurezza", label: "Sicurezza", match: ["/org-admin/sicurezza"], icon: "settings" },
          { to: "/org-admin/registro-attivita", label: "Registro attività", match: ["/org-admin/registro-attivita"], icon: "audit" },
        ],
      },
    ];
  }, [admin?.organization?.accounting_enabled, capabilities?.stripeConnectDemoEnabled]);

  const mobilePrimaryNav = useMemo(
    (): MobileDashboardNavItem[] => [
      { key: "overview", label: "Panoramica", to: "/org-admin", exact: true, icon: "home" as const },
      { key: "members", label: "Soci", to: "/org-admin/soci", activeMatch: ["/org-admin/soci"], icon: "users" as const },
      { key: "attendance", label: "Presenze", to: "/org-admin/presenze", activeMatch: ["/org-admin/presenze"], icon: "scan" as const },
      { key: "bookings", label: "Prenotazioni", to: "/org-admin/prenotazioni", activeMatch: ["/org-admin/prenotazioni"], icon: "book" as const },
    ],
    [],
  );

  const mobileMoreNav = useMemo(() => {
    const items: MobileDashboardNavItem[] = [
      { key: "cards", label: "Tessere", to: "/org-admin/tessere", activeMatch: ["/org-admin/tessere"], icon: "cards" as const },
      { key: "communications", label: "Comunicazioni", to: "/org-admin/comunicazioni", activeMatch: ["/org-admin/comunicazioni"], icon: "book" as const },
      { key: "documents", label: "Documenti", to: "/org-admin/documenti", activeMatch: ["/org-admin/documenti"], icon: "docs" as const },
      { key: "invites", label: "Inviti", to: "/org-admin/inviti", activeMatch: ["/org-admin/inviti"], icon: "book" as const },
      { key: "quote", label: "Quote e rinnovi", to: "/org-admin/quote", activeMatch: ["/org-admin/quote"], icon: "chart" as const },
      { key: "association", label: "Associazione", to: "/org-admin/associazione", activeMatch: ["/org-admin/associazione"], icon: "building" as const },
      { key: "security", label: "Sicurezza", to: "/org-admin/sicurezza", activeMatch: ["/org-admin/sicurezza"], icon: "building" as const },
      { key: "audit", label: "Registro attività", to: "/org-admin/registro-attivita", activeMatch: ["/org-admin/registro-attivita"], icon: "book" as const },
    ];
    if (admin?.organization?.accounting_enabled) {
      items.splice(1, 0, {
        key: "accounting",
        label: "Contabilità",
        to: "/org-admin/contabilita",
        activeMatch: ["/org-admin/contabilita"],
        icon: "chart" as const,
      });
    }
    if (capabilities?.stripeConnectDemoEnabled) {
      items.splice(items.length - 1, 0, {
        key: "stripe-demo",
        label: "Stripe Demo",
        to: "/org-admin/billing",
        activeMatch: ["/org-admin/billing"],
        icon: "chart" as const,
      });
    }
    items.push(
      { key: "site", label: "Torna al sito", to: "/", icon: "globe" as const },
      { key: "logout", label: "Esci", icon: "logout" as const, tone: "danger" as const, onSelect: handleLogout },
    );
    return items;
  }, [admin?.organization?.accounting_enabled, capabilities?.stripeConnectDemoEnabled]);

  return (
    <Ctx.Provider value={{ admin, loading }}>
      <div className="app-shell org-admin-v2 min-h-screen">
        <div className="org-admin-shell-grid">
          <aside className="org-admin-sidebar hidden lg:flex">
            <Link to="/org-admin" className="org-admin-sidebar__brand" aria-label="ASSONAM Org Admin">
              <img src={`${import.meta.env.BASE_URL}assonam-logo.svg`} alt="ASSONAM" className="h-10 w-auto" />
              <span className="org-admin-sidebar__brand-text" aria-hidden="true">
                <span>ASSONAM</span>
                <small>ORG ADMIN</small>
              </span>
            </Link>

            <nav className="org-admin-sidebar__nav" aria-label="Navigazione area riservata">
              {navGroups.map((group, groupIndex) => {
                const visibleItems = group.items.filter((item) => !item.hidden);
                if (visibleItems.length === 0) return null;
                return (
                  <div key={group.label ?? `primary-${groupIndex}`} className="org-admin-sidebar__group">
                    {group.label ? <p className="org-admin-sidebar__group-label">{group.label}</p> : null}
                    <div className="space-y-1">
                      {visibleItems.map((item) => {
                        const isActive = isSidebarItemActive(item, location);
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={() => `org-admin-sidebar__link ${isActive ? "org-admin-sidebar__link--active" : ""}`}
                          >
                            <MiniIcon name={item.icon} />
                            <span>{item.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>

            <div className="org-admin-sidebar__footer">
              <Link to="/" className="org-admin-sidebar__utility">
                <MiniIcon name="support" />
                <span>Sito pubblico</span>
              </Link>
              <button type="button" className="org-admin-sidebar__utility" onClick={handleLogout}>
                <MiniIcon name="logout" />
                <span>Esci</span>
              </button>
              {ver ? (
                <p className="pt-4 text-[0.68rem] font-semibold leading-5 text-slate-500">
                  ASSONAM Org Admin
                  <br />
                  v{ver.version}
                  {ver.git_sha ? ` - ${ver.git_sha.slice(0, 7)}` : ""}
                </p>
              ) : null}
            </div>
          </aside>

          <div className="min-w-0">
            <header className="org-admin-topbar">
              <div className="flex min-w-0 items-center gap-4">
                <Link to="/org-admin" className="flex items-center lg:hidden">
                  <img src={`${import.meta.env.BASE_URL}assonam-logo.svg`} alt="ASSONAM" className="h-9 w-auto" />
                </Link>
                <div className="hidden h-12 w-px bg-white/12 lg:block" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-base font-bold tracking-tight text-white">Area Riservata</h1>
                  </div>
                  <p className="truncate text-xs font-medium text-white/72">
                    {loading ? "Sistema di gestione per associazioni" : admin?.organization?.name ?? "Sistema di gestione per associazioni"}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <ThemeToggle />
                {!loading && admin && <OrgAdminNotificationBell />}
                {!loading && admin && <ReviewGuideButton className="hidden xl:flex" />}
                {!loading && admin ? (
                  <div className="org-admin-topbar__profile">
                    <span className="org-admin-topbar__avatar">{profileInitials(admin.email)}</span>
                    <span className="hidden min-w-0 text-left md:block">
                      <span className="block truncate text-xs font-bold text-white">{admin.email}</span>
                      <span className="block truncate text-[0.68rem] font-medium text-white/62">Amministratore</span>
                    </span>
                  </div>
                ) : (
                  <Skeleton className="h-9 w-36 rounded-lg bg-white/12" />
                )}
              </div>
            </header>

            <main className="dashboard-mobile-safe org-admin-content animate-in fade-in duration-500 md:pb-0">
              <Outlet />
            </main>
          </div>
        </div>

        {!loading && admin && (
          <MobileDashboardNav
            items={mobilePrimaryNav}
            moreItems={mobileMoreNav}
            moreTitle="Altro"
            moreContent={
              <ReviewGuideButton className="mobile-dashboard-sheet__action w-full justify-start rounded-[1.25rem] border border-neutral-200/70 bg-white/85 px-4 py-3.5 text-sm font-semibold text-neutral-700 shadow-sm" />
            }
          />
        )}
        {!loading && admin && <OnboardingTour role="org_admin" />}
      </div>
    </Ctx.Provider>
  );
};

export default OrgAdminLayout;
