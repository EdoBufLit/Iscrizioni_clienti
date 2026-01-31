import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { fetchMe, AuthError, type MemberProfile } from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";

export type DashboardContext = {
  user: MemberProfile | null;
  loading: boolean;
};

const NAV_ITEMS = [
  { label: "Riepilogo", to: "/dashboard", end: true },
  { label: "Profilo", to: "/dashboard/profilo", end: false },
  { label: "Documenti", to: "/dashboard/documenti", end: false },
];

const sidebarLinkBase =
  "block rounded-md px-3 py-2 text-sm font-medium transition";
const sidebarLinkActive = `${sidebarLinkBase} bg-neutral-50 text-brand`;
const sidebarLinkIdle = `${sidebarLinkBase} text-neutral-600 hover:text-neutral-900`;

const tabBase =
  "whitespace-nowrap px-3 py-2 text-sm font-medium transition border-b-2";
const tabActive = `${tabBase} border-brand text-brand`;
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

  const displayName = user
    ? `${user.first_name} ${user.last_name}`
    : null;
  const orgName = user?.organization?.name ?? null;

  return (
    <div className="container-shell py-10">
      <div className="md:flex md:gap-10">
        <aside className="hidden w-56 shrink-0 md:block">
          <p className="section-title">AREA RISERVATA</p>
          <div className="mt-4">
            {loading ? (
              <>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1.5 h-3 w-36" />
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-neutral-900">
                  {displayName ?? "—"}
                </p>
                {orgName && (
                  <p className="text-xs text-neutral-500">{orgName}</p>
                )}
              </>
            )}
          </div>

          <nav className="mt-6 flex flex-col gap-1" aria-label="Dashboard">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.label}
                className={linkClass}
                to={item.to}
                end={item.end}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-8 border-t border-neutral-100 pt-4">
            <Link
              className="text-sm font-medium text-neutral-500 transition hover:text-neutral-700"
              to="/"
            >
              Torna al sito
            </Link>
          </div>
        </aside>

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
  );
};

export default DashboardLayout;
