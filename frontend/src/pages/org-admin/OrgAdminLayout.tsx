import { createContext, useContext, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  fetchOrgAdminMe,
  orgAdminLogout,
  AuthError,
  type OrgAdminProfile,
} from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";

type OrgAdminCtx = {
  admin: OrgAdminProfile | null;
  loading: boolean;
};

const Ctx = createContext<OrgAdminCtx>({ admin: null, loading: true });
export const useOrgAdmin = () => useContext(Ctx);

const NAV_ITEMS = [
  { to: "/org-admin", label: "Panoramica", end: true },
  { to: "/org-admin/soci", label: "Soci", end: false },
  { to: "/org-admin/tessere", label: "Tessere", end: false },
];

const OrgAdminLayout = () => {
  const [admin, setAdmin] = useState<OrgAdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrgAdminMe()
      .then(setAdmin)
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleLogout = async () => {
    await orgAdminLogout();
    navigate("/org-admin/login", { replace: true });
  };

  return (
    <Ctx.Provider value={{ admin, loading }}>
      <div>
        {/* Header band */}
        <div className="border-b border-neutral-100 bg-gradient-to-b from-neutral-50 to-white">
          <div className="container-shell py-8">
            <div className="flex items-start gap-5">
              <div className="hidden shrink-0 sm:block">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand/10">
                  <img
                    src="/favicon.svg"
                    alt=""
                    className="h-6"
                    aria-hidden="true"
                  />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                {loading ? (
                  <>
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="mt-2 h-3.5 w-64" />
                  </>
                ) : admin ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h1 className="text-lg font-semibold text-neutral-900">
                        {admin.organization?.name ?? "Gestione associazione"}
                      </h1>
                      <span className="inline-flex items-center rounded-full border border-brand/20 bg-brand/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                        Org Admin
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">
                      {admin.email}
                    </p>
                  </>
                ) : (
                  <h1 className="text-lg font-semibold text-neutral-900">
                    Gestione associazione
                  </h1>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Link
                  className="hidden text-sm font-medium text-neutral-500 transition hover:text-neutral-700 sm:block"
                  to="/"
                >
                  Torna al sito
                </Link>
                {!loading && admin && (
                  <button
                    className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                    type="button"
                    onClick={handleLogout}
                  >
                    Esci
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Nav tabs */}
          {!loading && admin && (
            <div className="container-shell">
              <nav className="-mb-px flex gap-6">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `border-b-2 pb-3 text-sm font-medium transition ${
                        isActive
                          ? "border-brand text-brand"
                          : "border-transparent text-neutral-500 hover:text-neutral-700"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          )}
        </div>

        {/* Content */}
        <Outlet />
      </div>
    </Ctx.Provider>
  );
};

export default OrgAdminLayout;
