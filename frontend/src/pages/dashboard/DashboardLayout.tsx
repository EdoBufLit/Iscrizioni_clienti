import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { fetchMe, apiLogout, AuthError, type MemberProfile } from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";

export type DashboardContext = {
  user: MemberProfile | null;
  loading: boolean;
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
  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition";
const sidebarLinkActive = `${sidebarLinkBase} border border-white/70 bg-white/70 text-brand shadow-subtle`;
const sidebarLinkIdle = `${sidebarLinkBase} text-neutral-600 hover:bg-white/60 hover:text-neutral-900`;

const tabBase =
  "whitespace-nowrap px-3 py-2 text-sm font-medium transition border-b-2";
const tabActive = `${tabBase} border-accent text-brand`;
const tabIdle = `${tabBase} border-transparent text-neutral-500 hover:text-neutral-700`;

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? sidebarLinkActive : sidebarLinkIdle;

const tabClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? tabActive : tabIdle;

const DashboardLayout = () => {
  const [user, setUser] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/login", { replace: true });
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const displayName = user ? `${user.first_name} ${user.last_name}` : null;
  const orgName = user?.organization?.name ?? null;
  const statusInfo = user ? STATUS_MAP[user.status] ?? null : null;

  return (
    <div>
      {/* Header band */}
      <div className="header-band">
        <div className="container-shell py-8">
          <div className="flex items-start gap-5">
            <div className="hidden shrink-0 sm:block">
                <img
                  src={`${import.meta.env.BASE_URL}logo.jpg`}
                  alt="ASSO.N.A.M."
                className="h-12 rounded logo-mark"
              />
            </div>
            <div className="min-w-0 flex-1">
              {loading ? (
                <>
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="mt-2 h-3.5 w-56" />
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-lg font-semibold text-neutral-900">
                      {displayName ?? "Area riservata"}
                    </h1>
                    {statusInfo && (
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}
                      >
                        {statusInfo.label}
                      </span>
                    )}
                  </div>
                  {orgName && (
                    <p className="mt-1 text-sm text-neutral-500">{orgName}</p>
                  )}
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link className="hidden text-sm font-medium text-neutral-500 transition hover:text-neutral-700 sm:block" to="/">
                Torna al sito
              </Link>
              {!loading && user && (
                <button
                  className="btn-ghost px-3 py-1.5 text-sm"
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
        </div>
      </div>

      {/* Main content */}
      <div className="container-shell py-10">
        <div className="md:flex md:gap-10">
          {/* Sidebar — desktop */}
          <aside className="hidden w-56 shrink-0 md:block">
            <div className="surface p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                Navigazione
              </p>
              <nav className="mt-3 flex flex-col gap-0.5" aria-label="Dashboard">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.label}
                    className={linkClass}
                    to={item.to}
                    end={item.end}
                  >
                    <svg
                      className="h-4 w-4 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={item.icon} />
                    </svg>
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <div className="mt-8 border-t border-white/70 pt-4">
                <Link
                  className="flex items-center gap-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-700"
                  to="/"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                  </svg>
                  Torna al sito
                </Link>
              </div>
            </div>
          </aside>

          {/* Tabs — mobile */}
          <nav
            className="flex gap-1 border-b border-neutral-100 md:hidden"
            aria-label="Dashboard"
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

          <div className="mt-6 min-w-0 flex-1 md:mt-0">
            <Outlet context={{ user, loading } satisfies DashboardContext} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
