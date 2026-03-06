import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { fetchMe, apiLogout, AuthError, type MemberProfile } from "../../lib/api";
import { applySeo } from "../../lib/seo";
import Skeleton from "../../components/ui/Skeleton";
import { OnboardingTour, ReviewGuideButton } from "../../components/onboarding";

export type DashboardContext = {
  user: MemberProfile | null;
  loading: boolean;
  profileError: string | null;
  reloadProfile: () => Promise<void>;
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: {
    label: "Attiva",
    color: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  pending_docs: {
    label: "In attesa documenti",
    color: "border-amber-200 bg-amber-50 text-amber-700",
  },
  pending_cards: {
    label: "In attesa tessera",
    color: "border-amber-200 bg-amber-50 text-amber-700",
  },
  pending_verification: {
    label: "In verifica",
    color: "border-blue-200 bg-blue-50 text-blue-700",
  },
};

const NAV_ITEMS = [
  {
    label: "Riepilogo",
    to: "/dashboard",
    end: true,
    icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  },
  {
    label: "Profilo",
    to: "/dashboard/profilo",
    end: false,
    icon: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  },
  {
    label: "Documenti",
    to: "/dashboard/documenti",
    end: false,
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  },
];

const sidebarLinkBase =
  "flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 border border-transparent";
const sidebarLinkActive = `${sidebarLinkBase} border-neutral-200/60 bg-white/90 text-brand shadow-sm ring-1 ring-black/[0.03]`;
const sidebarLinkIdle = `${sidebarLinkBase} text-neutral-500 hover:bg-white/50 hover:text-neutral-900`;

const tabBase =
  "whitespace-nowrap px-4 py-3 text-sm font-bold transition-all border-b-2";
const tabActive = `${tabBase} border-brand text-brand`;
const tabIdle = `${tabBase} border-transparent text-neutral-400 hover:text-neutral-600`;

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? sidebarLinkActive : sidebarLinkIdle;

const tabClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? tabActive : tabIdle;

const DashboardLayout = () => {
  const [user, setUser] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    applySeo({
      title: "Area riservata",
      description: "Area riservata socio ASSO.N.A.M.",
      noindex: true,
    });
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setProfileError(null);
    try {
      const profile = await fetchMe();
      setUser(profile);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/login", { replace: true });
        return;
      }
      setUser(null);
      setProfileError(err instanceof Error ? err.message : "Errore nel caricamento profilo");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const displayName = user ? `${user.first_name} ${user.last_name}` : null;
  const orgName = user?.organization?.name ?? null;
  const statusInfo = user ? STATUS_MAP[user.status] ?? null : null;

  return (
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
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-48" />
                </div>
              ) : (
                <div className="flex flex-col justify-center h-full">
                  <div className="flex items-center gap-2.5">
                    <h1 className="truncate text-base font-bold tracking-tight text-neutral-900 leading-none">
                      {displayName ?? "Area riservata"}
                    </h1>
                    {statusInfo && (
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider leading-none ${statusInfo.color}`}
                      >
                        {statusInfo.label}
                      </span>
                    )}
                  </div>
                  {orgName && (
                    <p className="truncate text-[11px] font-medium text-neutral-500 uppercase tracking-wide opacity-80 mt-1 leading-none">
                      {orgName}
                    </p>
                  )}
                </div>
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
                  {displayName ?? "Area riservata"}
                </h1>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <Link className="link-muted hidden text-sm font-bold tracking-tight sm:block" to="/">
              Sito pubblico
            </Link>
            <div className="h-4 w-px bg-neutral-200 hidden sm:block" />
            {!loading && user && (
              <button
                className="btn-ghost !px-4 !py-2 !text-xs font-bold uppercase tracking-wider"
                type="button"
                onClick={async () => {
                  await apiLogout();
                  navigate("/login", { replace: true });
                }}
              >
                Esci
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container-shell py-8">
        <div className="md:flex md:gap-12">
          {/* Sidebar — desktop */}
          <aside className="hidden w-60 shrink-0 md:block">
            <div className="surface sticky top-24 p-5">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400/80 mb-5">
                Menu principale
              </h2>
              <nav className="flex flex-col gap-1.5" aria-label="Dashboard navigation">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.label}
                    className={linkClass}
                    to={item.to}
                    end={item.end}
                  >
                    <div className="flex h-5 w-5 items-center justify-center transition-colors">
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={item.icon} />
                      </svg>
                    </div>
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <div className="mt-8 pt-6 border-t border-neutral-100/80">
                <ReviewGuideButton className="mb-4 w-full" />
                <Link
                  className="flex items-center gap-2.5 px-3 py-2 text-sm font-semibold text-neutral-400 transition-colors hover:text-brand"
                  to="/"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                  </svg>
                  Home pubblica
                </Link>
              </div>
            </div>
          </aside>

          {/* Tabs — mobile */}
          <nav
            className="flex gap-1 border-b border-neutral-200/60 md:hidden overflow-x-auto no-scrollbar"
            aria-label="Dashboard navigation mobile"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.label}
                className={tabClass}
                to={item.to}
                end={item.end}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-8 min-w-0 flex-1 md:mt-0">
            <Outlet context={{ user, loading, profileError, reloadProfile: loadProfile } satisfies DashboardContext} />
          </div>
        </div>
      </main>

      {!loading && user && <OnboardingTour role="member" />}
    </div>
  );
};

export default DashboardLayout;
